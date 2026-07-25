import { contextBridge, ipcRenderer, webFrame } from 'electron';
import type {
  Script,
  ScriptSummary,
  AccountInfo,
  AppSettings,
  BinaryStatus,
  TranscribeResult,
  EditorProject,
  EditorProjectSummary,
  AssetClip,
  RenderOptions,
  EditPlanProgress,
  MusicLibraryEntry,
} from '../shared/types';

// Sandboxed preload scripts can only require a small whitelist of built-in modules —
// requiring our shared/contracts.ts file here fails at runtime ("module not found"),
// so the channel name constants are duplicated inline (must stay in sync with
// src/shared/contracts.ts) instead of imported.
const Channels = {
  scriptList: 'script:list',
  scriptLoad: 'script:load',
  scriptSave: 'script:save',
  scriptDelete: 'script:delete',
  scriptExport: 'script:export',
  scriptImport: 'script:import',

  accountList: 'account:list',
  accountLoad: 'account:load',
  accountSave: 'account:save',
  accountDelete: 'account:delete',

  pdfExport: 'pdf:export',

  geminiRewrite: 'gemini:rewrite',
  geminiEditPlan: 'gemini:editPlan',
  geminiEditPlanProgress: 'gemini:editPlanProgress',
  geminiRegenerateCaptions: 'gemini:regenerateCaptions',

  musicLibraryList: 'musicLibrary:list',

  transcribeStart: 'transcribe:start',
  transcribeProgress: 'transcribe:progress',

  binariesStatus: 'binaries:status',
  binariesEnsureYtDlp: 'binaries:ensureYtDlp',

  settingsGet: 'settings:get',
  settingsSave: 'settings:save',

  fsPickFiles: 'fs:pickFiles',
  fsPickFolder: 'fs:pickFolder',
  fsPickSaveLocation: 'fs:pickSaveLocation',

  projectList: 'project:list',
  projectLoad: 'project:load',
  projectSave: 'project:save',
  projectDelete: 'project:delete',
  projectExport: 'project:export',
  projectImport: 'project:import',
  projectProbeAssets: 'project:probeAssets',
  projectRender: 'project:render',
  projectRenderProgress: 'project:renderProgress',
  projectRelinkAsset: 'project:relinkAsset',
} as const;

const api = {
  scripts: {
    list: (): Promise<ScriptSummary[]> => ipcRenderer.invoke(Channels.scriptList),
    load: (id: string): Promise<Script | null> => ipcRenderer.invoke(Channels.scriptLoad, id),
    save: (script: Script): Promise<Script> => ipcRenderer.invoke(Channels.scriptSave, script),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(Channels.scriptDelete, id),
    export: (script: Script): Promise<{ canceled: boolean; filePath?: string }> =>
      ipcRenderer.invoke(Channels.scriptExport, script),
    import: (): Promise<Script | null> => ipcRenderer.invoke(Channels.scriptImport),
  },
  accounts: {
    list: (): Promise<AccountInfo[]> => ipcRenderer.invoke(Channels.accountList),
    load: (id: string): Promise<AccountInfo | null> => ipcRenderer.invoke(Channels.accountLoad, id),
    save: (account: AccountInfo): Promise<AccountInfo> => ipcRenderer.invoke(Channels.accountSave, account),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(Channels.accountDelete, id),
  },
  pdf: {
    export: (script: Script): Promise<{ canceled: boolean; filePath?: string }> =>
      ipcRenderer.invoke(Channels.pdfExport, script),
  },
  gemini: {
    rewrite: (payload: { script: Script; accountId: string }): Promise<Script> =>
      ipcRenderer.invoke(Channels.geminiRewrite, payload),
    editPlan: (payload: { projectId: string }): Promise<EditorProject> =>
      ipcRenderer.invoke(Channels.geminiEditPlan, payload),
    regenerateCaptions: (payload: { projectId: string }): Promise<EditorProject> =>
      ipcRenderer.invoke(Channels.geminiRegenerateCaptions, payload),
    onEditPlanProgress: (cb: (p: EditPlanProgress) => void) => {
      const listener = (_e: unknown, data: EditPlanProgress) => cb(data);
      ipcRenderer.on(Channels.geminiEditPlanProgress, listener);
      return () => ipcRenderer.removeListener(Channels.geminiEditPlanProgress, listener);
    },
  },
  musicLibrary: {
    list: (): Promise<MusicLibraryEntry[]> => ipcRenderer.invoke(Channels.musicLibraryList),
  },
  transcribe: {
    start: (url: string): Promise<TranscribeResult> => ipcRenderer.invoke(Channels.transcribeStart, url),
    onProgress: (cb: (p: { stage: string; message: string }) => void) => {
      const listener = (_e: unknown, data: { stage: string; message: string }) => cb(data);
      ipcRenderer.on(Channels.transcribeProgress, listener);
      return () => ipcRenderer.removeListener(Channels.transcribeProgress, listener);
    },
  },
  binaries: {
    status: (): Promise<BinaryStatus> => ipcRenderer.invoke(Channels.binariesStatus),
    ensureYtDlp: (): Promise<void> => ipcRenderer.invoke(Channels.binariesEnsureYtDlp),
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(Channels.settingsGet),
    save: (settings: AppSettings): Promise<AppSettings> => ipcRenderer.invoke(Channels.settingsSave, settings),
  },
  system: {
    // Native Chromium zoom — scales all text/layout together, crisply, without touching
    // every component's px-based inline styles.
    setZoom: (factor: number): void => {
      webFrame.setZoomFactor(factor);
    },
  },
  fs: {
    pickFiles: (filters?: { name: string; extensions: string[] }[]): Promise<string[]> =>
      ipcRenderer.invoke(Channels.fsPickFiles, filters),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke(Channels.fsPickFolder),
  },
  projects: {
    list: (): Promise<EditorProjectSummary[]> => ipcRenderer.invoke(Channels.projectList),
    load: (id: string): Promise<EditorProject | null> => ipcRenderer.invoke(Channels.projectLoad, id),
    save: (project: EditorProject): Promise<EditorProject> => ipcRenderer.invoke(Channels.projectSave, project),
    delete: (id: string): Promise<void> => ipcRenderer.invoke(Channels.projectDelete, id),
    probeAssets: (filePaths: string[]): Promise<AssetClip[]> =>
      ipcRenderer.invoke(Channels.projectProbeAssets, filePaths),
    render: (payload: { projectId: string; options: RenderOptions }): Promise<{ outputs: string[] }> =>
      ipcRenderer.invoke(Channels.projectRender, payload),
    onRenderProgress: (cb: (p: { stage: string; percent?: number; message: string }) => void) => {
      const listener = (_e: unknown, data: { stage: string; percent?: number; message: string }) => cb(data);
      ipcRenderer.on(Channels.projectRenderProgress, listener);
      return () => ipcRenderer.removeListener(Channels.projectRenderProgress, listener);
    },
    export: (project: EditorProject): Promise<{ canceled: boolean; filePath?: string }> =>
      ipcRenderer.invoke(Channels.projectExport, project),
    import: (): Promise<EditorProject | null> => ipcRenderer.invoke(Channels.projectImport),
    relinkAsset: (asset: AssetClip): Promise<AssetClip | null> =>
      ipcRenderer.invoke(Channels.projectRelinkAsset, asset),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
