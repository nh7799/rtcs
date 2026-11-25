import { randomBytes } from 'node:crypto';
import { withStagedProject } from './compiler.mjs';
import { runTool } from './process.mjs';

export const image = 'initio-lab-pi:1';
const maxAge = 60 * 60 * 1000;
const artifacts = new Map();
const docker = process.env.INITIO_DOCKER || 'docker';

export function dockerCommand() { return docker; }

export async function localDocker() {
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) {
    throw new Error('Use a local Docker socket for the Pi rehearsal.');
  }
  const endpoint = await runTool(docker, ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'], undefined, 5000);
  if (!endpoint.ok || !endpoint.text.startsWith('unix://')) throw new Error('Select a local Docker Desktop or Docker Engine context.');
}

export async function dockerEnginePlatform() {
  await localDocker();
  const result = await runTool(docker, ['version', '--format', '{{.Server.Os}}/{{.Server.Arch}}'], undefined, 7000);
  const platform = result.stdout.toString('utf8').trim();
  if (!result.ok) throw new Error(result.text || 'Start Docker and retry Pi OS setup.');
  if (!/^linux\/[a-z0-9]+$/.test(platform)) throw new Error('Use a Docker engine running Linux containers.');
  return platform;
}

export function newId() { return randomBytes(16).toString('hex'); }
export function isId(id) { return typeof id === 'string' && /^[a-f0-9]{32}$/.test(id); }

export function isolation(name, memory, space) {
  return [
    'run', '--rm', '--interactive', '--pull=never', '--name', name,
    '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--user=65534:65534', '--pids-limit=32', '--cpus=1', '--memory=' + memory, '--memory-swap=' + memory,
    '--tmpfs', '/work:rw,exec,nosuid,nodev,mode=1777,size=' + space,
    '--tmpfs', '/tmp:rw,noexec,nosuid,nodev,mode=1777,size=16m', image,
  ];
}
export function removeContainer(name) {
  return runTool(docker, ['rm', '-f', name], undefined, 5000).catch(() => {});
}

export async function piStatus() {
  try {
    await localDocker();
    const result = await runTool(docker, ['image', 'inspect', '--format', '{{.Id}}', image], undefined, 5000);
    if (result.ok && /^sha256:[0-9a-f]{64}$/.test(result.text)) {
      return { ready: true, detail: 'ARMv7 Linux · GNU make, GCC and QEMU' };
    }
  } catch { /* Browser rehearsal remains available without Docker. */ }
  return { ready: false, detail: 'Start Docker, then run npm run setup:pi in your computer’s terminal.' };
}

export function inspectArm(bytes) {
  if (bytes.length < 52 || !bytes.subarray(0, 7).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1, 1, 1])) ||
      bytes.readUInt16LE(16) !== 2 || bytes.readUInt16LE(18) !== 40 ||
      !(bytes.readUInt32LE(36) & 0x400)) throw new Error('The build did not produce a 32-bit ARM hard-float ELF executable.');
  return 'ELF 32-bit LSB executable, ARM, EABI5 hard-float, statically linked';
}

export function armArtifact(id) {
  const value = isId(id) && artifacts.get(id);
  if (!value || Date.now() - value.created > maxAge) {
    artifacts.delete(id);
    return undefined;
  }
  return value;
}

export async function buildPi(input, { syntaxOnly = false, strict = false } = {}) {
  const status = await piStatus();
  if (!status.ready) return { ok: false, diagnostics: status.detail };
  return withStagedProject(input, async folder => {
    const tar = await runTool('tar', ['-C', folder, '-cf', '-', '.'], undefined, 5000, {}, { binary: true, limit: 1024 * 1024 });
    if (!tar.ok) return { ok: false, diagnostics: tar.text || 'Could not package the project.' };
    const name = 'initio-build-' + newId();
    try {
      const result = await runTool(docker, [
        ...isolation(name, '384m', '32m'), '/opt/initio/build.sh', 'receive', syntaxOnly ? 'check' : 'build', strict ? '1' : '0',
      ], undefined, 45_000, {}, { input: tar.stdout, binary: true, limit: 3 * 1024 * 1024 });
      const diagnostics = result.text.replaceAll('/work/', '').replaceAll('/opt/initio/', '');
      if (!result.ok) {
        return { ok: false, diagnostics: /No such image|Cannot connect to the Docker daemon/.test(diagnostics)
          ? (await piStatus()).detail : diagnostics || 'The Pi compiler stopped before finishing.' };
      }
      if (syntaxOnly) return { ok: true, diagnostics: diagnostics || 'ARM GCC syntax check passed. No executable was created.' };
      if (result.stdout.length > 2 * 1024 * 1024) throw new Error('ARM build exceeds 2 MiB.');
      const description = inspectArm(result.stdout);
      const id = newId();
      for (const previous of artifacts.keys()) armArtifact(previous);
      if (artifacts.size >= 8) artifacts.delete(artifacts.keys().next().value);
      artifacts.set(id, { bytes: result.stdout, created: Date.now() });
      return { ok: true, id, description, diagnostics: diagnostics || 'GNU make and ARM GCC built the Pi practice executable.' };
    } catch (error) {
      if (error.code === 'ENOENT') return { ok: false, diagnostics: (await piStatus()).detail };
      throw error;
    } finally {
      await removeContainer(name);
    }
  });
}
