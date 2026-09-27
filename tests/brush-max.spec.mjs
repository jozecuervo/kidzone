import { expect, test } from "@playwright/test";

const gamePath = "/projects/brush-max/";

async function startGameWithKeyboard(page) {
  const startButton = page.getByRole("button", { name: "I am ready" });
  await startButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#introOverlay")).toBeHidden();
  await expect(page.locator("#catStage")).toHaveAttribute("data-mood", "calm");
}

test.beforeEach(async ({ page }) => {
  await page.goto(gamePath);
});

test("the nested start button keeps native keyboard activation", async ({ page }) => {
  await expect(page.locator("#catStage")).not.toHaveAttribute("role", "button");
  await startGameWithKeyboard(page);
  await expect(page.locator("#catStage")).toHaveAttribute("role", "button");
  await expect(page.locator("#liveStatus")).toContainText("Round 1");
});

test("a released brush cannot leak its delayed stroke into the next hold", async ({ page }) => {
  await startGameWithKeyboard(page);
  const stage = page.locator("#catStage");
  const strokes = page.locator("#strokeCount");

  await stage.focus();
  await page.keyboard.down("Space");
  await page.waitForTimeout(100);
  await page.keyboard.up("Space");
  await page.waitForTimeout(60);
  await page.keyboard.down("Space");
  await page.waitForTimeout(100);

  await expect(strokes).toHaveText("0");
  await expect.poll(async () => Number(await strokes.textContent())).toBeGreaterThan(0);
  await page.keyboard.up("Space");
});

test("an unrelated pointer release does not cancel keyboard brushing", async ({ page }) => {
  await startGameWithKeyboard(page);
  const stage = page.locator("#catStage");
  const purr = page.locator("#catPurr");

  await stage.focus();
  await page.keyboard.down("Space");
  await expect.poll(async () => purr.evaluate((audio) => audio.paused)).toBe(false);

  await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7 })));
  await expect.poll(async () => purr.evaluate((audio) => audio.paused)).toBe(false);
  await page.keyboard.up("Space");
});

test("window blur releases held keyboard brushing", async ({ page }) => {
  await startGameWithKeyboard(page);
  const stage = page.locator("#catStage");
  const strokes = page.locator("#strokeCount");
  const purr = page.locator("#catPurr");

  await stage.focus();
  await page.keyboard.down("Space");
  await expect.poll(async () => Number(await strokes.textContent())).toBeGreaterThan(0);
  await expect.poll(async () => purr.evaluate((audio) => audio.paused)).toBe(false);

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const countAfterBlur = Number(await strokes.textContent());

  await expect.poll(async () => purr.evaluate((audio) => audio.paused)).toBe(true);
  await page.waitForTimeout(500);
  expect(Number(await strokes.textContent())).toBe(countAfterBlur);
  await page.keyboard.up("Space");
});

test("visibility loss pauses play and returns Max calmly", async ({ page }) => {
  await startGameWithKeyboard(page);
  const stage = page.locator("#catStage");
  const purr = page.locator("#catPurr");

  await stage.focus();
  await page.keyboard.down("Space");
  await expect.poll(async () => purr.evaluate((audio) => audio.paused)).toBe(false);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(stage).toHaveAttribute("data-mood", "idle");
  await expect.poll(async () => purr.evaluate((audio) => audio.paused)).toBe(true);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  await expect(stage).toHaveAttribute("data-mood", "calm");
  await expect(page.locator("#liveStatus")).toContainText("Welcome back");
  await page.keyboard.up("Space");
});
