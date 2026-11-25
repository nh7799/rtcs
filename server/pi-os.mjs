import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { WebSocket, WebSocketServer } from 'ws';
import { dockerCommand, dockerEnginePlatform, removeContainer } from './pi-build.mjs';
import { piOsCode, piOsData, piOsImage, piOsInstance, piOsVersion } from './pi-os-config.mjs';
import { runTool } from './process.mjs';
import { validateFiles } from './project.mjs';

const docker = dockerCommand();
const verify = process.env.INITIO_PIOS_VERIFY === '1';
const instance = piOsInstance(verify);
const endpoint = '/api/pios/terminal';
const noMotion = { type: 'hardware', pid: 0, left: 0, right: 0, led: false };
const setupDetail = 'Start Docker, then run npm run setup:pi-os from this project.';

function sendInput(child, message) {
  if (child?.stdin.writable && child.stdin.writableLength < 32 * 1024) child.stdin.write(JSON.stringify(message) + '\n');
}

function sameOrigin(request) {
  const host = request.headers.host || '';
  return /^127\.0\.0\.1(?::[0-9]{1,5})?$/.test(host) && request.headers.origin === 'http://' + host;
}

async function liveContainer(args) {
  const child = spawn(docker, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  let error = '';
  child.stderr.on('data', data => { error = (error + data.toString()).slice(-3500); });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The lab PC took too long to start.')), 45_000);
      const finish = callback => value => { clearTimeout(timer); callback(value); };
      child.stdout.once('data', finish(resolve));
      child.once('error', finish(reject));
      child.once('close', finish(() => reject(new Error(error || 'The lab PC could not start.'))));
    });
    return child;
  } catch (failure) {
    child.stdin.end();
    throw failure;
  }
}

function defaultMakefile(name, files) {
  const sources = files.filter(file => file.name.endsWith('.c'));
  if (!sources.length) throw new Error('Stage at least one C source file.');
  const makePaths = files.map(file => file.name.replaceAll(' ', '\\ ')).join(' ');
  const compilePaths = sources.map(file => "'" + file.name + "'").join(' ');
  const libraries = name === 'power' ? '' : ' -linitio -lcurses -lwiringPi -lpthread';
  return [
    '# Tutorial practice Makefile for the Raspberry Pi OS lab',
    '.PHONY: all run schedule test_compile',
    `all: ${name}`,
    `${name}: ${makePaths}`,
    `\tgcc -Wall -Werror -o $@ ${compilePaths}${libraries}`,
    `run: ${name}`,
    `\t./${name}`,
    `schedule: ${name}`,
    `\trtcs schedule ${name}`,
    'test_compile:',
    `\tgcc -Wall -Werror -fsyntax-only ${compilePaths}`,
    '',
  ].join('\n');
}

