import path from 'node:path';
import fs from 'node:fs';
import YTDlpWrap from 'yt-dlp-wrap';
import { binDir } from './paths';

const ffmpegStaticPath = require('ffmpeg-static') as string;

let cachedYtDlpPath: string | null = null;

export function resolveFfmpegPath(): string {
  return ffmpegStaticPath;
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
    ffmpeg: fs.existsSync(ffmpegStaticPath),
    ytDlp: isYtDlpInstalled(),
  };
}
