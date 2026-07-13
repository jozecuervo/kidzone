import { expect, test } from '@playwright/test';

const path = '/projects/astro-bot-screensaver/astro.html';

test('uses one scheduler and supports keyboard pause', async ({ page }) => {
  await page.goto(path);
  await expect(page.getByRole('heading', { name: /Astro Bot-inspired/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__astroDebug.state.frameCount)).toBeGreaterThan(1);
  await expect(page.getByRole('button', { name: 'Pause animation' })).toBeVisible();
  expect(await page.evaluate(() => window.__astroDebug.state)).toMatchObject({
    botCount: 7, schedulerCount: 1, pageListenerCount: 6
  });
  await page.locator('body').press('Space');
  await expect(page.getByRole('button', { name: 'Resume animation' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__astroDebug.state.schedulerCount)).toBe(0);
  await page.locator('body').press('Space');
  await expect.poll(() => page.evaluate(() => window.__astroDebug.state.schedulerCount)).toBe(1);
});

test('pauses when hidden and honors reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path);
  expect(await page.evaluate(() => window.__astroDebug.state)).toMatchObject({
    paused: true, reducedMotion: true, schedulerCount: 0
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(() => page.evaluate(() => window.__astroDebug.state.schedulerCount)).toBe(1);
  await page.evaluate(() => window.__astroDebug.setHiddenForTest(true));
  await expect.poll(() => page.evaluate(() => window.__astroDebug.state.schedulerCount)).toBe(0);
});

test('fits a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(path);
  const fit = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth }));
  expect(fit.scrollWidth).toBeLessThanOrEqual(fit.clientWidth);
  await expect(page.getByRole('button')).toBeInViewport();
});
