import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const piOsImage = 'initio-lab-pios:1';
export const piOsVersion = '2026-10-06-bookworm-arm64-v2';
export const piOsProject = fileURLToPath(new URL('../', import.meta.url));
export const piOsCode = join(piOsProject, 'pi-os');
export const piOsData = join(piOsProject, '.initio-pi-os');

export function piOsInstance(verify = false) {
  const projectId = createHash('sha256').update(piOsData).digest('hex').slice(0, 16);
  return 'initio-pios-' + projectId + (verify ? '-verify' : '');
}
