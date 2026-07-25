import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function userDataDir(): string {
  return app.getPath('userData');
}

export function scriptsDir(): string {
  return ensureDir(path.join(userDataDir(), 'scripts'));
}

export function accountsDir(): string {
  return ensureDir(path.join(userDataDir(), 'accounts'));
}

export function projectsDir(): string {
  return ensureDir(path.join(userDataDir(), 'projects'));
}

export function cacheDir(): string {
  return ensureDir(path.join(userDataDir(), 'cache'));
}

export function transcriptCacheDir(): string {
  return ensureDir(path.join(cacheDir(), 'transcripts'));
}

export function assetTagsCacheDir(): string {
  return ensureDir(path.join(cacheDir(), 'assetTags'));
}

export function musicTagsCacheFile(): string {
  return path.join(cacheDir(), 'musicTags.json');
}

export function settingsFile(): string {
  return path.join(userDataDir(), 'settings.json');
}

export function resourcesDir(): string {
  // In dev, resources/ lives at the project root. When packaged, electron-builder
  // copies it under process.resourcesPath via extraResources (wired in Phase 8).
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.join(__dirname, '..', '..', '..', 'resources');
}

export function binDir(): string {
  return ensureDir(path.join(resourcesDir(), 'bin'));
}

export function musicStarterPackDir(): string {
  return path.join(resourcesDir(), 'music');
}
