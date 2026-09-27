# Plan: Melon Smash Lab, step 1 (drop a watermelon)

Status: APPROVED by Jose 2026-09-12; delegated to xo, who dispatches engineer and reviews
Branch: `feature/melon-smash-lab` in the primary checkout `/Users/jose/dev/jozecuervo/kidzone`
Language: **JavaScript (ES modules)**, because it is a browser runtime and this repo's
convention (package.json, node:test, Playwright). No shell scripts.
Engine decision: `docs/decisions/2026-09-12-melon-smash-lab-uses-cannon-es.md`

## Game brief

- **Title / path:** Melon Smash Lab, `projects/melon-smash-lab/`
- **Player fantasy:** "I'm a scientist finding out how high a watermelon has to fall to smash."
- **Core loop:** pick a height and a rind hardness, press Drop, watch it bounce or smash,
  read the result, reset, and change one thing.
- **Progress rule:** open-ended experiment with no win, loss, score or timer.
- **Age:** 5-11. **Mood:** bright, cartoony primitives with no gore; the "insides" are red
  flesh cubes and black seeds.

## Core invariants (tests must prove each)

1. **Phases:** `ready -> falling -> settled`. Reset from any phase returns to `ready`.
   `settled` begins when every dynamic body sleeps, or after 8 s of *simulated* time,
   whichever comes first.
2. **Controls follow phase.** The height and hardness sliders and the Drop button are
   enabled only in `ready`. Reset is always enabled. Instructions and status text are
   derived from the phase.
3. **Break rule (pure, in `rules.js`).** The melon breaks iff the impact speed along the
   contact normal is `>= breakSpeed(hardness)`. Hardness is an integer 1-10 and
   `breakSpeed` is strictly increasing. Pinned guarantees: height preset *Table* (1 m)
   never breaks at any hardness; *Plane* (60 m) always breaks at hardness <= 9; hardness
   10 at *Plane* is allowed to hold ("super rind").
4. **On break:** the whole melon body is removed and replaced by exactly 12 rind chunks,
   12 flesh cubes and 40 seeds. There are never more than 150 dynamic bodies.
   *Amended 2026-09-12 (Jose chose option C).* The original rule, "each piece inherits
   `v + ω × r`", aimed every piece into the ground. 57 of 64 spawned inside it and the
   solver erased the smash. Each piece's velocity is now:
   `v_piece = v_t − e·v_n + ω × r + burst_i`, where
   - `v_t` and `v_n` are the melon's pre-impact velocity split along the ground normal,
     and `e = 0.3` makes the downward part a partial bounce;
   - `burst_i = K · max(0, impactSpeed − breakSpeed(hardness)) · (1 ± 20% seeded
     jitter) · d_i`, where `d_i` is the unit vector from the melon centre to the piece
     with its vertical component made non-negative, and `K` is the **largest value in `(0, 0.2]`** that meets the containment rule below across
     seeds 1, 2, 3, 7 and 42. (Tuned 2026-09-12 after the xo's sweep. In `[0.2, 0.6]`
     debris landed 16-83 m out, off the close-up and off the ground. At K = 0 the bounce
     and lift alone gave energy 0.25 and 1.4 m spread.)
   So the extra energy beyond the breaking point becomes splatter.
   - **Spawn:** the piece group is lifted so no piece starts inside the ground.
   - **Pieces:** cannon-es default damping (0.01 / 0.01) and default sleep settings, a
     spin cap of 25 rad/s, and a speed cap of 40 m/s.
   - **Energy:** at Plane with hardness 1, mean piece speed 10 steps after the split is
     at least 0.25 × impact speed.
   - **Bigger hit, bigger burst:** mean initial burst speed increases with
     `impactSpeed − breakSpeed`.
   - **Containment:** every piece at `settled` is within **4 m** horizontally of the
     impact point, so debris stays inside the ~8 m impact close-up. No piece centre is
     below −0.5 m at any step after the split (landing pieces sink briefly for a step or
     two before the solver pushes them back up), and none is below −0.01 m at `settled`.
   - **Burst ordering:** Plane h1 > Crane h1 > Roof h1 (excess 28.3 > 16.1 > 8.1 m/s).
5. **On no break:** the melon stays one body and bounces. The status says the rind held.
6. **Result text** after `settled`, in an `aria-live="polite"` region, for example:
   "Dropped from 10 m. Hit the ground at 14.0 m/s. The rind cracked into 12 pieces and
   40 seeds flew out." or "...The rind held and it bounced."
7. **Determinism:** the same height, hardness and seed produce an identical result
   summary and identical body positions after N fixed steps.
8. **Reset result:** body count back to the single unbroken melon at the chosen height,
   phase `ready`, step counter 0, and no pending callbacks from the previous drop.

