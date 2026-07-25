import type { GoogleGenAI as GoogleGenAIClient } from '@google/genai';
import type { Script, ScriptRow } from '../../shared/types';
import { TEXT_MODEL_CHAIN, AUDIO_MODEL_CHAIN, buildFallbackChain } from '../../shared/geminiModels';
import { readSettingsSync } from '../ipc/settingsHandlers';

// @google/genai ships as an ESM-only package; our main process is compiled to CommonJS.
// tsc rewrites a plain `await import(...)` into a `require()` call when targeting CommonJS,
// which fails on an ESM-only package, so the import is routed through `new Function` to keep
// it a genuine native dynamic import at runtime instead.
const dynamicImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<typeof import('@google/genai')>;

let client: GoogleGenAIClient | null = null;

export async function getClient(): Promise<GoogleGenAIClient> {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set. Add it to your .env file.');
    }
    const { GoogleGenAI } = await dynamicImport('@google/genai');
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

function preferredModel(): string {
  return readSettingsSync().geminiModel;
}

// Mirrors @google/genai's `Type` enum values (plain OpenAPI-style schema type strings),
// defined locally so this file doesn't need a static import of the ESM package.
export const SchemaType = {
  OBJECT: 'OBJECT',
  ARRAY: 'ARRAY',
  STRING: 'STRING',
  INTEGER: 'INTEGER',
  NUMBER: 'NUMBER',
  BOOLEAN: 'BOOLEAN',
} as const;

type GenerateContentRequest = Parameters<GoogleGenAIClient['models']['generateContent']>[0];

// Models that have returned a permanent "no longer available" 404 for this account get
// remembered for the rest of the process's lifetime, so every subsequent call skips them
// immediately instead of re-discovering the same dead end (and burning a rate-limit slot
// on every single request across every asset/step of the pipeline).
const permanentlyUnavailableModels = new Set<string>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPermanentlyUnavailable(message: string): boolean {
  return message.includes('404') && /no longer available|NOT_FOUND/i.test(message);
}

function isRateLimited(message: string): boolean {
  return message.includes('429') || message.includes('RESOURCE_EXHAUSTED');
}

/** Google's 429 body embeds its own suggested wait, e.g. `"retryDelay":"59.49038558s"`. */
function parseRetryDelaySec(message: string): number | null {
  const match = message.match(/"retryDelay":"(\d+(?:\.\d+)?)s"/);
  return match ? parseFloat(match[1]) : null;
}

export type GeminiAttemptOutcome = 'success' | 'rate-limited-retrying' | 'unavailable' | 'failed';

/**
 * Tries the user's preferred model first, then falls through the rest of `chain` in order.
 * A 429 (free-tier accounts are commonly capped at ~5 requests/minute per model) waits for
 * the server's own suggested retry delay and retries the SAME model once before moving on,
 * since cycling models immediately just spreads the same burst across more quotas. A 404
 * "no longer available" response marks that model permanently dead for this session so it's
 * skipped on every future call rather than retried every time. Any other failure advances
 * to the next model in the chain, same as before.
 */
