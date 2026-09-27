import { expect, test } from "@playwright/test";

const gamePath = "/projects/make-a-game/";

async function cometPosition(region) {
  await expect(region).toHaveAttribute("data-comet-x", /^\d+$/);
  await expect(region).toHaveAttribute("data-comet-y", /^\d+$/);

  return {
    x: Number(await region.getAttribute("data-comet-x")),
    y: Number(await region.getAttribute("data-comet-y"))
  };
}

async function waitForAnimationFrames(page, frameCount = 4) {
  await page.evaluate(
    (count) => new Promise((resolve) => {
      function nextFrame(framesLeft) {
        if (framesLeft === 0) {
          resolve();
          return;
        }

        requestAnimationFrame(() => nextFrame(framesLeft - 1));
      }

      nextFrame(count);
    }),
    frameCount
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto(gamePath);
});

test("keyboard input is scoped to the focused game region", async ({ page }) => {
  const region = page.locator("[data-game-region]");
  await expect(region).toHaveAttribute("tabindex", "0");
  const start = await cometPosition(region);

  await page.keyboard.down("ArrowRight");
  await waitForAnimationFrames(page);
  await page.keyboard.up("ArrowRight");
  expect((await cometPosition(region)).x).toBe(start.x);

  await region.focus();
  await page.keyboard.down("ArrowRight");
  await expect.poll(async () => (await cometPosition(region)).x).toBeGreaterThan(start.x);
  await page.keyboard.up("ArrowRight");
});

test("pointer controls move and stop the comet", async ({ page }) => {
  const region = page.locator("[data-game-region]");
  const button = page.getByRole("button", { name: "Move left" });
  const start = await cometPosition(region);
  const box = await button.boundingBox();

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await cometPosition(region)).x).toBeLessThan(start.x);
  await page.mouse.up();
  const moved = await cometPosition(region);

  await waitForAnimationFrames(page);
  expect((await cometPosition(region)).x).toBe(moved.x);
});

test("direction buttons work with keyboard activation and stop on release", async ({ page }) => {
  const region = page.locator("[data-game-region]");
  const button = page.getByRole("button", { name: "Move up" });
  const start = await cometPosition(region);

  await button.focus();
  await page.keyboard.down("Enter");
  await expect.poll(async () => (await cometPosition(region)).y).toBeLessThan(start.y);
  await page.keyboard.up("Enter");
  const moved = await cometPosition(region);

  await waitForAnimationFrames(page);
  expect((await cometPosition(region)).y).toBe(moved.y);
});

test("blur clears held keyboard input", async ({ page }) => {
  const region = page.locator("[data-game-region]");
  await region.focus();
  const start = await cometPosition(region);
  await page.keyboard.down("d");
  await expect.poll(async () => (await cometPosition(region)).x).toBeGreaterThan(start.x);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  const afterBlur = await cometPosition(region);
  await waitForAnimationFrames(page);
  expect((await cometPosition(region)).x).toBe(afterBlur.x);
  await page.keyboard.up("d");
});

test("touch controls fit and move at a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(gamePath);
  const region = page.locator("[data-game-region]");
  const button = page.getByRole("button", { name: "Move down" });
  await expect(button).toBeVisible();
  const bodyWidth = await page.locator("body").evaluate((body) => body.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);

  const start = await cometPosition(region);
  await button.dispatchEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch"
  });
  await expect.poll(async () => (await cometPosition(region)).y).toBeGreaterThan(start.y);
  await button.dispatchEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch"
  });
});
