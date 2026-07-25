/// <reference types="vite/client" />

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
} from '@shared/types';

interface NovaEditsApi {
  scripts: {
    list: () => Promise<ScriptSummary[]>;
    load: (id: string) => Promise<Script | null>;
    save: (script: Script) => Promise<Script>;
    delete: (id: string) => Promise<void>;
    export: (script: Script) => Promise<{ canceled: boolean; filePath?: string }>;
    import: () => Promise<Script | null>;
  };
  accounts: {
    list: () => Promise<AccountInfo[]>;
    load: (id: string) => Promise<AccountInfo | null>;
    save: (account: AccountInfo) => Promise<AccountInfo>;
    delete: (id: string) => Promise<void>;
  };
  pdf: {
    export: (script: Script) => Promise<{ canceled: boolean; filePath?: string }>;
  };
  gemini: {
    rewrite: (payload: { script: Script; accountId: string }) => Promise<Script>;
    editPlan: (payload: { projectId: string }) => Promise<EditorProject>;
    regenerateCaptions: (payload: { projectId: string }) => Promise<EditorProject>;
    onEditPlanProgress: (cb: (p: EditPlanProgress) => void) => () => void;
  };
  musicLibrary: {
    list: () => Promise<MusicLibraryEntry[]>;
  };
  transcribe: {
    start: (url: string) => Promise<TranscribeResult>;
    onProgress: (cb: (p: { stage: string; message: string }) => void) => () => void;
  };
  binaries: {
    status: () => Promise<BinaryStatus>;
    ensureYtDlp: () => Promise<void>;
  };
  settings: {
    get: () => Promise<AppSettings>;
    save: (settings: AppSettings) => Promise<AppSettings>;
  };
  system: {
    setZoom: (factor: number) => void;
  };
  fs: {
    pickFiles: (filters?: { name: string; extensions: string[] }[]) => Promise<string[]>;
    pickFolder: () => Promise<string | null>;
  };
  projects: {
    list: () => Promise<EditorProjectSummary[]>;
    load: (id: string) => Promise<EditorProject | null>;
    save: (project: EditorProject) => Promise<EditorProject>;
    delete: (id: string) => Promise<void>;
    probeAssets: (filePaths: string[]) => Promise<AssetClip[]>;
    render: (payload: { projectId: string; options: RenderOptions }) => Promise<{ outputs: string[] }>;
    onRenderProgress: (cb: (p: { stage: string; percent?: number; message: string }) => void) => () => void;
    export: (project: EditorProject) => Promise<{ canceled: boolean; filePath?: string }>;
    import: () => Promise<EditorProject | null>;
    relinkAsset: (asset: AssetClip) => Promise<AssetClip | null>;
  };
}

declare global {
  interface Window {
    api: NovaEditsApi;
  }
}

export {};
