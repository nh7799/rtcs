import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { zipSync, strToU8, unzipSync } from 'fflate';

const sample = await readFile(new URL('../public/samples/obstacle_practice.c', import.meta.url), 'utf8');
const originalFixture = sample.replace('<initio.h>', '"include/initio.h"').replace('<wiringPi.h>', '"include/wiringPi.h"');
const output = (page: Page) => page.getByTestId('terminal-output');
const mode = (page: Page) => page.getByTestId('mode');
const left = (page: Page) => page.getByTestId('motor-left');
const right = (page: Page) => page.getByTestId('motor-right');
const press = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
async function open(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
}
async function upload(page: Page, name: string, text: string | Uint8Array) {
  await page.getByLabel('Upload C project').setInputFiles({
    name, mimeType: name.endsWith('.zip') ? 'application/zip' : 'text/plain', buffer: Buffer.from(text),
  });
  await expect(output(page)).toContainText('Imported');
}
async function compile(page: Page) {
  await press(page, 'Compile');
  await expect(page.getByRole('button', { name: 'Compile', exact: true })).toBeEnabled({ timeout: 20_000 });
}

test('uploaded C/headers/Makefile compile and edits change actuator logic after recompiling', async ({ page, request }) => {
  const status = await request.get('/api/status');
  expect((await status.json()).ready, 'Activate Emscripten and Binaryen before running integration tests.').toBeTruthy();
  await open(page);
  const project = zipSync({
    'lecturer-style (fixture)/testIR.c': strToU8(originalFixture),
    'lecturer-style (fixture)/include/initio.h': strToU8('#include <hardware_only_vendor_api.h>\n'),
    'lecturer-style (fixture)/include/wiringPi.h': strToU8('#include <unavailable_board_gpio.h>\n'),
    'lecturer-style (fixture)/Makefile': strToU8('all:\n\tcc -mfloat-abi=hard testIR.c\n'),
  });
  await upload(page, 'testIR-fixture.zip', project);
  await compile(page);
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await press(page, 'Step');
  await expect(page.getByTestId('clock')).toHaveText('0.02 s');
  await expect(left(page)).toHaveText('0%');
  await press(page, 'Run');
  await expect(left(page)).toHaveText('100%');
  await expect(left(page)).toHaveText('0%', { timeout: 8000 });
  await expect(page.getByText('Obstacle in sensor range')).toBeVisible();
  await press(page, 'Remove obstacle');
  await expect(left(page)).toHaveText('100%');
  await press(page, 'Pause');
  await expect(mode(page)).toHaveText('Paused');
  await expect(left(page)).toHaveText('0%');
  await expect(right(page)).toHaveText('0%');
  const halted = await page.getByTestId('clock').textContent();
  await page.getByLabel('Send p key').click();
  await expect(page.getByTestId('clock')).toHaveText(halted!);
  await press(page, 'Run');
  await page.getByLabel('Send q key').click();
  await expect(mode(page)).toHaveText('Exited');
  await expect(output(page)).toContainText('[C exited with status 0]');
  await expect(left(page)).toHaveText('0%');

  await press(page, 'Reset');
  const editor = page.getByLabel('C source editor');
  await editor.fill(originalFixture.replace('left == 0 && right == 0', 'left == 1 && right == 1'));
  await compile(page);
  await press(page, 'Run');
  await expect(left(page)).toHaveText('0%');
  await expect(page.getByTestId('clock')).not.toHaveText('0.00 s');
  await expect(page.getByTestId('sensor-FL')).toHaveText('0');
  await press(page, 'Stop');
  await expect(mode(page)).toHaveText('Stopped');
  await expect(left(page)).toHaveText('0%');

  await press(page, 'Restore original');
  await expect(editor).toContainText('left == 0 && right == 0');
  await editor.fill('int main(void) {\n  invalid keyword;\n}\n');
  await compile(page);
  await expect(output(page)).toContainText('testIR.c:2:3: error:');
  await expect(page.locator('.cm-lintRange-error').first()).toBeAttached();
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
});

test('a C loop without a checkpoint is terminated while the arena remains interactive', async ({ page }) => {
  await open(page);
  await upload(page, 'busy.c', '#include <initio.h>\nint main(void) { initio_DriveForward(35); for (;;) {} }\n');
  await compile(page);
  await press(page, 'Run');
  await press(page, 'Toggle angled view');
  await expect(page.getByText('ANGLED VIEW')).toBeVisible();
  await expect(mode(page)).toHaveText('Stopped with error');
  await press(page, 'Program terminal');
  await expect(output(page)).toContainText('C stopped responding');
  await expect(left(page)).toHaveText('0%');
  await expect(right(page)).toHaveText('0%');
});

