import { expect } from "@playwright/test";

// Baseline gaps found when this suite was introduced. These stay explicit so a
// project fix can remove one line and turn the smoke check into a regression guard.
// Do not add an exception for page errors, console errors, or broken resources.
const projectExceptions = {
  "astro-bot-screensaver": {
    missingViewport: "Legacy screensaver does not yet declare a mobile viewport.",
    missingH1: "Legacy animation has no visible level-one heading."
  },
  "math-knitting": {
    mobileOverflow: "Legacy fixed-width game is 36px wider than the 390px viewport."
  },
  "old-rules": {
    mobileOverflow: "Legacy fixed-width game is 213px wider than the 390px viewport."
  },
  "world-of-poo": {
    missingH1: "Legacy game logo is not yet exposed as a level-one heading.",
    mobileOverflow: "Legacy physics game is 405px wider than the 390px viewport."
  }
};

const allowedConsoleMessages = [];

function isAllowedConsoleMessage(text) {
  return allowedConsoleMessages.some((pattern) => pattern.test(text));
}

export function observePage(page) {
  const pageErrors = [];
  const consoleErrors = [];
  const failedLocalResources = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && !isAllowedConsoleMessage(message.text())) {
      consoleErrors.push(message.text());
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      url.origin === "http://127.0.0.1:4173" &&
      response.status() >= 400
    ) {
      failedLocalResources.push(`${response.status()} ${url.pathname}`);
    }
  });
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    if (url.origin === "http://127.0.0.1:4173") {
      failedLocalResources.push(
        `${request.failure()?.errorText ?? "request failed"} ${url.pathname}`
      );
    }
  });

  return { pageErrors, consoleErrors, failedLocalResources };
}

export async function expectProjectShell(page, project, observations) {
  const exceptions = projectExceptions[project.slug] ?? {};
  const response = await page.goto(project.path, { waitUntil: "load" });

  expect(response?.ok(), `entry response for ${project.slug}`).toBe(true);
  await expect(page.locator("html")).toHaveAttribute("lang", /\S+/);
  await expect(page).toHaveTitle(/\S+/);
  if (!exceptions.missingViewport) {
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /width=device-width/i
    );
  }
  if (!exceptions.missingH1) {
    await expect(page.locator("h1")).toHaveCount(1);
  }

  const mainCount = await page.locator("main").count();
  expect(mainCount, `${project.slug} should have at most one main landmark`).toBeLessThanOrEqual(1);

  const homeLinks = page.getByRole("link", { name: /(?:back to )?kidzone/i });
  for (let index = 0; index < await homeLinks.count(); index += 1) {
    const href = await homeLinks.nth(index).getAttribute("href");
    expect(new URL(href, page.url()).pathname, "Kidzone link should return to the site root").toBe("/");
  }

  // Let load handlers and their first rendered frame settle without a timed sleep.
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
