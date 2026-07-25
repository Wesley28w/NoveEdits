import { ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Channels } from '../../shared/contracts';
import type { AccountInfo } from '../../shared/types';
import { accountsDir } from '../services/paths';

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || randomUUID();
}

function fileFor(id: string): string {
  return path.join(accountsDir(), `${id}.md`);
}

export function registerAccountHandlers(): void {
  ipcMain.handle(Channels.accountList, () => {
    const dir = accountsDir();
    const accounts: AccountInfo[] = [];
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith('.md')) continue;
      const id = file.replace(/\.md$/, '');
      const content = fs.readFileSync(path.join(dir, file), 'utf-8');
      accounts.push({ id, name: id, content });
    }
    accounts.sort((a, b) => a.name.localeCompare(b.name));
    return accounts;
  });

  ipcMain.handle(Channels.accountLoad, (_e, id: string) => {
    try {
      const content = fs.readFileSync(fileFor(id), 'utf-8');
      return { id, name: id, content };
    } catch {
      return null;
    }
  });

  ipcMain.handle(Channels.accountSave, (_e, account: AccountInfo) => {
    const id = account.id || slugify(account.name);
    // if renamed, remove the old file
    if (account.id && account.id !== id && fs.existsSync(fileFor(account.id))) {
      fs.unlinkSync(fileFor(account.id));
    }
    fs.writeFileSync(fileFor(id), account.content, 'utf-8');
    return { id, name: id, content: account.content };
  });

  ipcMain.handle(Channels.accountDelete, (_e, id: string) => {
    try {
      fs.unlinkSync(fileFor(id));
    } catch {
      // already gone
    }
  });
}
