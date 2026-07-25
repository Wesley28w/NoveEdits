import 'dotenv/config';
import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { registerScriptHandlers } from './ipc/scriptHandlers';
import { registerAccountHandlers } from './ipc/accountHandlers';
import { registerPdfHandlers } from './ipc/pdfHandlers';
import { registerGeminiHandlers } from './ipc/geminiHandlers';
import { registerTranscribeHandlers } from './ipc/transcribeHandlers';
import { registerFsHandlers } from './ipc/fsHandlers';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerProjectHandlers } from './ipc/projectHandlers';
import { registerMusicLibraryHandlers } from './ipc/musicLibraryHandlers';
import { ipcMain } from 'electron';
import { Channels } from '../shared/contracts';
import { getBinaryStatus, resolveYtDlpPath } from './services/binaries';

// Electron derives the userData storage path (app.getPath('userData')) from the app name,
// which otherwise now resolves from package.json's "name" ("novaedits") since the app was
// rebranded from "Reeler". Pinning it here keeps existing users' saved scripts/projects/
// accounts at their original location (%APPDATA%/reeler) instead of silently starting them
// over in a new, empty folder — this is purely an internal storage identity, invisible to
// the user; the window title/branding is set separately via index.html's <title> + App.tsx.
app.setName('reeler');

const isDev = process.env.NODE_ENV === 'development';

function registerBinaryHandlers(): void {
  ipcMain.handle(Channels.binariesStatus, () => getBinaryStatus());
  ipcMain.handle(Channels.binariesEnsureYtDlp, async () => {
    await resolveYtDlpPath();
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'NovaEdits',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
    win.webContents.on('did-fail-load', (_e, code, desc) => {
      console.error(`[renderer] failed to load: ${code} ${desc}`);
    });
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  registerScriptHandlers();
  registerAccountHandlers();
  registerPdfHandlers();
  registerGeminiHandlers();
  registerTranscribeHandlers();
  registerFsHandlers();
  registerSettingsHandlers();
  registerProjectHandlers();
  registerBinaryHandlers();
  registerMusicLibraryHandlers();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
