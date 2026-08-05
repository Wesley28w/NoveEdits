export interface ScriptRow {
  id: string;
  said: string;
  shown: string;
  startSec?: number;
  endSec?: number;
}

export interface Script {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sourceUrl?: string;
  accountId?: string;
  rows: ScriptRow[];
}

export interface ScriptSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export interface AccountInfo {
  id: string;
  name: string;
  content: string;
}

export type AssetType = 'video' | 'image' | 'audio';

export interface AssetClip {
  id: string;
  filePath: string;
  fileName: string;
  type: AssetType;
  durationSec?: number;
  width?: number;
  height?: number;
  /** Whether the source file actually has an audio stream (silent b-roll is common). */
  hasAudio?: boolean;
}

export type TrackKind = 'video' | 'overlay' | 'caption' | 'music' | 'sfx';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  /** Stacking/z-order for video+overlay compositing; also UI row order. Higher draws on top / lower in the track list. */
  order: number;
  locked?: boolean;
  hidden?: boolean;
}

/** Region of the SOURCE frame that is visible, all as % of source width/height. */
export interface ClipCrop {
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export interface ClipTransform {
  cropRect: ClipCrop | null;
  rotationDeg: number;
  opacityPct: number;
  /** Center position of the clip's box on the canvas, % of canvas width/height. */
  posXPct: number;
  posYPct: number;
  /** Size of the clip's box as % of canvas (both dimensions, aspect fit inside). */
  scalePct: number;
}

export function defaultClipTransform(): ClipTransform {
  return { cropRect: null, rotationDeg: 0, opacityPct: 100, posXPct: 50, posYPct: 50, scalePct: 100 };
}

export function defaultOverlayTransform(): ClipTransform {
  return { cropRect: null, rotationDeg: 0, opacityPct: 100, posXPct: 78, posYPct: 78, scalePct: 40 };
}

export interface TimelineClip {
  id: string;
  trackId: string;
  assetId: string;
  scriptRowId?: string;
  /** Trim in/out within the source asset. */
  sourceInSec: number;
  sourceOutSec: number;
  /** Absolute position on the master timeline. */
  startSec: number;
  speed: number;
  volumePct: number;
  muted: boolean;
  transform: ClipTransform;
}

export function clipDurationSec(c: Pick<TimelineClip, 'sourceInSec' | 'sourceOutSec' | 'speed'>): number {
  return Math.max(0.01, (c.sourceOutSec - c.sourceInSec) / c.speed);
}

export function clipEndSec(c: Pick<TimelineClip, 'startSec' | 'sourceInSec' | 'sourceOutSec' | 'speed'>): number {
  return c.startSec + clipDurationSec(c);
}

export interface CaptionStyle {
  fontFamily: string;
  fontSizePx: number;
  color: string;
  outlineColor: string;
  bold: boolean;
  italic: boolean;
  posXPct: number;
  posYPct: number;
  maxWidthPct: number;
}

export function defaultCaptionStyle(): CaptionStyle {
  return {
    fontFamily: 'Arial',
    fontSizePx: 64,
    color: '#FFFFFF',
    outlineColor: '#000000',
    bold: true,
    italic: false,
    posXPct: 50,
    posYPct: 85,
    maxWidthPct: 80,
  };
}

export interface CaptionCue {
  id: string;
  trackId: string;
  scriptRowId?: string;
  text: string;
  startSec: number;
  endSec: number;
  enabled: boolean;
  style: CaptionStyle;
}

export interface MusicCue {
  id: string;
  trackId: string;
  filePath: string;
  fileName: string;
  startSec: number;
  endSec: number;
  sourceInSec: number;
  gainDb: number;
  kind: 'music' | 'sfx';
  fadeInSec?: number;
  fadeOutSec?: number;
  tags?: string[];
}

export interface EditPlan {
  tracks: Track[];
  clips: TimelineClip[];
  captions: CaptionCue[];
  music: MusicCue[];
  subtitlesGloballyEnabled: boolean;
}

// A dependency-free id generator for use in this shared file — avoids relying on either
// the DOM `crypto` global (renderer) or Node's `crypto` module (main), whose type
// availability differs between the two tsconfigs this file is compiled under.
function simpleId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultTracks(): Track[] {
  return [
    { id: simpleId(), kind: 'caption', name: 'Captions', order: 100 },
    { id: simpleId(), kind: 'overlay', name: 'Overlay', order: 90 },
    { id: simpleId(), kind: 'video', name: 'Video A', order: 80 },
    { id: simpleId(), kind: 'music', name: 'Music', order: 20 },
    { id: simpleId(), kind: 'sfx', name: 'SFX', order: 10 },
  ];
}

export function blankEditPlan(): EditPlan {
  return { tracks: defaultTracks(), clips: [], captions: [], music: [], subtitlesGloballyEnabled: true };
}

export function projectDurationSec(editPlan: EditPlan): number {
  const clipEnds = editPlan.clips.map((c) => clipEndSec(c));
  const capEnds = editPlan.captions.map((c) => c.endSec);
  const musicEnds = editPlan.music.map((c) => c.endSec);
  return Math.max(0.5, ...clipEnds, ...capEnds, ...musicEnds, 0.5);
}

export interface EditorProject {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  scriptId?: string;
  scriptSnapshot: Script;
  assets: AssetClip[];
  editPlan: EditPlan;
  renderOutputPath?: string;
  /** Defaults to '9:16' (short-form) when absent, via canvasForAspectRatio(). */
  aspectRatio?: '9:16' | '16:9';
  /** Trace of the most recent "Generate Edit Plan" run, for the Generation Info panel. */
  lastGenerationDebug?: EditPlanDebugInfo;
  /** Computed fresh on every load/import (never persisted) — asset ids whose filePath
   * doesn't exist on this machine, e.g. after importing a project from someone else. */
  missingAssetIds?: string[];
}

export interface EditorProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface GeminiApiKeyEntry {
  id: string;
  label: string;
  key: string;
}

export interface AppSettings {
  musicLibraryPath: string | null;
  geminiModel: string;
  geminiApiKeys: GeminiApiKeyEntry[];
  /** Which entry in `geminiApiKeys` is currently used; null falls back to the GEMINI_API_KEY env var. */
  activeGeminiKeyId: string | null;
  theme: ThemeMode;
  /** Hex color, e.g. "#ff6a00". Drives --accent (and derived --accent-hover/--accent-soft). */
  accentColor: string;
  /** Chromium zoom factor applied via webFrame.setZoomFactor — scales all text and UI together. */
  textScale: number;
}

export interface BinaryStatus {
  ffmpeg: boolean;
  ytDlp: boolean;
}

export interface TranscribeProgress {
  stage: 'downloading' | 'extracting-audio' | 'uploading' | 'transcribing' | 'done' | 'error';
  message: string;
}

export interface TranscribeResult {
  rows: ScriptRow[];
  sourceUrl: string;
  title?: string;
}

export type RenderQuality = 'high' | 'medium' | 'low';
export type RenderResolutionScale = 1 | 0.75 | 0.5;

export interface RenderOptions {
  burnInSubtitles: boolean;
  renderBothVersions: boolean;
  outputDir: string;
  /** Maps to an ffmpeg CRF value: high=18, medium=23 (default), low=28. */
  quality: RenderQuality;
  /** Multiplies the project's canvas dimensions (1 = full resolution). */
  resolutionScale: RenderResolutionScale;
}

export interface RenderProgress {
  stage: 'preparing' | 'rendering' | 'rendering-captioned' | 'rendering-plain' | 'done' | 'error';
  percent?: number;
  message: string;
}

export type EditPlanStep =
  | 'tagging-visual'
  | 'tagging-audio'
  | 'planning'
  | 'critiquing'
  | 'hydrating'
  | 'placing-audio'
  | 'captioning'
  | 'final-review'
  | 'done'
  | 'error';

export interface EditPlanProgress {
  step: EditPlanStep;
  message: string;
  current?: number;
  total?: number;
}

export interface MusicLibraryEntry {
  fileName: string;
  filePath: string;
  kind: 'music' | 'sfx';
  source: 'starter' | 'user';
  durationSec?: number;
  tags?: string[];
}

// --- AI generation debug trace, kept alongside a project so its "Generation Info" can be
// inspected after the fact to diagnose why a plan came out the way it did. ---

export interface EditPlanDebugAssetTag {
  assetId: string;
  fileName: string;
  visualSummary?: string;
  visualMoments?: { atSec: number; description: string }[];
  audioSegments?: { text: string; startSec: number; endSec: number }[];
}

export interface EditPlanDebugBeat {
  scriptRowIndex: number;
  assetFileName: string;
  trackKind: string;
  sourceInSec: number;
  sourceOutSec: number;
  isHardCutBefore: boolean;
  isHighEnergyBuildup: boolean;
}

export interface EditPlanDebugDraftSnapshot {
  label: string;
  beats: EditPlanDebugBeat[];
  overallMood: string;
}

export interface EditPlanDebugInfo {
  generatedAt: string;
  assetTags: EditPlanDebugAssetTag[];
  draftHistory: EditPlanDebugDraftSnapshot[];
  finalReview: {
    clipAdjustments: { index: number; sourceInSec: number }[];
    captionRevisions: { index: number; text: string }[];
  } | null;
  musicChoice: string | null;
  warnings: string[];
}
