import { ipcMain } from 'electron';
import { Channels } from '../../shared/contracts';
import { listMusicLibrary } from '../services/musicLibrary';

export function registerMusicLibraryHandlers(): void {
  ipcMain.handle(Channels.musicLibraryList, () => listMusicLibrary());
}
