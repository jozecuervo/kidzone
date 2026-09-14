import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import {
  FRUIT_KEYS,
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

// Fix (b): a real AudioContext opens a real audio device in Chromium, which
// is flaky under load in this environment (see the real-audio smoke test
// below). This installs a fake AudioContext (and webkitAudioContext alias)
// that never touches real audio, records every AudioBufferSourceNode/
// OscillatorNode start() into window.__audioLog (same shape the §10 sound
// tests read: { type, phase, steps }), and counts context instantiations
// into window.__audioLog.contexts. Registered via addInitScript, so it runs
// before any page script — including a test's own addInitScript that runs
// afterwards (registration order), which is how the "AudioContext deleted"
// test still sees no AudioContext.
async function installFakeAudio(page) {
  await page.addInitScript(() => {
    window.__audioLog = { contexts: 0, starts: [] };

    function recordStart(type) {
      const main = document.querySelector("main");

      window.__audioLog.starts.push({
        type,
        phase: main ? main.dataset.phase : null,
        steps: main ? Number(main.dataset.steps) : null
      });
    }

    function makeParam(initialValue) {
      return {
        value: initialValue,
        setValueAtTime(value) {
          this.value = value;
          return this;
        },
        exponentialRampToValueAtTime(value) {
          this.value = value;
          return this;
        }
      };
    }

    function makeNode(kind, { schedulable = false } = {}) {
      const listeners = { ended: [] };
      const node = {
        buffer: null,
        type: "sine",
        onended: null,
        frequency: makeParam(440),
        gain: makeParam(1),
        connect(destination) {
          return destination;
        },
        disconnect() {},
        addEventListener(type, listener) {
          if (type === "ended") listeners.ended.push(listener);
        },
        removeEventListener(type, listener) {
          if (type === "ended") {
            listeners.ended = listeners.ended.filter((entry) => entry !== listener);
          }
        }
      };

      function fireEnded() {
        setTimeout(() => {
          if (typeof node.onended === "function") node.onended();
          for (const listener of listeners.ended) listener();
        }, 0);
      }

      if (schedulable) {
        node.start = (...args) => {
          recordStart(kind);
          fireEnded();
        };
        node.stop = () => {};
      }

      return node;
    }

    class FakeAudioContext {
      constructor() {
        window.__audioLog.contexts += 1;
        this.currentTime = 0;
        this.state = "running";
        this.sampleRate = 44100;
        this.destination = {};
      }

      resume() {
        this.state = "running";
        return Promise.resolve();
      }

      createBuffer(numberOfChannels, length, sampleRate) {
        const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));

        return {
          sampleRate,
          length,
          numberOfChannels,
          getChannelData: (channel) => channels[channel]
        };
      }

      createBufferSource() {
        return makeNode("AudioBufferSourceNode", { schedulable: true });
      }

      createOscillator() {
        return makeNode("OscillatorNode", { schedulable: true });
      }

      createBiquadFilter() {
        return makeNode("BiquadFilterNode");
      }

      createGain() {
        return makeNode("GainNode");
      }
    }

    window.AudioContext = FakeAudioContext;
    window.webkitAudioContext = FakeAudioContext;
  });
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
  // Fix (b): every test in this suite gets the fake AudioContext by default,
  // so dropping never opens a real audio device. The one exception (a real
  // Web Audio smoke test) lives in its own top-level test.describe below,
  // outside this beforeEach's scope.
  test.beforeEach(async ({ page }) => {
    await installFakeAudio(page);
  });

  // Replaces "keyboard only ... Enter after Reset" (step 1b §10: no Reset
  // button). Now: Tab to Drop, Space to drop, wait for settled, assert
  // focus STAYED on Drop the whole time (the point of using aria-disabled
  // instead of the `disabled` attribute — Chromium moves focus to <body>
  // when a focused element gains `disabled`, which would break this), then
  // Space on Drop again in settled to redrop.
  test("keyboard only: Tab to height, arrow to Plane, Tab to toughness, Space on Drop, then Space on Drop again in settled", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    const heightSlider = page.locator("#height-slider");
    const toughnessSlider = page.locator("#toughness-slider");
    const dropButton = page.getByRole("button", { name: "Drop" });

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
    await expect(dropButton).toHaveAttribute("aria-disabled", "true");
    // Not `disabled` (see the style.css comment on #drop-button[aria-disabled]):
    // Chromium moving focus to <body> here would break the redrop below.
    await expect(dropButton).toBeFocused();

    await waitForPhase(page, "settled", { timeout: 15000 });
    // Default fruit (watermelon) at Plane/toughness 5 always smashes.
    await expect(page.locator("#status")).toContainText(
      "It smashed into 12 pieces and 40 seeds flew out."
    );
    await expect(dropButton).toHaveAttribute("aria-disabled", "false");
    await expect(dropButton).toBeFocused();

    // Space on Drop again, still focused, in settled: a redrop.
    await page.keyboard.press("Space");
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
      // Step 1b §10: the sound toggle must be visible at 390x844 without
      // scrolling past Drop.
      const soundToggleBox = await page.locator("#sound-toggle").boundingBox();

      for (const box of [canvasBox, dropBox, soundToggleBox]) {
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

      // Step 1b §10: no Reset button — Drop is tappable again immediately
      // in settled (a redrop), replacing the old Reset tap.
      await expect(page.getByRole("button", { name: "Drop" })).toHaveAttribute("aria-disabled", "false");
      await page.getByRole("button", { name: "Drop" }).tap();
      await waitForPhase(page, "falling");
      await waitForPhase(page, "settled", { timeout: 15000 });
      await expect(page.locator("#status")).toContainText("It held and bounced.");

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

  // Replaces "twice in one session: drop -> settle -> reset -> drop ->
  // settle -> reset" (step 1b §10: no Reset button). Drop is clicked again
  // directly in settled instead.
  test("twice in one session: drop -> settle -> Drop again -> settle gives matching results each time", async ({ page }) => {
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

    await expect(page.getByRole("button", { name: "Drop" })).toHaveAttribute("aria-disabled", "false");
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "falling");
    await waitForPhase(page, "settled", { timeout: 15000 });
    const secondText = await page.locator("#status").textContent();

    expect(secondText).toEqual(firstText);

    expect(errors).toEqual([]);
  });

  // Replaces "fruit -> drop -> reset -> other fruit -> drop" (step 1b §10:
  // no Reset button). Now: fruit -> drop -> settle -> change fruit -> drop,
  // twice — the fruit change itself does the clearing (a settled edit).
  test("fruit -> drop -> settle -> change fruit -> drop, twice in one session", async ({ page }) => {
    test.slow();
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
      return text;
    }

    const firstTomato = await dropFruitAtPlane("tomato");
    const firstCoconut = await dropFruitAtPlane("coconut"); // changing fruit from settled clears tomato's debris
    const secondTomato = await dropFruitAtPlane("tomato");
    const secondCoconut = await dropFruitAtPlane("coconut");

    expect(firstTomato).toContain("tomato");
    expect(firstCoconut).toContain("coconut");
    expect(secondTomato).toEqual(firstTomato);
    expect(secondCoconut).toEqual(firstCoconut);

    expect(errors).toEqual([]);
  });

  test("fruit selector: keyboard arrows move between fruits, disabled outside ready", async ({ page }) => {
    test.slow();
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

    // Step 1b §10: no Reset button — fruit radios are enabled again as soon
    // as the UI itself reaches settled (no extra action needed).
    await waitForPhase(page, "settled", { timeout: 45000 });
    for (const radio of [watermelonRadio, tomatoRadio, appleRadio]) {
      await expect(radio).toBeEnabled();
    }

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

  // Replaces "reset mid-fall returns to ready and no stale status appears
  // later" (step 1b §10: no Reset button). Now: in settled, changing
  // toughness is the settled edit; wait and assert no stale callback later
  // changes phase or text.
  test("a settled edit (toughness change) returns to ready with no stale status appearing later", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), KNEE_V);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });

    await setSliderValue(page.locator("#toughness-slider"), 1);
    await waitForPhase(page, "ready");
    await expect(page.locator("main")).toHaveAttribute("data-steps", "0");

    const statusAfterEdit = await page.locator("#status").textContent();
    await page.waitForTimeout(2000);
    const statusLater = await page.locator("#status").textContent();

    expect(statusLater).toEqual(statusAfterEdit);
    await expect(page.locator("main")).toHaveAttribute("data-phase", "ready");

    expect(errors).toEqual([]);
  });

  test("hidden tab pauses stepping and resumes on return", async ({ page }) => {
    test.slow();
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

    await waitForPhase(page, "settled", { timeout: 45000 });

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

    // Step 1b §10: no Reset button — controls are enabled again as soon as
    // the UI itself reaches settled, with no control left stuck.
    await expect(page.getByRole("button", { name: "Drop" })).toHaveAttribute("aria-disabled", "false");
    await expect(page.locator("#height-slider")).toBeEnabled();
    await expect(page.locator("#toughness-slider")).toBeEnabled();

    expect(errors).toEqual([]);
  });

  test("reduced motion: Skip to result matches a normal run with the same settings", async ({ page }) => {
    test.slow();
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
    await waitForPhase(page, "settled", { timeout: 45000 });
    const normalText = await page.locator("#status").textContent();
    expect(normalText).toContain("smashed into 12 pieces");

    // Step 1b §10: no Reset button — enable reduced motion, then Drop again
    // directly from settled (the settings are unchanged; this is a redrop,
    // not a settled edit).
    await page.emulateMedia({ reducedMotion: "reduce" });

    const skipButton = page.getByRole("button", { name: "Skip to result" });
    await expect(skipButton).toBeVisible();
    await expect(skipButton).toBeDisabled();

    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "falling");
    await expect(skipButton).toBeEnabled();
    await skipButton.click();

    await waitForPhase(page, "settled", { timeout: 45000 });
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

  // Step 1b §10: no Reset button. Fruit/height/toughness/Drop are enabled
  // in both `ready` and `settled`, disabled only while `falling`. Drop
  // itself is never given the `disabled` attribute — only `aria-disabled`
  // — so this test checks that directly instead of relying on
  // toBeDisabled()/toBeEnabled() for Drop.
  test("D3: controls follow phase exactly (invariant 2), and #instructions matches rules.js per phase", async ({ page }) => {
    test.slow();
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    const heightSlider = page.locator("#height-slider");
    const toughnessSlider = page.locator("#toughness-slider");
    const dropButton = page.getByRole("button", { name: "Drop" });
    const soundToggle = page.locator("#sound-toggle");
    const skipButton = page.getByRole("button", { name: "Skip to result" });
    const instructions = page.locator("#instructions");
    const fruitRadio = page.locator('input[name="fruit"][value="watermelon"]');

    expect(await page.locator("#reset-button").count(), "no Reset button should exist").toBe(0);

    // ready: fruit/height/toughness/Drop enabled; Skip hidden (no reduced
    // motion here); sound toggle always enabled.
    await expect(heightSlider).toBeEnabled();
    await expect(toughnessSlider).toBeEnabled();
    await expect(dropButton).toHaveAttribute("aria-disabled", "false");
    await expect(dropButton).not.toBeDisabled();
    await expect(fruitRadio).toBeEnabled();
    await expect(soundToggle).toBeEnabled();
    await expect(skipButton).toBeHidden();
    await expect(instructions).toHaveText(instructionsForPhase("ready"));
    const readyText = await instructions.textContent();

    // Reads every relevant control's live state in ONE round trip. Chained
    // per-locator assertions here were observed to occasionally take
    // several real seconds each in this environment (likely CDP round-trip
    // contention with the render loop) — long enough, cumulatively, for a
    // Plane fall to run all the way to physics settle before the LAST of a
    // chain of individual assertions even executed, which looks exactly
    // like a stale-disabled-state bug but is actually a test-timing gap.
    // Snapshotting once immediately after the phase transition removes that
    // gap entirely.
    function snapshotControls() {
      return page.evaluate(() => ({
        phase: document.querySelector("main").dataset.phase,
        steps: Number(document.querySelector("main").dataset.steps),
        dropAriaDisabled: document.getElementById("drop-button").getAttribute("aria-disabled"),
        dropDisabledAttr: document.getElementById("drop-button").disabled,
        heightDisabled: document.getElementById("height-slider").disabled,
        toughnessDisabled: document.getElementById("toughness-slider").disabled,
        fruitDisabled: document.querySelector('input[name="fruit"][value="watermelon"]').disabled,
        soundToggleDisabled: document.getElementById("sound-toggle").disabled,
        instructions: document.getElementById("instructions").textContent
      }));
    }

    await setSliderValue(page.locator("#height-slider"), PLANE_V); // long enough to observe "falling"
    await dropButton.click();
    await waitForPhase(page, "falling");

    const fallingSnapshot = await snapshotControls();

    expect(fallingSnapshot.phase).toBe("falling");
    expect(fallingSnapshot.dropAriaDisabled).toBe("true");
    expect(fallingSnapshot.dropDisabledAttr).toBe(false);
    expect(fallingSnapshot.heightDisabled).toBe(true);
    expect(fallingSnapshot.toughnessDisabled).toBe(true);
    expect(fallingSnapshot.fruitDisabled).toBe(true);
    expect(fallingSnapshot.soundToggleDisabled).toBe(false);
    expect(fallingSnapshot.instructions).toEqual(instructionsForPhase("falling"));
    const fallingText = fallingSnapshot.instructions;

    // A click/Space during falling must not start a second drop: aria-disabled
    // is a hint, not an enforcement mechanism, so the click handler itself
    // must ignore it. A genuine redrop resets the fruit to the full drop
    // height, so the height bar's own label (which tracks live fruit
    // height, independent of physics-step counts that can vary with
    // environmental timing) would jump back up near 60 m; checked here as
    // the more robust signal instead of a raw step-count comparison.
    async function heightBarMetres() {
      const text = await page.locator("#height-bar-label").textContent();
      return Number.parseFloat(text);
    }

    const phaseWhileFalling = await page.locator("main").getAttribute("data-phase");

    expect(phaseWhileFalling, "should still be falling well before a 60m free fall completes").toBe("falling");

    const heightBeforeIgnoredClick = await heightBarMetres();

    await dropButton.click();
    await page.waitForTimeout(50);

    const heightAfterIgnoredClick = await heightBarMetres();
    const phaseAfterIgnoredClick = await page.locator("main").getAttribute("data-phase");

    expect(
      heightAfterIgnoredClick,
      "a click during falling must not reset the fruit back up near the full drop height"
    ).toBeLessThanOrEqual(heightBeforeIgnoredClick + 0.5);
    expect(phaseAfterIgnoredClick).toBe("falling");

    await waitForPhase(page, "settled", { timeout: 45000 });

    // settled: fruit/height/toughness/Drop enabled again; no Reset button
    // needed to get there.
    const settledSnapshot = await snapshotControls();

    expect(settledSnapshot.dropAriaDisabled).toBe("false");
    expect(settledSnapshot.dropDisabledAttr).toBe(false);
    expect(settledSnapshot.heightDisabled).toBe(false);
    expect(settledSnapshot.toughnessDisabled).toBe(false);
    expect(settledSnapshot.fruitDisabled).toBe(false);
    expect(settledSnapshot.soundToggleDisabled).toBe(false);
    expect(settledSnapshot.instructions).toEqual(instructionsForPhase("settled"));
    const settledText = settledSnapshot.instructions;

    expect(readyText).not.toEqual(fallingText);
    expect(fallingText).not.toEqual(settledText);
    expect(readyText).not.toEqual(settledText);

    expect(errors).toEqual([]);
  });

  test("D5: the aria-live status region is not rewritten every frame when its text is unchanged", async ({ page }) => {
    test.slow();
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
    await waitForPhase(page, "settled", { timeout: 45000 });

    const mutationCount = await page.evaluate(() => {
      window.__statusMutationObserver.disconnect();
      return window.__statusMutationCount;
    });

    // At most: falling text (1) + result text (1) + 1 slack.
    expect(mutationCount).toBeLessThanOrEqual(3);

    expect(errors).toEqual([]);
  });

  test("every declared external request is fetched, and nothing else is (three.module.js, three.core.js, cannon-es.js)", async ({ page }) => {
    test.slow();
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
    await waitForPhase(page, "settled", { timeout: 45000 });

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

  // Step 1b §8: the "stray pink dot" seen in the 390x844 Plane screenshot
  // review was debris on the canvas showing through the height-bar track's
  // translucent background (rgba(255,255,255,0.55)), not a stray DOM
  // element. Two assertions that fit that cause: exactly one
  // .height-bar-marker (no duplicate/stray positioned indicator), and the
  // track's computed background-color has alpha 1 (opaque, so canvas
  // content can no longer show through it).
  test("B3: the pink-dot cause stays fixed — exactly one .height-bar-marker, and the track background is opaque", async ({ page }) => {
    test.slow();
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), PLANE_V);
    await setSliderValue(page.locator("#toughness-slider"), 1);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 45000 });

    const markerCount = await page.locator("#height-bar .height-bar-marker").count();
    expect(markerCount).toBe(1);

    // No other positioned children beyond the track's own ticks, label and
    // indicator: the height bar's direct DOM shape stays exactly
    // track > (ticks, indicator > (marker, label)).
    const structure = await page.locator("#height-bar").evaluate((bar) => {
      const track = bar.querySelector("#height-bar-track");
      const directChildIds = Array.from(track.children).map((el) => el.id || el.className);
      return directChildIds;
    });
    expect(structure.sort()).toEqual(["height-bar-indicator", "height-bar-ticks"].sort());

    const trackBackgroundAlpha = await page.locator("#height-bar-track").evaluate((track) => {
      const color = getComputedStyle(track).backgroundColor;
      const match = color.match(/rgba?\(([^)]+)\)/);
      const parts = match[1].split(",").map((part) => Number(part.trim()));
      return parts.length === 4 ? parts[3] : 1;
    });
    expect(trackBackgroundAlpha).toBe(1);

    expect(errors).toEqual([]);
  });

  test("B2/B3: the height bar marker moves down during a Plane fall and reaches the track bottom at settled", async ({ page }) => {
    test.slow();
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

    await waitForPhase(page, "settled", { timeout: 45000 });

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

  // Replaces "B2/B3: reset mid-fall at Plane returns the marker to the top
  // ..." (step 1b §10: no Reset button). Now: after a SETTLED Plane drop,
  // changing height (a settled edit) returns the marker to the top and the
  // label to the NEW height.
  test("B2/B3: after a settled Plane drop, changing height returns the marker to the top and the label to the new height, twice", async ({ page }) => {
    test.slow();
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    async function dropThenEditHeight(targetSliderValue, targetLabel) {
      await setSliderValue(page.locator("#height-slider"), PLANE_V);
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "settled", { timeout: 45000 });

      await setSliderValue(page.locator("#height-slider"), targetSliderValue);
      await waitForPhase(page, "ready");

      const markerBox = await page.locator("#height-bar-marker").boundingBox();
      const trackBox = await page.locator("#height-bar-track").boundingBox();
      const markerCentreY = markerBox.y + markerBox.height / 2;

      expect(Math.abs(markerCentreY - trackBox.y)).toBeLessThanOrEqual(3);
      await expect(page.locator("#height-bar-label")).toHaveText(targetLabel);
    }

    await dropThenEditHeight(PLANE_V, "60 m");
    await dropThenEditHeight(ROOF_V, "10 m");

    expect(errors).toEqual([]);
  });

  test("B3: bar write budget stays under 150 DOM mutations during one Plane drop", async ({ page }) => {
    test.slow();
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
    await waitForPhase(page, "settled", { timeout: 45000 });

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

    // Step 1b §8: the 44px minimum is withdrawn (the bar is aria-hidden and
    // pointer-events:none, never interactive); the track is now a slim
    // 16-20px strip.
    expect(trackBox.width).toBeLessThanOrEqual(20);

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

  function boxesIntersect(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  // Step 1b §5: the moving metres label and every visible tick name must
  // never intersect, at ready, mid-fall and settled, at both sizes. Step 1b
  // §9 extends this to the incoming marker (when visible): it must not
  // overlap the height bar or the moving label either.
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

        expect(
          boxesIntersect(labelBox, box),
          `label box ${JSON.stringify(labelBox)} intersects tick name box ${JSON.stringify(box)}`
        ).toBe(false);
      }

      const incomingHidden = await page.locator("#incoming-marker").isHidden();

      if (!incomingHidden) {
        const incomingBox = await page.locator("#incoming-marker").boundingBox();
        const heightBarBox = await page.locator("#height-bar").boundingBox();

        expect(
          boxesIntersect(incomingBox, heightBarBox),
          `incoming marker box ${JSON.stringify(incomingBox)} intersects the height bar box ${JSON.stringify(heightBarBox)}`
        ).toBe(false);
        expect(
          boxesIntersect(incomingBox, labelBox),
          `incoming marker box ${JSON.stringify(incomingBox)} intersects the moving label box ${JSON.stringify(labelBox)}`
        ).toBe(false);
      }
    }

    await setSliderValue(page.locator("#height-slider"), PLANE_V);
    await checkNoIntersection(); // ready

    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "falling");
    await page.waitForTimeout(500);
    await checkNoIntersection(); // mid-fall

    await waitForPhase(page, "settled", { timeout: 45000 });
    await checkNoIntersection(); // settled
  }

  test("B1/B3: the bar never covers the contact point at 1280x900, and the track is at most 20px wide", async ({ page }) => {
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

    test("B1/B3: the bar never covers the contact point at 390x844, and the track is at most 20px wide", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await assertBarAvoidsContactPointAndTrackIsWideEnough(page);
      expect(errors).toEqual([]);
    });

    test("V1: at 390x844, the top tick's name is visible and fully inside the stage panel, at Plane and at Roof", async ({ page }) => {
      test.slow();
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

      // Step 1b §10: no Reset button — Drop again directly from settled.
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

      // Step 1b §10: no Reset button — Drop again directly from settled.
      const secondHash = await dropAndReadLayoutHash(page);

      expect(secondHash).toEqual(firstHash);

      expect(errors).toEqual([]);
    });

    test("Skip-to-result path gives the same layout hash as a normal run with ?seed=7", async ({ page }) => {
      test.slow();
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), PLANE_V);
      await setSliderValue(page.locator("#toughness-slider"), 1);

      const normalHash = await dropAndReadLayoutHash(page);
      expect(normalHash).not.toBeNull();

      // Step 1b §10: no Reset button — enable reduced motion, then Drop
      // again directly from settled (the settings are unchanged).
      await page.emulateMedia({ reducedMotion: "reduce" });

      const skipButton = page.getByRole("button", { name: "Skip to result" });

      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "falling");
      await expect(skipButton).toBeEnabled();
      await skipButton.click();

      await waitForPhase(page, "settled", { timeout: 45000 });
      const skippedHash = await page.locator("main").getAttribute("data-layout-hash");

      expect(skippedHash).not.toBeNull();
      expect(skippedHash).toEqual(normalHash);

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

    // Step 1b §8: restored to the plan's original mid-track drag test. The
    // §7 workaround (targeting a non-landmark point) is no longer needed —
    // the `<datalist>` (and the Chromium pointer-snap-to-tick behaviour it
    // caused) is removed in §8; landmark ticks are now purely decorative
    // CSS marks with no effect on pointer/touch input.
    test("pointer: dragging to mid-track gives a height near heightFromSlider(500) (~4.2 m), within 10%", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      const heightSlider = page.locator("#height-slider");
      const sliderBox = await heightSlider.boundingBox();

      await heightSlider.click({ position: { x: sliderBox.width / 2, y: sliderBox.height / 2 } });

      const actualValue = Number(await heightSlider.inputValue());
      expect(Math.abs(actualValue - 500), `slider value ${actualValue} is more than 10 away from 500`).toBeLessThanOrEqual(10);

      const readoutText = await page.locator("#height-readout").textContent();
      const match = readoutText.match(/^([\d.]+)\s*m/);

      expect(match, `readout text "${readoutText}" did not start with a metres value`).not.toBeNull();

      const meters = Number(match[1]);
      const expectedMeters = heightFromSlider(500); // ~4.2426 m

      expect(Math.abs(meters - expectedMeters) / expectedMeters).toBeLessThanOrEqual(0.1);

      expect(errors).toEqual([]);
    });

    test.describe("touch viewport", () => {
      test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

      test("touch: tapping mid-track gives a height near heightFromSlider(500) (~4.2 m), within 10%", async ({ page }) => {
        const errors = trackConsoleAndPageErrors(page);
        await routeCdnAndRecordUnexpectedRequests(page);
        await page.goto(gamePath);
        await waitForPhase(page, "ready");

        const heightSlider = page.locator("#height-slider");
        const sliderBox = await heightSlider.boundingBox();

        await heightSlider.tap({ position: { x: sliderBox.width / 2, y: sliderBox.height / 2 } });

        const actualValue = Number(await heightSlider.inputValue());
        expect(Math.abs(actualValue - 500), `tapped value ${actualValue} is more than 10 away from 500`).toBeLessThanOrEqual(10);

        const readoutText = await page.locator("#height-readout").textContent();
        const match = readoutText.match(/^([\d.]+)\s*m/);

        expect(match, `readout text "${readoutText}" did not start with a metres value`).not.toBeNull();

        const meters = Number(match[1]);
        const expectedMeters = heightFromSlider(500); // ~4.2426 m

        expect(Math.abs(meters - expectedMeters) / expectedMeters).toBeLessThanOrEqual(0.1);

        expect(errors).toEqual([]);
      });
    });

    test("no datalist is present, and #height-slider has no list attribute", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      const datalistCount = await page.evaluate(() => document.querySelectorAll("datalist").length);
      expect(datalistCount).toBe(0);

      const hasListAttribute = await page.locator("#height-slider").evaluate((el) => el.hasAttribute("list"));
      expect(hasListAttribute).toBe(false);

      expect(errors).toEqual([]);
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

  test.describe("step 1b §9: incoming marker, fruit colour, ground texture", () => {
    const counterHeightSliderValue = String(Math.round(sliderFromHeight(1)));

    test("ready: #incoming-marker is visible for all five fruits at Counter", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), counterHeightSliderValue);

      for (const fruitKey of FRUIT_KEYS) {
        await setFruit(page, fruitKey);
        await expect(page.locator("#incoming-marker"), `${fruitKey} at Counter`).toBeVisible();
      }

      expect(errors).toEqual([]);
    });

    // Step 1b §10: no Reset button — "reappears after reset" becomes
    // "reappears after a settled edit".
    test("a Counter watermelon drop hides the incoming marker before settled, and it reappears after a settled edit (twice in one session)", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      async function dropAndCheckOnce() {
        await setSliderValue(page.locator("#height-slider"), counterHeightSliderValue);
        await expect(page.locator("#incoming-marker")).toBeVisible();

        await page.getByRole("button", { name: "Drop" }).click();
        await waitForPhase(page, "falling");

        // Poll for the marker hiding; a phase of "settled" reached first
        // (still visible) is the failure this test exists to catch.
        const deadline = Date.now() + 15000;
        let hiddenBeforeSettled = null;

        while (Date.now() < deadline) {
          const phase = await page.locator("main").getAttribute("data-phase");
          const hidden = await page.locator("#incoming-marker").isHidden();

          if (hidden) {
            hiddenBeforeSettled = phase !== "settled";
            break;
          }

          if (phase === "settled") {
            hiddenBeforeSettled = false;
            break;
          }

          await page.waitForTimeout(30);
        }

        expect(
          hiddenBeforeSettled,
          "incoming marker should hide before data-phase becomes settled"
        ).toBe(true);

        await waitForPhase(page, "settled", { timeout: 15000 });
        await expect(page.locator("#incoming-marker")).toBeHidden();

        // Settled edit: re-affirming the height (dispatches "input" and
        // "change" regardless of whether the numeric value differs) clears
        // the debris and returns to ready, showing the incoming marker.
        await setSliderValue(page.locator("#height-slider"), counterHeightSliderValue);
        await waitForPhase(page, "ready");
        await expect(page.locator("#incoming-marker")).toBeVisible();
      }

      await dropAndCheckOnce();
      await dropAndCheckOnce();

      expect(errors).toEqual([]);
    });

    test("--fruit-color on #incoming-marker-dot and #height-bar-marker matches the fruit table's skin colour, for tomato and coconut", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      for (const fruitKey of ["tomato", "coconut"]) {
        await setFruit(page, fruitKey);

        const expectedColor = `#${fruitByKey(fruitKey).skinColor.toString(16).padStart(6, "0")}`;

        const dotColor = await page
          .locator("#incoming-marker-dot")
          .evaluate((el) => getComputedStyle(el).getPropertyValue("--fruit-color").trim());
        const barMarkerColor = await page
          .locator("#height-bar-marker")
          .evaluate((el) => getComputedStyle(el).getPropertyValue("--fruit-color").trim());

        expect(dotColor, fruitKey).toBe(expectedColor);
        expect(barMarkerColor, fruitKey).toBe(expectedColor);
      }

      expect(errors).toEqual([]);
    });

    test("incoming marker write budget stays under 150 DOM mutations during one Plane drop", async ({ page }) => {
      test.slow();
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), PLANE_V);
      await setSliderValue(page.locator("#toughness-slider"), 1);

      await page.evaluate(() => {
        window.__incomingMutationCount = 0;
        const target = document.getElementById("incoming-marker");
        const observer = new MutationObserver((records) => {
          window.__incomingMutationCount += records.length;
        });
        observer.observe(target, { attributes: true, childList: true, characterData: true, subtree: true });
        window.__incomingMutationObserver = observer;
      });

      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "settled", { timeout: 45000 });

      const mutationCount = await page.evaluate(() => {
        window.__incomingMutationObserver.disconnect();
        return window.__incomingMutationCount;
      });

      expect(mutationCount).toBeLessThan(150);

      expect(errors).toEqual([]);
    });

    // Step 1b §9 (CTO ruling): impactViewFor unit tests moved from the
    // viewport sizes to the real measured #scene-canvas CSS sizes. This
    // assertion keeps that test constant from silently drifting away from
    // the real canvas aspect.
    test("canvas aspect at 1280x900 stays within +/-2% of the impactViewFor test size (592x416)", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      const box = await page.locator("#scene-canvas").evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));
      const measuredAspect = box.w / box.h;
      const testAspect = 592 / 416;

      expect(
        Math.abs(measuredAspect - testAspect) / testAspect,
        `measured canvas ${box.w}x${box.h} (aspect ${measuredAspect}) vs test size aspect ${testAspect}`
      ).toBeLessThanOrEqual(0.02);

      expect(errors).toEqual([]);
    });

    test.describe("touch viewport", () => {
      test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

      test("canvas aspect at 390x844 stays within +/-2% of the impactViewFor test size (358x256)", async ({ page }) => {
        const errors = trackConsoleAndPageErrors(page);
        await routeCdnAndRecordUnexpectedRequests(page);
        await page.goto(gamePath);
        await waitForPhase(page, "ready");

        const box = await page.locator("#scene-canvas").evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));
        const measuredAspect = box.w / box.h;
        const testAspect = 358 / 256;

        expect(
          Math.abs(measuredAspect - testAspect) / testAspect,
          `measured canvas ${box.w}x${box.h} (aspect ${measuredAspect}) vs test size aspect ${testAspect}`
        ).toBeLessThanOrEqual(0.02);

        expect(errors).toEqual([]);
      });
    });
  });

  test.describe("step 1b §10: no Reset button, settled edits, synthesized sound, UI-phase timing", () => {
    test("there is no Reset button in the DOM", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      expect(await page.getByRole("button", { name: "Reset" }).count()).toBe(0);
      expect(await page.locator("#reset-button").count()).toBe(0);

      expect(errors).toEqual([]);
    });

    // "1 body, 0 steps" proxies per the plan: data-phase=ready, data-steps=0,
    // no data-layout-hash, #incoming-marker visible, and the bar label
    // matches the new setting. The sim-level invariant-8 test keeps the
    // true body count.
    test("settled edits (fruit, height, toughness) return to ready with the new settings, twice in one session", async ({ page }) => {
      test.setTimeout(30000);
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      async function dropThenEdit(editFn) {
        await page.getByRole("button", { name: "Drop" }).click();
        await waitForPhase(page, "settled", { timeout: 15000 });

        await editFn();
        await waitForPhase(page, "ready");
        await expect(page.locator("main")).toHaveAttribute("data-steps", "0");
        expect(await page.locator("main").getAttribute("data-layout-hash")).toBeNull();
        await expect(page.locator("#incoming-marker")).toBeVisible();
      }

      await dropThenEdit(() => setFruit(page, "tomato"));
      await expect(page.locator('input[name="fruit"][value="tomato"]')).toBeChecked();

      await dropThenEdit(() => setSliderValue(page.locator("#height-slider"), ROOF_V));
      await expect(page.locator("#height-bar-label")).toHaveText("10 m");

      await dropThenEdit(() => setSliderValue(page.locator("#toughness-slider"), 8));
      await expect(page.locator("#toughness-readout")).toHaveText("8");

      // Twice in one session: a second fruit-change settled edit.
      await dropThenEdit(() => setFruit(page, "coconut"));
      await expect(page.locator('input[name="fruit"][value="coconut"]')).toBeChecked();

      expect(errors).toEqual([]);
    });

    test("keyboard redrop in settled: pressing Space on Drop again produces a new drop with no stale text from the previous one", async ({ page }) => {
      test.slow();
      test.setTimeout(30000);
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      const dropButton = page.getByRole("button", { name: "Drop" });

      await setSliderValue(page.locator("#height-slider"), KNEE_V);
      await dropButton.focus();
      await page.keyboard.press("Space");
      await waitForPhase(page, "settled", { timeout: 45000 });
      const firstText = await page.locator("#status").textContent();
      expect(firstText).toContain("0.3 m");

      const focusedBeforeRedrop = await dropButton.evaluate((element) => element === document.activeElement);
      expect(focusedBeforeRedrop, "focus should stay on Drop through settled (aria-disabled, not disabled)").toBe(true);

      await setSliderValue(page.locator("#height-slider"), PLANE_V);
      await setSliderValue(page.locator("#toughness-slider"), 1);
      await page.keyboard.press("Space");
      await waitForPhase(page, "settled", { timeout: 45000 });
      const secondText = await page.locator("#status").textContent();

      expect(secondText).not.toEqual(firstText);
      expect(secondText).toContain("60 m");

      expect(errors).toEqual([]);
    });

    // --- UI-phase timing (CTO amendment) ---------------------------------

    test("Counter watermelon crack: Drop to data-phase=settled takes under 2.5s of real time, with controls enabled", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), COUNTER_V);

      const start = Date.now();
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "settled", { timeout: 15000 });
      const elapsedMs = Date.now() - start;

      // eslint-disable-next-line no-console
      console.log("Counter watermelon crack: Drop-to-settled took", elapsedMs, "ms");
      expect(elapsedMs, `Drop-to-settled took ${elapsedMs}ms`).toBeLessThan(2500);

      const snapshot = await page.evaluate(() => ({
        dropAriaDisabled: document.getElementById("drop-button").getAttribute("aria-disabled"),
        heightDisabled: document.getElementById("height-slider").disabled,
        toughnessDisabled: document.getElementById("toughness-slider").disabled
      }));

      expect(snapshot.dropAriaDisabled).toBe("false");
      expect(snapshot.heightDisabled).toBe(false);
      expect(snapshot.toughnessDisabled).toBe(false);

      expect(errors).toEqual([]);
    });

    test("Plane watermelon smash: Drop to data-phase=settled takes under 5.5s of real time, with controls enabled", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), PLANE_V);
      await setSliderValue(page.locator("#toughness-slider"), 1);

      const start = Date.now();
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "settled", { timeout: 15000 });
      const elapsedMs = Date.now() - start;

      // eslint-disable-next-line no-console
      console.log("Plane watermelon smash: Drop-to-settled took", elapsedMs, "ms");
      expect(elapsedMs, `Drop-to-settled took ${elapsedMs}ms`).toBeLessThan(5500);

      const snapshot = await page.evaluate(() => ({
        dropAriaDisabled: document.getElementById("drop-button").getAttribute("aria-disabled"),
        heightDisabled: document.getElementById("height-slider").disabled
      }));

      expect(snapshot.dropAriaDisabled).toBe("false");
      expect(snapshot.heightDisabled).toBe(false);

      expect(errors).toEqual([]);
    });

    test("editing during moving debris (right after UI settle, before physics settle) clears cleanly, with no stale change 9s later", async ({ page }) => {
      test.setTimeout(40000);
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), PLANE_V);
      await setSliderValue(page.locator("#toughness-slider"), 1);
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "settled", { timeout: 15000 });

      // Confirm debris is still physically moving right after UI settle for
      // a Plane smash (data-steps keeps rising even though data-phase
      // already reads "settled").
      const stepsAtUiSettle = Number(await page.locator("main").getAttribute("data-steps"));
      await page.waitForTimeout(150);
      const stepsLater = Number(await page.locator("main").getAttribute("data-steps"));

      expect(
        stepsLater,
        "debris should still be physically moving right after UI settle for a Plane smash"
      ).toBeGreaterThan(stepsAtUiSettle);

      await setSliderValue(page.locator("#toughness-slider"), 3);
      await waitForPhase(page, "ready");
      await expect(page.locator("main")).toHaveAttribute("data-steps", "0");
      expect(await page.locator("main").getAttribute("data-layout-hash")).toBeNull();
      await expect(page.locator("#incoming-marker")).toBeVisible();

      const phaseAfterEdit = await page.locator("main").getAttribute("data-phase");
      const statusAfterEdit = await page.locator("#status").textContent();

      await page.waitForTimeout(9000);

      expect(await page.locator("main").getAttribute("data-phase")).toBe(phaseAfterEdit);
      expect(await page.locator("main").getAttribute("data-steps")).toBe("0");
      expect(await page.locator("#status").textContent()).toBe(statusAfterEdit);
      expect(await page.locator("main").getAttribute("data-layout-hash")).toBeNull();

      expect(errors).toEqual([]);
    });

    test("hidden tab mid-way between impact and UI settle (+72 steps) delays UI settle until visible again", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), KNEE_V);
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "falling");

      // Knee's free fall is very short (~0.25s/~16 steps); wait a little
      // past impact, roughly mid-way toward the 72-step UI-settle buffer
      // (72 steps is 1.2s), then hide the tab.
      await page.waitForTimeout(300);

      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await page.waitForTimeout(1500);
      await expect(page.locator("main")).toHaveAttribute("data-phase", "falling");

      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
        Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
        document.dispatchEvent(new Event("visibilitychange"));
      });

      await waitForPhase(page, "settled", { timeout: 15000 });

      expect(errors).toEqual([]);
    });

    // --- synthesized splat sound ------------------------------------------
    // Fix (b): these tests read window.__audioLog, populated by the default
    // fake AudioContext installed in the suite-level beforeEach above — no
    // per-test instrumentation call needed.

    test("no AudioContext exists before the first Drop, not after page load and not after changing controls", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      expect(await page.evaluate(() => window.__audioLog.contexts)).toBe(0);

      await setFruit(page, "coconut");
      await setSliderValue(page.locator("#height-slider"), COUNTER_V);
      await setSliderValue(page.locator("#toughness-slider"), 3);

      expect(await page.evaluate(() => window.__audioLog.contexts)).toBe(0);

      expect(errors).toEqual([]);
    });

    test("one Counter watermelon crack (?seed=7) gives exactly one noise-source start and one oscillator start, both while falling", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), COUNTER_V);
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "settled", { timeout: 15000 });
      await page.waitForTimeout(300); // let any still-moving debris finish

      const log = await page.evaluate(() => window.__audioLog);
      const bufferStarts = log.starts.filter((entry) => entry.type === "AudioBufferSourceNode");
      const oscillatorStarts = log.starts.filter((entry) => entry.type === "OscillatorNode");

      expect(bufferStarts.length, JSON.stringify(log.starts)).toBe(1);
      expect(oscillatorStarts.length, JSON.stringify(log.starts)).toBe(1);

      for (const entry of [...bufferStarts, ...oscillatorStarts]) {
        expect(entry.phase).toBe("falling");
        expect(entry.steps).toBeGreaterThanOrEqual(1);
      }

      expect(errors).toEqual([]);
    });

    test("with the sound toggle off, a drop gives zero starts", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await page.locator("#sound-toggle").click();
      await expect(page.locator("#sound-toggle")).toHaveAttribute("aria-pressed", "false");

      await setSliderValue(page.locator("#height-slider"), COUNTER_V);
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "settled", { timeout: 15000 });

      const log = await page.evaluate(() => window.__audioLog);
      expect(log.starts.length, JSON.stringify(log.starts)).toBe(0);

      expect(errors).toEqual([]);
    });

    test("with AudioContext and webkitAudioContext deleted, a full drop gives zero page/console errors and the correct result text", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.addInitScript(() => {
        delete window.AudioContext;
        delete window.webkitAudioContext;
      });
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), COUNTER_V);
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "settled", { timeout: 15000 });

      await expect(page.locator("#status")).toContainText("Dropped a watermelon from 1.0 m.");

      expect(errors).toEqual([]);
    });

    test("the sound toggle works by keyboard, and aria-pressed flips both ways", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      const soundToggle = page.locator("#sound-toggle");

      await expect(soundToggle).toHaveAttribute("aria-pressed", "true");
      await expect(soundToggle).toHaveText("Sound: on");

      // Tab to it (starting from nothing focused), rather than .focus(),
      // and use the locator's own .press() (which waits for actionability
      // first) rather than a bare page.keyboard.press() — more reliable in
      // this environment than a raw global key event after a scripted
      // .focus() call.
      await page.keyboard.press("Tab");
      let soundToggleFocused = await soundToggle.evaluate((element) => element === document.activeElement);

      for (let tabIndex = 0; tabIndex < 15 && !soundToggleFocused; tabIndex += 1) {
        await page.keyboard.press("Tab");
        soundToggleFocused = await soundToggle.evaluate((element) => element === document.activeElement);
      }

      expect(soundToggleFocused, "Tab (capped at 15 presses) never reached #sound-toggle").toBe(true);

      await soundToggle.press("Space");
      await expect(soundToggle).toHaveAttribute("aria-pressed", "false");
      await expect(soundToggle).toHaveText("Sound: off");

      await soundToggle.press("Space");
      await expect(soundToggle).toHaveAttribute("aria-pressed", "true");
      await expect(soundToggle).toHaveText("Sound: on");

      expect(errors).toEqual([]);
    });
  });
});