export async function generateWithFallback(
  chain: readonly string[],
  buildRequest: (model: string) => GenerateContentRequest,
  onAttempt?: (model: string, outcome: GeminiAttemptOutcome, detail?: string) => void,
): Promise<{ text: string; modelUsed: string }> {
  const ai = await getClient();
  const fullChain = buildFallbackChain(chain, preferredModel());
  const liveModels = fullChain.filter((m) => !permanentlyUnavailableModels.has(m));
  // Don't strand ourselves if every model got marked dead this session — try the full chain
  // again rather than throwing with zero candidates (Google's own restrictions can change).
  const attemptOrder = liveModels.length > 0 ? liveModels : fullChain;
  let lastErr: unknown;

  for (const model of attemptOrder) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent(buildRequest(model));
        const text = response.text;
        if (!text) throw new Error('empty response body');
        onAttempt?.(model, 'success');
        return { text, modelUsed: model };
      } catch (err) {
        lastErr = err;
        const message = err instanceof Error ? err.message : String(err);

        if (isPermanentlyUnavailable(message)) {
          permanentlyUnavailableModels.add(model);
          onAttempt?.(model, 'unavailable', message);
          console.error(`[gemini] "${model}" is permanently unavailable for this account — skipping it for the rest of this session.`);
          break;
        }

        if (isRateLimited(message) && attempt === 0) {
          const delaySec = Math.min(parseRetryDelaySec(message) ?? 20, 60);
          onAttempt?.(model, 'rate-limited-retrying', message);
          console.error(`[gemini] "${model}" rate-limited, waiting ${delaySec}s before retrying it once...`);
          await sleep(delaySec * 1000);
          continue;
        }

        onAttempt?.(model, 'failed', message);
        console.error(`[gemini] "${model}" failed, trying next fallback:`, message);
        break;
      }
    }
  }

  const detail = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`All Gemini models failed (tried: ${attemptOrder.join(', ')}). Last error: ${detail}`);
}

/** Re-asks the model to repair its own output when JSON.parse fails, once, before giving up. */
export async function parseJsonWithRepair<T>(text: string, model: string): Promise<T> {
  try {
    return JSON.parse(text) as T;
  } catch {
    console.error(`[gemini] "${model}" returned invalid JSON, requesting a repair pass`);
    const ai = await getClient();
    const repaired = await ai.models.generateContent({
      model,
      contents: `The following text was supposed to be strictly valid JSON but failed to parse. Return ONLY the corrected, valid JSON with no surrounding commentary or markdown fences:\n\n${text}`,
      config: { responseMimeType: 'application/json' },
    });
    if (!repaired.text) throw new Error('Gemini returned an unparseable response and the repair pass also failed.');
    return JSON.parse(repaired.text) as T;
  }
}

const scriptRowSchema = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      said: { type: SchemaType.STRING },
      shown: { type: SchemaType.STRING },
    },
    required: ['said', 'shown'],
  },
};

export async function rewriteScriptToAccountStyle(
  script: Script,
  accountName: string,
  accountContent: string,
): Promise<Pick<ScriptRow, 'said' | 'shown'>[]> {
  const sourceRows = script.rows
    .map((r, i) => `${i + 1}. Said: ${r.said || '(empty)'}\n   Shown: ${r.shown || '(empty)'}`)
    .join('\n');

  const transcriptNote = script.sourceUrl
    ? `\nThis source script was auto-transcribed from a real video (${script.sourceUrl}), so its "Said" text
may include filler words, false starts, or verbal tics from natural speech, and its "Shown" column is
likely empty since a transcript has no visual description — invent concrete, filmable "Shown" descriptions
from context. Clean up the transcript's rough edges as a natural part of the rewrite.\n`
    : '';

  const prompt = `You are an expert short-form video scriptwriter, adapting a script to match a specific
creator's established voice and style. Follow the style guide closely — treat it as ground truth for
word choice, sentence rhythm, humor, and pacing, even where it conflicts with a "generic" writing instinct.
This is an adaptation, not a wholesale reinvention: keep the source's concrete facts, claims, numbers,
names, and specific actions/beats intact — what changes is the VOICE, PHRASING, and delivery style, not
the underlying substance.
${transcriptNote}
ACCOUNT STYLE GUIDE (account: "${accountName}"):
${accountContent}

SOURCE SCRIPT (may be a rough transcript or draft — the ideas/structure are the input, not the prose):
${sourceRows}

Rewrite this into a new two-column script matching the account's voice, tone, and pacing described above.
Preserve the general narrative structure/beats unless the style guide implies a different structure.
"said" is what is spoken/narrated. "shown" is a short, concrete, filmable description of what is visually
on screen for that beat (specific enough that someone picking stock footage could act on it).
Return one row per beat. Do not add commentary outside the JSON.`;

  const { text, modelUsed } = await generateWithFallback(TEXT_MODEL_CHAIN, (model) => ({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: scriptRowSchema as any,
      temperature: 0.9,
    },
  }));

  return parseJsonWithRepair(text, modelUsed);
}

