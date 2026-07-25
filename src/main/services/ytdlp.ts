import YTDlpWrap from 'yt-dlp-wrap';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolveYtDlpPath } from './binaries';
import { resolveFfmpegPath } from './binaries';

export interface DownloadedAudio {
  audioPath: string;
  title?: string;
}

export async function downloadAudio(
  url: string,
  outDir: string,
  onProgress?: (message: string) => void,
): Promise<DownloadedAudio> {
  const ytDlpPath = await resolveYtDlpPath(onProgress);
  const wrap = new (YTDlpWrap as any)(ytDlpPath);
  fs.mkdirSync(outDir, { recursive: true });
  const id = randomUUID();
  const outTemplate = path.join(outDir, `${id}.%(ext)s`);
  const expectedPath = path.join(outDir, `${id}.mp3`);

  let title: string | undefined;
  try {
    const info = await wrap.getVideoInfo(url);
    title = typeof info?.title === 'string' ? info.title : undefined;
  } catch (err) {
    // Metadata fetch is a nice-to-have (used only for naming the resulting script) — never
    // let it block the actual transcription if the link doesn't support it.
    console.error('[ytdlp] failed to fetch video metadata, proceeding without a title:', err);
  }

  onProgress?.('Downloading media...');
  await wrap.execPromise([
    url,
    '-f', 'bestaudio/best',
    '-x',
    '--audio-format', 'mp3',
    '--ffmpeg-location', resolveFfmpegPath(),
    '-o', outTemplate,
    '--no-playlist',
  ]);

  if (fs.existsSync(expectedPath)) return { audioPath: expectedPath, title };

  // yt-dlp occasionally names the output slightly differently during postprocessing —
  // fall back to any file in outDir that starts with this run's own unique id. Never fall
  // back to "newest file in the directory": that risks silently transcribing a stale file
  // left over from a previous (possibly different) link.
  const match = fs.readdirSync(outDir).find((f) => f.startsWith(id));
  if (match) return { audioPath: path.join(outDir, match), title };

  throw new Error('yt-dlp did not produce an audio file for this link.');
}
