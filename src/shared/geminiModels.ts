export interface GeminiModelInfo {
  id: string;
  label: string;
  tier: 'flagship' | 'flash' | 'flash-lite';
  /** Supports audio file input (required for link transcription). */
  multimodal: boolean;
  /**
   * Supports image/video file input via the Files API (required for asset visual tagging).
   * ASSUMPTION, not verified against live Gemini API capability docs: mirrors `multimodal`
   * for every model here except gemini-3.1-pro-preview. If wrong for some model, the
   * generateWithFallback loop already treats ANY request failure as "advance to next model,"
   * so a wrong flag here only costs one wasted upload+call, not a hard failure.
   */
  videoInput: boolean;
  preview: boolean;
}

// Ordered best-default-first. Kept as the single source of truth for both the
// fallback chains below and the Settings model picker UI.
export const GEMINI_MODELS: GeminiModelInfo[] = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', tier: 'flash', multimodal: true, videoInput: true, preview: false },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', tier: 'flash-lite', multimodal: true, videoInput: true, preview: false },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', tier: 'flash-lite', multimodal: true, videoInput: true, preview: false },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', tier: 'flagship', multimodal: false, videoInput: false, preview: true },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', tier: 'flash', multimodal: true, videoInput: true, preview: true },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'flash', multimodal: true, videoInput: true, preview: false },
];

export const DEFAULT_GEMINI_MODEL = GEMINI_MODELS[0].id;

// Every model here supports plain text in/out, so all six are usable for
// rewrite/edit-plan tasks (text-only calls).
export const TEXT_MODEL_CHAIN = GEMINI_MODELS.map((m) => m.id);

// Transcription uploads an audio file, so gemini-3.1-pro-preview (no audio
// input) is excluded from this chain.
export const AUDIO_MODEL_CHAIN = GEMINI_MODELS.filter((m) => m.multimodal).map((m) => m.id);

// Asset visual tagging uploads a video/image file.
export const VISION_MODEL_CHAIN = GEMINI_MODELS.filter((m) => m.videoInput).map((m) => m.id);

/** Puts `preferred` first (if valid), then the rest of `chain` in order, deduped. */
export function buildFallbackChain(chain: readonly string[], preferred: string | null | undefined): string[] {
  if (!preferred) return [...chain];
  return [preferred, ...chain.filter((m) => m !== preferred)];
}
