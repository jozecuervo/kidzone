import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/projects/cheeseworld/");
  await page.waitForFunction(() => window.__cheeseworldTest);
});

test("generated cheese platforms stay connected across deterministic seeds", async ({ page }) => {
  const failures = await page.evaluate(() => {
    const api = window.__cheeseworldTest;
    const failures = [];
    for (let seed = 0; seed < 250; seed++) {
      api.setSeed(seed);
      api.initLevel(6);
      const { platforms } = api.state();
      for (let i = 1; i < platforms.length; i++) {
        const platform = platforms[i];
        const previous = platforms[platform.reachableFrom];
        const verticalRise = previous.y - platform.y;
        const horizontalGap = Math.max(
          0,
          previous.x - (platform.x + platform.width),
          platform.x - (previous.x + previous.width)
        );
        if (!previous || verticalRise > 70 || horizontalGap > 50) {
          failures.push({ seed, i, verticalRise, horizontalGap });
        }
      }
    }
    return failures;
  });
  expect(failures).toEqual([]);
});

test("fixed-step simulation is equivalent at 30 Hz and 120 Hz", async ({ page }) => {
  const positions = await page.evaluate(() => {
    const api = window.__cheeseworldTest;
    const run = (rate) => {
      api.setSeed(42);
      api.initLevel(1);
      api.runFrameDeltas(Array.from({ length: rate * 2 }, () => 1000 / rate));
      const state = api.state();
      return { mouseY: state.mouse.y, enemyX: state.enemies[0].x };
    };
    return { slow: run(30), fast: run(120) };
  });
  expect(positions.slow.mouseY).toBeCloseTo(positions.fast.mouseY, 5);
  expect(positions.slow.enemyX).toBeCloseTo(positions.fast.enemyX, 5);
});

test("overlapping hazards only deal one hit and grant a safe cooldown", async ({ page }) => {
  const states = await page.evaluate(() => {
    const api = window.__cheeseworldTest;
    api.arrangeDamageTest();
    api.step(1000 / 60);
    const first = api.state();
    api.step(500);
    const duringCooldown = api.state();
    return { first, duringCooldown };
  });
  expect(states.first.game.score).toBe(15);
  expect(states.first.mouse).toMatchObject({ x: 100, y: 435 });
  expect(states.first.game.damageCooldown).toBeGreaterThan(900);
  expect(states.duringCooldown.game.score).toBe(15);
});

test("gameplay keys are scoped and held input clears when focus leaves", async ({ page }) => {
  await page.keyboard.down("ArrowRight");
  expect(await page.evaluate(() => window.__cheeseworldTest.state().keys.right)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  expect(await page.evaluate(() => window.__cheeseworldTest.state().keys.right)).toBe(false);
  await page.evaluate(() => {
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
  });
  await page.keyboard.down("ArrowRight");
  expect(await page.evaluate(() => window.__cheeseworldTest.state().keys.right)).toBe(false);
  await page.keyboard.up("ArrowRight");
});

test("mobile controls remain visible and playable without overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const right = page.getByRole("button", { name: "Move right" });
  await expect(right).toBeVisible();
  const before = await page.evaluate(() => window.__cheeseworldTest.state().mouse.x);
  await right.dispatchEvent("pointerdown", { pointerId: 1 });
  await page.waitForTimeout(150);
  await right.dispatchEvent("pointerup", { pointerId: 1 });
  const after = await page.evaluate(() => window.__cheeseworldTest.state().mouse.x);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(after).toBeGreaterThan(before);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});
