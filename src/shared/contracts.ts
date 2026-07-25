export const Channels = {
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
