import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { getClient, generateWithFallback, parseJsonWithRepair, SchemaType } from './gemini';
import { transcribeAudioSegments, type AudioSegment } from './gemini';
import { TEXT_MODEL_CHAIN, VISION_MODEL_CHAIN, AUDIO_MODEL_CHAIN } from '../../shared/geminiModels';
import { AUDIO_MOOD_TAGS } from '../../shared/audioTaxonomy';
import { assetTagsCacheDir, musicTagsCacheFile } from './paths';
import { listMusicLibrary } from './musicLibrary';
import type {
  AssetClip,
  CaptionCue,
  EditorProject,
  EditPlan,
  EditPlanDebugInfo,
  EditPlanProgress,
  MusicCue,
  MusicLibraryEntry,
  Script,
  TimelineClip,
  Track,
} from '../../shared/types';
import {
  clipDurationSec,
  defaultCaptionStyle,
  defaultClipTransform,
  defaultOverlayTransform,
  defaultTracks,
} from '../../shared/types';

const CRITIQUE_PASSES = 2; // total reasoning passes over the arrangement = 1 draft + this many critiques

function mimeTypeFor(asset: AssetClip): string {
  const ext = path.extname(asset.filePath).toLowerCase();
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.avi': 'video/x-msvideo',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
  };
  return map[ext] ?? 'application/octet-stream';
}

function assetCacheKey(asset: AssetClip, suffix: string): string {
  const stat = fs.statSync(asset.filePath);
  return crypto.createHash('sha1').update(`${asset.filePath}|${stat.size}|${stat.mtimeMs}|${suffix}`).digest('hex');
}

function readCache<T>(key: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(assetTagsCacheDir(), `${key}.json`), 'utf-8'));
  } catch {
    return null;
  }
}

function writeCache<T>(key: string, value: T): void {
  fs.writeFileSync(path.join(assetTagsCacheDir(), `${key}.json`), JSON.stringify(value, null, 2), 'utf-8');
}

// --- Step 1: visual tagging (cached) -----------------------------------------------------

interface AssetVisualTag {
  summary: string;
  moments?: { atSec: number; description: string }[];
  model: string;
  cachedAt: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tagAssetVisual(asset: AssetClip, warnings: string[]): Promise<AssetVisualTag> {
  const key = assetCacheKey(asset, 'visual');
  const cached = readCache<AssetVisualTag>(key);
  if (cached) return cached;

  const ai = await getClient();
  const mimeType = mimeTypeFor(asset);
  const uploaded = await ai.files.upload({ file: asset.filePath, config: { mimeType } });

  const prompt =
    asset.type === 'video'
      ? `Describe this video clip's visual content for a video editor: subjects, actions, setting, mood.
Then list up to 5 notable visual moments with approximate timestamps in seconds (e.g. a jump cut, a
reveal, peak action). Return JSON: { "summary": string, "moments": [{ "atSec": number, "description": string }] }.`
      : `Describe this image's visual content for a video editor: subjects, setting, mood.
Return JSON: { "summary": string }.`;

  const { text, modelUsed } = await generateWithFallback(
    VISION_MODEL_CHAIN,
    (model) => ({
    model,
    contents: [{ role: 'user', parts: [{ fileData: { fileUri: uploaded.uri!, mimeType } }, { text: prompt }] }],
    config: {
      responseMimeType: 'application/json',
      temperature: 0.2,
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          summary: { type: SchemaType.STRING },
          moments: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: { atSec: { type: SchemaType.NUMBER }, description: { type: SchemaType.STRING } },
              required: ['atSec', 'description'],
            },
          },
        },
        required: ['summary'],
      } as any,
      },
    }),
    (model, outcome, detail) => {
      if (outcome === 'rate-limited-retrying') warnings.push(`"${model}" hit a rate limit while visual-tagging "${asset.fileName}" — waited and retried it.`);
      if (outcome === 'unavailable') warnings.push(`"${model}" is no longer available for this account (seen while visual-tagging "${asset.fileName}") — it will be skipped from now on.`);
    },
  );

  const parsed = await parseJsonWithRepair<{ summary: string; moments?: { atSec: number; description: string }[] }>(text, modelUsed);
  const tag: AssetVisualTag = { ...parsed, model: modelUsed, cachedAt: new Date().toISOString() };
  writeCache(key, tag);
  return tag;
}

