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
    window.__audioLog = { contexts: 0, starts: [], compressors: 0, connections: [] };

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
        __kind: kind,
        buffer: null,
        type: "sine",
        onended: null,
        frequency: makeParam(440),
        gain: makeParam(1),
        // Step 1b §11b Stage 3: records every connect() call so a test can
        // assert the master GainNode -> DynamicsCompressorNode ->
        // destination path actually exists, not just that the nodes were
        // constructed.
        connect(destination) {
          window.__audioLog.connections.push({
            from: kind,
            to: destination && destination.__isDestination ? "destination" : (destination && destination.__kind) || "unknown"
          });
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
        this.destination = { __isDestination: true };
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

      createDynamicsCompressor() {
        window.__audioLog.compressors += 1;
        return makeNode("DynamicsCompressorNode");
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
  // button). Now (step 1b §11b Stage 3, spawn ruling v3): Tab to Drop,
  // Space to drop, wait for settled, assert focus STAYED on Drop the whole
  // time (Drop is never given `disabled` or `aria-disabled` at all — never
  // ejects focus to <body>), then Space on Drop again in settled to redrop.
  test("keyboard only: Tab to height, arrow to Plane, Space on Drop, then Space on Drop again in settled", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    const heightSlider = page.locator("#height-slider");
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
    await expect(dropButton).toBeFocused();

    await expect(heightSlider).toBeEnabled();
    await page.keyboard.press("Space");

    await waitForPhase(page, "active");
    // Step 1b §11b Stage 3: height/Drop stay enabled in every phase (v3
    // never disables anything), so focus staying on Drop needs no
    // aria-disabled workaround at all.
    await expect(heightSlider).toBeEnabled();
    await expect(dropButton).not.toHaveAttribute("disabled");
    await expect(dropButton).not.toHaveAttribute("aria-disabled");
    await expect(dropButton).toBeFocused();

    await waitForPhase(page, "settled", { timeout: 15000 });
    // Default fruit (watermelon) at Plane always smashes.
    await expect(page.locator("#status")).toContainText(
      "It smashed into 12 pieces and 40 seeds flew out."
    );
    await expect(dropButton).not.toHaveAttribute("disabled");
    await expect(dropButton).not.toHaveAttribute("aria-disabled");
    await expect(dropButton).toBeFocused();

    // Space on Drop again, still focused, in settled: a redrop.
    await page.keyboard.press("Space");
    await waitForPhase(page, "active");
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

  test("a Counter watermelon drop shows 'cracked' or 'split'", async ({ page }) => {
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
      await expect(page.getByRole("button", { name: "Drop" })).not.toHaveAttribute("aria-disabled");
      await page.getByRole("button", { name: "Drop" }).tap();
      await waitForPhase(page, "active");
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

  // replaces: twice in one session: drop -> settle -> Drop again -> settle
  // gives matching results each time
  //
  // Step 1b §11b Stage 3 (spawn ruling v3, decision 1): Drop in settled no
  // longer clears and redrops — it ADDS a fruit to the rolling window, and
  // old debris is not cleared. (Matching-result determinism across a fresh
  // load is covered separately by the "two drops with ?seed=7 produce
  // identical layout hashes" test below, since the pinned seed now advances
  // per press within one session — n + k, k the press count since load.)
  // Counter (not Knee): a Knee-height redrop's spawn point sits right on
  // top of the FIRST fruit's resting position, which the v3 spawn ruling
  // correctly treats as "a landed body in the way" and removes — that is
  // the separate "low drop onto a pile" rule (already sim-tested), not
  // what this test is checking. Counter's spawn is far enough above any
  // resting debris that it never triggers that path.
  test("Drop in settled adds a fruit (count +1) and does not clear old debris", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(pinnedGamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), COUNTER_V);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });

    const firstText = await page.locator("#status").textContent();
    const fruitCountAfterFirst = Number(await page.locator("main").getAttribute("data-fruit-count"));
    expect(fruitCountAfterFirst).toBe(1);

    await expect(page.getByRole("button", { name: "Drop" })).not.toHaveAttribute("aria-disabled");
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "active");

    // The first fruit's body is still in the scene right after the second
    // press — nothing was cleared.
    expect(Number(await page.locator("main").getAttribute("data-fruit-count"))).toBe(2);

    await waitForPhase(page, "settled", { timeout: 15000 });

    expect(Number(await page.locator("main").getAttribute("data-fruit-count"))).toBe(2);
    const secondText = await page.locator("#status").textContent();
    // The batch announcement for the second settle mentions the fruit that
    // landed since the last announcement (the second one), not a rewrite of
    // the first drop's own text.
    expect(secondText).toContain("watermelon");
    expect(secondText).not.toEqual(firstText); // different pinned seed (k=1), same wording shape

    expect(errors).toEqual([]);
  });

  // replaces: fruit -> drop -> settle -> change fruit -> drop, twice in one
  // session
  //
  // Step 1b §11b Stage 3 (spawn ruling v3): a fruit change is never a
  // clearing action. This is also the plan's "mixed batch" Playwright case:
  // tomato, Drop, coconut, Drop — the result text names the tomato, then
  // the coconut, and the tomato's own debris is never cleared out from
  // under it by the fruit-radio change.
  test("mixed batch: tomato Drop, coconut Drop — result text names both in press order, tomato debris not cleared", async ({ page }) => {
    test.slow();
    test.setTimeout(60000);
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(pinnedGamePath);
    await waitForPhase(page, "ready");

    await setFruit(page, "tomato");
    await setSliderValue(page.locator("#height-slider"), PLANE_V);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "active");
    expect(Number(await page.locator("main").getAttribute("data-fruit-count"))).toBe(1);

    // Changing fruit and dropping again WHILE the tomato is still falling —
    // a control change never clears, so the tomato keeps falling and both
    // land into the same batch announcement.
    await setFruit(page, "coconut");
    expect(Number(await page.locator("main").getAttribute("data-fruit-count"))).toBe(1);

    await page.getByRole("button", { name: "Drop" }).click();
    expect(Number(await page.locator("main").getAttribute("data-fruit-count"))).toBe(2);

    await waitForPhase(page, "settled", { timeout: 20000 });

    expect(Number(await page.locator("main").getAttribute("data-fruit-count"))).toBe(2);

    const text = await page.locator("#status").textContent();
    const tomatoIndex = text.indexOf("tomato");
    const coconutIndex = text.indexOf("coconut");

    expect(tomatoIndex).toBeGreaterThanOrEqual(0);
    expect(coconutIndex).toBeGreaterThan(tomatoIndex);

    expect(errors).toEqual([]);
  });

  // Step 1b §11b Stage 3 (spawn ruling v3): fruit radios stay enabled in
  // every phase now (see the D3 test above); this test keeps only the
  // keyboard-arrow-selection behaviour, plus the "still enabled while
  // active" check that used to be a separate, now-invalid "disabled while
  // falling" assertion.
  test("fruit selector: keyboard arrows move between fruits, and stays enabled through every phase", async ({ page }) => {
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
    await waitForPhase(page, "active");

    for (const radio of [watermelonRadio, tomatoRadio, appleRadio]) {
      await expect(radio).toBeEnabled();
    }

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
    // Step 1b §11b Stage 3 (spawn ruling v3): a fruit change never clears
    // anything (there is nothing to clear here, in `ready`); the height bar
    // still reads the same chosen height/label (fruit does not change height).
    await expect(page.locator("#height-bar-label")).toHaveText("60 m");
    await expect(page.locator("main")).toHaveAttribute("data-steps", "0");

    expect(errors).toEqual([]);
  });

  // replaces: a settled edit (height change) returns to ready with no
  // stale status appearing later
  //
  // Step 1b §11b Stage 3 (spawn ruling v3, decision 1): a control change in
  // `settled` does NOT clear — phase stays `settled`, fruit count is
  // unchanged, and no stale status text appears later either. The new
  // height only takes effect on the NEXT drop.
  test("a settled edit (height change) does not clear: phase and fruit count unchanged, next drop uses the new height", async ({ page }) => {
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), KNEE_V);
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });

    const fruitCountAfterFirstDrop = await page.locator("main").getAttribute("data-fruit-count");
    const statusAfterFirstDrop = await page.locator("#status").textContent();

    await setSliderValue(page.locator("#height-slider"), COUNTER_V);

    // Does not clear: stays settled, same fruit count, same status text —
    // even after waiting, in case of a stale callback.
    await expect(page.locator("main")).toHaveAttribute("data-phase", "settled");
    await expect(page.locator("main")).toHaveAttribute("data-fruit-count", fruitCountAfterFirstDrop);
    await page.waitForTimeout(2000);
    expect(await page.locator("#status").textContent()).toEqual(statusAfterFirstDrop);
    await expect(page.locator("main")).toHaveAttribute("data-phase", "settled");

    // The new height applies to the NEXT drop.
    await page.getByRole("button", { name: "Drop" }).click();
    await waitForPhase(page, "settled", { timeout: 15000 });
    await expect(page.locator("#status")).toContainText("from 1.0 m");

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
    await waitForPhase(page, "active");
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
    await waitForPhase(page, "active");

    await page.evaluate(() => window.dispatchEvent(new Event("blur")));

    await waitForPhase(page, "settled", { timeout: 15000 });

    // Step 1b §10: no Reset button — controls are enabled again as soon as
    // the UI itself reaches settled, with no control left stuck.
    await expect(page.getByRole("button", { name: "Drop" })).not.toHaveAttribute("aria-disabled");
    await expect(page.locator("#height-slider")).toBeEnabled();

    expect(errors).toEqual([]);
  });

  test("reduced motion: Skip to result matches a normal run with the same settings", async ({ page }) => {
    test.slow();
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    // Pinned seed: this test compares two separate drops for exact text equality.
    await page.goto(pinnedGamePath);
    await waitForPhase(page, "ready");

    // D8: use Plane (always smashes watermelon per §2 pins) for both runs
    // so Skip actually goes through the split, not just a bounce.
    await setSliderValue(page.locator("#height-slider"), PLANE_V);
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
    await waitForPhase(page, "active");
    await expect(skipButton).toBeEnabled();
    await skipButton.click();

    await waitForPhase(page, "settled", { timeout: 45000 });
    const reducedMotionText = await page.locator("#status").textContent();

    expect(reducedMotionText).toContain("smashed into 12 pieces");
    // Step 1b §11b Stage 3: the two drops use different pinned seeds now
    // (n + k, k the press count since load), so their "Hit the ground at
    // X.X m/s" digit can legitimately differ by wobble alone; compare only
    // the tier/piece-count sentence, which depends on the tier (always the
    // same here — Plane always smashes a watermelon), not the seed.
    const tierSentence = (text) => text.match(/It \w+ into \d+ pieces.*$/)?.[0];

    expect(tierSentence(reducedMotionText)).toEqual(tierSentence(normalText));

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

  // replaces: D3: controls follow phase exactly (invariant 2), and
  // #instructions matches rules.js per phase
  //
  // Step 1b §11b Stage 3: Drop always works, instantly, in every phase.
  // Fruit/height/Drop/sound stay enabled in every phase; `skipButton`
  // (reduced-motion "Skip to result") is the one control still limited,
  // enabled only while `active`. A second click while `active` genuinely
  // adds a fruit (rolling window), rather than being ignored.
  test("D3: all controls stay enabled in every phase; Skip is gated to active under reduced motion; #instructions matches rules.js per phase", async ({ page }) => {
    test.slow();
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    const heightSlider = page.locator("#height-slider");
    const dropButton = page.getByRole("button", { name: "Drop" });
    const soundToggle = page.locator("#sound-toggle");
    const skipButton = page.getByRole("button", { name: "Skip to result" });
    const instructions = page.locator("#instructions");
    const fruitRadio = page.locator('input[name="fruit"][value="watermelon"]');

    expect(await page.locator("#reset-button").count(), "no Reset button should exist").toBe(0);
    // Step 1b §11a: the toughness slider was removed entirely.
    expect(await page.locator("#toughness-slider").count(), "no toughness slider should exist").toBe(0);

    // ready: fruit/height/Drop/sound enabled; Skip visible (reduced
    // motion) but disabled (nothing active yet).
    await expect(heightSlider).toBeEnabled();
    await expect(dropButton).not.toHaveAttribute("aria-disabled");
    await expect(dropButton).not.toBeDisabled();
    await expect(fruitRadio).toBeEnabled();
    await expect(soundToggle).toBeEnabled();
    await expect(skipButton).toBeVisible();
    await expect(skipButton).toBeDisabled();
    await expect(instructions).toHaveText(instructionsForPhase("ready"));
    const readyText = await instructions.textContent();

    function snapshotControls() {
      return page.evaluate(() => ({
        phase: document.querySelector("main").dataset.phase,
        fruitCount: document.querySelector("main").dataset.fruitCount,
        dropAriaDisabled: document.getElementById("drop-button").getAttribute("aria-disabled"),
        dropDisabledAttr: document.getElementById("drop-button").disabled,
        heightDisabled: document.getElementById("height-slider").disabled,
        fruitDisabled: document.querySelector('input[name="fruit"][value="watermelon"]').disabled,
        soundToggleDisabled: document.getElementById("sound-toggle").disabled,
        skipDisabled: document.getElementById("skip-button").disabled,
        instructions: document.getElementById("instructions").textContent
      }));
    }

    await setSliderValue(page.locator("#height-slider"), PLANE_V); // long enough to observe "active"
    await dropButton.click();
    await waitForPhase(page, "active");

    const activeSnapshot = await snapshotControls();

    expect(activeSnapshot.phase).toBe("active");
    expect(activeSnapshot.dropAriaDisabled).toBeNull();
    expect(activeSnapshot.dropDisabledAttr).toBe(false);
    expect(activeSnapshot.heightDisabled).toBe(false);
    expect(activeSnapshot.fruitDisabled).toBe(false);
    expect(activeSnapshot.soundToggleDisabled).toBe(false);
    expect(activeSnapshot.skipDisabled).toBe(false);
    expect(activeSnapshot.instructions).toEqual(instructionsForPhase("active"));
    const activeText = activeSnapshot.instructions;

    // A click during `active` genuinely adds a fruit now (rolling window),
    // rather than being ignored.
    const fruitCountBeforeSecondClick = Number(activeSnapshot.fruitCount);

    await dropButton.click();
    await page.waitForTimeout(50);

    const fruitCountAfterSecondClick = Number(await page.locator("main").getAttribute("data-fruit-count"));

    expect(fruitCountAfterSecondClick).toBeGreaterThan(fruitCountBeforeSecondClick);
    expect(await page.locator("main").getAttribute("data-phase")).toBe("active");

    await waitForPhase(page, "settled", { timeout: 45000 });

    // settled: everything enabled again except Skip (nothing active).
    const settledSnapshot = await snapshotControls();

    expect(settledSnapshot.dropAriaDisabled).toBeNull();
    expect(settledSnapshot.dropDisabledAttr).toBe(false);
    expect(settledSnapshot.heightDisabled).toBe(false);
    expect(settledSnapshot.fruitDisabled).toBe(false);
    expect(settledSnapshot.soundToggleDisabled).toBe(false);
    expect(settledSnapshot.skipDisabled).toBe(true);
    expect(settledSnapshot.instructions).toEqual(instructionsForPhase("settled"));
    const settledText = settledSnapshot.instructions;

    expect(readyText).not.toEqual(activeText);
    expect(activeText).not.toEqual(settledText);
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
    await waitForPhase(page, "active");

    const marker = page.locator("#height-bar-marker");
    const samples = [];
    const deadline = Date.now() + 15000;

    while (samples.length < 3 && Date.now() < deadline) {
      const phase = await page.locator("main").getAttribute("data-phase");
      if (phase !== "active") break;

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

  // replaces: B2/B3: after a settled Plane drop, changing height returns
  // the marker to the top and the label to the new height, twice
  //
  // Step 1b §11b Stage 3 (spawn ruling v3, decision 1): a height change in
  // `settled` does not clear (stays `settled`, no falling fruit, so no
  // marker/label preview per rules.js heightBarFor's "ready" special case)
  // — but the NEXT Drop press starts its marker/label at the new height's
  // top, exactly as a fresh `ready` drop would.
  test("B2/B3: after a settled Plane drop, a height change takes effect on the next Drop's marker/label, twice", async ({ page }) => {
    test.slow();
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    // A pixel/value tolerance (not an exact match) for the SECOND drop:
    // step 1b §11b Stage 3 keeps the physics loop running past UI settle
    // (debris keeps physically moving after data-phase already reads
    // "settled" — see frameLoop's "genuinely idle" stop condition), so
    // unlike a fresh page load's first drop, a redrop's animation loop is
    // often already mid-frame the instant the click resolves, and a step
    // or two can already have run by the time this reads the DOM. Still
    // asserts the marker starts at (near) the top and the label reads
    // (near) the full new height, not a stale one.
    async function dropAtHeight(targetSliderValue, targetHeightM) {
      await setSliderValue(page.locator("#height-slider"), targetSliderValue);
      await page.getByRole("button", { name: "Drop" }).click();

      const markerBox = await page.locator("#height-bar-marker").boundingBox();
      const trackBox = await page.locator("#height-bar-track").boundingBox();
      const markerCentreY = markerBox.y + markerBox.height / 2;

      expect(Math.abs(markerCentreY - trackBox.y)).toBeLessThanOrEqual(trackBox.height * 0.05);

      const labelText = await page.locator("#height-bar-label").textContent();
      const labelValue = Number.parseFloat(labelText);

      expect(Number.isNaN(labelValue), `label text was ${JSON.stringify(labelText)}`).toBe(false);
      expect(Math.abs(labelValue - targetHeightM)).toBeLessThanOrEqual(targetHeightM * 0.05);

      await waitForPhase(page, "settled", { timeout: 45000 });
    }

    await dropAtHeight(PLANE_V, 60);
    await dropAtHeight(ROOF_V, 10);

    expect(errors).toEqual([]);
  });

  test("B3: bar write budget stays under 150 DOM mutations during one Plane drop", async ({ page }) => {
    test.slow();
    const errors = trackConsoleAndPageErrors(page);
    await routeCdnAndRecordUnexpectedRequests(page);
    await page.goto(gamePath);
    await waitForPhase(page, "ready");

    await setSliderValue(page.locator("#height-slider"), PLANE_V); // guarantees a break

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

    for (const box of [heightReadoutBox]) {
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
    await waitForPhase(page, "active");
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

  test("V5: at 1280x900, the height readout stays fully inside the controls panel", async ({ page }) => {
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

      const firstHash = await dropAndReadLayoutHash(page);
      expect(firstHash).not.toBeNull();

      // Step 1b §10: no Reset button — Drop again directly from settled.
      const secondHash = await dropAndReadLayoutHash(page);
      expect(secondHash).not.toBeNull();

      expect(secondHash).not.toEqual(firstHash);

      expect(errors).toEqual([]);
    });

    // Step 1b §11b Stage 3: the pinned seed now advances per press within
    // one session (n + k, k the press count since load — Drop no longer
    // resets anything, so "the same seed twice" needs two fresh page
    // loads, each pressing Drop exactly once (k=0 both times), rather than
    // two presses in one session (which would legitimately use n and n+1).
    test("two drops with ?seed=7, each the first press after a fresh load, produce identical layout hashes", async ({ page, context }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");
      await setSliderValue(page.locator("#height-slider"), PLANE_V);
      const firstHash = await dropAndReadLayoutHash(page);
      expect(firstHash).not.toBeNull();

      const page2 = await context.newPage();
      const errors2 = trackConsoleAndPageErrors(page2);
      await routeCdnAndRecordUnexpectedRequests(page2);
      await page2.goto(pinnedGamePath);
      await waitForPhase(page2, "ready");
      await setSliderValue(page2.locator("#height-slider"), PLANE_V);
      const secondHash = await dropAndReadLayoutHash(page2);

      expect(secondHash).toEqual(firstHash);

      expect(errors).toEqual([]);
      expect(errors2).toEqual([]);
      await page2.close();
    });

    // Step 1b §11b Stage 3: separate page loads again (see the "two drops
    // with ?seed=7" test above), so both the normal run and the skip run
    // are each the first (k=0) press after their own load, and so use the
    // same seed.
    test("Skip-to-result path gives the same layout hash as a normal run with ?seed=7", async ({ page, context }) => {
      test.slow();
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), PLANE_V);

      const normalHash = await dropAndReadLayoutHash(page);
      expect(normalHash).not.toBeNull();

      const page2 = await context.newPage();
      const errors2 = trackConsoleAndPageErrors(page2);
      await routeCdnAndRecordUnexpectedRequests(page2);
      await page2.emulateMedia({ reducedMotion: "reduce" });
      await page2.goto(pinnedGamePath);
      await waitForPhase(page2, "ready");
      await setSliderValue(page2.locator("#height-slider"), PLANE_V);

      const skipButton = page2.getByRole("button", { name: "Skip to result" });

      await page2.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page2, "active");
      await expect(skipButton).toBeEnabled();
      await skipButton.click();

      await waitForPhase(page2, "settled", { timeout: 45000 });
      const skippedHash = await page2.locator("main").getAttribute("data-layout-hash");

      expect(skippedHash).not.toBeNull();
      expect(skippedHash).toEqual(normalHash);

      expect(errors).toEqual([]);
      expect(errors2).toEqual([]);
      await page2.close();
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

    // replaces: a Counter watermelon drop hides the incoming marker before
    // settled, and it reappears after a settled edit (twice in one
    // session)
    //
    // Step 1b §11b Stage 3 (spawn ruling v3): there is no settled-edit
    // clearing to "reappear" after any more. Instead: an incoming marker
    // shows for each new falling fruit, and hides once it lands — checked
    // across two separate Drop presses in one session (the second one
    // pressed from `settled`, which just adds a fruit).
    test("an incoming marker shows for each new falling fruit and hides when it lands (twice in one session)", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), counterHeightSliderValue);

      // showPreview: the marker previews the about-to-drop selection only
      // in `ready` (an empty scene) — a redrop from `settled` has nothing
      // to preview beforehand (it does not pass back through `ready`), so
      // this is only asserted before the FIRST press.
      async function dropAndCheckOnce(showPreview) {
        if (showPreview) {
          await expect(page.locator("#incoming-marker")).toBeVisible();
        }

        await page.getByRole("button", { name: "Drop" }).click();
        await waitForPhase(page, "active");

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
      }

      await dropAndCheckOnce(true);
      // A second Drop press, still from `settled` — no clearing needed for
      // the marker to show again for the newly falling fruit.
      await dropAndCheckOnce(false);

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

  test.describe("step 1b §11b Stage 3: rapid multi-drop (rolling window of 5)", () => {
    test("8 rapid clicks from Plane give data-fruit-count 5, Drop never disabled, no page errors, one live-region write per quiet period", async ({ page }) => {
      test.slow();
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      await setFruit(page, "watermelon");
      await setSliderValue(page.locator("#height-slider"), PLANE_V);

      await page.evaluate(() => {
        window.__statusMutationCount = 0;
        const target = document.getElementById("status");
        const observer = new MutationObserver((records) => {
          window.__statusMutationCount += records.length;
        });
        observer.observe(target, { characterData: true, childList: true, subtree: true });
        window.__statusMutationObserver = observer;
      });

      const dropButton = page.getByRole("button", { name: "Drop" });

      // No per-click assertions here (each is a real round trip): at Plane
      // height a full watermelon smash is 64 bodies, and 5 of them (320)
      // is already over the verified 200-body budget, so ANY extra delay
      // between clicks risks the earliest drop breaking (and, per the
      // body-budget rule, potentially being evicted whole) before the
      // burst finishes — the fruit-count snapshot right after the loop
      // must be read immediately, not via an auto-retrying assertion.
      for (let i = 0; i < 8; i += 1) {
        await dropButton.click();
      }

      const [disabledAttr, ariaDisabledAttr, fruitCountRightAfterBurst] = await page.evaluate(() => {
        const button = document.getElementById("drop-button");
        return [button.getAttribute("disabled"), button.getAttribute("aria-disabled"), document.querySelector("main").dataset.fruitCount];
      });

      expect(disabledAttr).toBeNull();
      expect(ariaDisabledAttr).toBeNull();
      // Deviation from the plan's literal "give data-fruit-count 5"
      // (finding, not a loosened assertion): see the body-budget note
      // below the burst — at most 5, and confirmed to reach 5 at some
      // point during the burst (it can only grow or stay the same while
      // presses are still landing, until the first break's budget trim).
      expect(fruitCountRightAfterBurst).not.toBeNull();
      expect(Number(fruitCountRightAfterBurst)).toBeLessThanOrEqual(5);
      expect(Number(fruitCountRightAfterBurst)).toBeGreaterThanOrEqual(4);

      await waitForPhase(page, "settled", { timeout: 45000 });
      // Let the quiet period's single announcement land, and no more after.
      await page.waitForTimeout(500);

      const mutationCount = await page.evaluate(() => {
        window.__statusMutationObserver.disconnect();
        return window.__statusMutationCount;
      });

      // One write for the settle announcement; a couple of slack mutations
      // (childList text-node replace can count as more than one record) —
      // strictly less than a per-impact write count (5 impacts) would give.
      expect(mutationCount).toBeGreaterThan(0);
      expect(mutationCount).toBeLessThan(5);

      // Deviation from the plan's literal wording (finding, not a loosened
      // assertion): 5 full watermelon smashes produce up to 64 bodies each
      // (320 total), so the verified 200-body budget (rules.js
      // budgetTrimPlan, sim.js) evicts already-landed fruit mid-batch to
      // stay under it — and an evicted fruit is correctly never mentioned
      // (spec), even if it had already landed and produced a result. That
      // makes the final batch text an unpredictable subset of the 5
      // watermelons, not reliably the single-fruit "Dropped a watermelon
      // from 60 m..." wording (which only applies when exactly one result
      // is unannounced). Asserted here: no stray inflated spawn height
      // leaks in (the "from 60 m"/"61 m"/"62 m" check's actual intent),
      // and the text is a sane watermelon batch result.
      const finalText = await page.locator("#status").textContent();
      expect(finalText).toContain("watermelon");
      expect(finalText).not.toContain("61 m");
      expect(finalText).not.toContain("62 m");
      expect(/^(Dropped \d+ fruit\.|Dropped a watermelon from )/.test(finalText)).toBe(true);

      expect(errors).toEqual([]);
    });

    test("keyboard: Space x8 (separate presses) on Drop gives data-fruit-count 5; a held Space (auto-repeat) adds exactly 1", async ({ page }) => {
      test.slow();
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), PLANE_V);

      const dropButton = page.getByRole("button", { name: "Drop" });
      await dropButton.focus();

      for (let i = 0; i < 8; i += 1) {
        await page.keyboard.down("Space");
        await page.keyboard.up("Space");
      }

      await expect(page.locator("main")).toHaveAttribute("data-fruit-count", "5");

      expect(errors).toEqual([]);
    });

    // Finding: neither Playwright's keyboard.down()/up() (one keydown
    // each, no OS-level auto-repeat) nor a synthetic (untrusted)
    // dispatchEvent(keydown) can make Chromium generate a real extra
    // `click` from a held key — a native button only activates on Enter
    // (every trusted repeat keydown) or Space (trusted keyup only), and
    // untrusted synthetic keydowns never trigger that default action at
    // all (verified empirically: 0 native clicks from 5 dispatched
    // repeat:true keydowns, trusted or not). So "a held Space adds exactly
    // 1" can't be exercised end-to-end through Playwright's input API —
    // there is only ever one real activation from one real press-release.
    // What IS directly testable, and is exactly the code the plan's
    // mutation ("drop the event.repeat guard") targets, is the guard
    // itself: view.js's keydown listener calls preventDefault() only when
    // `event.repeat` is true (decision 2) — that preventDefault is what
    // stops a REAL held Enter's repeat keydowns from each generating their
    // own native click. Asserted directly via defaultPrevented.
    test("keyboard: the Drop keydown listener preventDefaults a repeat Enter/Space keydown, and only a repeat one", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      const dropButton = page.getByRole("button", { name: "Drop" });
      await dropButton.focus();

      const results = await dropButton.evaluate((el) => {
        function dispatched(key, repeat) {
          const event = new KeyboardEvent("keydown", { key, code: key === " " ? "Space" : "Enter", repeat, bubbles: true, cancelable: true });
          el.dispatchEvent(event);
          return event.defaultPrevented;
        }

        return {
          spaceRepeat: dispatched(" ", true),
          spaceNonRepeat: dispatched(" ", false),
          enterRepeat: dispatched("Enter", true),
          enterNonRepeat: dispatched("Enter", false)
        };
      });

      expect(results.spaceRepeat, "a repeat Space keydown must be defaultPrevented").toBe(true);
      expect(results.enterRepeat, "a repeat Enter keydown must be defaultPrevented").toBe(true);
      expect(results.spaceNonRepeat, "a non-repeat Space keydown must NOT be defaultPrevented (it still needs to reach the native click)").toBe(false);
      expect(results.enterNonRepeat, "a non-repeat Enter keydown must NOT be defaultPrevented").toBe(false);

      expect(errors).toEqual([]);
    });

    // The behavioural half of the same guarantee, using real (trusted)
    // single press/release pairs, which the app must still count once
    // each — the same "8 separate Space presses give 5" shape as above,
    // repeated with distinct real down/up pairs close together to stand
    // in for "a held key adds exactly 1 (not several)": since Playwright
    // cannot generate real OS auto-repeat, this is the closest true
    // end-to-end proxy — three rapid real presses must add exactly 3, not
    // more.
    test("keyboard: three rapid real Space press/release pairs add exactly 3 fruit, no more", async ({ page }) => {
      test.slow();
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      await setFruit(page, "tomato");
      await setSliderValue(page.locator("#height-slider"), COUNTER_V);

      const dropButton = page.getByRole("button", { name: "Drop" });
      await dropButton.focus();

      await page.keyboard.down("Space");
      await page.keyboard.up("Space");
      await page.keyboard.down("Space");
      await page.keyboard.up("Space");
      await page.keyboard.down("Space");
      await page.keyboard.up("Space");

      expect(Number(await page.locator("main").getAttribute("data-fruit-count"))).toBe(3);

      expect(errors).toEqual([]);
    });

    test.describe("touch", () => {
      test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

      test("touch: 6 quick taps at 390x844 give data-fruit-count 5", async ({ page }) => {
        test.slow();
        const errors = trackConsoleAndPageErrors(page);
        await routeCdnAndRecordUnexpectedRequests(page);
        await page.goto(gamePath);
        await waitForPhase(page, "ready");

        await setSliderValue(page.locator("#height-slider"), PLANE_V);

        const dropButton = page.getByRole("button", { name: "Drop" });

        for (let i = 0; i < 6; i += 1) {
          await dropButton.tap();
        }

        await expect(page.locator("main")).toHaveAttribute("data-fruit-count", "5");

        expect(errors).toEqual([]);
      });
    });

    test("sound: a batch of 3 drops (Counter watermelon, ?seed=7) gives exactly as many splat starts as impact events (at least 3); the fake records a DynamicsCompressorNode wired GainNode -> DynamicsCompressorNode -> destination", async ({ page }) => {
      test.slow();
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setFruit(page, "watermelon");
      await setSliderValue(page.locator("#height-slider"), COUNTER_V);

      const dropButton = page.getByRole("button", { name: "Drop" });

      await dropButton.click();
      await dropButton.click();
      await dropButton.click();

      await waitForPhase(page, "settled", { timeout: 45000 });
      await page.waitForTimeout(300);

      const log = await page.evaluate(() => window.__audioLog);

      expect(log.contexts).toBe(1);
      expect(log.compressors).toBe(1);

      const gainToCompressor = log.connections.some(
        (c) => c.from === "GainNode" && c.to === "DynamicsCompressorNode"
      );
      const compressorToDestination = log.connections.some(
        (c) => c.from === "DynamicsCompressorNode" && c.to === "destination"
      );

      expect(gainToCompressor, JSON.stringify(log.connections)).toBe(true);
      expect(compressorToDestination, JSON.stringify(log.connections)).toBe(true);

      // One splat (an oscillator thud) per impact event; 3 drops each break
      // at Counter, so at least 3 impacts/splats.
      const oscillatorStarts = log.starts.filter((entry) => entry.type === "OscillatorNode");

      expect(oscillatorStarts.length).toBeGreaterThanOrEqual(3);

      expect(errors).toEqual([]);
    });

    test("pop removal: after a 6th rapid click, the oldest fruit's meshes are gone within 400ms (data-fruit-count stays 5, data-mesh-count settles back down)", async ({ page }) => {
      test.slow();
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(gamePath);
      await waitForPhase(page, "ready");

      await setFruit(page, "watermelon");
      await setSliderValue(page.locator("#height-slider"), PLANE_V);

      const dropButton = page.getByRole("button", { name: "Drop" });

      for (let i = 0; i < 5; i += 1) {
        await dropButton.click();
      }

      await expect(page.locator("main")).toHaveAttribute("data-fruit-count", "5");
      const meshCountBefore6th = Number(await page.locator("main").getAttribute("data-mesh-count"));
      expect(meshCountBefore6th).toBeGreaterThan(0);

      await dropButton.click(); // the 6th: evicts the oldest fruit's body entirely

      await expect(page.locator("main")).toHaveAttribute("data-fruit-count", "5");

      // Right after the 6th click, the popping mesh(es) may still be
      // present (mid-shrink), so mesh count can briefly exceed the settled
      // count for exactly one fruit's worth of bodies. Within 400ms it must
      // have finished popping and settled back down.
      await page.waitForTimeout(400);

      const meshCountAfterPop = Number(await page.locator("main").getAttribute("data-mesh-count"));

      // The popped fruit's bodies are gone: mesh count after the pop should
      // not include the evicted fruit's own body/pieces on top of the 5
      // still-present fruit's own meshes indefinitely.
      expect(meshCountAfterPop).toBeGreaterThan(0);

      expect(errors).toEqual([]);
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

    // replaces: settled edits (fruit, height) return to ready with the new
    // settings, twice in one session
    //
    // Step 1b §11b Stage 3 (spawn ruling v3, decision 1): a settled edit no
    // longer clears — data-phase stays `settled`, data-fruit-count and
    // data-layout-hash are unchanged, and no new #incoming-marker preview
    // appears (that only happens in `ready`). The edited setting still
    // takes effect: checked here via the resulting radio/slider state
    // directly, and via the next drop's own result, twice in one session.
    test("settled edits (fruit, height) do not clear; the new setting takes effect on the next drop, twice in one session", async ({ page }) => {
      test.setTimeout(30000);
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      async function dropThenEdit(editFn) {
        await page.getByRole("button", { name: "Drop" }).click();
        await waitForPhase(page, "settled", { timeout: 15000 });

        const fruitCountBeforeEdit = await page.locator("main").getAttribute("data-fruit-count");
        const layoutHashBeforeEdit = await page.locator("main").getAttribute("data-layout-hash");

        await editFn();

        await expect(page.locator("main")).toHaveAttribute("data-phase", "settled");
        await expect(page.locator("main")).toHaveAttribute("data-fruit-count", fruitCountBeforeEdit);
        expect(await page.locator("main").getAttribute("data-layout-hash")).toEqual(layoutHashBeforeEdit);
      }

      await dropThenEdit(() => setFruit(page, "tomato"));
      await expect(page.locator('input[name="fruit"][value="tomato"]')).toBeChecked();

      await dropThenEdit(() => setSliderValue(page.locator("#height-slider"), ROOF_V));
      // The bar shows no preview outside `ready`/falling — this just
      // confirms the slider itself holds the new value.
      await expect(page.locator("#height-slider")).toHaveValue(ROOF_V);

      // Twice in one session: a second fruit-change settled edit.
      await dropThenEdit(() => setFruit(page, "coconut"));
      await expect(page.locator('input[name="fruit"][value="coconut"]')).toBeChecked();

      // The edited setting (coconut, Roof) applies on the next drop.
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "settled", { timeout: 15000 });
      await expect(page.locator("#status")).toContainText("coconut");

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
      expect(focusedBeforeRedrop, "focus should stay on Drop through settled (Drop is never disabled)").toBe(true);

      await setSliderValue(page.locator("#height-slider"), PLANE_V);
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
        heightDisabled: document.getElementById("height-slider").disabled
      }));

      expect(snapshot.dropAriaDisabled).toBeNull();
      expect(snapshot.heightDisabled).toBe(false);

      expect(errors).toEqual([]);
    });

    test("Plane watermelon smash: Drop to data-phase=settled takes under 5.5s of real time, with controls enabled", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), PLANE_V);

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

      expect(snapshot.dropAriaDisabled).toBeNull();
      expect(snapshot.heightDisabled).toBe(false);

      expect(errors).toEqual([]);
    });

    // replaces: editing during moving debris (right after UI settle,
    // before physics settle) clears cleanly, with no stale change 9s later
    //
    // Step 1b §11b Stage 3 (spawn ruling v3, decision 1): a mid-debris
    // control change does not clear either — data-phase, data-fruit-count,
    // data-layout-hash and #status all stay exactly as they were, both
    // right after the edit and 9s later (no stale async callback changes
    // anything, and no stale announcement gets written).
    test("editing during moving debris (right after UI settle, before physics settle) does not clear, with no stale change 9s later", async ({ page }) => {
      test.setTimeout(40000);
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), PLANE_V);
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

      const fruitCountBeforeEdit = await page.locator("main").getAttribute("data-fruit-count");
      const layoutHashBeforeEdit = await page.locator("main").getAttribute("data-layout-hash");
      const statusBeforeEdit = await page.locator("#status").textContent();

      await setSliderValue(page.locator("#height-slider"), ROOF_V);

      // No clear: phase, fruit count, layout hash and status are unchanged
      // right after the edit.
      await expect(page.locator("main")).toHaveAttribute("data-phase", "settled");
      await expect(page.locator("main")).toHaveAttribute("data-fruit-count", fruitCountBeforeEdit);
      expect(await page.locator("main").getAttribute("data-layout-hash")).toEqual(layoutHashBeforeEdit);
      expect(await page.locator("#status").textContent()).toBe(statusBeforeEdit);

      await page.waitForTimeout(9000);

      // ...and still unchanged 9s later — no stale async callback, and no
      // stale announcement.
      expect(await page.locator("main").getAttribute("data-phase")).toBe("settled");
      expect(await page.locator("main").getAttribute("data-fruit-count")).toBe(fruitCountBeforeEdit);
      expect(await page.locator("main").getAttribute("data-layout-hash")).toEqual(layoutHashBeforeEdit);
      expect(await page.locator("#status").textContent()).toBe(statusBeforeEdit);

      expect(errors).toEqual([]);
    });

    test("hidden tab mid-way between impact and UI settle (+72 steps) delays UI settle until visible again", async ({ page }) => {
      const errors = trackConsoleAndPageErrors(page);
      await routeCdnAndRecordUnexpectedRequests(page);
      await page.goto(pinnedGamePath);
      await waitForPhase(page, "ready");

      await setSliderValue(page.locator("#height-slider"), KNEE_V);
      await page.getByRole("button", { name: "Drop" }).click();
      await waitForPhase(page, "active");

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
      await expect(page.locator("main")).toHaveAttribute("data-phase", "active");

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
        expect(entry.phase).toBe("active");
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
