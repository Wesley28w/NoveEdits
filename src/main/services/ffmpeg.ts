import ffmpeg from 'fluent-ffmpeg';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolveFfmpegPath, resolveFfprobePath } from './binaries';
import { CANVAS, canvasForAspectRatio, type CanvasSize } from '../../shared/constants';
import type {
  AssetClip,
  AssetType,
  CaptionCue,
  CaptionStyle,
  EditorProject,
  MusicCue,
  RenderOptions,
  RenderQuality,
  TimelineClip,
  Track,
} from '../../shared/types';
import { clipDurationSec } from '../../shared/types';

ffmpeg.setFfmpegPath(resolveFfmpegPath());
ffmpeg.setFfprobePath(resolveFfprobePath());

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg']);

export function assetTypeFromPath(filePath: string): AssetType {
  const ext = path.extname(filePath).toLowerCase();
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';
  return 'image';
}

interface ProbeInfo {
  duration?: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
}

export function probeMedia(filePath: string): Promise<ProbeInfo> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) {
        resolve({ hasAudio: false });
        return;
      }
      const videoStream = data.streams?.find((s) => s.codec_type === 'video');
      const audioStream = data.streams?.find((s) => s.codec_type === 'audio');
      const duration = Number(data.format?.duration);
      resolve({
        duration: Number.isFinite(duration) && duration > 0 ? duration : undefined,
        width: videoStream?.width,
        height: videoStream?.height,
        hasAudio: !!audioStream,
      });
    });
  });
}

export async function probeAsset(filePath: string): Promise<AssetClip> {
  const type = assetTypeFromPath(filePath);
  const info = await probeMedia(filePath);
  return {
    id: randomUUID(),
    filePath,
    fileName: path.basename(filePath),
    type,
    durationSec: type === 'image' ? undefined : info.duration,
    width: info.width,
    height: info.height,
    hasAudio: info.hasAudio,
  };
}

function runFfmpeg(configure: (cmd: ffmpeg.FfmpegCommand) => void, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cmd = ffmpeg();
    configure(cmd);
    cmd
      .on('error', (err) => reject(err))
      .on('end', () => resolve())
      .save(outputPath);
  });
}

function evenize(n: number): number {
  return Math.max(2, Math.round(n / 2) * 2);
}

/** ffmpeg's `atempo` filter only accepts [0.5, 2.0] per stage; chain stages for wider ranges. */
function buildAtempoChain(speed: number): string {
  if (!Number.isFinite(speed) || speed <= 0 || speed === 1) return '';
  const stages: string[] = [];
  let remaining = speed;
  while (remaining > 2.0) {
    stages.push('atempo=2.0');
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    stages.push('atempo=0.5');
    remaining /= 0.5;
  }
  stages.push(`atempo=${remaining.toFixed(4)}`);
  return stages.join(',');
}

/** Lossless 90-degree-step rotation via `transpose`, chained for 180/270. */
function rotationFilter(rotationDeg: number): string {
  const norm = ((Math.round(rotationDeg) % 360) + 360) % 360;
  if (norm === 0) return '';
  if (norm % 90 === 0) {
    const steps = norm / 90;
    return Array(steps).fill('transpose=1').join(',');
  }
  // Arbitrary angle: expand the canvas to fit the rotated rect (transparent fill) rather
  // than cropping corners; the following scale/pad stage then fits it into the clip's box.
  const rad = (rotationDeg * Math.PI) / 180;
  return `rotate=${rad}:fillcolor=black@0.0:ow=rotw(${rad}):oh=roth(${rad})`;
}

interface GraphInput {
  filePath: string;
  options: string[];
}

interface RenderGraph {
  inputs: GraphInput[];
  filterComplex: string;
  videoLabel: string;
  audioLabel: string;
  totalSec: number;
}

/**
 * Pure function: builds the full filter_complex graph for a multi-track project.
 * Independently testable against hand-built fixture EditorProject JSON.
 */
