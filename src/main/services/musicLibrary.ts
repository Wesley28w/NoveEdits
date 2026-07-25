import fs from 'node:fs';
import path from 'node:path';
import { musicStarterPackDir } from './paths';
import { readSettingsSync } from '../ipc/settingsHandlers';
import { probeMedia } from './ffmpeg';
import { tagSfxByFilename } from '../../shared/audioTaxonomy';
import type { MusicLibraryEntry } from '../../shared/types';

const AUDIO_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg']);

async function scanDir(dir: string, source: 'starter' | 'user'): Promise<MusicLibraryEntry[]> {
  if (!fs.existsSync(dir)) return [];
  const entries: MusicLibraryEntry[] = [];
  for (const file of fs.readdirSync(dir)) {
    const ext = path.extname(file).toLowerCase();
    if (!AUDIO_EXT.has(ext)) continue;
    const lower = file.toLowerCase();
    const kind: 'music' | 'sfx' = lower.includes('sfx') || lower.includes('effect') ? 'sfx' : 'music';
    const filePath = path.join(dir, file);
    const info = await probeMedia(filePath);
    entries.push({
      fileName: file,
      filePath,
      kind,
      source,
      durationSec: info.duration,
      tags: kind === 'sfx' ? tagSfxByFilename(file) : undefined,
    });
  }
  return entries;
}

export async function listMusicLibrary(): Promise<MusicLibraryEntry[]> {
  const settings = readSettingsSync();
  const starter = await scanDir(musicStarterPackDir(), 'starter');
  const user = settings.musicLibraryPath ? await scanDir(settings.musicLibraryPath, 'user') : [];

  // If the user's configured library folder is (or overlaps with) the bundled starter pack
  // directory, both scans return the same files — dedupe by resolved path so the UI/timeline
  // never sees (or drags in) the same track twice.
  const byPath = new Map<string, MusicLibraryEntry>();
  for (const entry of [...user, ...starter]) {
    const key = path.resolve(entry.filePath).toLowerCase();
    if (!byPath.has(key)) byPath.set(key, entry);
  }
  return [...byPath.values()];
}
