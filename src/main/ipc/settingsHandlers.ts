import { ipcMain } from 'electron';
import fs from 'node:fs';
import { Channels } from '../../shared/contracts';
import type { AppSettings } from '../../shared/types';
import { settingsFile } from '../services/paths';
import { DEFAULT_GEMINI_MODEL } from '../../shared/geminiModels';

const DEFAULT_SETTINGS: AppSettings = {
  musicLibraryPath: null,
  geminiModel: DEFAULT_GEMINI_MODEL,
  theme: 'system',
  accentColor: '#ff6a00',
  textScale: 1,
};

export function readSettingsSync(): AppSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf-8')) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettingsSync(settings: AppSettings): void {
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2), 'utf-8');
}

export function registerSettingsHandlers(): void {
  ipcMain.handle(Channels.settingsGet, () => readSettingsSync());
  ipcMain.handle(Channels.settingsSave, (_e, settings: AppSettings) => {
    writeSettingsSync(settings);
    return settings;
  });
}
