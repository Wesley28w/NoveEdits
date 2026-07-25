import { ipcMain, BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Channels } from '../../shared/contracts';
import type { Script, EditorProject } from '../../shared/types';
import { rewriteScriptToAccountStyle } from '../services/gemini';
import { generateFullEditPlan, regenerateCaptions } from '../services/editPlanPipeline';
import { loadProjectSync, saveProjectSync } from './projectHandlers';
import { accountsDir } from '../services/paths';

export function registerGeminiHandlers(): void {
  ipcMain.handle(Channels.geminiRewrite, async (_e, payload: { script: Script; accountId: string }) => {
    const { script, accountId } = payload;
    const accountContent = fs.readFileSync(path.join(accountsDir(), `${accountId}.md`), 'utf-8');
    const accountName = accountId;
    const rows = await rewriteScriptToAccountStyle(script, accountName, accountContent);
    const now = new Date().toISOString();
    const newScript: Script = {
      id: randomUUID(),
      title: `${script.title} (${accountName} style)`,
      createdAt: now,
      updatedAt: now,
      sourceUrl: script.sourceUrl,
      accountId: payload.accountId,
      rows: rows.map((r) => ({ id: randomUUID(), said: r.said, shown: r.shown })),
    };
    return newScript;
  });

  ipcMain.handle(Channels.geminiEditPlan, async (event, payload: { projectId: string }): Promise<EditorProject> => {
    const project = loadProjectSync(payload.projectId);
    if (!project) throw new Error('Project not found.');
    const win = BrowserWindow.fromWebContents(event.sender);
    const updated = await generateFullEditPlan(project, (p) => {
      win?.webContents.send(Channels.geminiEditPlanProgress, p);
    });
    return saveProjectSync(updated);
  });

  ipcMain.handle(Channels.geminiRegenerateCaptions, async (event, payload: { projectId: string }): Promise<EditorProject> => {
    const project = loadProjectSync(payload.projectId);
    if (!project) throw new Error('Project not found.');
    const win = BrowserWindow.fromWebContents(event.sender);
    const updated = await regenerateCaptions(project, (p) => {
      win?.webContents.send(Channels.geminiEditPlanProgress, p);
    });
    return saveProjectSync(updated);
  });
}
