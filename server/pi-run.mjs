import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { armArtifact, dockerCommand, isolation, isId, localDocker, removeContainer } from './pi-build.mjs';

const MAX_OUTPUT = 64 * 1024;
const MINUTE = 60_000;
const motorsStopped = [0, 0];

function runArguments(values) {
  if (!Array.isArray(values) || values.length > 17 || values.some(arg => typeof arg !== 'string' || arg.includes('\0') || Buffer.byteLength(arg) > 256)) {
    throw new Error('Provide up to 16 short program arguments.');
  }
  // The first string is the executable name already supplied by the runtime.
  return values.slice(1);
}

function frame(data) {
  if (!Array.isArray(data.bits) || data.bits.length !== 4 || data.bits.some(bit => bit !== 0 && bit !== 1) ||
      ![-1, 103, 112, 113].includes(data.key) || !Number.isInteger(data.distanceCm) || data.distanceCm < 0 || data.distanceCm > 400 ||
      !Number.isInteger(data.clockMs) || data.clockMs < 0 || data.clockMs > 0xffffffff) throw new Error('Invalid simulated sensor frame.');
  return [...data.bits, data.key, data.distanceCm, data.clockMs].join(' ') + '\n';
}

class PiRun {
  constructor(id, bytes, args, closed) {
    this.name = 'initio-run-' + id;
    this.closed = closed;
    this.screen = '';
    this.messages = '';
    this.buffer = '';
    this.decoder = new StringDecoder();
    this.outputSize = 0;
    this.done = false;
    this.ready = new Promise(resolve => this.started = resolve);
    this.child = spawn(dockerCommand(), [...isolation(this.name, '96m', '8m'), '/opt/initio/run.sh', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.startTimer = setTimeout(() => this.stop('QEMU did not start. Check Docker and run npm run setup:pi if needed.'), 9000);
    this.child.stdin.on('error', () => {});
    this.child.stdout.on('data', chunk => this.output(chunk));
    this.child.stderr.on('data', chunk => {
      this.outputSize += chunk.length;
      if (this.outputSize > MAX_OUTPUT) this.stop('The Pi program produced too much output between ticks.');
      else this.log(chunk.toString('utf8'));
    });
    this.child.once('error', () => this.stop('Docker is unavailable. Start Docker and retry.'));
    this.child.once('close', code => this.exit(code));
    this.child.stdin.write(Buffer.concat([Buffer.from(bytes.length + '\n'), bytes]));
  }

  log(text) { this.messages = (this.messages + text).slice(-2500); }

  terminal() { return [this.screen.trimEnd(), this.messages.trim()].filter(Boolean).join('\n'); }

  idle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.stop('The Pi session expired while idle. Run the program again.'), 3 * MINUTE);
    this.idleTimer.unref();
  }

  output(chunk) {
    if (this.done) return;
    this.outputSize += chunk.length;
    if (this.outputSize > MAX_OUTPUT) return this.stop('The Pi program produced too much output between ticks.');
    this.buffer += this.decoder.write(chunk);
    let newline;
    while (!this.done && (newline = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, '');
      this.buffer = this.buffer.slice(newline + 1);
      if (line === '@INITIO READY' && this.started) {
        clearTimeout(this.startTimer);
        const started = this.started;
        this.started = undefined;
        this.idle();
        started({ ok: true });
        continue;
      }
      if (line.startsWith('@INITIO TERM ') && /^[0-9a-f]{0,4800}$/.test(line.slice(13))) {
        this.screen = Buffer.from(line.slice(13), 'hex').toString('utf8');
        continue;
      }
      const step = line.match(/^@INITIO STEP (\d{1,5}) (-?\d{1,3}) (-?\d{1,3}) ([01])$/);
      if (step && this.pending) {
        const clamp = value => Math.max(-100, Math.min(100, Number(value)));
        this.complete({ motors: [clamp(step[2]), clamp(step[3])], led: step[4] === '1', delay: Math.min(60000, Number(step[1])), terminal: this.terminal() });
      } else if (line) this.log(line + '\n');
    }
  }

  complete(value) {
    clearTimeout(this.stepTimer);
    const pending = this.pending;
    this.pending = undefined;
    pending?.(value);
  }

  step(inputs) {
    if (this.done || this.started || this.pending) throw new Error('The Pi runtime is unavailable or busy.');
    const input = frame(inputs);
    this.idle();
    this.outputSize = 0;
    return new Promise(resolve => {
      this.pending = resolve;
      this.stepTimer = setTimeout(() => this.stop('The ARM program stopped responding. Keep delay(...) or getch() in the control loop.'), 1600);
      this.child.stdin.write(input);
    });
  }

  exit(code) {
    if (this.done) return;
    if (this.started) return this.stop(this.terminal() || 'QEMU exited before the program initialised.');
    const tail = this.buffer + this.decoder.end();
    if (tail) this.log(tail);
    this.complete({ motors: motorsStopped, led: false, delay: 0, terminal: this.terminal(), exit: code ?? 1 });
    this.finish();
  }

  finish() {
    this.done = true;
    clearTimeout(this.startTimer);
    clearTimeout(this.idleTimer);
    clearTimeout(this.stepTimer);
    this.closed();
  }

  stop(error = 'The Pi program was stopped.') {
    if (this.done) return;
    this.started?.({ ok: false, error });
    this.started = undefined;
    this.complete({ error });
    this.finish();
    this.child.stdin.destroy();
    this.child.kill();
    void removeContainer(this.name);
  }
}

export function piRuns() {
  const runs = new Map();
  const starting = new Set();
  const cancelled = new Set();
  return {
    async start({ runId, artifact, args }) {
      if (!isId(runId) || runs.has(runId) || starting.has(runId) || cancelled.has(runId)) throw new Error('Invalid or closed Pi run identifier.');
      if (runs.size + starting.size >= 1) throw new Error('Stop the current ARM/QEMU run before starting another.');
      const value = armArtifact(artifact);
      if (!value) throw new Error('The ARM executable is unavailable. Run make again.');
      starting.add(runId);
      try {
        await localDocker();
        if (cancelled.has(runId)) throw new Error('The Pi run was cancelled.');
        const run = new PiRun(runId, value.bytes, runArguments(args), () => runs.delete(runId));
        runs.set(runId, run);
        starting.delete(runId);
        return await run.ready;
      } finally { starting.delete(runId); }
    },
    step(input) {
      const run = runs.get(input.runId);
      if (!run) throw new Error('Pi run ended. Start the executable again.');
      return run.step(input);
    },
    stop(runId) {
      if (!isId(runId)) return;
      if (cancelled.size >= 24) cancelled.delete(cancelled.values().next().value);
      cancelled.add(runId);
      runs.get(runId)?.stop();
    },
    close() { for (const run of runs.values()) run.stop(); },
  };
}
