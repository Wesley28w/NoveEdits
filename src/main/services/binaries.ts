import path from 'node:path';
import fs from 'node:fs';
import YTDlpWrap from 'yt-dlp-wrap';
import { binDir } from './paths';

const ffmpegStaticPath = require('ffmpeg-static') as string;
const ffprobeStaticPath = require('ffprobe-static').path as string;

let cachedYtDlpPath: string | null = null;

// ffmpeg-static/ffprobe-static resolve their path relative to their own module location, which
// inside a packaged app sits in app.asar. Electron's patched `fs` transparently redirects reads
// of that path to the unpacked copy on disk (per `asarUnpack` in package.json), but that
// redirection only applies to Electron/Node's own fs calls. yt-dlp.exe and ffmpeg/ffprobe are
// spawned as separate OS processes and receive the path as a plain string, so they need the real
// on-disk path — rewrite `app.asar` -> `app.asar.unpacked` before handing it to them.
function unpackAsarPath(p: string): string {
  return p.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
}

export function resolveFfmpegPath(): string {
  return unpackAsarPath(ffmpegStaticPath);
}

export function resolveFfprobePath(): string {
  return unpackAsarPath(ffprobeStaticPath);
}

function ytDlpTargetPath(): string {
  const exeName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  return path.join(binDir(), 'yt-dlp', exeName);
}

export function isYtDlpInstalled(): boolean {
  return fs.existsSync(ytDlpTargetPath());
}

export async function resolveYtDlpPath(onProgress?: (message: string) => void): Promise<string> {
  const target = ytDlpTargetPath();
  if (cachedYtDlpPath && fs.existsSync(cachedYtDlpPath)) return cachedYtDlpPath;
  if (fs.existsSync(target)) {
    cachedYtDlpPath = target;
    return target;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  onProgress?.('Downloading yt-dlp (one-time setup)...');
  await YTDlpWrap.downloadFromGithub(target);
  cachedYtDlpPath = target;
  return target;
}

export function getBinaryStatus(): { ffmpeg: boolean; ytDlp: boolean } {
  return {
    ffmpeg: fs.existsSync(resolveFfmpegPath()) && fs.existsSync(resolveFfprobePath()),
    ytDlp: isYtDlpInstalled(),
  };
}
