import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const labAddress = 'e300user@10.0.1.2';
const transcript = (page: Page) => page.getByTestId('lab-transcript');
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

async function command(page: Page, text: string) {
  const field = page.getByRole('textbox', { name: 'Terminal command' });
  await field.fill(text);
  await field.press('Enter');
}
async function openLab(page: Page) {
  await page.goto('/');
  await button(page, 'Rehearse the Pi terminal').click();
  await button(page, 'Browser and ARM practice').click();
  await expect(page.getByRole('heading', { name: 'Pi terminal rehearsal', level: 2 })).toBeVisible();
}
async function copyAndEnter(page: Page, target: 'arm' | 'browser') {
  if (target === 'arm') {
    await expect(page.getByRole('option', { name: 'Raspberry Pi ARM/QEMU' })).toBeEnabled();
  }
  await page.getByLabel('Pi execution mode').selectOption(target);
  await button(page, 'Use testIR practice').click();
  await expect(transcript(page)).toContainText('Staged ~/testIR');
  await command(page, `scp -r testIR ${labAddress}:`);
  await expect(transcript(page)).toContainText('The Pi copy is ready to build');
  await command(page, `ssh ${labAddress}`);
  await command(page, 'cd testIR');
  await expect(page.locator('label[for="lab-command"]')).toHaveText('e300user@raspberrypi:~/testIR $');
}
async function floorSequence(page: Page) {
  for (const step of ['Disconnect Ethernet and DC', 'Connect battery', 'Place robot on floor', 'Power on Pi']) {
    await button(page, step).click();
  }
}

test('practice gcc on the lab PC and get real syntax diagnostics after a nano edit', async ({ page }) => {
  await openLab(page);
  await button(page, 'Use powers of two').click();
  await expect(transcript(page)).toContainText('Staged ~/power');
  await command(page, 'cd power');
  await command(page, 'gcc -o power power.c');
  await expect(transcript(page)).toContainText('Created ./power');
  await command(page, './power');
  await expect(transcript(page)).toContainText('2 ^ 13 = 8192');
  await expect(transcript(page)).toContainText('[C exited with status 0]');
  await command(page, 'nano power.c');
  await page.getByLabel('nano power.c').fill('int main(void) { return typo; }\n');
  await button(page, 'Save (Ctrl+O)').click();
  await button(page, 'Exit (Ctrl+X)').click();
  await command(page, 'gcc -fsyntax-only power.c');
  await expect(transcript(page)).toContainText('power.c:1:');
  await expect(transcript(page)).toContainText('undeclared identifier');
});

test('virtual SSH and make rehearse the exact stand-to-floor sequence with browser C', async ({ page }) => {
  await openLab(page);
  await command(page, 'ssh user@unknown.example');
  await expect(transcript(page)).toContainText(`Use the rehearsal address ${labAddress}`);
  // Wait for the toolchain check so the default cannot change during input.
  await expect(page.locator('.lab-target small')).not.toHaveText('Checking for the Pi toolchain…');
  await copyAndEnter(page, 'browser');
  await command(page, 'make testIR');
  await expect(transcript(page)).toContainText('Created ./testIR');
  await command(page, 'file ./testIR');
  await expect(transcript(page)).toContainText('WebAssembly binary, browser rehearsal');
  await command(page, 'make run');
  await expect(page.getByText('BENCH · WHEELS RAISED', { exact: true })).toBeVisible();
  await expect(page.getByTestId('motor-left')).toHaveText('100%');
  await expect(page.getByText('0.00 m', { exact: false })).toBeVisible();
  await button(page, 'Hold object').click();
  await expect(page.getByTestId('motor-left')).toHaveText('0%');
  await button(page, 'Remove object').click();
  await expect(page.getByText('Bench stop and resume observed')).toBeVisible();
  await button(page, 'Send q').click();
  await expect(transcript(page)).toContainText('[C exited with status 0]');
  await command(page, 'rtcs schedule testIR');
  await command(page, 'rtcs log');
  await expect(transcript(page)).toContainText('remaining');
  await command(page, 'sudo shutdown now');
  await floorSequence(page);
  await expect(page.getByText('Scheduled floor program started')).toBeVisible();
  await expect(page.getByText('Floor · battery power')).toBeVisible();
  await expect(page.getByTestId('motor-left')).toHaveText('100%');
  await button(page, 'Power off Pi').click();
  await button(page, 'Return to desk and reconnect').click();
  await expect(page.getByText('Desk · wheels raised')).toBeVisible();
});