export function piOsLab() {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false });
  let workbench, starting, vm, shell, socket, bootDeadline, latestSensors;
  let ownsContainer = false;
  let closed = false;
  let lastSensorAt = 0;
  const state = { phase: 'off', ethernet: false, power: 'dc', stand: true, sshReady: false, clean: null, error: '' };

  function emit(message) {
    if (socket?.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 256 * 1024) return socket.close(1008, 'Terminal output overflow');
    socket.send(Buffer.isBuffer(message) ? message : JSON.stringify(message));
  }

  function update(patch) {
    Object.assign(state, patch);
    emit({ type: 'state', state });
  }

  async function status() {
    const ready = await readFile(join(piOsData, 'ready'), 'utf8').then(value => value.trim() === piOsVersion, () => false);
    return { ready, detail: ready ? 'Raspberry Pi OS Lite · Raspberry Pi 3 Model B' : setupDetail, state };
  }

  async function startWorkbench() {
    if (workbench) return workbench;
    if (closed) throw new Error('The lab is closing.');
    starting ??= (async () => {
      if (!(await status()).ready) throw new Error(setupDetail);
      const platform = await dockerEnginePlatform();
      const { uid, gid } = await stat(piOsData);
      const user = uid === 1001 ? { name: 'piboard', uid: 1002 } : { name: 'SPECSuser', uid: 1001 };
      const python = await readFile(join(piOsCode, 'workbench.py'), 'utf8');
      const life = await liveContainer(['run', '--platform', platform, '-i', '--rm', '--pull=never', '--name', instance,
        '--network=none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
        '--memory', verify ? '3g' : '2g', '--memory-swap', verify ? '3g' : '2g', '--cpus=2', '--pids-limit=128', '--user', `${uid}:${gid}`,
        '--mount', `type=bind,source=${piOsData},target=/vm${verify ? ',readonly' : ''}`, '--mount', `type=bind,source=${piOsCode},target=/lab,readonly`,
        '--tmpfs', `/tmp:rw,nosuid,nodev,mode=1777,size=${verify ? 768 : 32}m`,
        '--tmpfs', `/home/${user.name}:rw,nosuid,nodev,exec,mode=0700,uid=${user.uid},gid=${user.uid},size=64m`,
        piOsImage, 'python3', '-u', '-c', 'import sys; print("Ready"); sys.stdin.buffer.read()']);
      ownsContainer = true;
      try {
        if (verify) {
          const disk = await runTool(docker, ['exec', instance, 'qemu-img', 'create', '-f', 'qcow2', '-F', 'raw', '-b', '/vm/sd.img', '/tmp/verification.qcow2']);
          if (!disk.ok) throw new Error(disk.text || 'Could not create the verification SD card overlay.');
        }
        const clientKey = await readFile(join(piOsData, 'workbench_key'), 'utf8');
        const hostKey = (await readFile(join(piOsData, 'host_key.pub'), 'utf8')).split(/\s+/).slice(0, 2).join(' ');
        const command = ['exec', '-i', '--user', user.name, instance, 'python3', '-c', python];
        const install = await runTool(docker, [...command, 'keys'], undefined, 7000, {}, { input: JSON.stringify({ clientKey, hostKey }) });
        if (!install.ok) throw new Error(install.text || 'Could not configure the lab PC SSH client.');
        workbench = { user: user.name, command, life };
        life.once('close', () => { if (workbench?.life === life) workbench = undefined; });
        return workbench;
      } catch (error) {
        await removeContainer(instance);
        ownsContainer = false;
        throw error;
      }
    })().finally(() => { starting = undefined; });
    return starting;
  }

  function stopVM() {
    if (!vm) return;
    update({ phase: 'stopping', sshReady: false });
    emit(noMotion);
    sendInput(vm, { type: 'off' });
  }

  async function powerOn() {
    if (state.phase !== 'off') throw new Error('The Pi is already powered.');
    if (state.power === 'none') throw new Error('Connect DC power or the battery first.');
    update({ phase: 'booting', clean: null, sshReady: false, error: '' });
    try { await startWorkbench(); }
    catch (error) { update({ phase: 'off' }); throw error; }
    const child = spawn(docker, ['exec', '-i', instance, 'python3', '-u', '/lab/run-vm.py', 'boot', '/vm',
      state.ethernet ? 'connected' : 'disconnected', ...(verify ? ['verify'] : [])], { stdio: ['pipe', 'pipe', 'pipe'] });
    vm = child;
    child.stdin.on('error', () => {});
    let diagnostic = '';
    let clean = false;
    child.stderr.on('data', data => {
      diagnostic = (diagnostic + data.toString()).slice(-3500);
      if (process.env.INITIO_PIOS_TRACE === '1') process.stderr.write(data);
    });
    child.on('error', error => { diagnostic = error.message; });
    bootDeadline = setTimeout(() => {
      if (vm === child && state.phase === 'booting') {
        update({ error: 'The Pi OS boot timed out. ' + (diagnostic.trim() || 'Check available memory and try powering it on again.') });
        stopVM();
      }
    }, 180_000);
    createInterface({ input: child.stdout }).on('line', line => {
      if (vm !== child) return;
      let message;
      try { message = JSON.parse(line); } catch { return; }
      if (message.type === 'os' && state.phase === 'booting') {
        update({ phase: 'on' });
        clearTimeout(bootDeadline);
        if (latestSensors) sendInput(vm, latestSensors);
      }
      if (message.type === 'link') update({ ethernet: message.connected, sshReady: message.connected && state.sshReady });
      if (message.type === 'ssh' && state.phase !== 'stopping') update({ sshReady: message.ready && state.ethernet });
      if (message.type === 'off') clean = message.clean;
      if (message.type === 'hardware' && state.phase === 'on') emit(message);
    });
    child.once('close', code => {
      if (vm !== child) return;
      vm = undefined;
      clearTimeout(bootDeadline);
      update({ phase: 'off', sshReady: false, clean, error: code === 0 ? state.error : diagnostic.trim() || 'The Pi emulator stopped unexpectedly.' });
      emit(noMotion);
    });
    return state;
  }

  async function action(name) {
    if (!(await status()).ready) throw new Error(setupDetail);
    if (name === 'on') return powerOn();
    if (name === 'off') {
      if (state.phase === 'booting' && !vm) throw new Error('Wait for the emulator to start.');
      stopVM();
    } else if (name === 'ethernet') {
      const connected = !state.ethernet;
      update({ ethernet: connected, sshReady: false });
      sendInput(vm, { type: 'link', connected });
    } else {
      if (state.phase !== 'off') throw new Error('Power off the Pi before changing its power supply or moving it.');
      if (name === 'dc') update({ power: state.power === 'dc' ? 'none' : 'dc' });
      else if (name === 'battery') {
        if (state.ethernet || state.power === 'dc') throw new Error('Disconnect Ethernet and DC before attaching the battery.');
        update({ power: state.power === 'battery' ? 'none' : 'battery' });
      } else if (name === 'floor') {
        if (state.power !== 'battery') throw new Error('Attach the battery before placing the car on the floor.');
        update({ stand: false });
      } else if (name === 'desk') update({ stand: true });
      else throw new Error('Unknown control.');
    }
    return state;
  }

  async function stage(project) {
    if (typeof project?.name !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,47}$/.test(project.name)) throw new Error('Invalid project folder name.');
    const files = validateFiles(project.files);
    if (!files.some(file => file.name === 'Makefile')) files.push({ name: 'Makefile', text: defaultMakefile(project.name, files) });
    const { command } = await startWorkbench();
    const result = await runTool(docker, [...command, 'stage'], undefined, 7000, {}, { input: JSON.stringify({ name: project.name, files }) });
    if (!result.ok) throw new Error(result.text || 'Could not stage the project on the lab PC.');
    return { folder: project.name };
  }

  async function openTerminal(current) {
    try {
      const { user } = await startWorkbench();
      const python = await readFile(join(piOsCode, 'terminal.py'), 'utf8');
      if (socket !== current || current.readyState !== WebSocket.OPEN) return;
      const child = spawn(docker, ['exec', '-i', '--user', user, instance, 'python3', '-c', python], { stdio: ['pipe', 'pipe', 'pipe'] });
      shell = child;
      child.stdin.on('error', () => {});
      child.stdout.on('data', data => { if (socket === current) emit(data); });
      child.stderr.on('data', data => { if (socket === current) emit({ type: 'error', message: data.toString().trim() }); });
      child.once('error', error => { if (socket === current) emit({ type: 'error', message: error.message }); });
      child.once('close', () => {
        if (shell === child) shell = undefined;
        if (socket === current) current.close(1000, 'Lab PC shell exited');
      });
      emit({ type: 'terminalReady' });
    } catch (error) {
      if (socket === current) {
        emit({ type: 'error', message: error.message });
        current.close(1011, 'Lab PC could not start');
      }
    }
  }

  function bind(server) {
    server?.on('upgrade', (request, stream, head) => {
      if (request.url !== endpoint) return;
      if (!sameOrigin(request) || closed) return stream.destroy();
      sockets.handleUpgrade(request, stream, head, client => {
        if (socket?.readyState === WebSocket.OPEN) {
          client.close(1008, 'Close the Pi lab in the other tab first');
          return;
        }
        socket = client;
        emit({ type: 'state', state });
        client.on('error', () => client.terminate());
        client.on('message', (data, binary) => {
          if (binary || socket !== client) return;
          let message;
          try { message = JSON.parse(data.toString()); } catch { return; }
          if (!message || typeof message !== 'object') return;
          if (message.type === 'keys' && typeof message.data === 'string' && Buffer.byteLength(message.data) <= 8192) sendInput(shell, message);
          if (message.type === 'size' && [message.cols, message.rows].every(value => Number.isInteger(value) && value >= 1 && value <= 300)) sendInput(shell, message);
          if (message.type === 'sensors' && Array.isArray(message.values) && message.values.length === 5 &&
              message.values.slice(0, 4).every(bit => bit === 0 || bit === 1) &&
              Number.isInteger(message.values[4]) && message.values[4] >= 0 && message.values[4] <= 1000 && Date.now() - lastSensorAt >= 30) {
            lastSensorAt = Date.now();
            latestSensors = message;
            sendInput(vm, message);
          }
        });
        client.once('close', () => {
          if (socket !== client) return;
          socket = undefined;
          latestSensors = undefined;
          shell?.stdin.end();
        });
        void openTerminal(client);
      });
    });
  }

  async function close() {
    if (closed) return;
    closed = true;
    clearTimeout(bootDeadline);
    for (const client of sockets.clients) client.terminate();
    sockets.close();
    await starting?.catch(() => {});
    workbench?.life.stdin.end();
    if (ownsContainer) await removeContainer(instance);
  }

  return { status, action, stage, bind, close };
}