## Height presets (slider with named stops)

Table 1 m, Treehouse 5 m, Roof 10 m, Crane 25 m, Plane 60 m. There is no air drag; the
camera shows the fall with a height marker. Displayed speed is `sqrt(2gh)`-accurate from
the sim, not recomputed.

## Files (only these)

- `projects/melon-smash-lab/index.html`: import map (pinned URLs below), controls, a
  `<canvas>`, a status region, visible instructions, a load-failure message element,
  and a link back to Kidzone.
- `projects/melon-smash-lab/style.css`: layout with canvas on top and controls below on
  narrow screens, side by side on wide ones.
- `projects/melon-smash-lab/rules.js`: pure, with no engine or DOM. Height presets,
  `breakSpeed`, `shouldBreak`, a seeded PRNG, piece counts, `phaseAfter`, and result text
  formatting.
- `projects/melon-smash-lab/sim.js`: the only file importing `cannon-es` (bare specifier).
  `createSim({ seed, heightId, hardness })` returns `{ drop(), step(), reset(opts),
  phase, summary, bodies() }`. Fixed step of 1/60 s, sleeping enabled, no DOM, no
  three.js.
- `projects/melon-smash-lab/view.js`: the only file importing `three`. It owns the render
  loop, listeners, resize and visibility handling, and maps sim bodies to meshes. It is
  the single lifecycle owner.
- `projects/melon-smash-lab/project.json`: per `projects/PROJECT_CONTRACT.md`.
  interaction `["pointer","touch","keyboard"]`, `networkAccess:
  "declared-external-dependency"`, both URLs in `externalDependencies` with reasons,
  `storesData: false`.
- `projects/melon-smash-lab/README.md`: what it is, how to run the tests, credits (all
  geometry hand-coded; three.js MIT and cannon-es MIT, with URLs).
- `tests/melon-smash-lab-rules.test.mjs`, `tests/melon-smash-lab-sim.test.mjs`
  (node:test), `tests/melon-smash-lab.spec.mjs` (Playwright).
- `package.json` / `package-lock.json`: add devDependencies `three@0.186.0` and
  `cannon-es@0.20.0`, both exact, with no caret.
- `projects/index.json`: regenerated by `node ./scripts/update-project-index.mjs` only.

Pinned URLs (the import map names the first two; the browser fetches the third because
`three.module.js` imports `./three.core.js`; all three are declared in `project.json`):
```
https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js
https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.core.js
https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js
```
Amended 2026-09-12 (CTO), after the xo found the transitive `three.core.js` fetch. The
Playwright spec must also assert that every external request the page makes is listed
in `project.json` `runtime.externalDependencies`, because `check.mjs` only scans source
text and cannot see transitive imports.

## Runtime rules

- **Loop:** accumulator with a fixed 1/60 s step and at most 5 steps per frame; render
  after stepping.
- **Hidden tab:** on `visibilitychange` hidden, cancel the rAF. On return, reset the
  last-frame time so the gap is not simulated.
- **Reduced motion:** the sim still runs so the result is honest, but there is no camera
  shake or follow-zoom, and a "Skip to result" button steps the sim to `settled`
  synchronously. The result text is identical either way.
- **Load failure:** if either module fails to import, show "The 3D engine couldn't load.
  Check the internet connection and reload." with no blank page and no uncaught error.
- **Camera.** There are no orbit controls, since that would be another URL. Amended three
  times on 2026-09-12 at Jose's request:
  1. *"Zoom in on the drop zone so we can see the impact."*
  2. *"Also show the zoomed-out view to track vertical progression at the same time."*
  3. *"Current height is an overlay on the shot, a vertical bar on the right."*

  The third **replaces** both the follow camera and the 3D inset. **One fixed camera, and
  it never moves**, so normal and reduced motion look identical.
  - **Impact close-up.** A single fixed camera fills the canvas, about 8 m wide at
    ground level. It frames the landing spot with the melon visible when it is 1 m up.
  - **Height bar** (the zoomed-out view). A DOM/CSS overlay on the right edge of the
    shot, `aria-hidden="true"`:
    - a vertical track from the ground (bottom) to the chosen height (top);
    - named tick marks for each preset at or below the chosen height;
    - a small melon marker at the current height, with a metres label beside it.
    - It writes to the DOM only when the rounded label or the marker position (to 0.5%
      of the track) changes, never on every frame.
  - **Blob shadow** under the melon: a flat mesh with a radial gradient drawn to a
    CanvasTexture in code. It grows and darkens as the melon nears the ground.
  - **Pure functions in `rules.js`:**
    - `impactViewFor({ width, height })` returns `{ position, target, fov }`, recomputed
      only on resize;
    - `heightBarFor({ melonY, heightM })` returns `{ fraction, label, ticks }`, where
      fraction is 1 at the drop height and 0 at the ground, clamped to [0, 1].
  - **No new URLs and no image files.** The bar never writes to the live status region.
