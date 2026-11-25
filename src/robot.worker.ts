import { makeVM, type Hardware } from './vm';
import type { Bits } from './physics';

type Request = { type: 'load'; bytes: ArrayBuffer; args: string[] } | { type: 'slice'; bits: Bits; key: number; hardware: Hardware };
let vm: Awaited<ReturnType<typeof makeVM>> | undefined;
self.onmessage = async (event: MessageEvent<Request>) => {
  const message = event.data;
  try {
    if (message.type === 'load') {
      vm = await makeVM(message.bytes, message.args);
      self.postMessage({ type: 'ready' });
      return;
    }
    if (!vm) throw new Error('No C program is loaded.');
    self.postMessage({ type: 'slice', result: vm.slice(message.bits, message.key, message.hardware) });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
