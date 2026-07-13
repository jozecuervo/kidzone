import { expect, test } from "@playwright/test";

const gamePath = "/projects/color-mixer-lab/";

async function addDrops(page, paint, count) {
  const button = page.getByRole("button", { name: `Add ${paint}` });
  for (let index = 0; index < count; index += 1) await button.click();
}

async function mixLevelOneRecipe(page) {
  await addDrops(page, "Yellow", 4);
  await addDrops(page, "White", 2);
  await addDrops(page, "Brown", 1);
}

test("correct and retry transitions wait for the player and restore focus", async ({ page }) => {
  await page.goto(gamePath);
  await mixLevelOneRecipe(page);
  await page.getByRole("button", { name: "Check mix" }).click();

  const continueButton = page.getByRole("button", { name: "Continue" });
  await expect(continueButton).toBeFocused();
  await expect(page.getByRole("status")).toContainText("Choose Continue");
  await page.waitForTimeout(1100);
  await expect(page.getByText("Light Gold", { exact: true })).toBeVisible();

  await continueButton.click();
  await expect(page.getByText("Pumpkin Orange", { exact: true })).toBeFocused();

  await page.getByRole("button", { name: "Add Blue" }).click();
  await page.getByRole("button", { name: "Check mix" }).click();
  const retryButton = page.getByRole("button", { name: "Retry this level" });
  await expect(retryButton).toBeFocused();
  await expect(page.getByRole("status")).toContainText("Choose Retry");

  await retryButton.click();
  await expect(page.getByRole("button", { name: "Add Red" })).toBeFocused();
  await expect(page.locator("#drop-total")).toHaveText("0");
});

test("closeness text and drop history work without color-only feedback", async ({ page }) => {
  await page.goto(gamePath);
  await addDrops(page, "Red", 20);

  await expect(page.locator("#closeness")).toHaveText(/Closeness: (Very close|Getting closer|Far apart)/);
  await expect(page.locator(".drop-chip")).toHaveCount(12);
  await expect(page.locator(".drop-summary")).toHaveText("Earlier: 8");
});

test("completion moves focus to a useful replay action", async ({ page }) => {
  const recipes = [
    { Yellow: 4, White: 2, Brown: 1 },
    { Red: 2, Yellow: 3, Brown: 1 },
    { Red: 2, White: 4, Brown: 1 },
    { Yellow: 2, Blue: 2, White: 3, Brown: 1 },
    { Red: 2, Blue: 3, White: 3, Brown: 1 }
  ];

  await page.goto(gamePath);

  for (const recipe of recipes) {
    for (const [paint, count] of Object.entries(recipe)) {
      await addDrops(page, paint, count);
    }
    await page.getByRole("button", { name: "Check mix" }).click();
    await page.getByRole("button", { name: "Continue" }).click();
  }

  const playAgain = page.getByRole("button", { name: "Play again" });
  await expect(page.getByText("All 5 colors matched.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Lab complete.");
  await expect(playAgain).toBeFocused();
});

test("mobile and reduced-motion modes keep actions usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(gamePath);

  await expect(page.locator("body")).toHaveCSS("overflow-x", "visible");
  const viewportFits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(viewportFits).toBe(true);
  await expect(page.getByRole("button", { name: "Check mix" })).toBeVisible();
  await expect(page.getByText("Digital paint is approximate. A close mix counts.")).toBeVisible();
});