function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map((p) => parseInt(p, 10));
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

export async function transcribeAudioFile(filePath: string, mimeType: string): Promise<ScriptRow[]> {
  const ai = await getClient();
  const uploaded = await ai.files.upload({ file: filePath, config: { mimeType } });

  const prompt = `Transcribe this audio/video clip's spoken content verbatim. Break it into short segments
(one sentence or short beat each). For each segment, give an approximate start timestamp in MM:SS format
based on where it occurs in the audio. Return a JSON array of objects with "timestamp" (MM:SS string),
and "text" (the exact spoken words for that segment, no paraphrasing).`;

  const { text, modelUsed } = await generateWithFallback(AUDIO_MODEL_CHAIN, (model) => ({
    model,
    contents: [{ role: 'user', parts: [{ fileData: { fileUri: uploaded.uri!, mimeType } }, { text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.15,
      responseSchema: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            timestamp: { type: SchemaType.STRING },
            text: { type: SchemaType.STRING },
          },
          required: ['timestamp', 'text'],
        },
      } as any,
    },
  }));

  const segments = await parseJsonWithRepair<{ timestamp: string; text: string }[]>(text, modelUsed);

  return segments.map((seg, i) => ({
    id: `${Date.now()}-${i}`,
    said: seg.text,
    shown: '',
    startSec: parseTimestamp(seg.timestamp),
  }));
}

export interface AudioSegment {
  text: string;
  startSec: number;
  endSec: number;
}

/**
 * Like transcribeAudioFile, but requests explicit start+end timestamps per segment (rather
 * than just a start), for precise placement of captions derived from actual spoken content.
 */
export async function transcribeAudioSegments(
  filePath: string,
  mimeType: string,
  onAttempt?: (model: string, outcome: GeminiAttemptOutcome, detail?: string) => void,
): Promise<AudioSegment[]> {
  const ai = await getClient();
  const uploaded = await ai.files.upload({ file: filePath, config: { mimeType } });

  const prompt = `Transcribe this audio/video clip's spoken content verbatim, if any. Break it into short
segments (one sentence or short phrase each). For each segment, give an approximate start AND end
timestamp in MM:SS format based on where it occurs in the audio. Return a JSON array of objects with
"startTimestamp" (MM:SS), "endTimestamp" (MM:SS), and "text" (the exact spoken words, no paraphrasing).
If there is no spoken content (e.g. music-only or silent), return an empty array.`;

  const { text, modelUsed } = await generateWithFallback(
    AUDIO_MODEL_CHAIN,
    (model) => ({
      model,
      contents: [{ role: 'user', parts: [{ fileData: { fileUri: uploaded.uri!, mimeType } }, { text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.15,
        responseSchema: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              startTimestamp: { type: SchemaType.STRING },
              endTimestamp: { type: SchemaType.STRING },
              text: { type: SchemaType.STRING },
            },
            required: ['startTimestamp', 'endTimestamp', 'text'],
          },
        } as any,
      },
    }),
    onAttempt,
  );

  const segments = await parseJsonWithRepair<{ startTimestamp: string; endTimestamp: string; text: string }[]>(text, modelUsed);
  return segments
    .map((seg) => ({ text: seg.text, startSec: parseTimestamp(seg.startTimestamp), endSec: parseTimestamp(seg.endTimestamp) }))
    .filter((seg) => seg.endSec > seg.startSec && seg.text.trim().length > 0);
}

// The single-shot edit-plan suggestion generator that used to live here has been replaced
// by the multi-step pipeline in src/main/services/editPlanPipeline.ts (asset visual tagging,
// draft planning, self-critique, and semantic music/SFX placement).
