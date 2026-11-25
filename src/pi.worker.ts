import type { Bits } from './physics';
import type { Hardware } from './vm';

type Message = { type: 'load'; artifact: string; runId: string; args: string[] }
  | { type: 'slice'; bits: Bits; key: number; hardware: Hardware };

let runId: string;

self.onmessage = async (event: MessageEvent<Message>) => {
  const message = event.data;
  try {
    const starting = message.type === 'load';
    if (starting) runId = message.runId;
    const body = starting ? { runId, artifact: message.artifact, args: message.args } :
      { runId, bits: message.bits, key: message.key, distanceCm: message.hardware.distanceCm, clockMs: message.hardware.clockMs >>> 0 };
    const response = await fetch('/api/pi/' + (starting ? 'start' : 'step'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || result.diagnostics || 'Pi request failed.');
    self.postMessage(starting ? { type: 'ready' } : { type: 'slice', result });
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
