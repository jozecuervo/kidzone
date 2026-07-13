import { expect, test } from "@playwright/test";

test("presents featured work and the complete project shelf", async ({ page }) => {
  const browserErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto("/", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { level: 1, name: "Kidzone" })).toBeVisible();
  await expect(page.locator(".featured-card")).toHaveCount(3);
  await expect(page.locator(".project-card")).toHaveCount(11);
  await expect(page.locator(".featured-preview img")).toHaveCount(3);

  const brokenPreviewCount = await page.locator(".featured-preview img").evaluateAll(
    (images) => images.filter((image) => !image.complete || image.naturalWidth === 0).length
  );

  expect(brokenPreviewCount).toBe(0);
  expect(browserErrors).toEqual([]);
});

test("fits the portfolio landing page on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/", { waitUntil: "networkidle" });

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );

  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole("link", { name: "Explore the work" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Footer" })).toBeVisible();
});