async function tagAllAssetsVisual(
  assets: AssetClip[],
  onProgress: (current: number, total: number, fileName: string) => void,
  warnings: string[],
): Promise<Map<string, AssetVisualTag>> {
  const visual = assets.filter((a) => a.type !== 'audio');
  const out = new Map<string, AssetVisualTag>();
  for (let i = 0; i < visual.length; i++) {
    onProgress(i + 1, visual.length, visual[i].fileName);
    // Pace requests: free-tier Gemini accounts cap at a handful of requests/minute per
    // model, and tagging several assets back-to-back can blow through that in seconds.
    if (i > 0) await sleep(3000);
    try {
      out.set(visual[i].id, await tagAssetVisual(visual[i], warnings));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[editPlanPipeline] visual tagging failed for ${visual[i].fileName}:`, err);
      warnings.push(`Visual tagging failed for "${visual[i].fileName}": ${message}`);
      out.set(visual[i].id, { summary: '(untagged — visual tagging failed)', model: 'none', cachedAt: new Date().toISOString() });
    }
  }
  return out;
}

// --- Step 2: audio tagging of every video/audio asset (cached) --------------------------

async function tagAssetAudio(asset: AssetClip, warnings: string[]): Promise<AudioSegment[]> {
  const key = assetCacheKey(asset, 'audio');
  const cached = readCache<AudioSegment[]>(key);
  if (cached) return cached;

  try {
    const segments = await transcribeAudioSegments(asset.filePath, mimeTypeFor(asset), (model, outcome) => {
      if (outcome === 'rate-limited-retrying') warnings.push(`"${model}" hit a rate limit while audio-tagging "${asset.fileName}" — waited and retried it.`);
      if (outcome === 'unavailable') warnings.push(`"${model}" is no longer available for this account (seen while audio-tagging "${asset.fileName}") — it will be skipped from now on.`);
    });
    if (segments.length === 0) {
      warnings.push(`No spoken audio detected in "${asset.fileName}" (silent, music-only, or transcription returned nothing).`);
    }
    writeCache(key, segments);
    return segments;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[editPlanPipeline] audio tagging failed for ${asset.fileName}:`, err);
    warnings.push(`Audio tagging failed for "${asset.fileName}": ${message}`);
    return [];
  }
}

async function tagAllAssetsAudio(
  assets: AssetClip[],
  onProgress: (current: number, total: number, fileName: string) => void,
  warnings: string[],
): Promise<Map<string, AudioSegment[]>> {
  // Any asset that might carry spoken content: standalone audio files, and video files
  // (hasAudio true or unknown — better to check than silently skip a talking-head clip).
  const candidates = assets.filter((a) => a.type === 'audio' || (a.type === 'video' && a.hasAudio !== false));
  const out = new Map<string, AudioSegment[]>();
  for (let i = 0; i < candidates.length; i++) {
    onProgress(i + 1, candidates.length, candidates[i].fileName);
    if (i > 0) await sleep(3000);
    out.set(candidates[i].id, await tagAssetAudio(candidates[i], warnings));
  }
  return out;
}

// --- Step 3: multi-pass script-to-clip arrangement reasoning -----------------------------

interface DraftBeat {
  scriptRowIndex: number;
  assetFileName: string;
  trackKind: 'video' | 'overlay';
  sourceInSec: number;
  sourceOutSec: number;
  isHardCutBefore: boolean;
  isHighEnergyBuildup: boolean;
}

interface DraftPlan {
  beats: DraftBeat[];
  overallMood: string;
}

const draftPlanSchema = {
  type: SchemaType.OBJECT,
  properties: {
    beats: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          scriptRowIndex: { type: SchemaType.INTEGER },
          assetFileName: { type: SchemaType.STRING },
          trackKind: { type: SchemaType.STRING },
          sourceInSec: { type: SchemaType.NUMBER },
          sourceOutSec: { type: SchemaType.NUMBER },
          isHardCutBefore: { type: SchemaType.BOOLEAN },
          isHighEnergyBuildup: { type: SchemaType.BOOLEAN },
        },
        required: ['scriptRowIndex', 'assetFileName', 'trackKind', 'sourceInSec', 'sourceOutSec', 'isHardCutBefore', 'isHighEnergyBuildup'],
      },
    },
    overallMood: { type: SchemaType.STRING },
  },
  required: ['beats', 'overallMood'],
} as const;

