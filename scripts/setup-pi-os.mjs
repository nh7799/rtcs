import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, chmod, copyFile, mkdir, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dockerCommand, dockerEnginePlatform, newId, removeContainer } from '../server/pi-build.mjs';
import { piOsCode, piOsData, piOsImage, piOsProject, piOsVersion } from '../server/pi-os-config.mjs';
import { runTool } from '../server/process.mjs';

const release = '2026-10-06';
const archive = `https://downloads.raspberrypi.com/raspios_oldstable_lite_arm64/images/raspios_oldstable_lite_arm64-${release}/${release}-raspios-bookworm-arm64-lite.img.xz`;
const archiveDigest = '9e938c5a6981c3f498b3b564c527f3e1fd58ef20bbf703be0eea748384a6c1af';
const ncurses = [
  ['libncurses6', 'bb5013fc7f24f3ed740d50449bfea3fb4ffce1e33787b6bc7f82ea3d377bc03c'],
  ['libncurses-dev', 'a33e3269e924132dd49b4424754ca63ae2b901a89bc8a3f541e962d67bee9d41'],
];
const docker = dockerCommand();

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with status ${code}.`));
    });
  });
}

async function exists(path) { return access(path).then(() => true, () => false); }

async function digest(path) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest('hex');
}

async function download(path, url, expected) {
  if (await exists(path) && await digest(path) === expected) return;
  const part = path + '.partial';
  try {
    await run('curl', ['--fail', '--location', '--retry', '2', '--output', part, url]);
    if (await digest(part) !== expected) throw new Error('Downloaded file did not match its published checksum.');
    await rename(part, path);
  } finally { await rm(part, { force: true }); }
}

async function setup() {
  process.umask(0o077);
  const platform = await dockerEnginePlatform();
  const buildImage = () => run(docker, ['build', '--platform', platform, '--pull', '--tag', piOsImage, piOsCode]);
  await mkdir(piOsData, { recursive: true, mode: 0o700 });
  await chmod(piOsData, 0o700);
  const ready = join(piOsData, 'ready');
  if (await exists(ready) && (await readFile(ready, 'utf8')).trim() === piOsVersion) {
    const image = await runTool(docker, ['image', 'inspect', '--format', '{{.Os}}/{{.Architecture}}', piOsImage], undefined, 7000);
    if (!image.ok || image.stdout.toString('utf8').trim() !== platform) await buildImage();
    console.log('Raspberry Pi OS is prepared. Open Pi terminal rehearsal in the app.');
    return;
  }
  const lockPath = join(piOsData, 'setup.lock');
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Pi OS setup is already in progress.'); });
  const container = 'initio-pios-prepare-' + newId();
  const assets = join(piOsData, 'provision-assets');
  try {
    await buildImage();
    if (!await exists(join(piOsData, 'sd.img'))) {
      console.log('Downloading the official Raspberry Pi OS Lite image (422 MiB).');
      await download(join(piOsData, 'raspios.img.xz'), archive, archiveDigest);
    }
    await mkdir(join(assets, 'debs'), { recursive: true });
    for (const [name, sha] of ncurses) {
      await download(join(assets, 'debs', name + '.deb'), `https://deb.debian.org/debian/pool/main/n/ncurses/${name}_6.4-4_arm64.deb`, sha);
    }
    for (const key of ['workbench_key', 'host_key']) {
      const path = join(piOsData, key);
      if (!await exists(path)) await run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', path]);
    }
    await copyFile(join(piOsData, 'workbench_key.pub'), join(assets, 'authorized_keys'));
    for (const key of ['host_key', 'host_key.pub']) await copyFile(join(piOsData, key), join(assets, key));
    for (const name of ['provision.sh', 'hardware.c', 'bridge.py', 'rtcs.py', 'gcc.sh', 'lab-ethernet.nmconnection', 'initio-bridge.service', 'initio-autostart.service']) {
      await copyFile(join(piOsCode, 'guest', name), join(assets, name));
    }
    for (const name of ['initio.h', 'wiringPi.h', 'softPwm.h']) await copyFile(join(piOsProject, 'shim', name), join(assets, name));

    await run(docker, ['run', '--platform', platform, '--detach', '--rm', '--pull=never', '--name', container,
      '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--memory=3g', '--cpus=2', '--pids-limit=96', '--user', `${process.getuid()}:${process.getgid()}`,
      '--mount', `type=bind,source=${piOsData},target=/vm`, '--mount', `type=bind,source=${piOsCode},target=/lab,readonly`,
      '--tmpfs', '/tmp:rw,nosuid,nodev,mode=1777,size=32m', piOsImage, 'sleep', 'infinity']);
    const inside = (...args) => run(docker, ['exec', container, 'python3', ...args]);
    if (!await exists(join(piOsData, 'sd.img'))) {
      await inside('/lab/prepare.py', 'unpack', '/vm');
      await rm(join(piOsData, 'raspios.img.xz'), { force: true });
    }
    await inside('/lab/prepare.py', 'boot-files', '/vm', '/vm/provision-assets');
    console.log('Booting Raspberry Pi OS to configure the lab account and native Initio library.');
    await inside('/lab/run-vm.py', 'provision', '/vm');
    await inside('/lab/prepare.py', 'ready', '/vm');
    await writeFile(ready, piOsVersion + '\n', { mode: 0o600 });
    await rm(assets, { recursive: true, force: true });
    console.log('Raspberry Pi OS is prepared. Open Pi terminal rehearsal in the app.');
  } finally {
    await removeContainer(container);
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

setup().catch(error => {
  console.error(`Pi OS setup stopped. ${error.message}`);
  process.exitCode = 1;
});
