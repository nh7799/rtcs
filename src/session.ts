import { World, ZERO, type Motors, type Point, type Pose } from './physics';
import type { Slice } from './vm';

export type Mode = 'paused' | 'running' | 'stopped' | 'finished' | 'fault';
type Reply = { type: 'ready' } | { type: 'slice'; result: Slice } | { type: 'error'; message: string };

export class Session {
  world = new World();
  mode: Mode = 'paused';
  terminal = '';
  led = false;
  args = ['program'];
  binary: ArrayBuffer | null = null;
  piArtifact: string | null = null;
  piOs = false;
  programRevision = 0;
  private piFrameAt = 0;
  private piRun?: string;
  private piCleanup: Promise<unknown> = Promise.resolve();
  demo = false;
  scale = 1;
  private worker?: Worker;
  private waiting?: number;
  private loading = false;
  private pending = false;
  private steps = 0;
  private due = 0;
  private debt = 0;
  private lastCommand: Motors = ZERO;
  private keys: number[] = [];
  private frame = 0;
  private previous = 0;
  private changed: () => void = () => {};
  private pausedAt = 0;
  private quit = false;

  connect(changed: () => void) {
    this.changed = changed;
    const update = (now: number) => {
      const elapsed = Math.min(100, now - (this.previous || now));
      this.previous = now;
      if (this.piOs) {
        if (this.mode === 'running' && now - this.piFrameAt > 1200) this.receivePiOs(0, ZERO, false);
        if (this.mode === 'running') {
          this.debt = Math.min(220, this.debt + elapsed);
          let ticks = 0;
          while (this.debt >= this.world.settings.dt && ticks++ < 12) this.advance();
          if (ticks) this.changed();
        }
      } else {
        if (this.mode === 'running') this.debt = Math.min(220, this.debt + elapsed * this.scale);
        this.pump();
      }
      this.frame = requestAnimationFrame(update);
    };
    this.frame = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(this.frame);
      this.destroyWorker();
    };
  }

  private destroyWorker() {
    this.worker?.terminate();
    this.worker = undefined;
    if (this.piRun) {
      this.piCleanup = fetch('/api/pi/stop', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: this.piRun }), keepalive: true,
      }).catch(() => {});
      this.piRun = undefined;
    }
    window.clearTimeout(this.waiting);
    this.pending = this.loading = false;
  }

  private clearRuntime() {
    this.destroyWorker();
    this.steps = this.due = this.debt = 0;
    this.keys = [];
    this.quit = false;
    this.led = false;
    this.lastCommand = this.world.commands = ZERO;
  }

  private selectProgram(binary: ArrayBuffer | null, artifact: string | null, demo: boolean, stand: boolean) {
    this.programRevision++;
    this.binary = binary;
    this.piArtifact = artifact;
    this.demo = demo;
    if (this.piOs) return this.changed();
    this.clearRuntime();
    this.world.onStand = stand;
    this.mode = 'paused';
    this.terminal = '';
    this.changed();
  }

  load(binary: ArrayBuffer | null, demo = false, stand = false) {
    this.selectProgram(binary, null, demo, stand);
  }

  loadPi(artifact: string, stand: boolean) {
    this.selectProgram(null, artifact, false, stand);
  }

  get canRun() { return !this.piOs && (!!this.binary || !!this.piArtifact || this.demo); }

  usePiOs(active: boolean) {
    if (this.piOs === active) return;
    this.clearRuntime();
    this.piOs = active;
    this.mode = 'paused';
    this.world.reset(null);
    this.world.onStand = active;
    this.changed();
  }

  placePiOs(stand: boolean) {
    if (!this.piOs || stand === this.world.onStand) return;
    this.world.onStand = stand;
    this.world.reset(null);
    this.changed();
  }

  receivePiOs(pid: number, motors: Motors, led: boolean) {
    if (!this.piOs) return;
    this.piFrameAt = performance.now();
    this.lastCommand = this.world.commands = pid ? motors : ZERO;
    this.led = led;
    if (pid) this.mode = 'running';
    else if (this.mode === 'running') {
      this.debt = 0;
      this.world.wheels = ZERO;
      this.mode = 'finished';
    }
    this.changed();
  }

  pause() {
    if (this.piOs) return;
    this.mode = 'paused';
    this.debt = this.steps = 0;
    this.world.commands = ZERO;
    this.pausedAt = this.world.clock;
    this.changed();
  }

  run() {
    if (!this.canRun || this.mode === 'running') return;
    if (['finished', 'stopped', 'fault'].includes(this.mode)) this.clearRuntime();
    this.mode = 'running';
    if (this.world.clock === this.pausedAt) this.debt = Math.max(this.debt, this.world.settings.dt);
    this.changed();
    this.pump();
  }

  step() {
    if (this.mode === 'running' || !this.canRun) return;
    if (['finished', 'stopped', 'fault'].includes(this.mode)) this.clearRuntime();
    this.mode = 'paused';
    this.steps++;
    this.pump();
  }

  key(value: string) {
    if (!this.worker || !'qgp'.includes(value) || this.quit) return;
    this.keys.push(value.charCodeAt(0));
    this.keys = this.keys.slice(-8);
    if (value === 'q') {
      this.keys = [113];
      this.quit = true;
    }
    this.pump();
  }

  stop(mode: Mode = 'stopped') {
    if (this.piOs) return;
    this.clearRuntime();
    this.mode = mode;
    this.world.wheels = ZERO;
    this.changed();
  }

  reset(obstacle?: Point | null, pose?: Pose) {
    if (this.piOs) {
      this.world.reset(obstacle, pose);
      this.changed();
      return;
    }
    this.clearRuntime();
    this.world.reset(obstacle, pose);
    this.mode = 'paused';
    this.terminal = '';
    this.changed();
  }

  private fail(message: string) {
    this.terminal = message;
    this.stop('fault');
  }

  private startWorker() {
    const artifact = this.piArtifact;
    const binary = this.binary;
    if (!artifact && !binary) return;
    const worker = artifact
      ? new Worker(new URL('./pi.worker.ts', import.meta.url), { type: 'module' })
      : new Worker(new URL('./robot.worker.ts', import.meta.url), { type: 'module' });
    this.worker = worker;
    this.loading = true;
    this.waiting = window.setTimeout(() => this.fail(artifact ? 'The Pi runtime could not start. Check Docker.' : 'WebAssembly worker could not start.'), artifact ? 12000 : 3000);
    worker.onerror = event => this.fail(event.message || 'The program worker failed.');
    worker.onmessage = (event: MessageEvent<Reply>) => {
      if (this.worker !== worker) return;
      window.clearTimeout(this.waiting);
      const message = event.data;
      if (message.type === 'error') return this.fail(message.message);
      if (message.type === 'ready') {
        this.loading = false;
      } else {
        this.pending = false;
        const result = message.result;
        this.lastCommand = result.motors;
        this.led = result.led;
        this.terminal = result.terminal;
        this.due = this.world.clock + Math.max(this.world.settings.dt, result.delay);
        if (result.exit !== undefined) {
          this.terminal += `${this.terminal ? '\n' : ''}[C exited with status ${result.exit}]`;
          return this.stop('finished');
        }
        if (this.mode === 'running' || this.steps > 0) this.advance();
        this.changed();
      }
      this.pump();
    };
    if (artifact) {
      const runId = crypto.randomUUID().replaceAll('-', '');
      this.piRun = runId;
      void this.piCleanup.then(() => {
        if (this.worker === worker) worker.postMessage({ type: 'load', artifact, runId, args: this.args });
      });
    } else if (binary) {
      const bytes = binary.slice(0);
      worker.postMessage({ type: 'load', bytes, args: this.args }, [bytes]);
    }
  }

  private advance() {
    this.world.commands = this.lastCommand;
    this.world.tick();
    this.debt = Math.max(0, this.debt - this.world.settings.dt);
    if (this.steps > 0) this.steps--;
    if (this.mode !== 'running') this.world.commands = ZERO;
  }

  private pump() {
    if (this.pending || this.loading) return;
    const dt = this.world.settings.dt;
    if (!this.steps && !(this.mode === 'running' && this.debt >= dt)) return;
    if (this.demo) {
      this.lastCommand = this.world.bits[0] || this.world.bits[1] ? ZERO : [28, 28];
      this.advance();
      this.changed();
      return;
    }
    if (!this.worker) {
      this.startWorker();
      return;
    }
    // Allow up to the current budget of intermediate physics ticks during a C delay.
    let ticks = 0;
    while (this.world.clock + 1e-6 < this.due &&
        (this.steps > 0 || (this.mode === 'running' && this.debt >= dt)) && ticks++ < 12) {
      this.advance();
      this.changed();
    }
    if (this.world.clock + 1e-6 < this.due || (!this.steps && this.debt < dt)) return;
    this.pending = true;
    this.waiting = window.setTimeout(() => this.fail('C stopped responding. Add delay(...) or getch() inside the loop and compile again.'), this.piArtifact ? 2200 : 600);
    this.worker.postMessage({ type: 'slice', bits: this.world.bits, key: this.keys.shift() ?? -1,
      hardware: { distanceCm: this.world.distanceCm, clockMs: this.world.clock } });
  }
}