function buildAssetManifest(assets: AssetClip[], visualTags: Map<string, AssetVisualTag>, audioTags: Map<string, AudioSegment[]>): string {
  return assets
    .filter((a) => a.type !== 'audio')
    .map((a) => {
      const visual = visualTags.get(a.id);
      const moments = visual?.moments?.map((m) => `${m.atSec.toFixed(1)}s: ${m.description}`).join('; ');
      const audio = audioTags.get(a.id);
      const speech = audio?.length ? audio.map((s) => `"${s.text}" (${s.startSec.toFixed(1)}-${s.endSec.toFixed(1)}s)`).join(' / ') : null;
      return (
        `- ${a.fileName} (${a.type}${a.durationSec ? `, ${a.durationSec.toFixed(1)}s` : ''}): ${visual?.summary ?? '(no description)'}` +
        `${moments ? ` | Notable moments: ${moments}` : ''}${speech ? ` | Spoken audio in this clip: ${speech}` : ''}`
      );
    })
    .join('\n');
}

async function planArrangement(
  script: Script,
  assets: AssetClip[],
  visualTags: Map<string, AssetVisualTag>,
  audioTags: Map<string, AudioSegment[]>,
  tracks: Track[],
): Promise<DraftPlan> {
  const beats = script.rows.map((r, i) => `${i}. Shown: "${r.shown || '(no description)'}" | Said: "${r.said || ''}"`).join('\n');
  const assetManifest = buildAssetManifest(assets, visualTags, audioTags);
  const trackKinds = [...new Set(tracks.map((t) => t.kind))].filter((k) => k === 'video' || k === 'overlay');

  const prompt = `You are a meticulous video editor storyboarding a short-form video. You have REAL visual
descriptions AND real transcribed speech for each asset (not just filenames) — use both to choose the
best-matching asset and trim range for each script beat.

IMPORTANT: scripts do not always map one beat to one shot. A single beat may need to be split across two
assets, or a single asset's footage may cover two consecutive beats. Use the "Spoken audio in this clip"
data to judge how much of an asset's footage actually corresponds to a given beat — don't assume a rigid
1:1 mapping between script rows and assets.

SCRIPT BEATS:
${beats}

AVAILABLE ASSETS (with real visual descriptions and transcribed speech):
${assetManifest}

AVAILABLE TRACK KINDS: ${trackKinds.join(', ')}

For each beat, choose the best-matching asset and a trim range (sourceInSec/sourceOutSec) within that
asset's duration. Assign trackKind "video" for primary footage, or "overlay" only if a beat calls for
picture-in-picture layered content over another beat (rare — most beats should be "video"). Prefer a
distinct asset per beat when there are enough assets; only reuse an asset if there are more beats than
usable assets. Flag isHardCutBefore=true if this beat should feel like an abrupt hard cut from the
previous one, and isHighEnergyBuildup=true if this beat is a high-energy moment that should be preceded
by a buildup. Also choose one overall mood tag for the whole video's music bed from exactly this list:
${AUDIO_MOOD_TAGS.join(', ')}.
Never propose a sourceInSec/sourceOutSec range that exceeds the asset's listed duration.`;

  const { text, modelUsed } = await generateWithFallback(TEXT_MODEL_CHAIN, (model) => ({
    model,
    contents: prompt,
    config: { responseMimeType: 'application/json', temperature: 0.5, responseSchema: draftPlanSchema as any },
  }));

  return parseJsonWithRepair<DraftPlan>(text, modelUsed);
}

async function critiquePlan(
  script: Script,
  assets: AssetClip[],
  visualTags: Map<string, AssetVisualTag>,
  audioTags: Map<string, AudioSegment[]>,
  draft: DraftPlan,
  passLabel: string,
): Promise<DraftPlan> {
  const beats = script.rows.map((r, i) => `${i}. Shown: "${r.shown || ''}" | Said: "${r.said || ''}"`).join('\n');
  const assetManifest = buildAssetManifest(assets, visualTags, audioTags);

  const prompt = `You proposed this draft storyboard (${passLabel}) for a short-form video. Review it
critically for: pacing issues, beats whose assigned asset doesn't actually match the "Shown" description
or its transcribed speech, unnecessary or lopsided asset reuse, trim ranges that feel too long/short for
the beat's spoken content, and beats that should really be split across two assets or merged because one
asset's footage naturally spans two beats. Return a corrected version in the exact same JSON shape (or
the same plan again if it's already good).

SCRIPT BEATS:
${beats}

ASSETS:
${assetManifest}

DRAFT STORYBOARD:
${JSON.stringify(draft, null, 2)}`;

  const { text, modelUsed } = await generateWithFallback(TEXT_MODEL_CHAIN, (model) => ({
    model,
    contents: prompt,
    config: { responseMimeType: 'application/json', temperature: 0.4, responseSchema: draftPlanSchema as any },
  }));

  return parseJsonWithRepair<DraftPlan>(text, modelUsed);
}

