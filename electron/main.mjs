// Native Mac window for the lab. Run with: npm run app
import { app, BrowserWindow, shell } from 'electron';
import { preview } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
// Apps started from Finder do not inherit the shell PATH, so add where Homebrew and Docker live.
process.env.PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/Applications/Docker.app/Contents/Resources/bin', process.env.PATH].filter(Boolean).join(':');

let server;
app.whenReady().then(async () => {
  server = await preview({ root, preview: { host: '127.0.0.1', port: 4173, strictPort: false, open: false } });
  const base = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:4173/';
  const win = new BrowserWindow({ width: 1500, height: 940, minWidth: 1100, minHeight: 700, title: 'RTCS Lab · Initio', backgroundColor: '#0e1318', webPreferences: { contextIsolation: true, sandbox: true } });
  win.webContents.setWindowOpenHandler(({ url }) => { void shell.openExternal(url); return { action: 'deny' }; });
  await win.loadURL(new URL('?desk=1', base).href);
});
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { void server?.close(); });
