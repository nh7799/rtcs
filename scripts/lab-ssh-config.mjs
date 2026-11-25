import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { dockerCommand, localDocker } from '../server/pi-build.mjs';
import { piOsData, piOsInstance, piOsVersion } from '../server/pi-os-config.mjs';

function shellWord(word) {
  // OpenSSH expands percent tokens before passing ProxyCommand to the shell.
  return "'" + word.replaceAll('%', '%%').replaceAll("'", "'\\''") + "'";
}

try {
  const ready = await readFile(join(piOsData, 'ready'), 'utf8').catch(() => '');
  if (ready.trim() !== piOsVersion) throw new Error('Run npm run setup:pi-os first.');
  await localDocker();
  await access(join(piOsData, 'workbench_key'));
  const [type, key] = (await readFile(join(piOsData, 'host_key.pub'), 'utf8')).trim().split(/\s+/);
  if (type !== 'ssh-ed25519' || !/^[A-Za-z0-9+/]+={0,2}$/.test(key ?? '')) {
    throw new Error('The provisioned Pi host key is invalid.');
  }
  const instance = piOsInstance(process.env.INITIO_PIOS_VERIFY === '1');
  const proxy = [dockerCommand(), 'exec', '-i', instance, 'python3', '/lab/ssh-relay.py'].map(shellWord).join(' ');
  await writeFile(join(piOsData, 'terminal_known_hosts'), `10.0.1.2 ${type} ${key}\n`, { mode: 0o600 });
  await writeFile(join(piOsData, 'ssh_config'), `Host 10.0.1.2
    HostName 10.0.1.2
    User e300user
    ProxyCommand ${proxy}
    HostKeyAlias 10.0.1.2
    UserKnownHostsFile .initio-pi-os/terminal_known_hosts
    GlobalKnownHostsFile none
    IdentityFile .initio-pi-os/workbench_key
    IdentitiesOnly yes
    StrictHostKeyChecking yes
    ConnectTimeout 5
    ServerAliveInterval 2
    ServerAliveCountMax 2
`, { mode: 0o600 });
  console.log('From the project directory, run:');
  console.log('ssh -F .initio-pi-os/ssh_config e300user@10.0.1.2');
} catch (error) {
  console.error(`Lab SSH setup stopped. ${error.message}`);
  process.exitCode = 1;
}
