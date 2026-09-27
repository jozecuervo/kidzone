import { expect, test } from "@playwright/test";

const projectUrl = "/projects/haunted-maze/";

async function startWithKeyboard(page) {
  await page.goto(projectUrl);
  await page.locator("#maze-view").focus();
}

test("level 1 can be completed with keyboard movement and restores focus", async ({ page }) => {
  await startWithKeyboard(page);

  // Branch away from the exit route to collect the required hidden key.
  await page.keyboard.press("s");
  await page.keyboard.press("s");
  await page.keyboard.press("d");

  await expect(page.locator("#reward-overlay")).toBeVisible();
  await expect(page.locator("#key-status")).toHaveText("Key: found");
  await page.keyboard.press("Escape");
  await expect(page.locator("#reward-overlay")).toBeHidden();
  await expect(page.locator("#maze-view")).toBeFocused();

  await page.keyboard.press("d");
  await page.keyboard.press("d");
  await expect(page.locator("#scare-overlay")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#scare-overlay")).toBeHidden();
  await expect(page.locator("#maze-view")).toBeFocused();

  await page.keyboard.press("d");
  await page.keyboard.press("s");
  await page.keyboard.press("s");

  await expect(page.locator("#win-overlay")).toBeVisible();
  await expect(page.locator("#next-level-btn")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#level-number")).toHaveText("2");
  await expect(page.locator("#win-overlay")).toBeHidden();
  await expect(page.locator("#maze-view")).toBeFocused();
});

test("arrow keys still sweep the searchlight without moving the player", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await startWithKeyboard(page);

  const maze = page.locator("#maze-view");
  const playerBefore = await maze.locator(".maze-player-cell").getAttribute("data-facing");
  const lightBefore = await maze.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--light-x")
  );

  await page.keyboard.press("ArrowRight");

  await expect(maze.locator(".maze-player-cell")).toHaveAttribute("data-facing", playerBefore);
  await expect.poll(() => maze.evaluate((element) =>
    getComputedStyle(element).getPropertyValue("--light-x")
  )).not.toBe(lightBefore);
  await expect.poll(() => page.evaluate(() =>
    document.documentElement.scrollWidth <= document.documentElement.clientWidth
  )).toBe(true);
});
