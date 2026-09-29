import { expect, test } from "@playwright/test";

const gamePath = "/projects/cat-city-rampage/";

async function waitForAnimationFrames(page, frameCount = 6) {
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

async function state(page) {
  return page.evaluate(() => {
    const game = window.__catCityRampage;
    return {
      running: game.game.running,
      won: game.game.won,
      bricks: game.bricks.length,
      players: game.players.map((player) => ({
        x: player.x,
        y: player.y,
        vx: player.vx,
        vy: player.vy,
        onGround: player.onGround,
        smashed: player.smashed,
        keys: { ...player.keys }
      }))
    };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto(gamePath);
});

test("keyboard movement uses elapsed time and reset clears held input", async ({ page }) => {
  const start = await state(page);

  await page.keyboard.down("d");
  await expect.poll(async () => (await state(page)).players[0].x).toBeGreaterThan(start.players[0].x + 8);

  await page.getByRole("button", { name: "Play Again" }).click();
  const reset = await state(page);
  expect(reset.players[0].x).toBe(130);
  expect(reset.players[0].keys.right).toBe(false);

  await waitForAnimationFrames(page);
  expect((await state(page)).players[0].x).toBe(130);
  await page.keyboard.up("d");
});

test("touch controls move the selected cat and release on cancellation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(gamePath);

  const blueLeft = page.getByRole("button", { name: "Blue Cat move left" });
  const redRight = page.getByRole("button", { name: "Red Cat move right" });
  const start = await state(page);

  await blueLeft.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch" });
  await expect.poll(async () => (await state(page)).players[1].x).toBeLessThan(start.players[1].x - 8);
  await blueLeft.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "touch" });
  const afterCancel = await state(page);
  expect(afterCancel.players[1].keys.left).toBe(false);

  await redRight.dispatchEvent("pointerdown", { pointerId: 2, pointerType: "touch" });
  await expect.poll(async () => (await state(page)).players[0].x).toBeGreaterThan(start.players[0].x + 8);
  await redRight.dispatchEvent("pointerup", { pointerId: 2, pointerType: "touch" });

  const bodyWidth = await page.locator("body").evaluate((body) => body.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(390);
});

test("smashing removes nearby bricks once per press", async ({ page }) => {
  await page.evaluate(() => {
    const game = window.__catCityRampage;
    const player = game.players[0];
    const target = game.bricks.find((brick) => brick.y === 520);
    player.x = target.x;
    player.y = target.y - player.height;
    player.vx = 0;
    player.vy = 0;
    player.onGround = true;
  });

  const before = await state(page);
  await page.keyboard.down(" ");
  await expect.poll(async () => (await state(page)).bricks).toBeLessThan(before.bricks);
  const afterFirstPress = await state(page);
  await waitForAnimationFrames(page, 4);
  expect((await state(page)).players[0].smashed).toBe(afterFirstPress.players[0].smashed);
  await page.keyboard.up(" ");
});

test("reaching the yarn ends the round and focuses replay", async ({ page }) => {
  await page.evaluate(() => {
    const game = window.__catCityRampage;
    const player = game.players[0];
    player.x = 400;
    player.y = 40;
    player.vx = 0;
    player.vy = 0;
  });

  await expect.poll(async () => (await state(page)).won).toBe(1);
  await expect(page.locator("#statusText")).toHaveText("Player 1 grabbed the yarn!");
  await expect(page.getByRole("button", { name: "Play Again" })).toBeFocused();
});