test('scheduled floor start expires after five minutes', async ({ page }) => {
  await openLab(page);
  await expect(page.locator('.lab-target small')).not.toHaveText('Checking for the Pi toolchain…');
  await copyAndEnter(page, 'browser');
  await command(page, 'make testIR');
  await expect(transcript(page)).toContainText('Created ./testIR');
  await page.clock.setFixedTime(new Date('2026-11-20T13:00:00Z'));
  await command(page, 'make schedule');
  await expect(page.getByTestId('pi-schedule')).toHaveText('5:00');
  await command(page, 'sudo shutdown now');
  await page.clock.setFixedTime(new Date('2026-11-20T13:05:01Z'));
  await floorSequence(page);
  await expect(transcript(page)).toContainText('no valid scheduled program');
  await expect(page.getByText('Scheduled floor program started')).toHaveCount(0);
});

test('Raspberry Pi profile compiles an ARM executable and runs it in QEMU through floor boot', async ({ page, request }) => {
  test.setTimeout(60_000);
  const status = await (await request.get('/api/pi/status')).json();
  test.skip(!status.ready, 'Run npm run setup:pi to test the ARM/QEMU runtime.');
  await openLab(page);
  await copyAndEnter(page, 'arm');
  await command(page, `gcc -o testIR -Wall -Werror -linitio -lcurses -lwiringPi -lpthread testIR.c`);
  await expect(transcript(page)).toContainText('Created ./testIR', { timeout: 16_000 });
  await command(page, 'file testIR');
  await expect(transcript(page)).toContainText('testIR: ELF 32-bit LSB executable, ARM, EABI5 hard-float');
  const [download] = await Promise.all([
    page.waitForEvent('download'), page.getByRole('link', { name: 'ARM practice binary' }).click(),
  ]);
  const artifact = await readFile((await download.path())!);
  expect(artifact.readUInt16LE(18)).toBe(40);
  expect(artifact.readUInt32LE(36) & 0x400).toBe(0x400);

  await command(page, './testIR');
  await expect(page.getByTestId('lab-program-output')).toContainText('Front left: 0', { timeout: 12_000 });
  await expect(page.getByTestId('motor-left')).toHaveText('100%');
  await button(page, 'Hold object').click();
  await expect(page.getByTestId('motor-left')).toHaveText('0%');
  await button(page, 'Remove object').click();
  await expect(page.getByText('Bench stop and resume observed')).toBeVisible();
  await button(page, 'Send q').click();
  await expect(transcript(page)).toContainText('[C exited with status 0]');
  await command(page, 'make schedule');
  await command(page, 'sudo shutdown now');
  await floorSequence(page);
  await expect(page.getByText('Scheduled floor program started')).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId('motor-left')).toHaveText('100%');
  await button(page, 'Power off Pi').click();
});

test('the actual ARM line follower steers and gives obstacles priority', async ({ request }) => {
  test.setTimeout(45_000);
  const ready = await (await request.get('/api/pi/status')).json();
  test.skip(!ready.ready, 'Run npm run setup:pi to test the ARM/QEMU runtime.');
  const text = await readFile(new URL('../public/samples/line_reference_practice.c', import.meta.url), 'utf8');
  const compiled = await (await request.post('/api/pi/build', { data: { files: [{ name: 'line_follower.c', text }] } })).json();
  expect(compiled.ok, compiled.diagnostics).toBeTruthy();
  const runId = crypto.randomUUID().replaceAll('-', '');
  try {
    const started = await (await request.post('/api/pi/start', { data: { runId, artifact: compiled.id, args: ['line_follower'] } })).json();
    expect(started.ok, started.error).toBeTruthy();
    for (const [clockMs, bits, key, motors] of [
      [0, [0, 0, 1, 1], -1, [42, 42]],
      [20, [0, 0, 1, 0], -1, [9, 38]],
      [40, [0, 0, 0, 1], -1, [38, 9]],
      [60, [1, 0, 1, 1], -1, [0, 0]],
      [80, [0, 0, 1, 1], 113, [0, 0]],
    ] as const) {
      const result = await (await request.post('/api/pi/step', { data: { runId, bits, key, clockMs, distanceCm: 0 } })).json();
      expect(result.motors).toEqual(motors);
      if (key === 113) expect(result.exit).toBe(0);
    }
  } finally {
    await request.post('/api/pi/stop', { data: { runId } });
  }
});
