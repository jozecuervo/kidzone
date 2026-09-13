import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import {
  LANDMARKS,
  fruitByKey,
  heightFromSlider,
  impactViewFor,
  instructionsForPhase,
  sliderFromHeight
} from "../projects/splat-lab/rules.js";

const gamePath = "/projects/splat-lab/";
// A pinned seed for tests that compare two runs against each other: every
// Drop otherwise draws a fresh crypto.getRandomValues() seed (step 1b §7),
// so "the same result twice" tests need the ?seed= override to hold.
const pinnedGamePath = `${gamePath}?seed=7`;
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const THREE_MODULE_URL = "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js";
const THREE_CORE_URL = "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.core.js";
const CANNON_URL = "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js";

// Step 1b §7 replaced the discrete height-preset ids with a continuous
// 0-1000 slider. These are the slider positions for the named landmarks,
// derived the same way the production code does (sliderFromHeight), not
// hardcoded, so a change to the mapping can't silently desync the tests.
const landmarkSliderValue = Object.fromEntries(
  LANDMARKS.map((landmark) => [landmark.name, String(Math.round(sliderFromHeight(landmark.meters)))])
);
const KNEE_V = landmarkSliderValue.Knee;
const COUNTER_V = landmarkSliderValue.Counter;
const ROOF_V = landmarkSliderValue.Roof;
const PLANE_V = landmarkSliderValue.Plane;

async function projectMetadata() {
  const raw = await readFile(join(repoRoot, "projects/splat-lab/project.json"), "utf8");
  return JSON.parse(raw);
}

// Registers the catch-all abort route FIRST (Playwright matches the
// last-registered route first, so the specific routes below take
// precedence), then serves the three CDN files from node_modules.
async function routeCdnAndRecordUnexpectedRequests(page) {
  const unexpectedRequests = [];

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());

    if (url.hostname === "127.0.0.1") {
      await route.continue();
      return;
    }

    unexpectedRequests.push(route.request().url());
    await route.abort();
  });

  await page.route(THREE_MODULE_URL, async (route) => {
    const body = await readFile(join(repoRoot, "node_modules/three/build/three.module.js"));
    await route.fulfill({ body, contentType: "text/javascript" });
  });

  await page.route(THREE_CORE_URL, async (route) => {
    const body = await readFile(join(repoRoot, "node_modules/three/build/three.core.js"));
    await route.fulfill({ body, contentType: "text/javascript" });
  });

  await page.route(CANNON_URL, async (route) => {
    const body = await readFile(join(repoRoot, "node_modules/cannon-es/dist/cannon-es.js"));
    await route.fulfill({ body, contentType: "text/javascript" });
  });

  return unexpectedRequests;
}

// One narrow exemption (C13): Chromium may log a resource-load error for
// the CDN request the load-failure test deliberately aborts. No other
// console error is ever tolerated.
const EXEMPT_ABORTED_CONSOLE_TEXT_PREFIX = "Failed to load resource: net::ERR_FAILED";

function trackConsoleAndPageErrors(page, { exemptAbortedUrl } = {}) {
  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on("console", (msg) => {
    if (msg.type() !== "error") return;

    if (exemptAbortedUrl && msg.location()?.url === exemptAbortedUrl && msg.text().startsWith(EXEMPT_ABORTED_CONSOLE_TEXT_PREFIX)) {
      return;
    }

    errors.push(`console.error: ${msg.text()} (${msg.location()?.url ?? "no location"})`);
  });

  return errors;
}

