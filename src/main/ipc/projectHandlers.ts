import { ipcMain, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { Channels } from '../../shared/contracts';
import type { AssetClip, EditorProject, EditorProjectSummary, RenderOptions } from '../../shared/types';
import { projectsDir } from '../services/paths';
import { probeAsset, renderProject } from '../services/ffmpeg';

function projectFile(id: string): string {
  return path.join(projectsDir(), id, 'project.json');
}

function computeMissingAssetIds(project: EditorProject): string[] {
  return project.assets.filter((a) => !fs.existsSync(a.filePath)).map((a) => a.id);
}

export function loadProjectSync(id: string): EditorProject | null {
  try {
    const project: EditorProject = JSON.parse(fs.readFileSync(projectFile(id), 'utf-8'));
    return project;
  } catch {
    return null;
  }
}

/** Same as loadProjectSync, but also flags assets whose files are missing on this machine
 * (e.g. after importing a project shared by someone else, or a drive got unplugged). */
function loadProjectWithAssetCheck(id: string): EditorProject | null {
  const project = loadProjectSync(id);
  if (!project) return null;
  const missingAssetIds = computeMissingAssetIds(project);
  return missingAssetIds.length > 0 ? { ...project, missingAssetIds } : project;
}

export function saveProjectSync(project: EditorProject): EditorProject {
  const now = new Date().toISOString();
  // missingAssetIds is computed on load, never persisted — strip it before writing.
  const { missingAssetIds, ...rest } = project;
  const toSave: EditorProject = {
    ...rest,
    id: project.id || randomUUID(),
    createdAt: project.createdAt || now,
    updatedAt: now,
  };
  const dir = path.join(projectsDir(), toSave.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(projectFile(toSave.id), JSON.stringify(toSave, null, 2), 'utf-8');
  return toSave;
}

function isValidProjectShape(value: unknown): value is EditorProject {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.title === 'string' && !!v.editPlan && !!v.scriptSnapshot && Array.isArray(v.assets);
}

export function registerProjectHandlers(): void {
  ipcMain.handle(Channels.projectList, () => {
    const dir = projectsDir();
    const summaries: EditorProjectSummary[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const project = loadProjectSync(entry.name);
      if (project) summaries.push({ id: project.id, title: project.title, updatedAt: project.updatedAt });
    }
    summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return summaries;
  });

  ipcMain.handle(Channels.projectLoad, (_e, id: string) => loadProjectWithAssetCheck(id));

  ipcMain.handle(Channels.projectSave, (_e, project: EditorProject) => saveProjectSync(project));

  ipcMain.handle(Channels.projectDelete, (_e, id: string) => {
    fs.rmSync(path.join(projectsDir(), id), { recursive: true, force: true });
  });

  ipcMain.handle(Channels.projectProbeAssets, async (_e, filePaths: string[]) => {
    return Promise.all(filePaths.map((fp) => probeAsset(fp)));
  });

  ipcMain.handle(Channels.projectRender, async (event, payload: { projectId: string; options: RenderOptions }) => {
    const project = loadProjectSync(payload.projectId);
    if (!project) throw new Error('Project not found.');
    const win = BrowserWindow.fromWebContents(event.sender);
    const tempDir = path.join(os.tmpdir(), 'novaedits-render', project.id);
    const outputs = await renderProject(project, payload.options, tempDir, (stage, message) => {
      win?.webContents.send(Channels.projectRenderProgress, { stage, message });
    });
    return { outputs };
  });

  ipcMain.handle(Channels.projectExport, async (event, project: EditorProject) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const safeName = (project.title || 'project').replace(/[^a-z0-9_\- ]+/gi, '_');
    const result = await dialog.showSaveDialog(win!, {
      title: 'Export Project',
      defaultPath: `${safeName}.novaproject`,
      filters: [
        { name: 'NovaEdits Project', extensions: ['novaproject'] },
        { name: 'JSON', extensions: ['json'] },
      ],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const { missingAssetIds, ...portable } = project;
    fs.writeFileSync(result.filePath, JSON.stringify(portable, null, 2), 'utf-8');
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle(Channels.projectImport, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      title: 'Import Project',
      properties: ['openFile'],
      filters: [
        { name: 'NovaEdits Project', extensions: ['novaproject', 'json'] },
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
    if (!isValidProjectShape(parsed)) {
      throw new Error('That file does not look like a NovaEdits project.');
    }
    const now = new Date().toISOString();
    const imported: EditorProject = { ...parsed, id: randomUUID(), createdAt: now, updatedAt: now };
    const saved = saveProjectSync(imported);
    const missingAssetIds = computeMissingAssetIds(saved);
    // Asset file paths are absolute references from whoever exported this — they almost
    // certainly don't exist on this machine, hence the relink flow the UI shows for these.
    return missingAssetIds.length > 0 ? { ...saved, missingAssetIds } : saved;
  });

  ipcMain.handle(Channels.projectRelinkAsset, async (event, asset: AssetClip) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, {
      title: `Locate "${asset.fileName}"`,
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const probed = await probeAsset(result.filePaths[0]);
    // Keep the original asset id so every TimelineClip/reference that already points at it
    // stays valid — only the file-backed fields (path/dims/duration/audio) get refreshed.
    return { ...probed, id: asset.id };
  });
}