test('C/project exports preserve bytes; save, restore and lesson progress persist', async ({ page }) => {
  await open(page);
  const text = '\uFEFF/* café */\r\nint main(void) { return 0; }\r\n';
  await upload(page, 'roundtrip.c', text);
  await page.getByText('Export', { exact: true }).click();
  const single = page.waitForEvent('download');
  await press(page, 'Current file');
  const file = await single;
  expect(await readFile((await file.path())!)).toEqual(Buffer.from(text));
  const project = page.waitForEvent('download');
  await press(page, 'Project ZIP');
  const archive = await project;
  const entries = unzipSync(new Uint8Array(await readFile((await archive.path())!)));
  expect(Buffer.from(entries['roundtrip.c'])).toEqual(Buffer.from(text));

  const edited = 'int main(void) { return 1; }';
  await page.getByLabel('C source editor').fill(edited);
  await press(page, 'Diff');
  await expect(page.locator('.diff-view .add')).toContainText(edited);
  await press(page, 'Save');
  await press(page, 'I can explain the three assessed outcomes.');
  await page.reload();
  await expect(page.getByLabel('C source editor')).toContainText(edited);
  await expect(page.getByRole('button', { name: 'I can explain the three assessed outcomes.' })).toHaveAttribute('aria-pressed', 'true');
  await press(page, 'Restore original');
  await expect(page.getByLabel('C source editor')).toContainText('return 0;');
});

test('line reference uses calibrated sensor state in the worker, with a responsive mobile arena', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.getByLabel('Practice sample').selectOption('line_reference_practice.c');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await press(page, 'Run');
  await expect(left(page)).toHaveText('42%');
  await press(page, 'Pause');
  await press(page, 'Sensor calibration');
  await page.getByLabel('Invert both floor sensors').check();
  await expect(page.getByTestId('sensor-LL')).toHaveText('0');
  await expect(page.getByTestId('sensor-LR')).toHaveText('0');
  await press(page, 'Run');
  await press(page, 'Program terminal');
  await expect(output(page)).toContainText('Line lost');
  await expect(left(page)).toHaveText('0%');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('track selector and Reset start Lab Octagon and existing tracks on their lines', async ({ page }) => {
  await open(page);
  const track = page.getByLabel('Track', { exact: true });
  await track.selectOption('lab-octagon');
  await press(page, 'Reset');
  await expect(page.getByTestId('sensor-LL')).toHaveText('1');
  await expect(page.getByTestId('sensor-LR')).toHaveText('1');

  const arena = page.locator('canvas');
  await arena.evaluate(canvas => canvas.scrollIntoView({ block: 'center' }));
  const bounds = await arena.boundingBox();
  if (!bounds) throw new Error('Arena canvas is not visible');
  const screenPoint = (x: number, y: number) => ({
    x: bounds.x + bounds.width * x / 880,
    y: bounds.y + bounds.height * y / 440,
  });
  const start = screenPoint(440, 45);
  const corner = screenPoint(715, 74);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.up();
  for (let turn = 0; turn < 3; turn++) await press(page, 'Rotate');
  await expect(page.getByTestId('sensor-LL')).toHaveText('1');
  await expect(page.getByTestId('sensor-LR')).toHaveText('1');

  await track.selectOption('loop');
  await press(page, 'Reset');
  await expect(page.getByTestId('sensor-LL')).toHaveText('1');
  await expect(page.getByTestId('sensor-LR')).toHaveText('1');
});

test('learning path starts with runnable C, then compiles a change and passes real arguments', async ({ page }) => {
  await open(page);
  await press(page, 'Start with Tutorial 1');
  await expect(page.getByRole('heading', { name: 'C from scratch' })).toBeVisible();
  await press(page, 'Load powers of two');
  await press(page, 'Run program');
  await expect(output(page)).toContainText('2 ^ 13 = 8192');

  const power = await readFile(new URL('../public/samples/power.c', import.meta.url), 'utf8');
  await page.getByLabel('C source editor').fill(power.replace('pot < 10000', 'pot < 40'));
  await compile(page);
  await press(page, 'Run program');
  await expect(output(page)).toContainText('2 ^ 5 = 32');
  await expect(output(page)).not.toContainText('2 ^ 6 = 64');

  await press(page, 'Load macros and bit 12');
  const macros = await readFile(new URL('../public/samples/macro_bits.c', import.meta.url), 'utf8');
  await page.getByLabel('C source editor').fill(macros
    .replace('#define MAXNUM(a, b) 0', '#define MAXNUM(a, b) (((a) > (b)) ? (a) : (b))')
    .replace('#define BIT12(a) 0', '#define BIT12(a) (((unsigned int)(a) >> 12) & 1u)'));
  await compile(page);
  await press(page, 'Run program');
  await expect(output(page)).toContainText('MAXNUM(-8, -3) = -3');
  await expect(output(page)).toContainText('BIT12(0x1f00) = 1');
  await expect(output(page)).toContainText('BIT12(0x0f00) = 0');

  await press(page, 'Load sum from arguments');
  await expect(page.getByLabel('Program arguments')).toHaveValue('12 -5');
  await press(page, 'Run program');
  await expect(output(page)).toContainText('Sum (decimal) = 7');
  await page.getByLabel('Program arguments').fill('12 abc');
  await press(page, 'Run program');
  await expect(output(page)).toContainText('Give two valid base-10 integers.');
  await expect(output(page)).toContainText('[C exited with status 1]');
});

test('Tutorial 3 positions exercise sonar, P37 and the editable dark-floor stop', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Try extra sensors/ }).click();
  await press(page, 'Load sensor extensions');
  await expect(page.getByTestId('sonar')).toHaveText('130 cm');

  await press(page, '75 cm');
  await expect(page.getByTestId('sonar')).toHaveText('75 cm');
  await press(page, 'Run');
  await expect(left(page)).toHaveText('70%');
  await press(page, '45 cm');
  await expect(page.getByTestId('sonar')).toHaveText('45 cm');
  await expect(page.getByTestId('sensor-FL')).toHaveText('0');
  await expect(page.getByTestId('sensor-FR')).toHaveText('0');
  await press(page, 'Run');
  await expect(page.getByTestId('p37')).toHaveText('On');
  await expect(left(page)).toHaveText('0%');

  const extension = await readFile(new URL('../public/samples/sensor_extensions_practice.c', import.meta.url), 'utf8');
  await page.getByLabel('C source editor').fill(extension.replace('#define STOP_ON_DARK 0', '#define STOP_ON_DARK 1'));
  await compile(page);
  await page.getByRole('button', { name: /Build a line follower/ }).click();
  await press(page, 'Both on tape');
  await press(page, 'Run');
  await press(page, 'Program terminal');
  await expect(output(page)).toContainText('Dark floor stop');
  await expect(left(page)).toHaveText('0%');
});