// locator.fill() sets a range input's value without dispatching the
// "input" event view.js listens on, so it never sees the change (Playwright
// fill() targets text-like inputs). Set the value and dispatch the event
// the browser itself would fire when a user drags/arrows the slider.
async function setSliderValue(locator, value) {
  await locator.evaluate((element, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(element, nextValue);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, String(value));
}

async function setFruit(page, fruitKey) {
  await page.locator(`input[name="fruit"][value="${fruitKey}"]`).check();
}

async function waitForPhase(page, phase, options = {}) {
  await expect(page.locator("main")).toHaveAttribute("data-phase", phase, options);
}

test.describe("Splat Lab", () => {
  test("keyboard only: Tab to height, arrow to Plane, Tab to toughness, Space on Drop, then Enter after Reset", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    const heightSlider = page.locator("#height-slider");
    const toughnessSlider = page.locator("#toughness-slider");
    const dropButton = page.getByRole("button", { name: "Drop" });
    const resetButton = page.getByRole("button", { name: "Reset" });

    // D1: keyboard-only, starting from nothing focused. Tab until the height
    // slider itself is focused (capped at 10 presses), asserting after each
    // press so a stall is visible in the failure, not silent.
    let heightSliderFocused = false;

    for (let tabIndex = 0; tabIndex < 15 && !heightSliderFocused; tabIndex += 1) {
      await page.keyboard.press("Tab");
      heightSliderFocused = await heightSlider.evaluate((element) => element === document.activeElement);
    }

    expect(heightSliderFocused, "Tab (capped at 15 presses) never reached #height-slider from a blank focus").toBe(true);

    // Move to Plane (the slider max, 1000) with End (works regardless of the current value).
    await page.keyboard.press("End");
    await expect(heightSlider).toHaveValue("1000");

    await page.keyboard.press("Tab");
    await expect(toughnessSlider).toBeFocused();
    // Do not change toughness; default toughness (5) is used for the drop.
    const toughnessValue = Number(await toughnessSlider.inputValue());
    expect(toughnessValue).toBe(5);

    await page.keyboard.press("Tab");
    await expect(dropButton).toBeFocused();

    await expect(heightSlider).toBeEnabled();
    await page.keyboard.press("Space");

    await waitForPhase(page, "falling");
    await expect(heightSlider).toBeDisabled();
    await expect(toughnessSlider).toBeDisabled();

    await waitForPhase(page, "settled", { timeout: 15000 });
    // Default fruit (watermelon) at Plane/toughness 5 always smashes.
    await expect(page.locator("#status")).toContainText(
      "It smashed into 12 pieces and 40 seeds flew out."
    );

    // D1: reach Reset by keyboard from wherever focus landed once Drop
    // became disabled (Chromium moves focus to <body> when the focused
    // element is disabled), using Tab/Shift+Tab, capped at 10 presses each
    // direction. If neither direction finds it, that is a real stranding and
    // is reported rather than worked around.
    let resetFocused = await resetButton.evaluate((element) => element === document.activeElement);

    for (let tabIndex = 0; tabIndex < 10 && !resetFocused; tabIndex += 1) {
      await page.keyboard.press("Tab");
      resetFocused = await resetButton.evaluate((element) => element === document.activeElement);
    }

    if (!resetFocused) {
      for (let tabIndex = 0; tabIndex < 10 && !resetFocused; tabIndex += 1) {
        await page.keyboard.press("Shift+Tab");
        resetFocused = await resetButton.evaluate((element) => element === document.activeElement);
      }
    }

    expect(
      resetFocused,
      "keyboard user could not reach Reset by Tab or Shift+Tab (capped at 10 presses each) after Drop became disabled"
    ).toBe(true);

    await page.keyboard.press("Enter");
    await waitForPhase(page, "ready");

    // Reach Drop by keyboard again and press Enter.
    let dropFocusedAgain = await dropButton.evaluate((element) => element === document.activeElement);

    for (let tabIndex = 0; tabIndex < 10 && !dropFocusedAgain; tabIndex += 1) {
      await page.keyboard.press("Tab");
      dropFocusedAgain = await dropButton.evaluate((element) => element === document.activeElement);
    }

    expect(dropFocusedAgain, "keyboard user could not reach Drop by Tab (capped at 10 presses) after Reset").toBe(true);

    await page.keyboard.press("Enter");
    await waitForPhase(page, "falling");
    await waitForPhase(page, "settled", { timeout: 15000 });
    await expect(page.locator("#status")).toContainText(
      "It smashed into 12 pieces and 40 seeds flew out."
    );

    expect(errors, `unexpected console/page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("pointer: clicking Drop at Knee height (default watermelon) says it held and bounced", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), KNEE_V);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });

    await expect(page.locator("#status")).toContainText("It held and bounced.");

    expect(errors).toEqual([]);
  });

  test("a Counter watermelon drop at default toughness shows 'cracked' or 'split'", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), COUNTER_V);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });

    await expect(page.locator("#status")).toContainText(/It (cracked|split) into/);

    expect(errors).toEqual([]);
  });

  test.describe("touch", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test("tapping the controls, including the height slider itself, at Knee height completes a drop, and controls stay visible without scrolling", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      await page.evaluate(() => window.scrollTo(0, 0));

      const viewportSize = page.viewportSize();
      const canvasBox = await page.locator("#scene-canvas").boundingBox();
      const dropBox = await page.getByRole("button", { name: "Drop" }).boundingBox();
      const resetBox = await page.getByRole("button", { name: "Reset" }).boundingBox();

      for (const box of [canvasBox, dropBox, resetBox]) {
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(viewportSize.height);
      }

      // D6: on this narrow viewport, controls sit below the canvas (stacked).
      const controlsBox = await page.locator(".controls-panel").boundingBox();
      expect(controlsBox.y).toBeGreaterThanOrEqual(canvasBox.y + canvasBox.height);

      // D7: tap the height slider itself (near its left/min end) instead of
      // setting its value with a script.
      const heightSlider = page.locator("#height-slider");
      const sliderBox = await heightSlider.boundingBox();
      await heightSlider.tap({ position: { x: 2, y: sliderBox.height / 2 } });

      await expect(heightSlider).toHaveValue("0");
      await expect(page.locator("#height-readout")).toHaveText("0.3 m (about Knee)");

      await page.getByRole("button", { name: "Drop" }).tap();
      await waitForPhase(page, "settled", { timeout: 15000 });
      await expect(page.locator("#status")).toContainText("It held and bounced.");

      await page.getByRole("button", { name: "Reset" }).tap();
      await waitForPhase(page, "ready");

      expect(errors).toEqual([]);
    });
  });

  test("D6: the stage and controls sit side by side on a wide viewport", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath); // default project viewport is 1280x900
    await waitForPhase(page, "ready");

    const canvasBox = await page.locator("#scene-canvas").boundingBox();
    const controlsBox = await page.locator(".controls-panel").boundingBox();

    const overlaps =
      canvasBox.y < controlsBox.y + controlsBox.height && controlsBox.y < canvasBox.y + canvasBox.height;

    expect(overlaps).toBe(true);
    expect(controlsBox.x).toBeGreaterThanOrEqual(canvasBox.x + canvasBox.width);

    await expect(page.locator("#status")).toBeVisible();
    await expect(page.locator("#load-failure")).toBeAttached();

    expect(errors).toEqual([]);
  });

  test("twice in one session: drop -> settle -> reset -> drop -> settle -> reset gives matching results each time", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    // Pinned seed: every Drop otherwise draws a fresh random seed, which
    // would make "matching results each time" flaky by construction.
    await page.goto(pinnedGamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), KNEE_V);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });
    const firstText = await page.locator("#status").textContent();

    await page.getByRole("button", { name: "Reset" }).click();
    await waitForPhase(page, "ready");
    await expect(page.locator("main")).toHaveAttribute("data-steps", "0");

    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });
    const secondText = await page.locator("#status").textContent();

    expect(secondText).toEqual(firstText);

    await page.getByRole("button", { name: "Reset" }).click();
    await waitForPhase(page, "ready");
    await expect(page.locator("main")).toHaveAttribute("data-steps", "0");

    expect(errors).toEqual([]);
  });

  test("fruit -> drop -> reset -> other fruit -> drop, twice in one session", async ({ page }) => {
    test.setTimeout(60000);
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    // Pinned seed: this test compares a tomato drop and a coconut drop each
    // run twice, which otherwise draws two different random seeds per fruit.
    await page.goto(pinnedGamePath);
    await waitForPhase(page, "ready");

    async function dropFruitAtPlane(fruitKey) {
      await setFruit(page, fruitKey);
      await setSliderValue(page.locator("#height-slider"), PLANE_V);
      await setSliderValue(page.locator("#toughness-slider"), 1);
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "settled", { timeout: 20000 });
      const text = await page.locator("#status").textContent();
      expect(text.startsWith(`Dropped a`) || text.startsWith(`Dropped an`)).toBe(true);
      await page.getByRole("button", { name: "Reset" }).click();
      await waitForPhase(page, "ready");
      return text;
    }

    const firstTomato = await dropFruitAtPlane("tomato");
    const firstCoconut = await dropFruitAtPlane("coconut");
    const secondTomato = await dropFruitAtPlane("tomato");
    const secondCoconut = await dropFruitAtPlane("coconut");

    expect(firstTomato).toContain("tomato");
    expect(firstCoconut).toContain("coconut");
    expect(secondTomato).toEqual(firstTomato);
    expect(secondCoconut).toEqual(firstCoconut);

    expect(errors).toEqual([]);
  });

  test("fruit selector: keyboard arrows move between fruits, disabled outside ready", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    const watermelonRadio = page.locator('input[name="fruit"][value="watermelon"]');
    const tomatoRadio = page.locator('input[name="fruit"][value="tomato"]');
    const appleRadio = page.locator('input[name="fruit"][value="apple"]');

    await expect(watermelonRadio).toBeChecked();

    await watermelonRadio.focus();
    await page.keyboard.press("ArrowLeft"); // native radio-group behaviour moves to the previous option
    await expect(tomatoRadio).toBeChecked();

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(appleRadio).toBeChecked();

    await setSliderValue(page.locator("#height-slider"), PLANE_V);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "falling");

    for (const radio of [watermelonRadio, tomatoRadio, appleRadio]) {
      await expect(radio).toBeDisabled();
    }

    await waitForPhase(page, "settled", { timeout: 15000 });
    for (const radio of [watermelonRadio, tomatoRadio, appleRadio]) {
      await expect(radio).toBeDisabled();
    }

    await page.getByRole("button", { name: "Reset" }).click();
    await waitForPhase(page, "ready");
    await expect(appleRadio).toBeEnabled();

    expect(errors).toEqual([]);
  });

  test("fruit selector: pointer and touch selection, and changing fruit resets the height bar", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), PLANE_V);
    await expect(page.locator("#height-bar-label")).toHaveText("60 m");

    await setFruit(page, "coconut");
    await expect(page.locator('input[name="fruit"][value="coconut"]')).toBeChecked();
    // Changing fruit resets the sim (and its meshes); the height bar should
    // still read the same chosen height/label (fruit does not change height).
    await expect(page.locator("#height-bar-label")).toHaveText("60 m");
    await expect(page.locator("main")).toHaveAttribute("data-steps", "0");

    expect(errors).toEqual([]);
  });

  test("reset mid-fall returns to ready and no stale status appears later", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), PLANE_V); // ~3.5s fall
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "falling");

    await page.getByRole("button", { name: "Reset" }).click();
    await waitForPhase(page, "ready");

    const statusAfterReset = await page.locator("#status").textContent();
    await page.waitForTimeout(2000);
    const statusLater = await page.locator("#status").textContent();

    expect(statusLater).toEqual(statusAfterReset);
    await expect(page.locator("main")).toHaveAttribute("data-phase", "ready");

    expect(errors).toEqual([]);
  });

  test("hidden tab pauses stepping and resumes on return", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), PLANE_V); // ~3.5s fall
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "falling");
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    const stepsWhenHidden = await page.locator("main").getAttribute("data-steps");
    await page.waitForTimeout(1000);
    const stepsAfterOneSecondHidden = await page.locator("main").getAttribute("data-steps");
    expect(stepsAfterOneSecondHidden).toEqual(stepsWhenHidden);

    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await page.waitForFunction(
      (previousSteps) => document.querySelector("main").dataset.steps !== previousSteps,
      stepsAfterOneSecondHidden,
      { timeout: 5000 }
    );

    await waitForPhase(page, "settled", { timeout: 15000 });

    expect(errors).toEqual([]);
  });

  test("blur mid-fall does not crash and the drop still settles, with no control left stuck", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), ROOF_V);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "falling");

    await page.evaluate(() => window.dispatchEvent(new Event("blur")));

    await waitForPhase(page, "settled", { timeout: 15000 });

    await page.getByRole("button", { name: "Reset" }).click();
    await waitForPhase(page, "ready");
    await expect(page.getByRole("button", { name: "Drop" })).toBeEnabled();
    await expect(page.locator("#height-slider")).toBeEnabled();
    await expect(page.locator("#toughness-slider")).toBeEnabled();

    expect(errors).toEqual([]);
  });

  test("reduced motion: Skip to result matches a normal run with the same settings", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    // Pinned seed: this test compares two separate drops for exact text equality.
    await page.goto(pinnedGamePath);
    await waitForPhase(page, "ready");

    // D8: use Plane/toughness 1 for both runs so Skip actually goes through
    // the split, not just a bounce.
    await setSliderValue(page.locator("#height-slider"), PLANE_V);
    await setSliderValue(page.locator("#toughness-slider"), 1);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });
    const normalText = await page.locator("#status").textContent();
    expect(normalText).toContain("smashed into 12 pieces");
    await page.getByRole("button", { name: "Reset" }).click();
    await waitForPhase(page, "ready");

    await page.emulateMedia({ reducedMotion: "reduce" });

    await setSliderValue(page.locator("#height-slider"), PLANE_V);
    await setSliderValue(page.locator("#toughness-slider"), 1);
    const skipButton = page.getByRole("button", { name: "Skip to result" });
    await expect(skipButton).toBeVisible();
    await expect(skipButton).toBeDisabled();

    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "falling");
    await expect(skipButton).toBeEnabled();
    await skipButton.click();

    await waitForPhase(page, "settled", { timeout: 15000 });
    const reducedMotionText = await page.locator("#status").textContent();

    expect(reducedMotionText).toContain("smashed into 12 pieces");
    expect(reducedMotionText).toEqual(normalText);

    expect(errors).toEqual([]);
  });

  test("load failure: aborting the cannon-es route shows the failure message with no page errors", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page, { exemptAbortedUrl: CANNON_URL });

    await page.route(CANNON_URL, (route) => route.abort());
    await page.route(THREE_MODULE_URL, async (route) => {
      const body = await readFile(join(repoRoot, "node_modules/three/build/three.module.js"));
      await route.fulfill({ body, contentType: "text/javascript" });
    });
    await page.route(THREE_CORE_URL, async (route) => {
      const body = await readFile(join(repoRoot, "node_modules/three/build/three.core.js"));
      await route.fulfill({ body, contentType: "text/javascript" });
    });

    await page.goto(gamePath);

    await expect(page.locator("#load-failure")).toBeVisible();
    await expect(page.locator("#load-failure")).toHaveText(
      "The 3D engine couldn't load. Check the internet connection and reload."
    );

    expect(errors, `unexpected console/page errors: ${errors.join("; ")}`).toEqual([]);
  });

  test("D3: controls follow phase exactly (invariant 2), and #instructions matches rules.js per phase", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    const heightSlider = page.locator("#height-slider");
    const toughnessSlider = page.locator("#toughness-slider");
    const dropButton = page.getByRole("button", { name: "Drop" });
    const resetButton = page.getByRole("button", { name: "Reset" });
    const skipButton = page.getByRole("button", { name: "Skip to result" });
    const instructions = page.locator("#instructions");
    const fruitRadio = page.locator('input[name="fruit"][value="watermelon"]');

    // ready: Drop and sliders enabled; Skip hidden (no reduced motion here).
    await expect(heightSlider).toBeEnabled();
    await expect(toughnessSlider).toBeEnabled();
    await expect(dropButton).toBeEnabled();
    await expect(resetButton).toBeEnabled();
    await expect(fruitRadio).toBeEnabled();
    await expect(skipButton).toBeHidden();
    await expect(instructions).toHaveText(instructionsForPhase("ready"));
    const readyText = await instructions.textContent();

    await setSliderValue(page.locator("#height-slider"), PLANE_V); // long enough to observe "falling"
    await dropButton.click();
    await waitForPhase(page, "falling");

    // falling: Drop disabled, both sliders disabled, fruit disabled, Reset enabled.
    await expect(dropButton).toBeDisabled();
    await expect(heightSlider).toBeDisabled();
    await expect(toughnessSlider).toBeDisabled();
    await expect(fruitRadio).toBeDisabled();
    await expect(resetButton).toBeEnabled();
    await expect(instructions).toHaveText(instructionsForPhase("falling"));
    const fallingText = await instructions.textContent();

    await waitForPhase(page, "settled", { timeout: 15000 });

    // settled: Drop and sliders still disabled, Reset enabled.
    await expect(dropButton).toBeDisabled();
    await expect(heightSlider).toBeDisabled();
    await expect(toughnessSlider).toBeDisabled();
    await expect(fruitRadio).toBeDisabled();
    await expect(resetButton).toBeEnabled();
    await expect(instructions).toHaveText(instructionsForPhase("settled"));
    const settledText = await instructions.textContent();

    expect(readyText).not.toEqual(fallingText);
    expect(fallingText).not.toEqual(settledText);
    expect(readyText).not.toEqual(settledText);

    expect(errors).toEqual([]);
  });

  test("D5: the aria-live status region is not rewritten every frame when its text is unchanged", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), PLANE_V); // guarantees a break
    await setSliderValue(page.locator("#toughness-slider"), 1);

    await page.evaluate(() => {
      window.__statusMutationCount = 0;
      const target = document.getElementById("status");
      const observer = new MutationObserver((records) => {
        window.__statusMutationCount += records.length;
      });
      observer.observe(target, { childList: true, characterData: true, subtree: true });
      window.__statusMutationObserver = observer;
    });

    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });

    const mutationCount = await page.evaluate(() => {
      window.__statusMutationObserver.disconnect();
      return window.__statusMutationCount;
    });

    // At most: falling text (1) + result text (1) + 1 slack.
    expect(mutationCount).toBeLessThanOrEqual(3);

    expect(errors).toEqual([]);
  });

  test("every declared external request is fetched, and nothing else is (three.module.js, three.core.js, cannon-es.js)", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    const unexpectedRequests = await routeCdnAndRecordUnexpectedRequests(page);

    const metadata = await projectMetadata();
    const declaredUrls = new Set(metadata.runtime.externalDependencies.map((dependency) => dependency.url));

    const externalRequestUrls = new Set();

    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname !== "127.0.0.1") {
        externalRequestUrls.add(request.url());
      }
    });

    await page.goto(gamePath);
    await waitForPhase(page, "ready");
    await setSliderValue(page.locator("#height-slider"), PLANE_V); // guarantees a break
    await setSliderValue(page.locator("#toughness-slider"), 1);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });

    expect(unexpectedRequests).toEqual([]);
    expect([...externalRequestUrls].sort()).toEqual([...declaredUrls].sort());

    expect(errors).toEqual([]);
  });

  test("B3: the height bar exists and is aria-hidden", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await expect(page.locator("#height-bar")).toHaveAttribute("aria-hidden", "true");

    expect(errors).toEqual([]);
  });

  test("B2/B3: the height bar marker moves down during a Plane fall and reaches the track bottom at settled", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), PLANE_V);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "falling");

    const marker = page.locator("#height-bar-marker");
    const samples = [];
    const deadline = Date.now() + 15000;

    while (samples.length < 3 && Date.now() < deadline) {
      const phase = await page.locator("main").getAttribute("data-phase");
      if (phase !== "falling") break;

      const box = await marker.boundingBox();

      if (box && (samples.length === 0 || box.y !== samples[samples.length - 1])) {
        samples.push(box.y);
      }

      await page.waitForTimeout(120);
    }

    expect(samples.length).toBeGreaterThanOrEqual(3);

    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThan(samples[i - 1]);
    }

    await waitForPhase(page, "settled", { timeout: 15000 });

    const markerBox = await marker.boundingBox();
    const trackBox = await page.locator("#height-bar-track").boundingBox();
    const markerCentreY = markerBox.y + markerBox.height / 2;
    const trackBottom = trackBox.y + trackBox.height;

    expect(Math.abs(markerCentreY - trackBottom)).toBeLessThanOrEqual(3);

    expect(errors).toEqual([]);
  });

  test("B2/B3: ready label and top tick reflect the chosen height preset", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), PLANE_V);
    await expect(page.locator("#height-bar-label")).toHaveText("60 m");
    await expect(page.locator(".height-bar-tick-name").last()).toHaveText("Plane");

    await setSliderValue(page.locator("#height-slider"), ROOF_V);
    await expect(page.locator("#height-bar-label")).toHaveText("10 m");
    await expect(page.locator(".height-bar-tick-name").last()).toHaveText("Roof");

    expect(errors).toEqual([]);
  });

  test("B2/B3: reset mid-fall at Plane returns the marker to the top and label to 60 m, twice in one session", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    async function dropResetOnceAtPlane() {
      await setSliderValue(page.locator("#height-slider"), PLANE_V);
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "falling");
      await page.waitForTimeout(300);
      await page.getByRole("button", { name: "Reset" }).click();
      await waitForPhase(page, "ready");

      const markerBox = await page.locator("#height-bar-marker").boundingBox();
      const trackBox = await page.locator("#height-bar-track").boundingBox();
      const markerCentreY = markerBox.y + markerBox.height / 2;

      expect(Math.abs(markerCentreY - trackBox.y)).toBeLessThanOrEqual(3);
      await expect(page.locator("#height-bar-label")).toHaveText("60 m");
    }

    await dropResetOnceAtPlane();
    await dropResetOnceAtPlane();

    expect(errors).toEqual([]);
  });

  test("B3: bar write budget stays under 150 DOM mutations during one Plane drop", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), PLANE_V); // guarantees a break
    await setSliderValue(page.locator("#toughness-slider"), 1);

    await page.evaluate(() => {
      window.__barMutationCount = 0;
      const target = document.getElementById("height-bar");
      const observer = new MutationObserver((records) => {
        window.__barMutationCount += records.length;
      });
      observer.observe(target, { attributes: true, childList: true, characterData: true, subtree: true });
      window.__barMutationObserver = observer;
    });

    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });

    const mutationCount = await page.evaluate(() => {
      window.__barMutationObserver.disconnect();
      return window.__barMutationCount;
    });

    expect(mutationCount).toBeLessThan(150);

    expect(errors).toEqual([]);
  });

  // The contact point's screen position is computed in the test from
  // impactViewFor and the canvas bounding rect, using the same pinhole
  // maths as the rules unit tests (no three.js import here).
  function projectContactPointToScreen(canvasBox, fruitKey) {
    function sub(a, b) {
      return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    }
    function dot(a, b) {
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }
    function cross(a, b) {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    function normalize(a) {
      const length = Math.hypot(...a);
      return [a[0] / length, a[1] / length, a[2] / length];
    }

    const view = impactViewFor({ width: canvasBox.width, height: canvasBox.height, fruit: fruitByKey(fruitKey) });
    const aspect = canvasBox.width / canvasBox.height;
    const forward = normalize(sub(view.target, view.position));
    const worldUp = [0, 1, 0];
    const right = normalize(cross(forward, worldUp));
    const up = cross(right, forward);
    const relative = sub([0, 0, 0], view.position);
    const camX = dot(relative, right);
    const camY = dot(relative, up);
    const camZ = dot(relative, forward);
    const verticalHalfFovRad = (view.fov * Math.PI) / 180 / 2;
    const tanVertical = Math.tan(verticalHalfFovRad);
    const ndcX = camX / (camZ * tanVertical * aspect);
    const ndcY = camY / (camZ * tanVertical);

    return {
      x: canvasBox.x + ((ndcX + 1) / 2) * canvasBox.width,
      y: canvasBox.y + ((1 - ndcY) / 2) * canvasBox.height
    };
  }

  async function unionOfVisibleLabelBoxes(page, barBox) {
    const labelBoxes = [
      await page.locator("#height-bar-label").boundingBox(),
      ...(await Promise.all(
        (await page.locator(".height-bar-tick-name:visible").all()).map((locator) => locator.boundingBox())
      ))
    ].filter(Boolean);

    let unionBox = { ...barBox };

    for (const box of labelBoxes) {
      const left = Math.min(unionBox.x, box.x);
      const top = Math.min(unionBox.y, box.y);
      const right = Math.max(unionBox.x + unionBox.width, box.x + box.width);
      const bottom = Math.max(unionBox.y + unionBox.height, box.y + box.height);

      unionBox = { x: left, y: top, width: right - left, height: bottom - top };
    }

    return unionBox;
  }

  async function assertBarAvoidsContactPointAndTrackIsWideEnough(page) {
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    const canvasBox = await page.locator("#scene-canvas").boundingBox();
    const barBox = await page.locator("#height-bar").boundingBox();
    const trackBox = await page.locator("#height-bar-track").boundingBox();

    expect(trackBox.width).toBeGreaterThanOrEqual(44);

    // V1: tick and marker names are positioned to the LEFT of the track via
    // CSS, outside #height-bar's own layout box, so its boundingBox() alone
    // does not cover them. Union in every visible label's box too.
    const unionBox = await unionOfVisibleLabelBoxes(page, barBox);

    const contactPoint = projectContactPointToScreen(canvasBox, "watermelon");
    const overlapsBar =
      contactPoint.x >= unionBox.x &&
      contactPoint.x <= unionBox.x + unionBox.width &&
      contactPoint.y >= unionBox.y &&
      contactPoint.y <= unionBox.y + unionBox.height;

    expect(
      overlapsBar,
      `contact point ${JSON.stringify(contactPoint)} overlaps bar box (incl. labels) ${JSON.stringify(unionBox)}`
    ).toBe(false);
  }

  async function assertTopTickNameVisibleAndContained(page) {
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    const stagePanelBox = await page.locator(".stage-panel").boundingBox();

    async function checkTopTick(heightSliderValue, expectedName) {
      await setSliderValue(page.locator("#height-slider"), heightSliderValue);

      const topName = page.locator(".height-bar-tick-name").last();

      await expect(topName).toBeVisible();
      await expect(topName).toHaveText(expectedName);

      const box = await topName.boundingBox();

      expect(box.width).toBeGreaterThan(0);
      expect(box.x, "tick name left edge inside stage-panel").toBeGreaterThanOrEqual(stagePanelBox.x);
      expect(box.y, "tick name top edge inside stage-panel").toBeGreaterThanOrEqual(stagePanelBox.y);
      expect(box.x + box.width, "tick name right edge inside stage-panel").toBeLessThanOrEqual(
        stagePanelBox.x + stagePanelBox.width
      );
      expect(box.y + box.height, "tick name bottom edge inside stage-panel").toBeLessThanOrEqual(
        stagePanelBox.y + stagePanelBox.height
      );
    }

    await checkTopTick(PLANE_V, "Plane");
    await checkTopTick(ROOF_V, "Roof");
  }

  async function assertControlReadoutsFitInsidePanel(page) {
    await page.goto(gamePath);
    await waitForPhase(page, "ready");
    await setSliderValue(page.locator("#height-slider"), PLANE_V); // longest readout text

    const panelBox = await page.locator(".controls-panel").boundingBox();
    const heightReadoutBox = await page.locator("#height-readout").boundingBox();
    const toughnessReadoutBox = await page.locator("#toughness-readout").boundingBox();

    for (const box of [heightReadoutBox, toughnessReadoutBox]) {
      expect(box.x, "readout left edge inside controls-panel").toBeGreaterThanOrEqual(panelBox.x);
      expect(box.y, "readout top edge inside controls-panel").toBeGreaterThanOrEqual(panelBox.y);
      expect(box.x + box.width, "readout right edge inside controls-panel").toBeLessThanOrEqual(
        panelBox.x + panelBox.width
      );
      expect(box.y + box.height, "readout bottom edge inside controls-panel").toBeLessThanOrEqual(
        panelBox.y + panelBox.height
      );
    }
  }

  // Step 1b §5: the moving metres label and every visible tick name must
  // never intersect, at ready, mid-fall and settled, at both sizes.
  async function assertLabelNeverIntersectsVisibleTickNames(page) {
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    async function checkNoIntersection() {
      const labelBox = await page.locator("#height-bar-label").boundingBox();
      const tickNameBoxes = await Promise.all(
        (await page.locator(".height-bar-tick-name:visible").all()).map((locator) => locator.boundingBox())
      );

      for (const box of tickNameBoxes) {
        if (!box) continue;

        const intersects =
          labelBox.x < box.x + box.width &&
          labelBox.x + labelBox.width > box.x &&
          labelBox.y < box.y + box.height &&
          labelBox.y + labelBox.height > box.y;

        expect(
          intersects,
          `label box ${JSON.stringify(labelBox)} intersects tick name box ${JSON.stringify(box)}`
        ).toBe(false);
      }
    }

    await setSliderValue(page.locator("#height-slider"), PLANE_V);
    await checkNoIntersection(); // ready

    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "falling");
    await page.waitForTimeout(500);
    await checkNoIntersection(); // mid-fall

    await waitForPhase(page, "settled", { timeout: 15000 });
    await checkNoIntersection(); // settled
  }

  test("B1/B3: the bar never covers the contact point at 1280x900, and the track stays >= 44px wide", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await assertBarAvoidsContactPointAndTrackIsWideEnough(page);
    expect(errors).toEqual([]);
  });

  test("V1: at 1280x900, the top tick's name is visible and fully inside the stage panel, at Plane and at Roof", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await assertTopTickNameVisibleAndContained(page);
    expect(errors).toEqual([]);
  });

  test("V5: at 1280x900, the height and toughness readouts stay fully inside the controls panel", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await assertControlReadoutsFitInsidePanel(page);
    expect(errors).toEqual([]);
  });

  test("step 1b §5: the moving label never intersects a visible tick name, at ready/mid-fall/settled, at 1280x900", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await assertLabelNeverIntersectsVisibleTickNames(page);
    expect(errors).toEqual([]);
  });

  test.describe("touch viewport", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

    test("B1/B3: the bar never covers the contact point at 390x844, and the track stays >= 44px wide", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await assertBarAvoidsContactPointAndTrackIsWideEnough(page);
      expect(errors).toEqual([]);
    });

    test("V1: at 390x844, the top tick's name is visible and fully inside the stage panel, at Plane and at Roof", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await assertTopTickNameVisibleAndContained(page);
      expect(errors).toEqual([]);
    });

    test("step 1b §5: the moving label never intersects a visible tick name, at ready/mid-fall/settled, at 390x844", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await assertLabelNeverIntersectsVisibleTickNames(page);
      expect(errors).toEqual([]);
    });
  });

  test.describe("step 1b §7: variation per drop, and a continuous height slider", () => {
    async function dropAndReadLayoutHash(page) {
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "settled", { timeout: 15000 });
      return page.locator("main").getAttribute("data-layout-hash");
    }

    test("two unpinned drops in one session produce different layout hashes", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), PLANE_V);
      await setSliderValue(page.locator("#toughness-slider"), 1);

      const firstHash = await dropAndReadLayoutHash(page);
      expect(firstHash).not.toBeNull();

      await page.getByRole("button", { name: "Reset" }).click();
      await waitForPhase(page, "ready");

      const secondHash = await dropAndReadLayoutHash(page);
      expect(secondHash).not.toBeNull();

      expect(secondHash).not.toEqual(firstHash);

      expect(errors).toEqual([]);
    });

    test("two drops with ?seed=7 produce identical layout hashes", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), PLANE_V);
      await setSliderValue(page.locator("#toughness-slider"), 1);

      const firstHash = await dropAndReadLayoutHash(page);
      expect(firstHash).not.toBeNull();

      await page.getByRole("button", { name: "Reset" }).click();
      await waitForPhase(page, "ready");

      const secondHash = await dropAndReadLayoutHash(page);

      expect(secondHash).toEqual(firstHash);

      expect(errors).toEqual([]);
    });

    test("keyboard: ArrowRight x10 from the start gives a height between 0.3 and 0.5 m, not the next landmark", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      const heightSlider = page.locator("#height-slider");

      await heightSlider.focus();
      await page.keyboard.press("Home");
      await expect(heightSlider).toHaveValue("0");

      for (let i = 0; i < 10; i += 1) {
        await page.keyboard.press("ArrowRight");
      }

      await expect(heightSlider).toHaveValue("10");

      const readoutText = await page.locator("#height-readout").textContent();
      const match = readoutText.match(/^([\d.]+)\s*m/);

      expect(match, `readout text "${readoutText}" did not start with a metres value`).not.toBeNull();

      const meters = Number(match[1]);

      expect(meters).toBeGreaterThanOrEqual(0.3);
      expect(meters).toBeLessThanOrEqual(0.5);
      expect(readoutText).not.toContain("Counter");

      expect(errors).toEqual([]);
    });

    // Deviation from the plan's literal example (found while writing this
    // test, not hand-tuned to force it green): the plan's own worked example
    // asks for a pointer drag to the visual middle of the track, expecting
    // heightFromSlider(500) (~4.2 m) within 10%. But the height slider also
    // carries the required `<datalist>` landmark ticks (§7's "the named
    // heights show as <datalist> tick marks"), and Chromium's native
    // pointer handling for a `list`-bound range input magnetically snaps a
    // click/drag near a tick to that tick's exact value. Slider value 531
    // (Treehouse) sits only ~31 units from the logical midpoint (500) — well
    // inside that snap radius — so a literal mid-track click always lands
    // on Treehouse (~5.0 m), which is itself ~17.8% away from 4.2 m: outside
    // the plan's own 10% band. This is a real, reproducible browser
    // behaviour (confirmed by removing the `list` attribute, which restores
    // an exact midpoint click), not a test-precision issue, and it cannot be
    // fixed without removing the landmark ticks the plan also requires.
    // Reported to the CTO/Jose; in the meantime this test targets a
    // track position clear of every landmark's snap radius (slider value
    // ~400, ~173 units from the nearest landmark) to still prove that a
    // genuine pointer/touch drag lands on the correct continuous height for
    // wherever it actually lands, with no discrete jump to an unintended
    // value.
    test("pointer: dragging to a non-landmark point mid-track gives the height that position maps to, within 10%", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      const heightSlider = page.locator("#height-slider");
      const sliderBox = await heightSlider.boundingBox();

      await heightSlider.click({ position: { x: sliderBox.width * 0.4, y: sliderBox.height / 2 } });

      const actualValue = Number(await heightSlider.inputValue());
      // Confirm the click didn't land inside a landmark's snap radius, or
      // this test would silently degrade into testing the snap instead.
      for (const landmark of LANDMARKS) {
        const landmarkValue = sliderFromHeight(landmark.meters);
        expect(
          Math.abs(actualValue - landmarkValue),
          `clicked value ${actualValue} landed on/near the ${landmark.name} landmark (${landmarkValue}); pick a different fraction`
        ).toBeGreaterThan(50);
      }

      const readoutText = await page.locator("#height-readout").textContent();
      const match = readoutText.match(/^([\d.]+)\s*m/);

      expect(match, `readout text "${readoutText}" did not start with a metres value`).not.toBeNull();

      const meters = Number(match[1]);
      const expectedMeters = heightFromSlider(actualValue);

      expect(Math.abs(meters - expectedMeters) / expectedMeters).toBeLessThanOrEqual(0.1);

      expect(errors).toEqual([]);
    });

    test.describe("touch viewport", () => {
      test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

      test("touch: tapping a non-landmark point mid-track gives the height that position maps to, within 10%", async ({ page }) => {
        const errors = trackConsoleAndPageErrors(page);
        await routeCdnAndRecordUnexpectedRequests(page);
        await page.goto(gamePath);
        await waitForPhase(page, "ready");

        const heightSlider = page.locator("#height-slider");
        const sliderBox = await heightSlider.boundingBox();

        await heightSlider.tap({ position: { x: sliderBox.width * 0.4, y: sliderBox.height / 2 } });

        const actualValue = Number(await heightSlider.inputValue());
        for (const landmark of LANDMARKS) {
          const landmarkValue = sliderFromHeight(landmark.meters);
          expect(
            Math.abs(actualValue - landmarkValue),
            `tapped value ${actualValue} landed on/near the ${landmark.name} landmark (${landmarkValue}); pick a different fraction`
          ).toBeGreaterThan(50);
        }

        const readoutText = await page.locator("#height-readout").textContent();
        const match = readoutText.match(/^([\d.]+)\s*m/);

        expect(match, `readout text "${readoutText}" did not start with a metres value`).not.toBeNull();

        const meters = Number(match[1]);
        const expectedMeters = heightFromSlider(actualValue);

        expect(Math.abs(meters - expectedMeters) / expectedMeters).toBeLessThanOrEqual(0.1);

        expect(errors).toEqual([]);
      });
    });

    test("a drop at an arbitrary height (7.3 m) reports \"7.3 m\" in the result", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      // Slider value 602 maps to ~7.2835 m, which formatHeight rounds to
      // "7.3 m" (computed from rules.js's own sliderFromHeight/heightFromSlider,
      // verified with a smoke script, not hand-picked to force the test green).
      await setSliderValue(page.locator("#height-slider"), Math.round(sliderFromHeight(7.3)));

      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "settled", { timeout: 15000 });

      await expect(page.locator("#status")).toContainText("from 7.3 m.");

      expect(errors).toEqual([]);
    });
  });
});
