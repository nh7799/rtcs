import { spawn } from 'node:child_process';

export function runTool(program, args, cwd, timeout = 45_000, toolEnv = {}, {
  input, binary = false, limit = 96 * 1024,
} = {}) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, ...toolEnv };
    for (const key of ['EMCC_CFLAGS', 'EMCC_DEBUG', 'CPATH', 'C_INCLUDE_PATH', 'CPLUS_INCLUDE_PATH', 'LIBRARY_PATH']) delete env[key];
    const child = spawn(program, args, { cwd, env, detached: true, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    const combined = [];
    let size = 0;
    let reason;
    const kill = message => {
      reason = message;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    };
    const timer = setTimeout(() => kill('Tool timed out. Check setup and retry.'), timeout);
    const append = (chunk, stream) => {
      size += chunk.length;
      if (size > limit) {
        if (!reason) kill('Tool output exceeded the limit.');
      } else {
        stream.push(chunk);
        if (!binary || stream === stderr) combined.push(chunk);
      }
    };
    if (child.stdin) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
    child.stdout.on('data', chunk => append(chunk, stdout));
    child.stderr.on('data', chunk => append(chunk, stderr));
    child.once('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('close', code => {
      clearTimeout(timer);
      const text = Buffer.concat(combined).toString('utf8').trim();
      resolve({ ok: code === 0 && !reason, text: [text, reason].filter(Boolean).join('\n'), stdout: Buffer.concat(stdout) });
    });
  });
}