export function buildRenderGraph(project: EditorProject, canvas: CanvasSize = CANVAS): RenderGraph {
  const assetsById = new Map(project.assets.map((a) => [a.id, a]));
  const tracksById = new Map(project.editPlan.tracks.map((t) => [t.id, t]));

  const clips = project.editPlan.clips.filter((c) => assetsById.has(c.assetId));
  const orderedClips = [...clips].sort((a, b) => {
    const orderA = tracksById.get(a.trackId)?.order ?? 0;
    const orderB = tracksById.get(b.trackId)?.order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.startSec - b.startSec;
  });

  const inputs: GraphInput[] = [];
  const filterParts: string[] = [];
  const audioSourceLabels: string[] = [];

  const clipEndTimes = orderedClips.map((c) => c.startSec + clipDurationSec(c));
  const musicEndTimes = project.editPlan.music.map((m) => m.endSec);
  const captionEndTimes = project.editPlan.captions.map((c) => c.endSec);
  const totalSec = Math.max(0.5, ...clipEndTimes, ...musicEndTimes, ...captionEndTimes, 0.5);

  // --- Per-clip visual + audio filter chains ---
  const videoLabels: { label: string; x: number; y: number; startSec: number; endSec: number }[] = [];

  orderedClips.forEach((clip, i) => {
    const asset = assetsById.get(clip.assetId)!;
    const dur = clipDurationSec(clip);
    const inputIdx = inputs.length;

    if (asset.type === 'image') {
      inputs.push({ filePath: asset.filePath, options: ['-loop', '1', '-t', dur.toFixed(3)] });
    } else {
      inputs.push({
        filePath: asset.filePath,
        options: ['-ss', clip.sourceInSec.toFixed(3), '-t', (clip.sourceOutSec - clip.sourceInSec).toFixed(3)],
      });
    }

    const boxW = evenize(canvas.width * (clip.transform.scalePct / 100));
    const boxH = evenize(canvas.height * (clip.transform.scalePct / 100));
    const x = Math.round((canvas.width * clip.transform.posXPct) / 100 - boxW / 2);
    const y = Math.round((canvas.height * clip.transform.posYPct) / 100 - boxH / 2);

    const stages: string[] = [`[${inputIdx}:v]`];
    if (clip.transform.cropRect && asset.width && asset.height) {
      const cw = evenize(asset.width * (clip.transform.cropRect.wPct / 100));
      const ch = evenize(asset.height * (clip.transform.cropRect.hPct / 100));
      const cx = Math.round(asset.width * (clip.transform.cropRect.xPct / 100));
      const cy = Math.round(asset.height * (clip.transform.cropRect.yPct / 100));
      stages.push(`crop=${cw}:${ch}:${cx}:${cy}`);
    }
    if (asset.type !== 'image') stages.push(`setpts=(1/${clip.speed})*PTS`);
    const rot = rotationFilter(clip.transform.rotationDeg);
    if (rot) stages.push(rot);
    stages.push('format=rgba');
    stages.push(`scale=${boxW}:${boxH}:force_original_aspect_ratio=decrease`);
    stages.push(`pad=${boxW}:${boxH}:(ow-iw)/2:(oh-ih)/2:color=black@0.0`);
    stages.push(`colorchannelmixer=aa=${(clip.transform.opacityPct / 100).toFixed(3)}`);
    const vLabel = `v${i}`;
    filterParts.push(`${stages[0]}${stages.slice(1).join(',')}[${vLabel}]`);
    videoLabels.push({ label: vLabel, x, y, startSec: clip.startSec, endSec: clip.startSec + dur });

    if (!clip.muted && asset.hasAudio && asset.type !== 'image') {
      const atempo = buildAtempoChain(clip.speed);
      const delayMs = Math.max(0, Math.round(clip.startSec * 1000));
      const chain = [
        atempo,
        `volume=${(clip.volumePct / 100).toFixed(3)}`,
        `adelay=${delayMs}|${delayMs}`,
      ]
        .filter(Boolean)
        .join(',');
      const aLabel = `ca${i}`;
      filterParts.push(`[${inputIdx}:a]${chain}[${aLabel}]`);
      audioSourceLabels.push(`[${aLabel}]`);
    }
  });

  if (videoLabels.length === 0) {
    throw new Error('No timeline clips to render.');
  }

  // --- Compositing: base canvas + sequential timed overlays ---
  filterParts.push(`color=size=${canvas.width}x${canvas.height}:rate=${canvas.fps}:color=black:duration=${totalSec.toFixed(3)}[base]`);
  let prevLabel = 'base';
  videoLabels.forEach((v, i) => {
    const outLabel = i === videoLabels.length - 1 ? 'vout' : `comp${i}`;
    filterParts.push(
      `[${prevLabel}][${v.label}]overlay=${v.x}:${v.y}:enable='between(t,${v.startSec.toFixed(3)},${v.endSec.toFixed(3)})'[${outLabel}]`,
    );
    prevLabel = outLabel;
  });

  // --- Music/SFX inputs + filter chains ---
  project.editPlan.music.forEach((cue, j) => {
    const inputIdx = inputs.length;
    inputs.push({ filePath: cue.filePath, options: [] });
    const cueDur = Math.max(0.05, cue.endSec - cue.startSec);
    const delayMs = Math.max(0, Math.round(cue.startSec * 1000));
    const stages = [
      `atrim=start=${cue.sourceInSec.toFixed(3)}:duration=${cueDur.toFixed(3)}`,
      'asetpts=PTS-STARTPTS',
    ];
    if (cue.fadeInSec) stages.push(`afade=t=in:st=0:d=${cue.fadeInSec.toFixed(3)}`);
    if (cue.fadeOutSec) stages.push(`afade=t=out:st=${Math.max(0, cueDur - cue.fadeOutSec).toFixed(3)}:d=${cue.fadeOutSec.toFixed(3)}`);
    stages.push(`volume=${cue.gainDb}dB`);
    stages.push(`adelay=${delayMs}|${delayMs}`);
    const label = `m${j}`;
    filterParts.push(`[${inputIdx}:a]${stages.join(',')}[${label}]`);
    audioSourceLabels.push(`[${label}]`);
  });

  // --- Audio mix ---
  if (audioSourceLabels.length === 0) {
    filterParts.push(`anullsrc=r=44100:cl=stereo:d=${totalSec.toFixed(3)}[aout]`);
  } else if (audioSourceLabels.length === 1) {
    filterParts.push(`${audioSourceLabels[0]}anull[aout]`);
  } else {
    filterParts.push(
      `${audioSourceLabels.join('')}amix=inputs=${audioSourceLabels.length}:duration=longest:dropout_transition=2[aout]`,
    );
  }

  return {
    inputs,
    filterComplex: filterParts.join(';'),
    videoLabel: '[vout]',
    audioLabel: '[aout]',
    totalSec,
  };
}

function formatAssTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec - Math.floor(sec)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

/** '#RRGGBB' -> ASS '&HBBGGRR&' (BGR order, no alpha byte needed for \c/\3c). */
function assColorTag(hex: string): string {
  const clean = hex.replace('#', '').padEnd(6, '0');
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return `&H${b}${g}${r}&`.toUpperCase();
}

function wrapForAss(text: string, style: CaptionStyle, canvas: CanvasSize): string {
  const charsPerLine = Math.max(6, Math.floor(((style.maxWidthPct / 100) * canvas.width) / (style.fontSizePx * 0.55)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > charsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.join('\\N');
}

function buildCueOverrideTags(style: CaptionStyle, canvas: CanvasSize): string {
  const x = Math.round((canvas.width * style.posXPct) / 100);
  const y = Math.round((canvas.height * style.posYPct) / 100);
  return (
    `{\\an5\\pos(${x},${y})\\fn${style.fontFamily}\\fs${style.fontSizePx}` +
    `\\1c${assColorTag(style.color)}\\3c${assColorTag(style.outlineColor)}` +
    `\\b${style.bold ? 1 : 0}\\i${style.italic ? 1 : 0}}`
  );
}

function buildAssFile(cues: CaptionCue[], outputPath: string, canvas: CanvasSize = CANVAS): void {
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${canvas.width}
PlayResY: ${canvas.height}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Outline, Shadow, Alignment, MarginL, MarginR, MarginV
Style: Default,Arial,64,&H00FFFFFF,&H00000000,&H80000000,1,3,0,2,60,60,120

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = cues
    .filter((c) => c.enabled)
    .map((c) => {
      const tags = buildCueOverrideTags(c.style, canvas);
      const text = wrapForAss(c.text, c.style, canvas).replace(/\n/g, '\\N');
      return `Dialogue: 0,${formatAssTime(c.startSec)},${formatAssTime(c.endSec)},Default,,0,0,0,,${tags}${text}`;
    })
    .join('\n');
  fs.writeFileSync(outputPath, header + events + '\n', 'utf-8');
}

function burnSubtitles(inputVideo: string, assFile: string, outputPath: string, totalSec: number): Promise<void> {
  // ffmpeg's subtitles filter needs escaped path (colons/backslashes trip its own mini-parser on Windows)
  const escaped = assFile.replace(/\\/g, '/').replace(/:/g, '\\:');
  return runFfmpeg((cmd) => {
    cmd.input(inputVideo).outputOptions([
      '-vf', `subtitles='${escaped}'`,
      '-c:a', 'copy',
      // Re-encoding video via -vf while stream-copying audio can otherwise leave the audio
      // stream with a corrupted duration_ts in the new container (observed: a ~2^48 garbage
      // value) — pinning an explicit output duration forces a correct one.
      '-t', totalSec.toFixed(3),
    ]);
  }, outputPath);
}

const CRF_BY_QUALITY: Record<RenderQuality, number> = { high: 18, medium: 23, low: 28 };

async function renderBaseVideo(graph: RenderGraph, outputPath: string, quality: RenderQuality): Promise<void> {
  await runFfmpeg((cmd) => {
    graph.inputs.forEach((input) => {
      cmd.input(input.filePath);
      if (input.options.length) cmd.inputOptions(input.options);
    });
    cmd
      .complexFilter(graph.filterComplex)
      .outputOptions([
        '-map', graph.videoLabel,
        '-map', graph.audioLabel,
        '-c:v', 'libx264',
        '-crf', String(CRF_BY_QUALITY[quality]),
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-t', graph.totalSec.toFixed(3),
      ]);
  }, outputPath);
}

export async function renderProject(
  project: EditorProject,
  options: RenderOptions,
  tempDir: string,
  onProgress: (stage: string, message: string) => void,
): Promise<string[]> {
  fs.mkdirSync(tempDir, { recursive: true });
  fs.mkdirSync(options.outputDir, { recursive: true });

  onProgress('preparing', 'Building composite timeline...');
  // Projects saved before `hasAudio` existed on AssetClip (or from a probe that failed)
  // have it as `undefined` — re-probe those specific assets rather than guessing, since
  // wrongly assuming audio exists makes ffmpeg's filter graph reference a non-existent
  // stream and hard-fail, while wrongly assuming it doesn't exist silently drops real audio.
  const assets = await Promise.all(
    project.assets.map(async (asset) => {
      if (asset.hasAudio !== undefined || asset.type === 'image') return asset;
      const info = await probeMedia(asset.filePath);
      return { ...asset, hasAudio: info.hasAudio };
    }),
  );
  const fullCanvas = canvasForAspectRatio(project.aspectRatio);
  const scale = options.resolutionScale ?? 1;
  const canvas: CanvasSize = {
    width: evenize(fullCanvas.width * scale),
    height: evenize(fullCanvas.height * scale),
    fps: fullCanvas.fps,
  };
  const graph = buildRenderGraph({ ...project, assets }, canvas);

  onProgress('rendering', 'Compositing tracks and mixing audio...');
  const basePath = path.join(tempDir, 'base.mp4');
  await renderBaseVideo(graph, basePath, options.quality ?? 'medium');

  const outputs: string[] = [];
  const baseName = (project.title || 'render').replace(/[^a-z0-9_\-]+/gi, '_');

  const wantsPlain = !options.burnInSubtitles || options.renderBothVersions;
  const wantsCaptioned = options.burnInSubtitles || options.renderBothVersions;

  if (wantsPlain) {
    onProgress('rendering-plain', 'Writing plain version...');
    const plainOut = path.join(options.outputDir, `${baseName}_nocaptions.mp4`);
    fs.copyFileSync(basePath, plainOut);
    outputs.push(plainOut);
  }

  if (wantsCaptioned) {
    onProgress('rendering-captioned', 'Burning in captions...');
    const assPath = path.join(tempDir, 'subs.ass');
    buildAssFile(project.editPlan.captions, assPath, canvas);
    const captionedOut = path.join(options.outputDir, `${baseName}_captioned.mp4`);
    await burnSubtitles(basePath, assPath, captionedOut, graph.totalSec);
    outputs.push(captionedOut);
  }

  onProgress('done', 'Render complete.');
  return outputs;
}
