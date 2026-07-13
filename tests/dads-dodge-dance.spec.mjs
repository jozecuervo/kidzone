import { expect, test } from "@playwright/test";

const gameUrl = "/projects/dads-dodge-dance/";

async function aimAtDad(page) {
  const dadBox = await page.locator("#dad").boundingBox();
  if (!dadBox) throw new Error("Dad target is not visible");
  await page.mouse.click(dadBox.x + dadBox.width / 2, dadBox.y + dadBox.height / 2);
}

test.describe("Dad's Dodge Dance lifecycle", () => {
  test("reset invalidates an in-flight toss", async ({ page }) => {
    await page.goto(gameUrl);
    await aimAtDad(page);
    await page.getByRole("button", { name: "Reset" }).click();
    await page.waitForTimeout(650);

    await expect(page.locator("#splash-meter")).toHaveAttribute("aria-valuenow", "0");
    await expect(page.locator("#ammo-count")).toHaveText("10");
    await expect(page.locator(".balloon, .splash, .float-note")).toHaveCount(0);
  });

  test("reset invalidates a pending reload", async ({ page }) => {
    await page.goto(gameUrl);
    for (let toss = 0; toss < 10; toss += 1) {
      await page.getByRole("button", { name: "Toss balloon" }).click();
      await page.waitForTimeout(450);
    }
    await page.getByRole("button", { name: "Reload" }).click();
    await expect(page.locator("#stage")).toHaveAttribute("data-phase", "reloading");
    await page.getByRole("button", { name: "Reset" }).click();
    await page.waitForTimeout(1350);

    await expect(page.locator("#stage")).toHaveAttribute("data-phase", "playing");
    await expect(page.locator("#ammo-count")).toHaveText("10");
    await expect(page.locator("#stage")).not.toHaveClass(/is-reloading/);
  });

  test("reset invalidates victory and level-advance work", async ({ page }) => {
    await page.goto(gameUrl);
    for (let hit = 0; hit < 6; hit += 1) {
      await aimAtDad(page);
      await page.waitForTimeout(470);
    }
    await expect(page.locator("#stage")).toHaveAttribute("data-phase", "celebrate");
    await page.getByRole("button", { name: "Reset" }).click();
    await page.waitForTimeout(1700);

    await expect(page.locator("#level-number")).toHaveText("1");
    await expect(page.locator("#splash-meter")).toHaveAttribute("aria-valuenow", "0");
    await expect(page.locator("#stage")).toHaveAttribute("data-phase", "playing");
    await expect(page.locator("#dad")).not.toHaveClass(/is-victory-dance|is-fleeing/);
  });

  test("keyboard aim retains stage focus and safety copy avoids body rewards", async ({ page }) => {
    await page.goto(gameUrl);
    const stage = page.locator("#stage");
    await stage.focus();
    await page.keyboard.press("ArrowRight");
    await expect(stage).toBeFocused();
    await expect(page.locator("body")).toContainText("every splash counts the same");
    await expect(page.locator("body")).not.toContainText(/HEAD SHOT|\bOUCH\b|Face hits|low hits/i);
  });
});

test("reduced motion shortens the toss and disables repeating CSS motion", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(gameUrl);
  await page.getByRole("button", { name: "Toss balloon" }).click();
  await page.waitForTimeout(200);
  await expect(page.locator(".balloon")).toHaveCount(0);
  const animationName = await page.locator("#dad .dad-figure").evaluate((node) => getComputedStyle(node).animationName);
  expect(animationName).toBe("none");
  await context.close();
});

test("mobile splash zone fits without page overflow or console errors", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(gameUrl);
  const sizes = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth + 1);
  await expect(page.getByRole("button", { name: "Toss balloon" })).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});
