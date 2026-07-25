import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Channels } from '../../shared/contracts';
import type { Script, ScriptSummary } from '../../shared/types';
import { scriptsDir } from '../services/paths';

function indexFile(): string {
  return path.join(scriptsDir(), 'index.json');
}

function readIndex(): ScriptSummary[] {
  try {
    const raw = fs.readFileSync(indexFile(), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return rebuildIndex();
  }
}

function rebuildIndex(): ScriptSummary[] {
  const dir = scriptsDir();
  const summaries: ScriptSummary[] = [];
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.json') || file === 'index.json') continue;
    try {
      const script: Script = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
      summaries.push({ id: script.id, title: script.title, updatedAt: script.updatedAt });
    } catch {
      // skip corrupt file
    }
  }
  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  writeIndex(summaries);
  return summaries;
}

function writeIndex(summaries: ScriptSummary[]): void {
  fs.writeFileSync(indexFile(), JSON.stringify(summaries, null, 2), 'utf-8');
}

function scriptFile(id: string): string {
  return path.join(scriptsDir(), `${id}.json`);
}

function saveScriptSync(script: Script): Script {
  const now = new Date().toISOString();
  const toSave: Script = {
    ...script,
    id: script.id || randomUUID(),
    createdAt: script.createdAt || now,
    updatedAt: now,
  };
  fs.writeFileSync(scriptFile(toSave.id), JSON.stringify(toSave, null, 2), 'utf-8');
  const idx = readIndex().filter((s) => s.id !== toSave.id);
  idx.unshift({ id: toSave.id, title: toSave.title, updatedAt: toSave.updatedAt });
  writeIndex(idx);
  return toSave;
}

function isValidScriptShape(value: unknown): value is Script {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.title === 'string' && Array.isArray(v.rows);
}

export function registerScriptHandlers(): void {
  ipcMain.handle(Channels.scriptList, () => readIndex());

  ipcMain.handle(Channels.scriptLoad, (_e, id: string) => {
    try {
      return JSON.parse(fs.readFileSync(scriptFile(id), 'utf-8'));
    } catch {
      return null;
    }
  });

  ipcMain.handle(Channels.scriptSave, (_e, script: Script) => saveScriptSync(script));

  ipcMain.handle(Channels.scriptDelete, (_e, id: string) => {
    try {
      fs.unlinkSync(scriptFile(id));
    } catch {
      // already gone
    }
    writeIndex(readIndex().filter((s) => s.id !== id));
  });

  ipcMain.handle(Channels.scriptExport, async (event, script: Script) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const safeName = (script.title || 'script').replace(/[^a-z0-9_\- ]+/gi, '_');
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export Script',
      defaultPath: `${safeName}.novascript`,
      filters: [
        { name: 'NovaEdits Script', extensions: ['novascript'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    fs.writeFileSync(result.filePath, JSON.stringify(script, null, 2), 'utf-8');
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle(Channels.scriptImport, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import Script',
      properties: ['openFile'],
      filters: [
        { name: 'NovaEdits Script', extensions: ['novascript', 'json'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
    } catch {
      throw new Error('That file is not valid JSON.');
    }
    if (!isValidScriptShape(parsed)) {
      throw new Error('That file does not look like a NovaEdits script.');
    }
    // Fresh id/timestamps: this is always imported as a new local script, never overwriting
    // (or colliding with) anything already saved, even if re-importing the same file twice.
    const now = new Date().toISOString();
    const imported: Script = { ...parsed, id: randomUUID(), createdAt: now, updatedAt: now };
    return saveScriptSync(imported);
  });
}
