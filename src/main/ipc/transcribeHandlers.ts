import { ipcMain, BrowserWindow } from 'electron';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Channels } from '../../shared/contracts';
import type { TranscribeResult } from '../../shared/types';
import { downloadAudio } from '../services/ytdlp';
import { transcribeAudioFile } from '../services/gemini';
import { transcriptCacheDir } from '../services/paths';

export function registerTranscribeHandlers(): void {
  ipcMain.handle(Channels.transcribeStart, async (event, url: string): Promise<TranscribeResult> => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const send = (stage: string, message: string) =>
      win?.webContents.send(Channels.transcribeProgress, { stage, message });

    let audioPath: string | undefined;
    try {
      send('downloading', 'Downloading media from link...');
      const outDir = transcriptCacheDir();
      const downloaded = await downloadAudio(url, outDir, (m) => send('downloading', m));
      audioPath = downloaded.audioPath;

      send('uploading', 'Uploading audio to Gemini...');
      send('transcribing', 'Transcribing audio...');
      const rows = await transcribeAudioFile(audioPath, 'audio/mpeg');
      rows.forEach((r) => (r.id = r.id || randomUUID()));

      send('done', 'Transcription complete.');
      return { rows, sourceUrl: url, title: downloaded.title };
    } catch (err) {
      send('error', err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      // Each transcription downloads to a fresh unique filename — there's no cache-hit
      // benefit to keeping it around, so clean up rather than growing this directory forever.
      if (audioPath) {
        try {
          fs.unlinkSync(audioPath);
        } catch {
          // best-effort cleanup
        }
      }
    }
  });
}
