import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateFiles, safePath } from './project.mjs';
import { runTool as run } from './process.mjs';

const shim = fileURLToPath(new URL('../shim/', import.meta.url));
const standard = new Set('assert complex ctype errno fenv float inttypes iso646 limits locale math setjmp signal stdalign stdarg stdatomic stdbool stddef stdint stdio stdlib stdnoreturn string tgmath threads time uchar unistd wchar wctype'.split(' ').map(name => name + '.h'));
const compatibility = new Set(['initio.h', 'wiringPi.h', 'softPwm.h', 'curses.h', 'ncurses.h']);
const sdkRoot = fileURLToPath(new URL('../.initio-toolchain/emsdk/', import.meta.url));
const setupHelp = 'From the project folder, run npm run setup:compiler, then restart npm run dev.';

export function prepareSource(file, names) {
  // Mask comments while retaining offsets and newlines, so compiler locations still match the editor.
  const normalized = file.text.replace(/\r\n?/g, '\n');
  const masked = normalized.replace(/"(?:\\[^\n]|[^"\\\n])*"|'(?:\\[^\n]|[^'\\\n])*'|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    match => match.startsWith('/') ? match.replace(/[^\n]/g, ' ') : match);
  const lines = normalized.split('\n');
  masked.split('\n').forEach((line, index) => {
    const location = `${file.name}:${index + 1}:1: error: `;
    if (/\\[ \t]*$|\?\?[=/]|%:|\b(?:__asm__?|asm|__has_include(?:_next)?|_Pragma)\b/.test(line)) {
      throw new Error(location + 'Line continuations, alternate directive spellings, inline assembly, and include probing are disabled in the local compiler.');
    }
    const directive = line.match(/^\s*\uFEFF?\s*#\s*([a-zA-Z_][a-zA-Z0-9_]*|\d+)/);
    if (!directive) return;
    if (directive[1] === 'pragma' && line.slice(directive[0].length).trim() === 'once') return;
    if (/^(?:include_next|import|embed|pragma|ident|line|\d+)$/.test(directive[1])) {
      throw new Error(location + 'This preprocessor directive is disabled in the local compiler.');
    }
    if (directive[1] !== 'include') return;
    const include = line.slice(directive[0].length).trim().match(/^(?:<([^<>]+)>|"([^"]+)")$/);
    if (!include) throw new Error(location + 'Use a literal include such as #include <initio.h>.');
    const target = include[1] ?? include[2];
    try { safePath(target); } catch { throw new Error(location + 'Unsafe include path.'); }
    const filename = target.split('/').at(-1);
    if (compatibility.has(filename) && (target === filename || target === 'include/' + filename)) {
      lines[index] = `#include <${filename === 'ncurses.h' ? 'curses.h' : filename}>`;
      return;
    }
    const local = dirname(file.name) === '.' ? target : dirname(file.name) + '/' + target;
    if (!target.endsWith('.h') || !(standard.has(target) || names.has(target) || names.has(local))) {
      throw new Error(location + `Include ${target} is unavailable. Upload your project header or use a supported ISO C/Initio header.`);
    }
  });
  return lines.join('\n');
}

function executablePath(program) {
  return program.includes('/') ? resolve(program) : program;
}

async function optimizer(emcc) {
  const search = emcc.includes('/') ? [emcc] : (process.env.PATH || '').split(':').map(part => resolve(part, emcc));
  for (const candidate of search) {
    try {
      const compiler = await realpath(candidate);
      for (const location of [join(dirname(compiler), '../bin/wasm-opt'), join(dirname(compiler), 'wasm-opt')]) {
        try { await access(location, constants.X_OK); return location; } catch { /* continue searching */ }
      }
    } catch { /* emcc may be installed elsewhere on PATH */ }
  }
  return 'wasm-opt';
}

async function compilerTools() {
  const configuredOptimizer = process.env.WASM_OPT && executablePath(process.env.WASM_OPT);
  if (!process.env.EMCC) {
    const emcc = join(sdkRoot, 'upstream/emscripten/emcc');
    const wasmOpt = join(sdkRoot, 'upstream/bin/wasm-opt');
    const config = join(sdkRoot, '.emscripten');
    try {
      await Promise.all([access(emcc, constants.X_OK), access(wasmOpt, constants.X_OK), access(config, constants.R_OK)]);
      return { emcc, wasmOpt: configuredOptimizer || wasmOpt, env: { EM_CONFIG: config } };
    } catch { /* fall back to an externally installed SDK */ }
  }
  const emcc = executablePath(process.env.EMCC || 'emcc');
  return { emcc, wasmOpt: configuredOptimizer || await optimizer(emcc), env: {} };
}

function missingTool(name) {
  return `Compiler unavailable. Could not start ${name}. ${setupHelp}`;
}