// --- Step 5: semantic music/SFX classification + placement -------------------------------

interface MusicTagCache {
  key: string;
  tags: Record<string, string[]>;
}

function musicLibraryCacheKey(entries: MusicLibraryEntry[]): string {
  const stat = entries
    .filter((e) => e.kind === 'music')
    .map((e) => {
      try {
        return `${e.fileName}:${fs.statSync(e.filePath).mtimeMs}`;
      } catch {
        return e.fileName;
      }
    })
    .sort()
    .join('|');
  return crypto.createHash('sha1').update(stat).digest('hex');
}

async function classifyMusicLibrary(entries: MusicLibraryEntry[], warnings: string[]): Promise<MusicLibraryEntry[]> {
  const musicEntries = entries.filter((e) => e.kind === 'music' && !e.tags?.length);
  if (musicEntries.length === 0) return entries;

  const key = musicLibraryCacheKey(entries);
  let cache: MusicTagCache | null = null;
  try {
    cache = JSON.parse(fs.readFileSync(musicTagsCacheFile(), 'utf-8'));
  } catch {
    cache = null;
  }
  if (cache && cache.key === key) {
    return entries.map((e) => (e.kind === 'music' && cache!.tags[e.fileName] ? { ...e, tags: cache!.tags[e.fileName] } : e));
  }

  const fileList = musicEntries.map((e) => `- ${e.fileName}`).join('\n');
  const prompt = `Classify each of these music track filenames by mood, choosing 1-2 tags per track from
exactly this list: ${AUDIO_MOOD_TAGS.join(', ')}. Filenames may not describe mood clearly — use your best
judgment from any words present, and default to "chill-ambient" if nothing suggests otherwise.

TRACKS:
${fileList}

Return JSON: { "tracks": [{ "fileName": string, "tags": string[] }] }`;

  try {
    const { text, modelUsed } = await generateWithFallback(TEXT_MODEL_CHAIN, (model) => ({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            tracks: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: { fileName: { type: SchemaType.STRING }, tags: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } } },
                required: ['fileName', 'tags'],
              },
            },
          },
          required: ['tracks'],
        } as any,
      },
    }));
    const parsed = await parseJsonWithRepair<{ tracks: { fileName: string; tags: string[] }[] }>(text, modelUsed);
    const tagsByName: Record<string, string[]> = {};
    parsed.tracks.forEach((t) => (tagsByName[t.fileName] = t.tags));
    fs.writeFileSync(musicTagsCacheFile(), JSON.stringify({ key, tags: tagsByName }, null, 2), 'utf-8');
    return entries.map((e) => (e.kind === 'music' && tagsByName[e.fileName] ? { ...e, tags: tagsByName[e.fileName] } : e));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[editPlanPipeline] music classification failed, proceeding without mood tags:', err);
    warnings.push(`Music mood classification failed: ${message}`);
    return entries;
  }
}

function pickMusicForMood(library: MusicLibraryEntry[], mood: string): MusicLibraryEntry | null {
  const musicOnly = library.filter((e) => e.kind === 'music');
  if (musicOnly.length === 0) return null;
  const matching = musicOnly.filter((e) => e.tags?.includes(mood));
  return matching[0] ?? musicOnly[0];
}

function pickSfxForTag(library: MusicLibraryEntry[], tag: string): MusicLibraryEntry | null {
  return library.find((e) => e.kind === 'sfx' && e.tags?.includes(tag)) ?? null;
}

// --- Step 6: captions derived from actual transcribed asset audio (not the script) -------

