import { expect, test } from '@playwright/test';

const projectUrl = '/projects/photo-by-numbers/src/index.html';

test('upload control opens the file chooser from the keyboard', async ({ page }) => {
  await page.goto(projectUrl);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Upload Photo' }).focus();
  await page.keyboard.press('Enter');
  await chooserPromise;
});

test('palette colors have names and expose their selection', async ({ page }) => {
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'Try Sample' }).click();
  await page.getByRole('button', { name: 'Proceed to Coloring' }).click();
  await expect(page.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Orange' }).click();
  await expect(page.getByRole('button', { name: 'Orange' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'false');
});

test('camera denial gives a recoverable status message', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => { throw new Error('denied'); } }
    });
  });
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'Use Webcam' }).click();
  await expect(page.getByRole('status')).toContainText('Camera access was not available');
});

test('page exit stops an active camera stream', async ({ page }) => {
  await page.addInitScript(() => {
    window.cameraTrackStops = 0;
    const track = { stop: () => { window.cameraTrackStops += 1; } };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [track] }) }
    });
  });
  await page.goto(projectUrl);
  await page.getByRole('button', { name: 'Use Webcam' }).click();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect.poll(() => page.evaluate(() => window.cameraTrackStops)).toBe(1);
});

test('input screen fits a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(projectUrl);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.getByRole('button', { name: 'Upload Photo' })).toBeVisible();
});