- **Test hooks:** `data-phase` and `data-steps` attributes on `<main>`, and nothing on
  `window`.

## Tests

**`tests/melon-smash-lab-rules.test.mjs`**
- `breakSpeed` is strictly increasing over 1-10.
- `shouldBreak` holds at exactly the threshold, breaks just above it, and holds just below.
- Result text for break and no-break matches the invariant 6 wording and counts.
- A test reading `package.json` and `projects/melon-smash-lab/project.json` asserts the
  devDependency versions equal the versions in the CDN URLs.

**`tests/melon-smash-lab-sim.test.mjs`** (real cannon-es from node_modules)
- Table at every hardness 1-10: after settle, exactly 1 dynamic body and `broke === false`.
- Plane at hardness 1 and 9: `broke === true` and body count equals 12 + 12 + 40.
- Right after the split, each chunk's velocity is within 5% of `v + ω × r` from the
  pre-impact state.
- The same seed and settings run twice give deep-equal summaries and positions after
  300 steps.
- `drop -> reset -> drop -> reset` in one sim: each reset yields phase `ready`, 1 body and
  0 steps, and the second drop's summary equals the first.
- `drop()` outside `ready` is a no-op.

**`tests/melon-smash-lab.spec.mjs`** (Playwright; `page.route` serves both CDN URLs from
node_modules so no network is needed)
- **Keyboard only:** Tab to the height slider and use arrows to pick Plane; Tab to
  hardness; press Space on Drop. Sliders become disabled while falling, and the status
  reaches the break text. Repeat with Enter on Drop after Reset.
- **Pointer:** click Drop at Table height; the result says the rind held.
- **Touch:** in a `hasTouch` 390x844 context, tap the controls; the drop completes and the
  controls are visible without scrolling the canvas out of view.
- **Twice in one session:** `drop -> settle -> reset -> drop -> settle -> reset`; both
  result texts match and phase and steps return to `ready`/`0`.
- **Reset mid-fall:** press Reset while `falling`; phase goes to `ready`, and no stale
  status text appears later (wait 2 s and assert it is unchanged).
- **Hidden tab:** mid-fall, dispatch visibility hidden (override `document.hidden` and
  fire the event). `data-steps` does not advance for 1 s, then resumes after visible.
- **Blur:** fire `blur` mid-fall; there is no crash and the drop still settles. There are
  no held inputs in step 1, so assert that no control is stuck.
- **Reduced motion:** `emulateMedia({ reducedMotion: 'reduce' })`; "Skip to result" gives
  the same result text as a normal run with the same settings.
- **Load failure:** abort the cannon-es route; the failure message is visible and there
  are no page errors.
- **Every test:** zero `pageerror` and zero console errors.

## Commands the worker must run and paste output from

```
node --test tests/melon-smash-lab-rules.test.mjs tests/melon-smash-lab-sim.test.mjs
npx playwright test tests/melon-smash-lab.spec.mjs
node ./scripts/update-project-index.mjs
node ./scripts/check.mjs
git status --short
```
Also measure frame cost once: the Playwright mobile context plus CDP 4x CPU throttle on
the Plane break scene, reporting average and p95 of (step + render) ms per frame.

## Boundaries

- Touch only the files listed above. Do not edit other projects, `scripts/`,
  `server.mjs`, `playwright.config.mjs`, `docs/PATTERNS.md` or the landing page.
- No catapult, targets, fillings or shell types. Those are steps 2-4.
- No extra CDN URLs: no OrbitControls, fonts or textures. Materials are flat colours.
- No audio, storage, analytics or network calls beyond the two modules.
- No git commit, push, branch or stash.

## Stop conditions (stop and report; do not work around)

- Step + render p95 above 16 ms at 4x throttle on the break scene: report numbers, do not
  cut piece counts on your own.
- Invariant 3's pinned guarantees cannot all hold with a strictly increasing
  `breakSpeed`: report the measured impact speeds per height and hardness.
- A declared interaction cannot be exercised by a real test: report it; do not remove it
  from `project.json` or fake the test.
- `check.mjs` or the index script fails because of another project: report it, and do not
  touch that project.
- A determinism test fails: report it with the diff; do not loosen it to a tolerance.

## Report back

1. The file list with one line each.
2. Every command above, with its pass/fail output.
3. Each invariant 1-8 mapped to the test(s) that prove it.
4. The frame-cost numbers.
5. What was verified in a real browser versus emulated, and untested device risk
   (e.g. real iOS Safari, low-end Android).
