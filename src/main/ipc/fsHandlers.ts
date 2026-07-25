import { ipcMain, dialog, BrowserWindow } from 'electron';
import { Channels } from '../../shared/contracts';

export function registerFsHandlers(): void {
  ipcMain.handle(
    Channels.fsPickFiles,
    async (event, filters?: { name: string; extensions: string[] }[]) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const result = await dialog.showOpenDialog(win!, {
        properties: ['openFile', 'multiSelections'],
        filters: filters?.length ? filters : undefined,
      });
      return result.canceled ? [] : result.filePaths;
    },
  );

  ipcMain.handle(Channels.fsPickFolder, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
}