function buildCaptionsFromAudio(
  clips: TimelineClip[],
  audioTags: Map<string, AudioSegment[]>,
  captionTrackId: string,
): CaptionCue[] {
  const cues: CaptionCue[] = [];
  for (const clip of clips) {
    const segments = audioTags.get(clip.assetId);
    if (!segments?.length) continue;
    for (const seg of segments) {
      const overlapStart = Math.max(seg.startSec, clip.sourceInSec);
      const overlapEnd = Math.min(seg.endSec, clip.sourceOutSec);
      if (overlapEnd - overlapStart <= 0.05) continue;
      const timelineStart = clip.startSec + (overlapStart - clip.sourceInSec) / clip.speed;
      const timelineEnd = clip.startSec + (overlapEnd - clip.sourceInSec) / clip.speed;
      cues.push({
        id: randomUUID(),
        trackId: captionTrackId,
        scriptRowId: clip.scriptRowId,
        text: seg.text,
        startSec: timelineStart,
        endSec: timelineEnd,
        enabled: true,
        style: defaultCaptionStyle(),
      });
    }
  }
  return cues.sort((a, b) => a.startSec - b.startSec);
}

// --- Step 7: final holistic review (safe, scoped revisions only) ------------------------

interface FinalReviewResult {
  clipAdjustments: { index: number; sourceInSec: number }[];
  captionRevisions: { index: number; text: string }[];
}

async function finalReview(
  script: Script,
  clips: TimelineClip[],
  assets: Map<string, AssetClip>,
  captions: CaptionCue[],
  musicChoice: string | null,
): Promise<FinalReviewResult> {
  const clipList = clips
    .map((c, i) => `${i}. ${assets.get(c.assetId)?.fileName ?? '?'} [${c.sourceInSec.toFixed(1)}-${c.sourceOutSec.toFixed(1)}s of source] at timeline ${c.startSec.toFixed(1)}s`)
    .join('\n');
  const captionList = captions.map((c, i) => `${i}. (${c.startSec.toFixed(1)}-${c.endSec.toFixed(1)}s) "${c.text}"`).join('\n');
  const scriptText = script.rows.map((r) => r.said).join(' ');

  const prompt = `You are doing a final quality pass on an assembled short-form video, with the original
script and the fully assembled clip/caption data in front of you. Two things to check:

1. Captions were auto-generated from real speech-to-text transcription of the footage, so they may contain
filler words, false starts, or minor transcription errors. Clean up the TEXT ONLY (never change meaning,
never change timing) for any caption that needs it — return only the ones that need a change.

2. Clip trims: for any clip whose in-point could be nudged slightly (e.g. to cut earlier/later within the
same source footage window for better pacing) without changing its overall on-screen duration, propose a
new sourceInSec. Only propose changes you're genuinely confident improve things — most clips should need
no adjustment.

ORIGINAL SCRIPT: ${scriptText}

ASSEMBLED CLIPS (index, asset, source trim window, timeline position):
${clipList}

ASSEMBLED CAPTIONS (index, timing, text):
${captionList}

CHOSEN BACKGROUND MUSIC: ${musicChoice ?? '(none)'}

Return JSON: { "clipAdjustments": [{ "index": number, "sourceInSec": number }], "captionRevisions": [{ "index": number, "text": string }] }.
Only include entries that actually need a change — empty arrays are fine and expected if everything looks good.`;

  const { text, modelUsed } = await generateWithFallback(TEXT_MODEL_CHAIN, (model) => ({
    model,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          clipAdjustments: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: { index: { type: SchemaType.INTEGER }, sourceInSec: { type: SchemaType.NUMBER } },
              required: ['index', 'sourceInSec'],
            },
          },
          captionRevisions: {
            type: SchemaType.ARRAY,
            items: {
              type: SchemaType.OBJECT,
              properties: { index: { type: SchemaType.INTEGER }, text: { type: SchemaType.STRING } },
              required: ['index', 'text'],
            },
          },
        },
        required: ['clipAdjustments', 'captionRevisions'],
      } as any,
    },
  }));

  return parseJsonWithRepair<FinalReviewResult>(text, modelUsed);
}

// --- Orchestration ------------------------------------------------------------------------

