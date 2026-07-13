import { expect } from "@playwright/test";

const testSiteBasePath = "/kidzone/";

const projectExceptions = {
  "old-rules": {
    mobileOverflow: "The game board still requires a wider-than-phone playfield."
  },
  "world-of-poo": {
    missingH1: "The canvas game logo is not yet exposed as a level-one heading.",
    mobileOverflow: "The physics game still requires a wider-than-phone playfield."
  }
};

export function observePage(page) {
  const pageErrors = [];
  const consoleErrors = [];
  const failedLocalResources = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin === "http://127.0.0.1:4173" &&
      !url.pathname.startsWith(testSiteBasePath)
    ) {
      failedLocalResources.push(`resource escaped ${testSiteBasePath}: ${url.href}`);
    }
    if (response.status() >= 400) {
      failedLocalResources.push(`${response.status()} ${url.href}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    failedLocalResources.push(
      `${request.failure()?.errorText ?? "request failed"} ${url.href}`
    );
  });

  return { pageErrors, consoleErrors, failedLocalResources };
}

export async function expectProjectShell(page, project, observations) {
  const exceptions = projectExceptions[project.slug] ?? {};
  const response = await page.goto(project.path, { waitUntil: "load" });

  expect(response?.ok(), `entry response for ${project.slug}`).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", /\S+/);
  await expect(page).toHaveTitle(/\S+/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /width=device-width/i
  );
  if (!exceptions.missingH1) {
    await expect(page.locator("h1")).toHaveCount(1);
  }

  const mainCount = await page.locator("main").count();
  expect(mainCount, `${project.slug} should have at most one main landmark`).toBeLessThanOrEqual(1);

  const homeLinks = page.getByRole("link", { name: /(?:back to )?kidzone/i });
  const expectedSiteRoot = new URL("../../", page.url()).pathname;
  for (let index = 0; index < await homeLinks.count(); index += 1) {
    const href = await homeLinks.nth(index).getAttribute("href");
    expect(new URL(href, page.url()).pathname, "Kidzone link should return to the site root").toBe(expectedSiteRoot);
  }

  await page.waitForLoadState("networkidle");
  // Let load handlers and their first rendered frame settle.
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  if (!(exceptions.mobileOverflow && overflow.clientWidth === 390)) {
    expect(
      overflow.scrollWidth,
      `${project.slug} should not overflow horizontally (${JSON.stringify(overflow)})`
    ).toBeLessThanOrEqual(overflow.clientWidth + 1);
  }

  expect(observations.pageErrors, "uncaught page errors").toEqual([]);
  expect(observations.consoleErrors, "unexpected console errors").toEqual([]);
  expect(observations.failedLocalResources, "failed local resources").toEqual([]);
}
