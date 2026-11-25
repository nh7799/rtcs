import { readdir, readFile, writeFile } from 'node:fs/promises';
import { compileProject } from './compiler.mjs';

const folder = new URL('../public/samples/', import.meta.url);
for (const name of (await readdir(folder)).filter(name => name.endsWith('.c'))) {
  const text = await readFile(new URL(name, folder), 'utf8');
  const result = await compileProject([{ name, text }]);
  if (!result.ok) throw new Error(result.diagnostics);
  await writeFile(new URL(name.replace(/\.c$/, '.wasm'), folder), Buffer.from(result.wasm, 'base64'));
  console.log(`${name}: ${result.diagnostics}`);
}