export async function compilerStatus() {
  const { emcc, wasmOpt, env } = await compilerTools();
  const results = await Promise.allSettled([
    run(emcc, ['--version'], undefined, 5000, env),
    run(wasmOpt, ['--version'], undefined, 5000, env),
  ]);
  const names = ['emcc', 'wasm-opt'];
  const missing = results.flatMap((result, index) => result.status === 'rejected' ? [names[index]] : []);
  if (missing.length) return { ready: false, detail: missingTool(missing.join(' and ')) };
  const versions = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const ready = versions.every(result => result.ok);
  const detail = versions.map(result => result.ok ? result.text.split('\n')[0] : result.text).filter(Boolean).join(' · ');
  return { ready, detail: ready ? detail : [detail, setupHelp].filter(Boolean).join(' ') };
}

export async function withStagedProject(input, action) {
  const files = validateFiles(input).filter(file => {
    const name = file.name.split('/').at(-1);
    return name !== 'Makefile' && !compatibility.has(name);
  });
  const names = new Set(files.map(file => file.name));
  const sources = files.filter(file => file.name.endsWith('.c')).map(file => file.name);
  if (!sources.length) throw new Error('Add a .c file with a main function.');
  const staged = files.map(file => ({ ...file, text: prepareSource(file, names) }));
  const folder = await mkdtemp(join(tmpdir(), 'virtual-initio-'));
  try {
    for (const file of staged) {
      const target = join(folder, file.name);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.text);
    }
    return await action(folder, sources);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

export async function compileProject(input, { syntaxOnly = false, strict = false } = {}) {
  return withStagedProject(input, async (folder, sources) => {
    const flags = [
      '-std=c11', '-O1', '-Wall', '-Wextra', '-fno-color-diagnostics',
      '-Werror=implicit-function-declaration', '-I', shim, '-I', '.',
      ...sources.map(source => './' + source),
    ];
    if (strict) flags.push('-Werror');
    if (syntaxOnly) flags.push('-fsyntax-only');
    else flags.push(
      join(shim, 'bridge.c'),
      '-sSTANDALONE_WASM=1', '-sFILESYSTEM=0', '-sERROR_ON_UNDEFINED_SYMBOLS=0',
      '-sINITIAL_MEMORY=4194304', '-sALLOW_MEMORY_GROWTH=0', '-sSTACK_SIZE=131072',
      '-Wl,--export=lab_async_data', '-o', 'compiled.wasm',
    );
    const { emcc, wasmOpt, env } = await compilerTools();
    const compiled = await run(emcc, flags, folder, 45_000, env).catch(error => {
      if (error.code === 'ENOENT' || error.code === 'EACCES') throw new Error(missingTool('emcc'));
      throw error;
    });
    const sanitize = text => text.replaceAll(folder + '/', '').replaceAll(shim, 'shim/').replace(/(^|\n)\.\//g, '$1');
    if (!compiled.ok) return { ok: false, diagnostics: sanitize(compiled.text) };
    if (syntaxOnly) return { ok: true, diagnostics: sanitize(compiled.text) || 'Syntax check passed. No executable was created.' };
    const optimized = await run(wasmOpt, [
      'compiled.wasm', '--asyncify', '--pass-arg=asyncify-imports@env.lab_tick', '-o', 'program.wasm',
    ], folder, 15_000, env).catch(error => {
      if (error.code === 'ENOENT' || error.code === 'EACCES') throw new Error(missingTool('wasm-opt'));
      throw error;
    });
    if (!optimized.ok) return { ok: false, diagnostics: sanitize(optimized.text) };
    const output = join(folder, 'program.wasm');
    if ((await stat(output)).size > 2 * 1024 * 1024) throw new Error('Compiled program exceeds 2 MiB.');
    const wasm = await readFile(output);
    const module = await WebAssembly.compile(wasm);
    const allowed = new Set([
      'env.lab_tick', 'env.lab_sensor', 'env.lab_key', 'env.lab_motor', 'env.lab_terminal',
      'env.lab_range', 'env.lab_clock', 'env.lab_led',
      'wasi_snapshot_preview1.proc_exit', 'wasi_snapshot_preview1.fd_write',
      'wasi_snapshot_preview1.fd_close', 'wasi_snapshot_preview1.fd_seek',
      'wasi_snapshot_preview1.args_sizes_get', 'wasi_snapshot_preview1.args_get',
    ]);
    const unsupported = WebAssembly.Module.imports(module).filter(entry => entry.kind !== 'function' || !allowed.has(entry.module + '.' + entry.name));
    if (unsupported.length) {
      return { ok: false, diagnostics: `Unsupported simulator call(s): ${unsupported.map(entry => entry.name).join(', ')}. No host libraries or hardware are available to C.\n${sanitize(compiled.text)}`.trim() };
    }
    return { ok: true, wasm: wasm.toString('base64'), diagnostics: sanitize(compiled.text) || 'Compilation succeeded.' };
  });
}
