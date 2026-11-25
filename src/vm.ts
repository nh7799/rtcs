import type { Bits, Motors } from './physics';

export type Slice = { motors: Motors; led: boolean; delay: number; terminal: string; exit?: number };
export type Hardware = { distanceCm: number; clockMs: number };
const idleHardware = { distanceCm: 0, clockMs: 0 };
type Exports = {
  memory: WebAssembly.Memory;
  _start: () => void;
  lab_async_data: () => number;
  asyncify_start_unwind: (pointer: number) => void;
  asyncify_stop_unwind: () => void;
  asyncify_start_rewind: (pointer: number) => void;
  asyncify_stop_rewind: () => void;
};

export async function makeVM(bytes: ArrayBuffer, args: string[] = ['program']) {
  const stop = Symbol('WASI exit');
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const argumentsZ = args.map(value => encoder.encode(value + '\0'));
  const lines = Array.from({ length: 24 }, () => '');
  let wasm: Exports;
  let state: 'normal' | 'unwinding' | 'suspended' | 'rewinding' = 'normal';
  let bits: Bits = [0, 0, 0, 0];
  const keys: number[] = [];
  let motors: Motors = [0, 0];
  let led = false;
  let hardware = idleHardware;
  let sleep = 0;
  let exit: number | undefined;
  let stdout = '';
  let rendered = '';
  let writes = 0;
  const read = (pointer: number, length: number) => decoder.decode(new Uint8Array(wasm.memory.buffer, pointer, length));
  const view = () => new DataView(wasm.memory.buffer);
  const output = () => [lines.join('\n').trimEnd(), stdout.trimEnd()].filter(Boolean).join('\n');
  const loaded = await WebAssembly.instantiate(bytes, {
    env: {
      lab_tick(milliseconds: number) {
        if (state === 'rewinding') {
          wasm.asyncify_stop_rewind();
          state = 'normal';
          return;
        }
        sleep = milliseconds;
        state = 'unwinding';
        wasm.asyncify_start_unwind(data);
      },
      lab_sensor(channel: number) { return bits[channel] ?? 0; },
      lab_range() { return hardware.distanceCm; },
      lab_clock() { return hardware.clockMs >>> 0; },
      lab_led(on: number) { led = !!on; },
      lab_key() { return keys.shift() ?? -1; },
      lab_motor(left: number, right: number) {
        const limit = (n: number) => Math.max(-100, Math.min(100, n));
        motors = [limit(left), limit(right)];
      },
      lab_terminal(row: number, column: number, pointer: number, length: number) {
        if (++writes > 200) return;
        if (row === -2) {
          rendered = output();
          return;
        }
        if (row === -1) {
          lines.fill('');
          return;
        }
        if (row < 0 || row >= lines.length || column < 0 || column >= 100 || length < 0) return;
        const value = read(pointer, Math.min(100 - column, length));
        const old = lines[row].padEnd(column);
        lines[row] = old.slice(0, column) + value + old.slice(column + value.length);
      },
    },
    wasi_snapshot_preview1: {
      args_sizes_get(argc: number, size: number) {
        const data = view();
        data.setUint32(argc, argumentsZ.length, true);
        data.setUint32(size, argumentsZ.reduce((sum, value) => sum + value.length, 0), true);
        return 0;
      },
      args_get(argv: number, buffer: number) {
        const memory = new Uint8Array(wasm.memory.buffer);
        const data = view();
        argumentsZ.forEach((value, i) => {
          data.setUint32(argv + i * 4, buffer, true);
          memory.set(value, buffer);
          buffer += value.length;
        });
        return 0;
      },
      proc_exit(code: number) { exit = code; throw stop; },
      fd_close() { return 8; },
      fd_seek() { return 8; },
      fd_write(fd: number, iovs: number, count: number, written: number) {
        if (fd !== 1 && fd !== 2) return 8;
        if (count < 0 || count > 128) return 28;
        let total = 0;
        const data = view();
        for (let i = 0; i < count; i++) {
          const pointer = data.getUint32(iovs + i * 8, true);
          const length = data.getUint32(iovs + i * 8 + 4, true);
          if (length > 1024 * 1024) return 28;
          total += length;
          if (++writes <= 200 && length) stdout = (stdout + read(pointer, Math.min(length, 2048))).slice(-3000);
        }
        data.setUint32(written, total, true);
        rendered = output();
        return 0;
      },
    },
  });
  wasm = loaded.instance.exports as unknown as Exports;
  const data = wasm.lab_async_data();
  view().setUint32(data, data + 8, true);
  view().setUint32(data + 4, data + 65536, true);
  return {
    slice(nextBits: Bits, nextKey = -1, inputs: Hardware = idleHardware): Slice {
      if (exit !== undefined) return { motors: [0, 0], led: false, delay: 0, terminal: output(), exit };
      bits = nextBits;
      hardware = inputs;
      if (nextKey === 113) keys.splice(0, keys.length, nextKey);
      else if (nextKey >= 0 && keys.length < 8 && keys[0] !== 113) keys.push(nextKey);
      sleep = 0;
      writes = 0;
      if (state === 'suspended') {
        state = 'rewinding';
        wasm.asyncify_start_rewind(data);
      }
      try {
        wasm._start();
      } catch (error) {
        if (error !== stop) throw error;
      }
      // WASM imports change the scheduler state during the call to _start.
      if ((state as string) === 'unwinding') {
        wasm.asyncify_stop_unwind();
        state = 'suspended';
      } else {
        exit ??= 0;
        motors = [0, 0];
        led = false;
        rendered = output();
      }
      return { motors, led, delay: sleep, terminal: rendered, exit };
    },
  };
}
