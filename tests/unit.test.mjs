import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { defaults, footprints, paths, reflectivity, startPose, World, ZERO } from '../src/physics.ts';
import { scenarios, scenarioSettings } from '../src/course-scenarios.ts';
import { makeVM } from '../src/vm.ts';
import { importZip, safePath } from '../server/project.mjs';
import { prepareSource } from '../server/compiler.mjs';

async function vm(name, args) {
  const source = await readFile(new URL(`../public/samples/${name}.wasm`, import.meta.url));
  return makeVM(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength), args);
}

test('fixed-step forward acceleration, braking, spin and shape collisions', () => {
  const world = new World({ ...defaults, asymmetry: 0 });
  world.placeObstacle({ x: 498, y: 340 });
  world.commands = [80, 80];
  world.tick();
  assert.ok(world.wheels[0] > 0 && world.wheels[0] < 0.08);
  const initialPosition = world.pose.x;
  for (let i = 0; i < 100; i++) world.tick();
  assert.ok(world.pose.x > initialPosition && world.pose.x < 450);
  assert.equal(world.collisions, 1);
  world.reset(null);
  world.commands = [-38, 38];
  for (let i = 0; i < 20; i++) world.tick();
  assert.equal(world.pose.x, 345);
  assert.ok(world.pose.heading < 0);
  world.commands = ZERO;
  for (let i = 0; i < 20; i++) world.tick();
  assert.deepEqual(world.wheels, ZERO);
});

test('front and floor bits have independent positions, ranges, latency and polarity', () => {
  const world = new World({ ...defaults, frontRightRange: 18, latency: 60 });
  const position = footprints(world.pose, world.settings)[0];
  world.placeObstacle({ x: position.x + 90, y: position.y - 16 }, false);
  assert.deepEqual(world.bits, [0, 0, 1, 1]);
  for (let i = 0; i < 3; i++) world.tick();
  assert.deepEqual(world.bits, [1, 0, 1, 1]);
  world.settings.leftInvert = world.settings.rightInvert = world.settings.floorInvert = true;
  world.sample(true);
  assert.deepEqual(world.bits, [0, 1, 0, 0]);
});

test('Lab Octagon is closed, starts on the top straight and detects the same line at corners', () => {
  const settings = { ...defaults, track: 'lab-octagon' };
  const course = paths[settings.track][0];
  assert.equal(course.length, 9);
  assert.deepEqual(course[0], course.at(-1));
  assert.deepEqual(startPose(settings), { x: 440, y: 45, heading: 0 });

  const world = new World(settings);
  world.reset(null);
  assert.deepEqual(world.bits.slice(2), [1, 1]);
  assert.equal(world.settings.width, defaults.width);

  const cornerPose = { x: 715, y: 74, heading: Math.PI / 4 };
  world.reset(null, cornerPose);
  const cornerSensors = footprints(cornerPose, settings).slice(2);
  assert.ok(cornerSensors.every(sensor => reflectivity(sensor, settings) < settings.threshold));
  assert.deepEqual(world.bits.slice(2), [1, 1]);
});

test('bundled obstacle WASM executes stop, resume, delayed terminal output and q', async () => {
  const app = await vm('obstacle_practice');
  assert.deepEqual(app.slice([0, 0, 1, 1]).motors, [100, 100]);
  app.slice([0, 1, 1, 1]);
  const blocked = app.slice([0, 1, 1, 1]);
  assert.deepEqual(blocked.motors, ZERO);
  assert.equal(blocked.delay, 100);
  assert.match(blocked.terminal, /Front right: 1/);
  app.slice([0, 0, 1, 1]);
  assert.deepEqual(app.slice([0, 0, 1, 1]).motors, [100, 100]);
  app.slice([0, 0, 1, 1], 113);
  const ended = app.slice([0, 0, 1, 1]);
  assert.equal(ended.exit, 0);
  assert.deepEqual(ended.motors, ZERO);
});

test('reference WASM chooses both steering directions, lost line, obstacle priority and resume', async () => {
  const app = await vm('line_reference_practice');
  assert.deepEqual(app.slice([0, 0, 1, 1]).motors, [42, 42]);
  assert.deepEqual(app.slice([0, 0, 1, 0]).motors, [9, 38]);
  assert.deepEqual(app.slice([0, 0, 0, 1]).motors, [38, 9]);
  assert.deepEqual(app.slice([0, 0, 0, 0]).motors, ZERO);
  assert.deepEqual(app.slice([1, 0, 1, 1]).motors, ZERO);
  assert.deepEqual(app.slice([0, 0, 1, 1]).motors, [42, 42]);
  assert.equal(app.slice([0, 0, 1, 1], 113).exit, 0);
  const template = await vm('line_template_practice');
  assert.deepEqual(template.slice([0, 0, 1, 0]).motors, ZERO);
});

test('fixed-seed WASM trials reproduce complete laps and metrics on both closed courses', async () => {
  async function run(track, ticks) {
    const simulator = new World({ ...defaults, track, seed: 402, noise: 0.06 });
    const controller = await vm('line_reference_practice');
    simulator.placeObstacle(null);
    for (let i = 0; i < ticks; i++) {
      const command = controller.slice(simulator.bits);
      simulator.commands = command.motors;
      simulator.tick();
    }
    return { trial: simulator.trial('reference'), pose: simulator.pose };
  }
  for (const track of ['loop', 'lab-octagon']) {
    const ticks = track === 'lab-octagon' ? 3000 : 1500;
    const a = await run(track, ticks);
    const b = await run(track, ticks);
    assert.ok(a.trial.laps > 0, track);
    assert.equal(a.trial.losses, 0, track);
    assert.equal(a.trial.collisions, 0, track);
    assert.deepEqual(a, b, track);
  }
});

