import { strToU8, zipSync } from 'fflate';

export type Source = { name: string; text: string };
type Workspace = { files: Source[]; originals: Source[]; active: string; args?: string };
export const workspaceKey = 'initio:workspace:1';

export function readSaved(): Workspace | null {
  try {
    const saved = JSON.parse(localStorage.getItem(workspaceKey) || 'null');
    return saved?.files?.length && saved.originals?.length ? saved : null;
  } catch { return null; }
}

export function saveLocal(files: Source[], originals: Source[], active: string, args: string) {
  localStorage.setItem(workspaceKey, JSON.stringify({ files, originals, active, args }));
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportZip(files: Source[]) {
  const bytes = zipSync(Object.fromEntries(files.map(file => [file.name, strToU8(file.text)])));
  download(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' }), 'initio-c-project.zip');
}

export async function importFiles(selection: File[]) {
  if (selection.length === 1 && selection[0].name.endsWith('.zip')) {
    if (selection[0].size > 1024 * 1024) throw new Error('ZIP archives are limited to 1 MiB.');
    const response = await fetch('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: selection[0] });
    const result = await response.json();
    if (!result.ok) throw new Error(result.diagnostics);
    return result.files as Source[];
  }
  if (selection.length > 32 || selection.some(file => !/^[a-zA-Z0-9_][a-zA-Z0-9_. ()-]{0,76}\.(c|h)$/.test(file.name) || file.size > 128 * 1024) ||
      selection.reduce((total, file) => total + file.size, 0) > 512 * 1024) {
    throw new Error('Select up to 32 .c or .h files (128 KiB each, 512 KiB total), or one ZIP.');
  }
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  return Promise.all(selection.map(async file => {
    const text = decoder.decode(await file.arrayBuffer());
    if (text.includes('\0')) throw new Error('Source files must be UTF-8 text.');
    return { name: file.name, text };
  }));
}

export function fromBase64(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0)).buffer;
}