// Fix (b): every other test in this file gets the fake AudioContext (see
// the suite-level beforeEach above). This one test deliberately does not —
// it is the single smoke check that real Web Audio still works end to end.
// Kept in its own top-level test.describe (no beforeEach) so the default
// fake never gets installed here.
test.describe("Splat Lab: real audio", () => {
  test("real Web Audio smoke: a Counter watermelon crack plays with no page errors and no unexpected console errors", async ({ page }) => {
    // Chromium's headless audio renderer can log this one console error
    // under machine load (observed independent of app code); it is not a
    // real failure, so it is the single exemption below.
    const AUDIO_DEVICE_ERROR_TEXT =
      "The AudioContext encountered an error from the audio device or the WebAudio renderer.";

    const pageErrors = [];
    const unexpectedConsoleErrors = [];

    page.on("pageerror", (error) => {
      pageErrors.push(`pageerror: ${error.message}`);
    });

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      if (msg.text() === AUDIO_DEVICE_ERROR_TEXT) return;

      unexpectedConsoleErrors.push(`console.error: ${msg.text()} (${msg.location()?.url ?? "no location"})`);
    });

    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(pinnedGamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), COUNTER_V);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });

    expect(pageErrors).toEqual([]);
    expect(unexpectedConsoleErrors).toEqual([]);
  });
});
