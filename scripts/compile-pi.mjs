import { lstat, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, relative, resolve } from 'node:path';
import { armArtifact, buildPi } from '../server/pi-build.mjs';
import { MAX_FILE } from '../server/project.mjs';

try {
  const args = process.argv.slice(2);
  const syntaxOnly = args[0] === '--syntax-only';
  const paths = syntaxOnly ? args.slice(1) : args;
  if (!paths[0]?.endsWith('.c')) throw new Error('Run npm run compile:pi -- path/to/testIR.c [other-project-files].');
  const root = dirname(resolve(paths[0]));
  const sources = [];
  for (const path of paths) {
    const absolute = resolve(path);
    const name = relative(root, absolute);
    const stat = await lstat(absolute);
    if (!stat.isFile() || name.startsWith('..') || stat.size > MAX_FILE) throw new Error('Choose regular source files under the entry file’s directory.');
    sources.push({ name, text: await readFile(absolute, 'utf8') });
  }
  const result = await buildPi(sources, { syntaxOnly });
  if (!result.ok) throw new Error(result.diagnostics);
  console.log(result.diagnostics);
  if (result.id) {
    const output = resolve(root, basename(paths[0], '.c') + '-sim-armhf');
    await writeFile(output, armArtifact(result.id).bytes, { flag: 'wx', mode: 0o600 });
    console.log(result.description);
    console.log('Saved simulator build to ' + output + '\nInspect it with file. Build the source with the tutor’s Makefile for the physical robot.');
  }
} catch (error) {
  console.error(error?.code === 'EEXIST' ? 'A simulator output already exists. Move it aside before rebuilding.' : error.message);
  process.exitCode = 1;
}