test('archive import preserves UTF-8 bytes and original layout; paths and symlinks are rejected', async () => {
  const original = { 'lab (1)/testIR.c': '\uFEFF/* café */\r\nint main(void) {return 0;}\r\n', 'lab (1)/include/initio.h': '#pragma once\n', 'lab (1)/Makefile': 'run:\n\t./testIR\n' };
  const zip = Buffer.from(zipSync(Object.fromEntries(Object.entries(original).map(([name, string]) => [name, strToU8(string)]))));
  const source = await importZip(zip);
  const actual = Object.fromEntries(source.map(({ name, text }) => [name, text]));
  assert.deepEqual(actual, original);
  for (const path of ['../test.c', 'path/../../test.c', 'C:/test.c', '/test.c', '-flag.c']) {
    assert.throws(() => safePath(path), /Unsafe project path/);
  }
  const traversal = Buffer.from(zipSync({ '../escape.c': strToU8('void x(void) {}') }));
  await assert.rejects(importZip(traversal), /invalid relative path|Unsafe project path/i);
  const symlink = Buffer.from(zipSync({ 'link.c': [strToU8('target.c'), { os: 3, attrs: 0o120777 << 16 }] }));
  await assert.rejects(importZip(symlink), /entry type/);
});

test('compatibility includes are staged without changing editor paths or line numbers', () => {
  const file = { name: 'project/testIR.c', text: '// start\n#include "include/initio.h"\n#include "app.h"\n' };
  const names = new Set(['project/testIR.c', 'project/app.h']);
  assert.equal(prepareSource(file, names), '// start\n#include <initio.h>\n#include "app.h"\n');
  assert.throws(() => prepareSource({ ...file, text: '#include "/tmp/secrets.h"' }, names), /project\/testIR.c:1:1: error: Unsafe include/);
  assert.throws(() => prepareSource({ ...file, text: '#include APP_HEADER' }, names), /literal include/);
});

test('guided cases create distinct front and floor sensor combinations', () => {
  const world = new World(scenarioSettings);
  for (const [key, bits] of Object.entries({
    clear: [0, 0, 1, 1], 'front-left': [1, 0, 1, 1], 'front-right': [0, 1, 1, 1],
    'front-both': [1, 1, 1, 1], 'line-left': [0, 0, 1, 0], 'line-right': [0, 0, 0, 1],
    'line-lost': [0, 0, 0, 0], 'line-blocked': [1, 1, 1, 1],
  })) {
    const { pose, obstacle } = scenarios[key];
    world.reset(obstacle, pose);
    assert.deepEqual(world.bits, bits, key);
  }
  for (const [key, cm] of Object.entries({ 'sonar-far': 130, 'sonar-near': 75, 'sonar-stop': 45 })) {
    const { pose, obstacle } = scenarios[key];
    world.reset(obstacle, pose);
    assert.equal(world.distanceCm, cm, key);
    assert.deepEqual(world.bits, [0, 0, 0, 0], key);
  }
  world.placeObstacle(null);
  assert.equal(world.distanceCm, 0);
});

test('argument samples read WASI argv and report invalid data to the terminal', async () => {
  const power = (await vm('power')).slice([0, 0, 0, 0]);
  assert.equal(power.exit, 0);
  assert.match(power.terminal, /2 \^ 0 = 1\n[\s\S]*2 \^ 13 = 8192$/);
  const valid = (await vm('sum', ['sum', '12', '-5'])).slice([0, 0, 0, 0]);
  assert.equal(valid.exit, 0);
  assert.equal(valid.terminal, 'Sum (decimal) = 7');
  const invalid = (await vm('sum', ['sum', '12', 'abc'])).slice([0, 0, 0, 0]);
  assert.equal(invalid.exit, 1);
  assert.match(invalid.terminal, /valid base-10 integers/);
});

test('Tutorial 3 C uses sonar thresholds and toggles P37 by virtual time', async () => {
  const program = await vm('sensor_extensions_practice');
  function iteration(clockMs, distanceCm, key = -1) {
    const bits = [0, 0, 0, 0];
    const hardware = { clockMs, distanceCm };
    program.slice(bits, -1, hardware);
    return program.slice(bits, key, hardware);
  }
  assert.deepEqual(iteration(0, 130).motors, [100, 100]);
  assert.deepEqual(iteration(70, 100).motors, [70, 70]);
  const close = iteration(520, 50);
  assert.deepEqual(close.motors, ZERO);
  assert.equal(close.led, true);
  assert.match(close.terminal, /50 cm/);
  const noEcho = iteration(1040, 0);
  assert.deepEqual(noEcho.motors, [100, 100]);
  assert.equal(noEcho.led, false);
  assert.equal(iteration(1110, 75, 113).exit, 0);
});

test('bench stand preserves the robot pose while the controller drives the wheels', () => {
  const world = new World();
  const start = { ...world.pose };
  world.onStand = true;
  world.commands = [60, 60];
  for (let tick = 0; tick < 80; tick++) world.tick();
  assert.deepEqual(world.pose, start);
  assert.equal(world.distance, 0);
  assert.ok(world.wheels.every(wheel => wheel > 0));
  world.onStand = false;
  world.tick();
  assert.ok(world.distance > 0);
});
