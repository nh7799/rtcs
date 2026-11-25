import yauzl from 'yauzl';

export const MAX_FILES = 32;
export const MAX_FILE = 128 * 1024;
export const MAX_TOTAL = 512 * 1024;
export const MAX_ARCHIVE = 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const segment = /^[a-zA-Z0-9_][a-zA-Z0-9_. ()-]{0,79}$/;

export function safePath(name, directory = false) {
  const normalized = directory ? name.replace(/\/$/, '') : name;
  const parts = normalized.split('/');
  if (normalized.length > 220 || parts.length > 8 ||
      parts.some(part => !segment.test(part) || /[. ]$/.test(part) || /^(con|nul|prn|aux|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error(`Unsafe project path: ${name}`);
  }
  return normalized;
}

export function sourcePath(name) {
  safePath(name);
  if (!/\.(c|h)$|(?:^|\/)Makefile$/.test(name)) throw new Error(`Unsupported project file: ${name}. Use .c, .h, or Makefile.`);
  return name;
}

export function validateFiles(value) {
  const names = new Set();
  let total = 0;
  if (!Array.isArray(value) || !value.length || value.length > MAX_FILES) throw new Error('A project must contain 1–32 files.');
  return value.map(({ name, text } = {}) => {
    if (typeof name !== 'string' || typeof text !== 'string' || text.includes('\0')) throw new Error('Project files must be UTF-8 text.');
    sourcePath(name);
    const canonical = name.toLowerCase();
    if (names.has(canonical) || [...names].some(existing => canonical.startsWith(existing + '/') || existing.startsWith(canonical + '/'))) {
      throw new Error(`Conflicting or duplicate project file: ${name}`);
    }
    names.add(canonical);
    const length = Buffer.byteLength(text);
    total += length;
    if (length > MAX_FILE || total > MAX_TOTAL) throw new Error('Source limit exceeded (128 KiB per file, 512 KiB per project).');
    return { name, text };
  });
}

export async function importZip(bytes) {
  if (bytes.length > MAX_ARCHIVE) throw new Error('ZIP archives are limited to 1 MiB.');
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, strictFileNames: true }, (error, zip) => {
      if (error) return reject(error);
      const files = [];
      let total = 0;
      const fail = error => { zip.close(); reject(error); };
      zip.on('error', fail);
      zip.on('end', () => {
        try { resolve(validateFiles(files)); } catch (error) { reject(error); }
      });
      if (zip.entryCount > 96) return fail(new Error('ZIP has too many entries.'));
      zip.on('entry', entry => {
        const name = entry.fileName;
        const directory = name.endsWith('/');
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        try {
          if (mode !== 0 && mode !== (directory ? 0o040000 : 0o100000)) throw new Error(`Unsupported ZIP entry type: ${name}`);
          // macOS archive metadata is discarded, after checking its components and mode.
          if (/^(?:__MACOSX\/)?(?:[a-zA-Z0-9_][a-zA-Z0-9_. ()-]*\/)*(?:\.DS_Store|\._[a-zA-Z0-9_][a-zA-Z0-9_. ()-]*)$/.test(name)) {
            const parent = name.split('/').slice(0, -1).join('/');
            if (parent) safePath(parent, true);
            return zip.readEntry();
          }
          safePath(name, directory);
          if (directory) return zip.readEntry();
          sourcePath(name);
          total += entry.uncompressedSize;
          if (entry.uncompressedSize > MAX_FILE || total > MAX_TOTAL || files.length >= MAX_FILES) {
            throw new Error('ZIP exceeds the source size or file count limit.');
          }
          zip.openReadStream(entry, (error, stream) => {
            if (error) return fail(error);
            const chunks = [];
            stream.on('error', fail);
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('end', () => {
              try {
                files.push({ name, text: decoder.decode(Buffer.concat(chunks)) });
                zip.readEntry();
              } catch (error) { fail(error); }
            });
          });
        } catch (error) { fail(error); }
      });
      zip.readEntry();
    });
  });
}