export async function generateFullEditPlan(project: EditorProject, onProgress: (p: EditPlanProgress) => void): Promise<EditorProject> {
  const warnings: string[] = [];
  const draftHistory: EditPlanDebugInfo['draftHistory'] = [];
  try {
    const script = project.scriptSnapshot;
    const tracks: Track[] = project.editPlan.tracks.length ? project.editPlan.tracks : defaultTracks();

    if (project.assets.length === 0) warnings.push('No assets were attached to the project — nothing to tag or arrange.');
    if (script.rows.length === 0) warnings.push('The script has no rows — nothing to storyboard.');

    // Step 1: visual tagging
    onProgress({ step: 'tagging-visual', message: 'Looking at your assets...', current: 0, total: project.assets.length });
    const visualTags = await tagAllAssetsVisual(
      project.assets,
      (current, total, fileName) => onProgress({ step: 'tagging-visual', message: `Analyzing ${fileName}...`, current, total }),
      warnings,
    );

    // Step 2: audio tagging (videos, audio files, voiceovers)
    onProgress({ step: 'tagging-audio', message: 'Listening to your assets...', current: 0, total: project.assets.length });
    const audioTags = await tagAllAssetsAudio(
      project.assets,
      (current, total, fileName) => onProgress({ step: 'tagging-audio', message: `Transcribing ${fileName}...`, current, total }),
      warnings,
    );

    // Step 3: multi-pass arrangement reasoning
    onProgress({ step: 'planning', message: 'Storyboarding the arrangement...' });
    let draft = await planArrangement(script, project.assets, visualTags, audioTags, tracks);
    draftHistory.push({ label: 'Initial draft', beats: draft.beats, overallMood: draft.overallMood });
    for (let pass = 1; pass <= CRITIQUE_PASSES; pass++) {
      await sleep(3000); // pace successive calls to stay under free-tier per-model rate limits
      onProgress({ step: 'critiquing', message: `Refining the plan (pass ${pass}/${CRITIQUE_PASSES})...` });
      draft = await critiquePlan(script, project.assets, visualTags, audioTags, draft, `pass ${pass}`);
      draftHistory.push({ label: `Critique pass ${pass}`, beats: draft.beats, overallMood: draft.overallMood });
    }
    if (draft.beats.length === 0) {
      warnings.push('The AI returned zero beats in its storyboard — the timeline will be empty. This usually means it could not confidently match any asset to any script line.');
    }

    // Step 4: write the JSON — hydrate clips first (captions/music placement below need real timing)
    onProgress({ step: 'hydrating', message: 'Building the timeline...' });
    // Case/whitespace-insensitive lookup: the model echoes back a filename it read from our
    // own manifest, but can still vary casing/whitespace slightly — an exact-match-only lookup
    // here would silently drop the beat (and previously did, producing an empty timeline).
    const normalizeName = (s: string) => s.trim().toLowerCase();
    const assetsByName = new Map(project.assets.map((a) => [normalizeName(a.fileName), a]));
    const assetsById = new Map(project.assets.map((a) => [a.id, a]));
    const videoTrack = tracks.find((t) => t.kind === 'video') ?? tracks[0];
    const overlayTrack = tracks.find((t) => t.kind === 'overlay') ?? videoTrack;

    let videoCursor = 0;
    let overlayCursor = 0;
    const clips: TimelineClip[] = [];
    const videoStartByRow = new Map<number, number>();

    draft.beats.forEach((beat, i) => {
      const asset = assetsByName.get(normalizeName(beat.assetFileName));
      if (!asset) {
        warnings.push(
          `Beat ${i} (script row ${beat.scriptRowIndex}) referenced asset "${beat.assetFileName}", which doesn't match any attached asset — this beat was skipped.`,
        );
        return;
      }
      const sourceInSec = Math.max(0, beat.sourceInSec);
      const sourceOutSec = Math.max(sourceInSec + 0.3, beat.sourceOutSec);
      const row = script.rows[beat.scriptRowIndex];

      if (beat.trackKind === 'overlay') {
        const anchorStart = videoStartByRow.get(beat.scriptRowIndex) ?? overlayCursor;
        clips.push({
          id: randomUUID(),
          trackId: overlayTrack.id,
          assetId: asset.id,
          scriptRowId: row?.id,
          sourceInSec,
          sourceOutSec,
          startSec: anchorStart,
          speed: 1,
          volumePct: 100,
          muted: true,
          transform: defaultOverlayTransform(),
        });
        overlayCursor = anchorStart + (sourceOutSec - sourceInSec);
      } else {
        videoStartByRow.set(beat.scriptRowIndex, videoCursor);
        clips.push({
          id: randomUUID(),
          trackId: videoTrack.id,
          assetId: asset.id,
          scriptRowId: row?.id,
          sourceInSec,
          sourceOutSec,
          startSec: videoCursor,
          speed: 1,
          volumePct: 100,
          muted: false,
          transform: defaultClipTransform(),
        });
        videoCursor += sourceOutSec - sourceInSec;
      }
    });

    // Step 5: fitting background music (+ semantic SFX at flagged beats)
    onProgress({ step: 'placing-audio', message: 'Selecting music and sound effects...' });
    await sleep(3000);
    let library = await listMusicLibrary();
    library = await classifyMusicLibrary(library, warnings);
    if (library.length === 0) warnings.push('Music/SFX library is empty — no background music or semantic SFX will be added. Add tracks via Settings or the starter pack folder.');
    const musicTrack = tracks.find((t) => t.kind === 'music') ?? tracks[0];
    const sfxTrack = tracks.find((t) => t.kind === 'sfx') ?? tracks[0];
    const music: MusicCue[] = [];

    draft.beats.forEach((beat) => {
      const clipStart = videoStartByRow.get(beat.scriptRowIndex);
      if (clipStart === undefined) return;
      if (beat.isHighEnergyBuildup) {
        const entry = pickSfxForTag(library, 'riser-buildup');
        if (entry) {
          const dur = Math.min(1.2, entry.durationSec ?? 1.2);
          music.push({
            id: randomUUID(),
            trackId: sfxTrack.id,
            filePath: entry.filePath,
            fileName: entry.fileName,
            startSec: Math.max(0, clipStart - dur),
            endSec: clipStart,
            sourceInSec: 0,
            gainDb: 0,
            kind: 'sfx',
            tags: entry.tags,
          });
        }
      }
      if (beat.isHardCutBefore && clipStart > 0.05) {
        const entry = pickSfxForTag(library, 'whoosh-transition');
        if (entry) {
          const dur = Math.min(0.5, entry.durationSec ?? 0.5);
          music.push({
            id: randomUUID(),
            trackId: sfxTrack.id,
            filePath: entry.filePath,
            fileName: entry.fileName,
            startSec: Math.max(0, clipStart - dur / 2),
            endSec: clipStart + dur / 2,
            sourceInSec: 0,
            gainDb: 0,
            kind: 'sfx',
            tags: entry.tags,
          });
        }
      }
    });

    const totalSec = Math.max(videoCursor, overlayCursor, 0.5);
    const musicEntry = pickMusicForMood(library, draft.overallMood);
    if (musicEntry) {
      music.push({
        id: randomUUID(),
        trackId: musicTrack.id,
        filePath: musicEntry.filePath,
        fileName: musicEntry.fileName,
        startSec: 0,
        endSec: totalSec,
        sourceInSec: 0,
        gainDb: -14,
        kind: 'music',
        fadeInSec: 1,
        fadeOutSec: 1.5,
        tags: musicEntry.tags,
      });
    }

    // Step 6: captions from actual transcribed asset audio, not the script
    onProgress({ step: 'captioning', message: 'Generating captions from the footage audio...' });
    const captionTrack = tracks.find((t) => t.kind === 'caption') ?? tracks[0];
    let captions = buildCaptionsFromAudio(clips, audioTags, captionTrack.id);
    if (captions.length === 0) {
      // Fallback: no video clip carried usable speech (e.g. all silent B-roll) — if a
      // standalone voiceover/audio asset exists, use its transcript directly at its own
      // timestamps (assumed aligned to the start of the timeline).
      const voAsset = project.assets.find((a) => a.type === 'audio');
      const voSegments = voAsset ? audioTags.get(voAsset.id) : undefined;
      if (voSegments?.length) {
        captions = voSegments.map((seg) => ({
          id: randomUUID(),
          trackId: captionTrack.id,
          text: seg.text,
          startSec: seg.startSec,
          endSec: seg.endSec,
          enabled: true,
          style: defaultCaptionStyle(),
        }));
      }
      if (captions.length === 0) {
        warnings.push('No captions were generated — no clip carried transcribable speech, and no standalone voiceover asset was found.');
      }
    }

    // Step 7: final holistic review — safe, scoped revisions only
    onProgress({ step: 'final-review', message: 'Final quality pass...' });
    await sleep(3000);
    let finalReviewResult: EditPlanDebugInfo['finalReview'] = null;
    try {
      const review = await finalReview(script, clips, assetsById, captions, musicEntry?.fileName ?? null);
      finalReviewResult = review;
      review.clipAdjustments.forEach(({ index, sourceInSec }) => {
        const clip = clips[index];
        if (!clip) return;
        const asset = assetsById.get(clip.assetId);
        const delta = sourceInSec - clip.sourceInSec;
        const newIn = Math.max(0, clip.sourceInSec + delta);
        const newOut = clip.sourceOutSec + delta;
        if (newIn < 0 || (asset?.durationSec && newOut > asset.durationSec)) return;
        clip.sourceInSec = newIn;
        clip.sourceOutSec = newOut;
      });
      review.captionRevisions.forEach(({ index, text }) => {
        if (captions[index]) captions[index] = { ...captions[index], text };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[editPlanPipeline] final review pass failed, keeping pre-review result:', err);
      warnings.push(`Final review pass failed (kept the pre-review result): ${message}`);
    }

    const editPlan: EditPlan = { tracks, clips, captions, music, subtitlesGloballyEnabled: true };
    const assetTags: EditPlanDebugInfo['assetTags'] = project.assets.map((a) => ({
      assetId: a.id,
      fileName: a.fileName,
      visualSummary: visualTags.get(a.id)?.summary,
      visualMoments: visualTags.get(a.id)?.moments,
      audioSegments: audioTags.get(a.id),
    }));
    const lastGenerationDebug: EditPlanDebugInfo = {
      generatedAt: new Date().toISOString(),
      assetTags,
      draftHistory,
      finalReview: finalReviewResult,
      musicChoice: musicEntry?.fileName ?? null,
      warnings,
    };
    const updated: EditorProject = { ...project, editPlan, lastGenerationDebug };

    onProgress({ step: 'done', message: 'Edit plan ready to review.' });
    return updated;
  } catch (err) {
    onProgress({ step: 'error', message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

/** Deletes all existing captions and regenerates them from actual transcribed asset audio
 * (reusing the same per-asset audio-tagging pipeline as full generation). Used by the
 * "Rerender Captions" autocaptioning button — does not touch clips/music. */
export async function regenerateCaptions(project: EditorProject, onProgress: (p: EditPlanProgress) => void): Promise<EditorProject> {
  const warnings: string[] = [];
  try {
    onProgress({ step: 'tagging-audio', message: 'Listening to your assets...', current: 0, total: project.assets.length });
    const audioTags = await tagAllAssetsAudio(
      project.assets,
      (current, total, fileName) => onProgress({ step: 'tagging-audio', message: `Transcribing ${fileName}...`, current, total }),
      warnings,
    );

    onProgress({ step: 'captioning', message: 'Generating captions from the footage audio...' });
    const captionTrack = project.editPlan.tracks.find((t) => t.kind === 'caption') ?? project.editPlan.tracks[0];
    let captions = buildCaptionsFromAudio(project.editPlan.clips, audioTags, captionTrack.id);
    if (captions.length === 0) {
      const voAsset = project.assets.find((a) => a.type === 'audio');
      const voSegments = voAsset ? audioTags.get(voAsset.id) : undefined;
      if (voSegments?.length) {
        captions = voSegments.map((seg) => ({
          id: randomUUID(),
          trackId: captionTrack.id,
          text: seg.text,
          startSec: seg.startSec,
          endSec: seg.endSec,
          enabled: true,
          style: defaultCaptionStyle(),
        }));
      } else {
        warnings.push('No captions could be generated — no clip carries transcribable speech, and no standalone voiceover asset was found.');
      }
    }

    const assetTags: EditPlanDebugInfo['assetTags'] = project.assets.map((a) => ({
      assetId: a.id,
      fileName: a.fileName,
      audioSegments: audioTags.get(a.id),
    }));
    const lastGenerationDebug: EditPlanDebugInfo = {
      generatedAt: new Date().toISOString(),
      assetTags,
      draftHistory: [],
      finalReview: null,
      musicChoice: null,
      warnings,
    };

    onProgress({ step: 'done', message: 'Captions regenerated.' });
    return { ...project, editPlan: { ...project.editPlan, captions }, lastGenerationDebug };
  } catch (err) {
    onProgress({ step: 'error', message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