test('CW1 line cases exercise left steering and stop priority while preserving the module', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Build a line follower/ }).click();
  await press(page, 'Try a completed simulation reference');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeEnabled();
  await press(page, 'Left on tape');
  await expect(page.getByTestId('sensor-LL')).toHaveText('1');
  await expect(page.getByTestId('sensor-LR')).toHaveText('0');
  await page.getByLabel('Time scale').selectOption('0.25');
  await press(page, 'Run');
  await expect(left(page)).toHaveText('9%');
  await expect(right(page)).toHaveText('38%');

  await press(page, 'Tape and obstacle');
  await expect(page.getByTestId('sensor-LL')).toHaveText('1');
  await expect(page.getByTestId('sensor-FL')).toHaveText('1');
  await press(page, 'Run');
  await press(page, 'Program terminal');
  await expect(output(page)).toContainText('State: Obstacle');
  await expect(left(page)).toHaveText('0%');
  await expect(page.getByRole('heading', { name: 'Build a line follower' })).toBeVisible();
});

test('desk mode gives the terminal and arena usable space on desktop and narrow windows', async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 940 });
  await page.goto('/?desk=1');
  await expect(page.getByRole('heading', { name: 'Raspberry Pi OS lab', exact: true })).toBeVisible();
  const lab = page.locator('#pi-terminal');
  const arena = page.locator('#simulator');
  await expect.poll(async () => (await lab.boundingBox())?.width ?? 0).toBeGreaterThan(600);
  const desktopLab = (await lab.boundingBox())!;
  const desktopArena = (await arena.boundingBox())!;
  expect(desktopArena.x).toBeGreaterThan(desktopLab.x + desktopLab.width);

  await page.setViewportSize({ width: 390, height: 844 });
  const narrowLab = (await lab.boundingBox())!;
  const narrowArena = (await arena.boundingBox())!;
  expect(narrowLab.width).toBeGreaterThan(340);
  expect(narrowArena.y).toBeGreaterThan(narrowLab.y + narrowLab.height);
});
