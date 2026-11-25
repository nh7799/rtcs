import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { test, expect, type Page } from '@playwright/test';

const exec = promisify(execFile);
const hostConfig = ['-F', '.initio-pi-os/ssh_config'];
const commandLimits = { timeout: 20_000 };
const address = 'e300user@10.0.1.2';
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const terminal = (page: Page) => page.locator('.pi-os-terminal .xterm-rows');

async function type(page: Page, command: string) {
  await page.locator('.pi-os-terminal .xterm-helper-textarea').focus();
  await page.keyboard.type(command);
  await page.keyboard.press('Enter');
}

test('boots Raspberry Pi OS and uses SSH-built C for both the bench and unplugged floor run', async ({ page, request }) => {
  test.setTimeout(360_000);
  const status = await (await request.get('/api/pios/status')).json();
  test.skip(!status.ready, 'Run npm run setup:pi-os to prepare the official Raspberry Pi OS image.');
  await page.goto('/');
  await button(page, 'Rehearse the Pi terminal').click();
  await expect(page.getByRole('heading', { name: 'Raspberry Pi OS lab' })).toBeVisible();
  await expect(terminal(page)).toContainText('SPECSuser@lab-pc', { timeout: 25_000 });
  await button(page, 'Use testIR practice').click();
  await expect(page.getByRole('status').filter({ hasText: 'Staged ~/testIR' })).toBeVisible();
  await type(page, `ssh ${address}`);
  await expect(terminal(page)).toContainText(/Connection refused|Connection closed/);
  await expect(page.getByTestId('motor-left')).toHaveText('0%');

  await button(page, 'Connect Ethernet').click();
  await button(page, 'Power on Pi').click();
  await expect(page.getByTestId('pi-ssh-status')).toHaveText('SSH ready · 10.0.1.2', { timeout: 175_000 });
  await exec(process.execPath, ['scripts/lab-ssh-config.mjs'], {
    ...commandLimits, env: { ...process.env, INITIO_PIOS_VERIFY: process.env.INITIO_PIOS_VERIFY ?? '1' },
  });
  await exec('scp', [...hostConfig, '-r', 'examples/testIR', `${address}:`], commandLimits);
  const build = await exec('ssh', [...hostConfig, address, 'cd testIR && make testIR && file ./testIR'], commandLimits);
  expect(build.stdout).toMatch(/ELF 64-bit LSB.*ARM aarch64/);

  const controller = spawn('ssh', [...hostConfig, '-tt', address, 'cd testIR && make run'], {
    env: { ...process.env, TERM: 'xterm-256color' },
  });
  let display = '';
  controller.stdin.on('error', () => {});
  controller.stdout.on('data', data => { display += data.toString(); });
  controller.stderr.on('data', data => { display += data.toString(); });
  controller.once('error', error => { display += error.message; });
  try {
    await expect.poll(() => display, { timeout: 15_000 }).toContain('Obstacle test | q to quit');
    await expect(page.getByTestId('motor-left')).toHaveText('100%');
    await button(page, 'Hold object').click();
    await expect(page.getByTestId('motor-left')).toHaveText('0%');
    await button(page, 'Remove object').click();
    await expect(page.getByTestId('motor-left')).toHaveText('100%');
    controller.stdin.write('q');
    await expect.poll(() => controller.exitCode, { timeout: 8_000 }).toBe(0);
    await expect(page.getByTestId('motor-left')).toHaveText('0%');
  } finally {
    controller.kill();
  }

  await button(page, 'Unplug Ethernet').click();
  await expect(page.getByTestId('pi-ssh-status')).toHaveText('Ethernet unplugged');
  await expect(exec('ssh', [...hostConfig, address, 'true'], commandLimits)).rejects.toMatchObject({ code: 255 });
  await button(page, 'Connect Ethernet').click();
  await expect(page.getByTestId('pi-ssh-status')).toHaveText('SSH ready · 10.0.1.2', { timeout: 30_000 });
  await type(page, `ssh ${address}`);
  await expect(terminal(page)).toContainText('e300user@raspberrypi', { timeout: 20_000 });
  await type(page, 'uname -m; tail -2 /etc/rpi-issue; ip -br -4 addr');
  await expect(terminal(page)).toContainText('aarch64');
  await expect(terminal(page)).toContainText('Raspberry Pi reference 2026-10-06');
  await expect(terminal(page)).toContainText('10.0.1.2/24');
  await type(page, 'exit');
  await expect(terminal(page)).toContainText(/Connection to (10\.0\.1\.2|127\.0\.0\.1) closed/);
  await type(page, `scp -r testIR ${address}:`);
  await expect(terminal(page)).toContainText(/testIR\.c.*100%/, { timeout: 20_000 });
  await type(page, `ssh ${address}`);
  await expect(terminal(page)).toContainText('e300user@raspberrypi', { timeout: 20_000 });
  await type(page, 'cd testIR && make testIR && file ./testIR');
  await expect(terminal(page)).toContainText(/ELF 64-bit LSB.*ARM aarch64/, { timeout: 30_000 });

  await type(page, 'make run');
  await expect(terminal(page)).toContainText('Obstacle test | q to quit');
  await expect(page.getByTestId('motor-left')).toHaveText('100%', { timeout: 15_000 });
  await expect(page.getByText('BENCH · WHEELS RAISED', { exact: true })).toBeVisible();
  await button(page, 'Hold object').click();
  await expect(page.getByTestId('motor-left')).toHaveText('0%');
  await button(page, 'Remove object').click();
  await expect(page.getByTestId('motor-left')).toHaveText('100%');
  await page.locator('.pi-os-terminal .xterm-helper-textarea').focus();
  await page.keyboard.press('q');
  await expect(page.getByTestId('motor-left')).toHaveText('0%');

  await type(page, 'rtcs schedule testIR && rtcs log');
  await expect(terminal(page)).toContainText('for the next boot within five minutes');
  await type(page, 'sudo shutdown now');
  await expect(page.getByTestId('pi-os-power')).toContainText('Cleanly shut down', { timeout: 35_000 });
  for (const control of ['Unplug Ethernet', 'Disconnect DC', 'Connect battery', 'Place on floor', 'Power on Pi']) {
    await button(page, control).click();
  }
  await expect(page.getByTestId('pi-os-power')).toContainText('Raspberry Pi OS running', { timeout: 125_000 });
  await expect(page.getByTestId('pi-ssh-status')).toHaveText('Ethernet unplugged');
  await expect(page.getByTestId('motor-left')).toHaveText('100%', { timeout: 15_000 });
  await type(page, `ssh ${address}`);
  await expect(terminal(page)).toContainText(/Connection timed out|Connection reset|Connection closed/, { timeout: 15_000 });
  await expect(page.getByTestId('motor-left')).toHaveText('100%');
  await button(page, 'Power off Pi').click();
  await expect(page.getByTestId('pi-os-power')).toContainText('Powered off', { timeout: 15_000 });
  await expect(page.getByTestId('motor-left')).toHaveText('0%');
});
