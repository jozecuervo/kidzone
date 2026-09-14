# Plan: Melon Smash Lab, step 1b (realistic breaking, fruit chunks, fruit selector)

Status: QUEUED. Dispatch to xo after the CTO reviews the running task (spawn test plus
height bar).
Builds on: `docs/plans/2026-09-12-melon-smash-lab-step-1.md`. That plan's invariants hold
except where this file replaces them.
Branch: `feature/melon-smash-lab`, primary checkout. Language: JavaScript (ES modules).

## Why (Jose, 2026-09-12)

> "All the watermelon red pieces are cubes, and it takes at least 10 m drop to smash.
> Unrealistic (1 m drop from a kitchen counter will crack a watermelon). We need more
> fruit too. Add a fruit selector."

## 0. Rename to Splat Lab (do this first, as its own verified step)

Jose picked the name on 2026-09-12. The project is unpublished and uncommitted, so the
rename is free now. The CTO has already renamed the branch to `feature/splat-lab`.

- **Folder:** `projects/melon-smash-lab/` becomes `projects/splat-lab/`. Use plain `mv`;
  the files are untracked, so no git commands.
- **Tests:** `tests/melon-smash-lab-rules.test.mjs`, `-sim.test.mjs` and `.spec.mjs`
  become `tests/splat-lab-*`. Update their import paths and `gamePath`.
- **Metadata:** `project.json` gets title "Splat Lab", with the summary and description
  about dropping fruit to see what splats. `index.html` gets the `<title>` and `<h1>`,
  and `README.md` its heading.
- **Code:** replace every remaining `melon-smash-lab` or "Melon Smash Lab" string in
  project code and tests. Keep "watermelon" wherever it means the fruit.
- **Index:** regenerate `projects/index.json` with the index script.
- **Verify before §1:** all node tests, Playwright and `check.mjs` pass unchanged, and
  `grep -ri "melon-smash\|melon smash" projects tests` returns nothing.
- **Leave alone:** docs file names under `docs/plans/` and `docs/decisions/`. Those are
  dated history.

All later sections of this plan use the new paths: read `projects/melon-smash-lab/` as
`projects/splat-lab/`, and `tests/melon-smash-lab*` as `tests/splat-lab*`.

## 1. Fruit selector

A native radio group (keyboard: arrows; enabled only in `ready`) with five fruits. Their
breaking points span the height presets, so the experiment "which fruit survives from
where?" has a real answer for every fruit. All numbers are **playful approximations**, and
the README says so.

| Fruit | Radius | Mass | Break speed at normal toughness | About the same as a drop of | Outer / inner / seeds |
|---|---|---|---|---|---|
| Tomato | 0.035 m | 0.15 kg | 2.0 m/s | 0.2 m | red skin shreds / pulp blobs / many small yellow seeds |
| Watermelon (default) | 0.15 m | 6 kg | 3.5 m/s | 0.6 m | green rind shell pieces / red flesh chunks / black seeds |
| Apple | 0.04 m | 0.2 kg | 6.3 m/s | 2 m | red skin plus white wedges / few seeds |
| Orange | 0.04 m | 0.2 kg | 8.5 m/s | 3.7 m | peel shell pieces / segment wedges / few seeds |
| Coconut | 0.10 m | 1.5 kg | 18.5 m/s | 17 m | brown shell pieces / white flesh chunks / no seeds |

**Height presets become** Knee 0.3 m, Counter 1 m (renamed from Table), Treehouse 5 m,
Roof 10 m, Crane 25 m and Plane 60 m. The Knee preset is new, so kids can find a height
where a watermelon *doesn't* crack.

## 2. Toughness replaces hardness (invariant 3 replaced)

- The slider keeps the range 1-10, is labelled "Toughness" with the ends marked
  "squishy" and "super tough", and **defaults to 5 = the real fruit**.
- `breakSpeed(fruit, t) = fruit.breakSpeed × m(t)`, where `m` is geometric and strictly
  increasing, with `m(1) = 0.4`, `m(5) = 1.0` and `m(10) = 4.0`.
- **Margin rule (tested):** at t = 5, no preset's impact speed (`sqrt(2gh)`) is within
  10% of any fruit's break speed. That keeps every pinned guarantee below well clear of a
  borderline.
- **Pinned guarantees at t = 5** (sim tests, measured impact speed):
  - Watermelon: holds from Knee, cracks from Counter.
  - Tomato: cracks from Knee.
  - Apple: holds from Counter, breaks from Treehouse.
  - Orange: holds from Counter, breaks from Treehouse.
  - Coconut: holds from Roof, breaks from Crane.

## 3. How badly it breaks (invariant 4 counts replaced)

`severity = impactSpeed / breakSpeed(fruit, t)`.

| Severity | Result wording | Pieces, as a share of the fruit's smash counts |
|---|---|---|
| < 1 | "held" | 1 body, and it bounces |
| 1 to < 1.6 | "cracked" | 25% (rounded, at least 2 outer pieces) |
| 1.6 to < 3 | "split" | 50% |
| ≥ 3 | "smashed" | 100% |

- **Watermelon smash counts:** 12 outer, 12 inner, 40 seeds (unchanged). Each other fruit
  sets its own counts, with at most 64 pieces.
- **The body cap stays at 150.**
- **The velocity rule stays** as in step 1's invariant 4 (bounce plus lift plus burst),
  but the burst scales with fruit size: `K_fruit = K × (fruit.radius / 0.15)`.
- **Result text** names the fruit and the tier, for example "Dropped a watermelon from
  1 m. Hit the ground at 4.4 m/s. It cracked into 3 pieces and 10 seeds fell out."

## 4. Real chunk shapes (no cubes)

Physics shapes stay simple for speed and determinism: spheres for inner chunks and seeds,
and boxes or spheres for outer pieces. **Only the rendered meshes change.**

- **Inner chunks:** `chunkShape(seed)` in `rules.js`, a pure function. It takes an
  icosahedron's 12 vertices, scales each radially by a seeded factor in [0.7, 1.3], and
  the result is rendered as a flat-shaded convex hull. Watermelon flesh is red with a
  lighter core; tomato pulp is glossy red; coconut is white; orange is a segment wedge;
  apple is a white wedge with a red skin face.
- **Outer pieces:** `shellPiece(seed, fruit)` in `rules.js`. It is a curved patch of the
  sphere shell between seeded latitude and longitude bounds, with an outer colour, an
  inner colour, and a thickness per fruit (watermelon is green outside and white-then-red
  inside).
- **Seeds:** small ellipsoids, black for watermelon.
- **Unbroken fruit:** a sphere with fruit colours. The watermelon gets stripes from a
  code-drawn CanvasTexture, the orange a dimpled colour, and the coconut a fibrous brown.
  No image files and no new URLs.

## 5. Camera framing per fruit (updates `impactViewFor`)

`impactViewFor({ width, height, fruit })` frames each fruit so that:
- the fruit at rest is at least 8% of the view width, and
- the containment radius (below) fits inside the view, and
- the vertical field of view is **at most 75°** at every aspect ratio. Step 1 used a 118.6°
  field of view in portrait to hold the width. Move the camera back or up instead, and
  add a unit test for this limit at 390x844.

**Height bar fix (from step 1 review):** at `settled`, the moving metres label overlaps
the bottom tick name ("Tab'e 0 m"). Extend the collision rule to cover the moving label:
a tick name within one label height of the label hides while the label is there. Add a
Playwright assertion that the label's box and every visible tick name's box never
intersect, checked at ready, mid-fall and settled, at both sizes.

The height bar is unchanged.

## 6. Re-tune (xo, before dispatch)

The toughness multiplier moves watermelon t = 1 from break speed 6 to 1.4 m/s. The
excess at Plane grows, so K = 0.04 no longer meets containment by construction.

**Superseded on 2026-09-12 by the CTO ruling below.** The original bars could not be met
by any K. The absolute energy bar (≥ 0.25 × impact) demanded pieces flying about 1.8 s,
which is unrealistic and throws small-fruit debris out of an 8%-framed shot. Both bars
were the CTO's own proxies, not Jose's requirements; his requirement is realism.

**Ruling (replaces the bars below):**
- **Framing:** keep the 8% fruit-size rule and the 75° field-of-view cap. The fruit
  stays clearly visible.
- **Sweep** `e ∈ {0.10, 0.15, 0.20, 0.30}` × `K ∈ {0, 0.005, 0.01, 0.02}`.
- **Energy guard, now relative:** mean piece speed at +10 steps must be ≥ 2× the dead
  control. The dead control is the same fruit and seed with K = 0, e = 0 and no lift.
  Check watermelon and tomato at Plane t = 1. The stop line is below 2.2× on any seed.
  This guards the actual regression (a smash killed by the ground), not a spectacle
  target.
- **Containment:** at `settled`, ≥ 90% of pieces are within 50% of that fruit's
  impact-view width from the impact point, and 100% within 1.0× the view width. Check
  all five fruits × five seeds at Plane t = 1. A few stragglers leaving the shot at the
  most extreme setting are allowed.
- **Correction (same day, from the xo's grid):** the dead control is K = 0, e = 0 **with
  lift**. With no lift, buried pieces are ejected by the solver, so that control isn't
  dead, and it penalised the tomato most. Removing the lift is guarded by the spawn test,
  not by the energy guard. **Chosen: e = 0.3, K = 0.01.** The guard passes at ≥ 9×
  (watermelon) and ≥ 85× (tomato), and containment passes for all five fruits.
- **Choose** the largest e, then the largest K, that meets both.
- **Stop** if none does, and report the grid.

**Original bars (kept for history):** sweep K over (0, 0.2] against:
- **Containment:** every settled piece within 45% of that fruit's impact-view ground
  width of the impact point, for all five fruits at Plane t = 1, seeds 1, 2, 3, 7 and 42.
- **Energy:** ≥ 0.25 × impact at +10 steps, watermelon Plane t = 1.
- **Stop if** the chosen K gives energy below 0.26 on any seed. The same rule as before;
  do not change `e` on your own.

## 7. Variation per drop, and a smooth height slider (Jose, 2026-09-12)

> "The results are deterministic. We need the slightest randomization or variance.
> Perhaps a tiny rotation as the fruit is released. Also, the height slider should not
> be stepped."

**Variation: a fresh seed for every drop, and determinism kept for tests.**
- **Where the seed comes from:** every Drop draws a new 32-bit seed from
  `crypto.getRandomValues` in `view.js`. That is the only non-seeded randomness in the
  project. `sim.js` and `rules.js` stay purely seeded.
- **Pinned seed:** `?seed=<n>` in the page URL pins the seed for every drop, for
  debugging, Playwright and screenshots. Existing Playwright tests that compare two runs
  use it.
- **Release wobble, from the seed:**
  - a tilt of ±8° about a random horizontal axis;
  - a spin of 0-1.5 rad/s about a random axis;
  - a horizontal velocity of 0-0.05 m/s in a random direction.

  These are small enough that the fruit still lands in the shot, and the pieces'
  splatter jitter already differs with the seed.
- **Guarantees must hold for any seed.** Every pinned guarantee in §2, the tier sequence,
  containment and the energy guard run over **20 seeds** (1-20) instead of five. Report
  if a guarantee flips on any seed; do not widen the margin on your own.
- **Visible variety test:** in node, two drops at the same fruit, height and toughness
  with different seeds give different settled piece positions. With the same seed they
  are deep-equal.
- **Playwright:** two unpinned drops in one session produce different piece layouts,
  compared through a `data-layout-hash` attribute on `<main>`, set at settled. Two drops
  with `?seed=7` produce identical hashes.
- **Mutation:** make `view.js` reuse the same seed for every drop. The unpinned
  Playwright test must fail.

**Height slider: continuous, not stepped.**
- **Range and mapping:** 0.3-60 m, log-scaled. The native `<input type="range">` runs
  over 0-1000 with step 1, and `heightFromSlider(v) = 0.3 × 200^(v/1000)`. Arrow keys move
  0.1% of the track and PageUp/PageDown move 10%, which is native range behaviour. There
  is no snapping.
- **Landmarks:** the named heights (Knee, Counter, Treehouse, Roof, Crane, Plane) show
  as `<datalist>` tick marks. The visible label is the height in metres (one decimal
  below 10 m, whole metres from 10 m) plus the nearest landmark when within 10%, for
  example "9.6 m (about Roof)".
- **Sim input:** it takes `heightM`, a number, instead of `heightId`. Result text uses the
  rounded metres. The height bar's ticks show the landmarks at or below the chosen
  height.
- **Guarantee tests** call the sim with the exact landmark heights. The margin rule in
  §2 applies to the landmarks only. Heights near a threshold are the experiment, not a
  defect.
- **Unit tests:**
  - `heightFromSlider(0) = 0.3` and `heightFromSlider(1000) = 60` within 1e-9;
  - strictly increasing;
  - `sliderFromHeight` inverts it within 1 slider unit;
  - label rounding and the "about" rule.
- **Playwright:**
  - by keyboard, ArrowRight ×10 from the start changes the label to a height between 0.3
    and 0.5 m (not the next landmark);
  - by pointer, a drag to mid-track gives a height near `heightFromSlider(500)` ≈ 4.2 m,
    ±10%;
  - by touch, the same on 390x844;
  - a drop at an arbitrary height, for example 7.3 m, reports "7.3 m" in the result.
- **Mutation:** set `step="100"` on the slider. The ArrowRight test must fail.

## 8. Visual pass (CTO screenshot review, 2026-09-12)

The screenshots show that the "close-up" isn't close. A Counter watermelon crack is a
dozen specks on a field of brown, and a Plane smash is dots. Jose's ask was "zoom in on
the drop zone so we can see the impact", and this misses it. The 8% framing rule was the
CTO's proxy and was too weak.

**Camera**
- **Angle:** a low three-quarter view, 20-30° above the ground, looking at the impact
  point. The horizon may be visible, but ground fills at least 60% of the frame.
- **Distance:** scaled per fruit, so the **unbroken fruit's diameter is about 25% of the
  view width** (tested within 20-30%) at 390x844 and 1280x900. The 75° field-of-view cap
  stays.
- **Separate from containment:** framing is no longer tied to containment. The
  containment and energy tests keep their current numbers, restated in fruit radii
  (0.5W = 12.5R, W = 25R) and asserted on physics, not on the view. At the extreme
  settings (Plane, squishy) debris is allowed to leave the shot; the impact is what must
  be visible.

**Height bar**
- **Size:** a slim track of 16-20 px, no longer the pill that covers about 15% of the
  canvas. The earlier 44 px minimum is withdrawn, since the bar isn't interactive.
- **Scale:** the same log scale as the slider (`sliderFromHeight`), so landmark ticks
  spread out instead of bunching at the bottom.
- **Stray pink dot:** the 390x844 Plane screenshot shows a pink dot in the middle of the
  bar. Find it and remove it. If it's a debris mesh rendered over the bar, say so.
- **Labels:** landmark labels sit inside the canvas edge and never overlap the moving
  label (the existing test).

**Slider ticks:** remove the `<datalist>`. Chromium snaps a drag to the nearest option,
which is stepping, and Jose ruled that out. Draw the landmark ticks under the slider as
decorative CSS marks with no snapping. Restore the plan's mid-track drag test: a drag to
500 gives about 4.2 m ±10%, by pointer and by touch.

**Tests**
- A unit test checks the fruit's on-screen diameter fraction for every fruit at both
  sizes, using pinhole maths.
- Playwright checks the bar track is at most 20 px wide and that no `datalist` is
  present.
- The mid-track drag test is restored.

**Mutations**
- Put the `datalist` back: the drag test must fail.
- Use the old 25R framing: the diameter-fraction test must fail.

**Screenshots,** same set as before, plus the unbroken fruit in `ready` for each fruit
at 390x844.

## 9. Show what's coming (CTO screenshot review of §8, 2026-09-12)

The close-up now reads well at impact, but in `ready` and during most of the fall the shot
is an empty brown field with a shadow. The hanging fruit is above the frame, as expected
for a close camera, and the height bar's marker is a green ball whatever the fruit.

- **"Incoming" marker (option c).**
  - **What it is:** a small DOM overlay at the top edge of the canvas, directly above the
    impact point: a down-arrow, a fruit-coloured circle, and the distance above the frame
    edge in metres.
  - **When it shows:** in `ready` and `falling` while the fruit's projected position is
    above the frame. It hides the moment any part of the fruit enters the frame, and
    shows again on reset.
  - **Other rules:** `aria-hidden`. It writes only when its rounded label changes, sharing
    the bar's write discipline. No camera motion.
- **Fruit-coloured markers.** The height bar's marker and the incoming circle use the
  selected fruit's skin colour (tomato red, watermelon green, apple red, orange orange,
  coconut brown), and they update when the fruit changes in `ready`.
- **Ground that reads as ground.** Add a subtle, code-drawn CanvasTexture: a faint tile
  or soil speckle, repeated at a scale tied to fruit radius so the close-up shows size
  and depth. Keep the palette. No image files.
- **Tests:**
  - **Pure `incomingFor({ fruitY, fruitRadius, view })`:** it is visible exactly when the
    fruit's top projection is above the frame, and the label is correct.
  - **Playwright, ready and hidden:** in `ready`, the incoming marker is visible for every
    fruit at Counter. During a Counter watermelon drop it becomes hidden before `settled`.
  - **Playwright, reset:** it reappears after reset. Run that sequence twice.
  - **Playwright, colour:** the marker colour matches the fruit (read the CSS custom
    property) for two different fruits.
  - **Playwright, writes:** the marker's write count during a Plane drop is under 150.
- **Mutations:**
  - Never hide the marker: the hidden-before-settled test must fail.
  - Hard-code green: the colour test must fail.
- **Screenshots:** `ready` for every fruit at 390x844, a mid-fall watermelon at Roof, and
  the Counter crack settled. Replace the old set.

## 10. No Reset button, a synthesized splat, one height on screen (Jose, 2026-09-13)

> "After the drop, we shouldn't have to hit reset to start fiddling with the controls
> again. The reset button doesn't serve a purpose at that point. We should have some
> sound when the fruit hits. I don't wanna download wave files, just generate a
> plausible splat noise."

**Controls live again after the drop; the Reset button is removed.**
- **Phases** stay `ready`, `falling` and `settled`.
- **Control availability:** fruit, height, toughness and Drop are enabled in `ready`
  **and** `settled`, and disabled only while `falling`, which lasts at most about 3.5 s.
- **In `settled`:**
  - Changing any control clears the debris and returns to `ready` with the new settings,
    showing the incoming marker and updating the bar.
  - Pressing Drop clears the debris and drops at once with a fresh seed, which counts as
    one action.
  - The result text stays until the next state change.
- **Lifecycle:** clearing from `settled` owns everything the old reset owned. It disposes
  the pieces, invalidates stale callbacks and resets the step counter.
- **Focus:** it stays on the control the user touched. After Drop is pressed in
  `settled`, focus stays on Drop so Space and Space again repeat drops.
- **Tests (replacing the Reset-button tests; none loosened):**
  - **Settled edits:** in `settled`, changing fruit, height or toughness returns to `ready`
    with 1 body, 0 steps and the new settings. Run it twice in one session.
  - **Keyboard redrop:** in `settled`, pressing Space on Drop produces a new drop, and
    its result arrives with no stale text from the previous one.
  - **No Reset button:** there is no Reset button in the DOM.
  - **Controls disabled while falling:** held from D3.
  - **Sim-level reset:** keep the invariant-8 test. Clearing in the sim is still
    `reset()`.
- **Mutation:** leave the controls disabled in `settled`. The settled-edit test must fail.

**Amendment (CTO, same day, option A from the xo's measurement).** `falling` actually
lasted 8 s on every scene, because the physics settle hits the 480-step limit, so the
controls were locked 8 s. The UI no longer waits for physics:
- **Two phases, two layers.** The UI phase (`data-phase`) is `ready`, `falling` or
  `settled`. The sim keeps its own physics phase and its 480-step limit, unchanged.
  Containment and energy tests still step to the physics end.
- **UI `settled` begins exactly 72 simulation steps (1.2 s) after the impact step.** It is
  counted in steps, not with `setTimeout`, so a hidden tab pauses it and it is
  deterministic. The result text and live controls arrive then.
- **Debris keeps moving.** Pieces keep simulating and rendering in UI `settled` until
  they sleep or hit the 480-step limit. The loop then stops stepping. Any control edit
  or Drop clears them as specified above.
- **Invariant 1 wording:** the old text "`settled` = all bodies asleep or 8 s" now
  describes the **physics** phase only.
- **Tests:**
  - **Timing, unit/sim:** UI settle happens at impact step + 72 for a held fruit and for
    a smash.
  - **Timing, Playwright:** from Drop, a Counter watermelon reaches `data-phase=settled`
    in under 2.5 s of real time, and a Plane smash in under 5.5 s, with the controls
    enabled.
  - **Edit while debris moves:** in UI `settled`, before the physics end, a control edit
    clears to `ready` with 1 body. No stale callback later changes the phase or text
    (wait 9 s and assert unchanged).
  - **Hidden tab:** hiding the tab between impact and impact + 72 delays the UI settle
    by the hidden time.
- **Mutation:** gate UI `settled` on the physics end again. The Counter under-2.5 s test
  must fail.

**Splat sound, synthesized with Web Audio, no files.**
- **Pure parameters:** `splatSoundFor({ fruit, severity, impactSpeed })` in `rules.js`
  returns plain numbers: noise-burst duration, low-pass cutoff, gain (clamped ≤ 0.6),
  thud pitch and thud gain, and a "crack" click gain for hard shells.
- **Character by fruit and result:**
  - **Held:** a short dull thud, with no noise.
  - **Soft fruit (tomato, watermelon flesh):** a wet noise burst with a falling cutoff.
  - **Coconut:** a sharp click plus a thud.
  - **Bigger severity:** louder and longer, within the clamps.
- **Synthesis in `view.js`:** a white-noise `AudioBuffer` generated in code, through a
  `BiquadFilter` with a cutoff sweep and a `GainNode` envelope, plus an
  `OscillatorNode` thud. It plays once per drop at the impact step.
- **Autoplay rules:** create or resume the `AudioContext` only inside the Drop click or
  key handler. Never create one on page load.
- **Lifecycle:** one context is reused. Every node is disconnected when it ends, and
  nothing plays while the tab is hidden, because the sim is paused then.
- **Sound toggle:** a visible button, `aria-pressed`, default on, not persisted, and
  enabled in every phase.
- **No Web Audio:** if `AudioContext` is missing or throws, the toy works silently with
  no console errors.
- **`project.json`:** the safety notes mention the generated sound and the sound toggle.
  There is no new interaction type and no network.
- **Tests:**
  - **Unit:** gain ≤ 0.6 everywhere. Duration and gain don't decrease as severity rises
    for a fruit. Held has zero noise gain. Coconut has crack gain above 0, and tomato
    has 0.
  - **Playwright** (with an init script that wraps `AudioContext` and records node
    creation and `start` calls):
    - no context exists before the first Drop;
    - one Counter watermelon drop gives exactly one splat `start` burst at impact;
    - with sound toggled off, a drop gives zero starts;
    - with `AudioContext` deleted, a full drop gives zero page errors and the correct
      result text;
    - the toggle works by keyboard, and its `aria-pressed` flips.
- **Mutation:** create the `AudioContext` at module load. The no-context-before-Drop test
  must fail.

**One height on screen.** Remove the metres label from the incoming marker; it keeps the
arrow and the fruit-coloured dot. The height bar is the only height readout. Update the
incoming tests to match. Ground-texture seams: leave as is.

## 11. Remove toughness; rapid Drop puts up to 5 fruit in the air (Jose, 2026-09-14)

> "Remove it [the toughness slider]. And make it so I fast click the drop button to
> deploy multiple fruit at once, up to 5."

### 11a. Toughness removed

- **Controls:** remove the slider, its label, its tests and `m(t)`. Every fruit uses its
  real break speed (the old t = 5). `breakSpeedFor(fruit)` takes no toughness argument.
- **Guarantees:** the §2 guarantees stand unchanged, since they were already written at
  t = 5. Tests that used t = 1 (containment, energy guard, burst ordering) move to real
  toughness.
  - **Burst ordering:** needs three breaking cases with strictly ordered excess. Use
    watermelon at Plane, Crane and Roof.
  - **Containment and energy:** re-measured at Plane with real toughness, keeping
    e = 0.3 and K = 0.01. The worst case is milder than t = 1, so no re-tune is expected.
    **Stop** if the energy guard falls below 2.2× on any seed.
- **Copy:** result text, instructions, README, `project.json` summary and the PR
  description drop every mention of toughness.

### 11b. A batch of up to 5 fruit

**Model.**
- **Batch:** every fruit in the scene since the last clear. At most 5.
- **Each Drop press adds one fruit** with the current fruit, current height and a fresh
  seed. Each fruit has its own impact, break check, tier, pieces and splat.
- **Spawn spread:** each fruit spawns at a seeded horizontal offset. The first is at the
  centre; later ones are placed within 35% of the view half-width, at least 2.5 fruit
  diameters from every other fruit in the batch, with seeded retries. Impacts stay
  visible and fruit don't stack in the air.
- **Spawn ruling v3, the current one (Jose, 2026-09-14: "That's silly. Spheres won't
  'stack' in nature. They roll off each other right away. Just delete the oldest fruit
  (or its pieces) as the newest fruit is dropped. Make it work. Make it fun!").** It
  **replaces v2's queue, stacking, backstop, 5-fruit block, `aria-disabled` note and
  batch clear.** v2's every-contact break check and the same-drop-zone rule stay.
  - **Drop always works, instantly.** No queue, no waiting, no disabled state, no max
    note. Fruit and height are enabled in every phase and never clear anything.
  - **Rolling window of 5.** The scene holds at most 5 fruit. Dropping a 6th removes the
    **oldest** fruit entirely: its unbroken body, or every piece it broke into, plus its
    markers and pending bookkeeping. A fruit removed before it lands produces no splat
    and no result.
  - **Body budget of 200.** If a break would push the total over 200, remove the oldest
    fruit, repeating as needed but never the breaking fruit itself. Only then trim that
    fruit's seeds and inner chunks, keeping at least 2 outer pieces.
  - **Spawn never overlaps.** The new fruit's spawn is the centre at its chosen height.
    - **Falling fruit in the way** (rapid clicks): raise the spawn to just above the
      highest overlapping falling fruit, at `y + Rother + Rnew + 0.02`. Falling fruit
      accelerate equally, so the stream keeps its gaps.
    - **Landed bodies in the way** (a low drop onto a pile): remove those bodies first,
      whole fruit if unbroken, individual pieces if broken.
    - A pure `spawnPlanFor(...)` in `rules.js` returns `{ y, removeIds }`.
  - **Removal looks like a pop:** a 150 ms shrink to zero, cosmetic only, since the
    physics bodies are removed at once. With reduced motion it is instant.
  - **Phases** are for status and announcements only:
    - `ready`: empty scene.
    - `active`: anything falling, or an impact under 72 steps ago.
    - `settled`: quiet, meaning nothing falling and 72 steps since the last impact.
  - **Result text:** on entering `settled`, announce the fruit that landed since the last
    announcement, once, using `batchResultText`. The same single-fruit wording applies
    for one fruit. Removed fruit are never mentioned.
  - **Sound:** one splat per impact, through the master gain and compressor.
  - **Camera and markers:** `Rmax` framing covers the fruit currently in the scene, with
    the same instant snap. Incoming and bar markers are shown per falling fruit.
  - **Determinism:** the same sequence of `(step, fruit, heightM, seed)` gives identical
    results.
  - **Tests** (replacing v2's):
    - **Rolling window:** 6 scripted drops. After the 6th spawns, the oldest fruit's
      body IDs are all gone, the fruit count is 5, and it never appears in any result.
    - **Removed before landing:** a fruit removed mid-air produces no splat start and no
      result.
    - **Rapid clicks:** 5 presses in 5 consecutive steps give no body overlap at any
      spawn, strictly increasing spawn heights, and an impact for each.
    - **Low drop onto a pile:** a watermelon at Knee over a resting watermelon. The
      overlapping landed bodies are removed, the new fruit spawns at 0.3 m + R, lands,
      and gets a result.
    - **Held then smashed:** carried over from v2. A Knee watermelon later struck by a
      Plane coconut ends in a broken tier.
    - **Fuzz:** seeds 1-20, each a script of 40 random presses (random fruit, full
      height range, random gaps of 0-30 steps). At every step there are at most 5 fruit,
      at most 200 bodies, finite values, and no overlap at spawn. It reaches `settled`
      within 600 steps of the last press. Determinism holds over two runs.
    - **Playwright:**
      - 8 rapid clicks give `data-fruit-count` 5, and Drop is never disabled.
      - The live region is written once per quiet period.
      - No page errors.
      - Space ×8 on Drop gives the same result.
      - Touch: 6 quick taps.
  - **Mutations:**
    - Skip removal of the oldest fruit: the rolling-window test must fail.
    - Skip spawn raising: the rapid-click overlap test must fail.
    - Skip removal of landed blockers: the low-drop test must fail.
    - Check first contact only: the held-then-smashed test must fail.
  - **Stop:** frame-cost p95 above 16 ms at 4x throttle on 5 watermelons clicked rapidly
    from Plane. Keep the naive broadphase; SAP needs a CTO ruling.
- ~~**Spawn ruling v2 (Jose, 2026-09-14: "That's no fun. I want to aim all the fruit at
  the same drop zone.")** This **replaces both** the spread rule and the fixed-slot ruling
  below, which is kept struck for history. Every fruit drops at the same point, and
  pile-ups are the point.
  - **Same spot:** every fruit spawns at the centre of the drop zone. §7's release
    wobble goes back to its original absolute values, with no size scaling.
  - **Spawn queue.** A Drop press never spawns a body overlapping another body. If
    anything is within `Rnew + Rother + 0.02 m` of the spawn point, the new fruit waits
    in a queue and releases on the first step the space is clear.
    - The queue counts toward the 5-fruit limit, and releases in press order.
    - Waiting is counted in steps, so it is deterministic and a hidden tab pauses it.
    - Five fast clicks therefore release as a quick stream, about 0.25 s apart for
      watermelons.
    - Clearing empties the queue.
  - **No soft-lock (CTO, from the xo's finding).** With the plain queue, a fruit resting
    at the centre blocks every drop below `2·Rrest + 0.02` (0.32 m for a watermelon), and
    the batch never settles. The fix is option A plus a hard backstop:
    - **Stack over a resting blocker.** If a queued fruit is still blocked after 30 steps
      and every blocking body is asleep or slower than 0.1 m/s, release it at the centre
      directly above the highest blocker, at `blocker.y + Rblocker + Rnew + 0.02`. The
      result text and the height bar use that actual release height above the ground.
    - **Backstop.** A queued fruit still unreleased after 240 steps (4 s) is dropped from
      the queue, with the visible note "No room to drop — try again when it lands". The
      batch can then settle.
    - **Invariant:** every batch reaches `settled` within a bounded number of steps.
    - **Tests:**
      - Two watermelons at Knee: the second releases stacked and lands on the first.
      - The backstop fires when a scripted blocker is kept moving, and the batch then
        settles.
      - Seeds 1-20 of random scripted batches (random fruit, heights across the full
        range including Knee, random press steps) all reach `settled` within 1500 steps.
    - **Mutations:**
      - Remove the stacking: the Knee test must fail.
      - Remove the backstop: the moving-blocker test must fail.
  - **Fruit hitting fruit.** An unbroken fruit gets a break check on **every** contact,
    not only its first, using the relative normal speed of that contact against its own
    break speed. A fruit that held on the ground can therefore be smashed by the next
    fruit landing on it, and the falling fruit gets its own check too. The result text
    reports each fruit's final outcome and the speed of the contact that broke it; a
    fruit that never broke reports its first ground impact.
  - **Camera:** the `Rmax` batch framing stays: selected fruit in `ready`, a one-time
    instant snap out when a larger fruit joins.
  - **Tests** (replacing the crowding test):
    - **Spawn overlap:** five watermelon presses in the same step give no body overlap
      at any spawn step, five releases in press order, and every release step strictly
      after the previous one. The same holds for a mixed batch.
    - **Held then smashed:** a scripted watermelon that holds from Knee is then struck
      by a coconut from Plane. The watermelon's result changes from held to a broken
      tier, and it appears in the batch result.
    - **Pile-up physics:** five watermelons from Plane released as a stream. Checks the
      200-body budget, finite values, the ground clauses and determinism.
    - **Playwright:** five rapid clicks give `data-fruit-count` 5 and five splat starts.
      The `data-queued` attribute rises and then drains to 0.
  - **Mutations:**
    - Remove the spawn queue: the overlap test must fail.
    - Check breaks on first contact only: the held-then-smashed test must fail.
- ~~**Spawn ruling (CTO, 2026-09-14; replaces the spread rule above).**~~ *Superseded
  by v2.* The xo showed that
  "within 35% of the half-width" and "2.5 diameters apart" can't both hold at the §8
  framing, where the half-width is 4R. The replacement is option A, made deterministic:
  - **Fixed slots.** Fruit 1 drops at the centre. Fruits 2-5 take four fixed slots at
    90° intervals on a ring of radius `3·Rmax`, where `Rmax` is the largest radius in the
    batch at the moment of that drop. The ring gets one seeded rotation per batch, and
    slots are never reused.
  - **Spacing is guaranteed, with no retries.** For any two fruit i and j, the centre
    distance is at least `1.5·(Ri + Rj)`, and this holds even when a larger fruit joins
    later.
  - **Framing follows the batch.** In `ready` it frames the selected fruit. During a batch
    it frames `Rmax`, snapping out once, instantly, when a larger fruit is added. The
    camera never animates.
  - **Wobble scaled to size (amends §7).** Horizontal release speed is at most
    `0.02 · R / 0.15` m/s, so drift at Plane is at most about 0.47R. The gap left at spawn
    is `0.5·(Ri + Rj)`, which is more than both fruit's worst-case drift combined, so they
    cannot touch before landing. Tilt and spin are unchanged.
  - **Crowding test** (replaces the stop condition): for each fruit type, and for a mixed
    batch of tomato, watermelon, coconut, apple and orange, drop 5 fruit at Plane in the
    same step over seeds 1-20. No fruit-to-fruit contact happens before both fruit have
    touched the ground, and every impact point is inside the batch framing.
- **Break check:** the first contact with anything (ground, another fruit, debris).
  Impact speed is the relative normal speed at that contact. A fruit landing on debris
  can still break.
- **Body budget:** 200 dynamic bodies across the batch. At each break, trim the new
  pieces to fit, seeds first, then inner chunks, keeping at least 2 outer pieces. The
  result counts report what was actually spawned.

**Phases and controls.**
- **`ready`:** the scene is empty.
- **`active`:** at least one fruit is falling, or the last impact was under 72 steps ago.
  This replaces `falling`.
- **`settled`:** no fruit is falling and 72 steps have passed since the last impact.
- **Drop:**
  - in `ready` or `active` it adds a fruit, while the batch has fewer than 5;
  - in `settled` it clears the scene and starts a new batch with this fruit, as one
    action;
  - at 5 fruits it sets `aria-disabled="true"`, not the `disabled` attribute, so
    keyboard focus stays on it. Presses are ignored, and a visible note reads "5 fruit
    in the air — wait for them to land". It becomes available again in `settled`.
- **Fruit and height:** enabled in every phase.
  - During `ready` or `active`, a change applies to the next fruit dropped and clears
    nothing, so batches can mix fruit and heights.
  - During `settled`, a change clears the scene to `ready`, as in §10.
- **Rapid presses:** `touch-action: manipulation` on Drop, so fast taps don't zoom or lag.
  Each `click` counts, and so does each Enter or Space press, but not key auto-repeat
  (`event.repeat` is ignored).

**Output.**
- **Result text:** written once, at batch `settled`, into the live region. For one fruit
  the wording is unchanged. For a batch, one sentence per fruit, in drop order, for
  example "Dropped 3 fruit. The watermelon smashed into 12 pieces and 40 seeds flew out.
  The tomato cracked into 2 pieces. The coconut held."
  - A pure `batchResultText(results)` in `rules.js` builds it.
  - Nothing is announced per impact, so the live region isn't spammed.
- **Sound:** one splat per impact. All splats pass through a shared master `GainNode`
  plus a `DynamicsCompressorNode`, so 5 overlapping splats don't clip. The toggle and
  the no-context-before-first-Drop rules stand.
- **Incoming markers:** one per fruit that is still above the frame, at its horizontal
  offset, in its fruit colour.
- **Height bar:** one fruit-coloured marker per falling fruit. The bar's top is the
  largest height in the batch, or the slider height in `ready`.

**Determinism.**
- **Sim API:** `sim.drop({ fruit, heightM, seed })` can be called at any step. Given the
  same sequence of `(step, fruit, heightM, seed)`, results and positions are identical.
- **Layout hash:** taken at batch UI-settle from the sim snapshot.
- **Pinned seeds:** with `?seed=<n>`, the k-th drop of a batch uses seed `n + k`.

**Lifecycle.** One owner for every fruit's bodies, pieces, sounds and markers. Clearing
disposes all of them and invalidates pending impact or settle bookkeeping. No stale
splat or result text can arrive after a clear.

### Tests (none loosened)

**Rules unit tests:**
- `batchResultText` for 1, 3 and 5 fruit, with mixed tiers.
- The spawn-offset rule: seeded, within 35% of the half-width, at least 2.5 diameters
  apart, for 5 fruit of each type.
- The body-budget trimming order.

**Sim tests:**
- A scripted batch of 5 watermelons from Plane, dropped 9 steps apart (0.15 s):
  - body count ≤ 200 at every step;
  - all values finite;
  - no centre below −0.5 m during flight, and none below −0.01 m at settle;
  - 5 impacts recorded;
  - determinism over two runs.
- A tomato landing on a settled watermelon's debris still gets a break check, reporting
  its tier.
- Mixed batches (fruit A at 5 m, then fruit B at 1 m) record the right fruit and height
  per result.
- Batch UI-settle happens exactly 72 steps after the last impact, and not while any
  fruit is still falling.
- Clearing mid-batch leaves 0 bodies, and no pending impact survives.

**Playwright:**
- **Rapid clicks:** 5 quick clicks from `ready`, all within 1 s, give 5 fruit (count via
  `data-fruit-count`). A 6th click is ignored, Drop shows `aria-disabled="true"` and
  keeps focus, and the max note is visible.
- **Keyboard:** Space pressed 3 times quickly on Drop gives 3 fruit. A held Space (auto
  repeat) gives only 1.
- **Touch:** 3 quick taps at 390x844 give 3 fruit.
- **Mixed batch:** choose tomato, Drop, choose coconut, Drop. The result text names both
  in order.
- **Settled redrop:** a Drop press in `settled` clears and starts a new batch of 1.
  Repeat twice in one session.
- **Sound:** a batch of 3 makes exactly 3 splat starts with the fake AudioContext, and
  the master compressor exists.
- **Live region:** it is written once per batch.
- **Existing tests:** single-drop behaviour, undeclared-URL, reduced-motion,
  hidden-tab and page-error checks still pass. Tests that reference toughness are
  removed.

**Mutations:**
- Allow a 6th fruit: the rapid-click test must fail.
- Use `disabled` instead of `aria-disabled`: the focus assertion must fail.
- Remove the body budget: the ≤ 200 sim test must fail.
- Count key auto-repeat: the held-Space test must fail.

### Stop conditions

- **Frame cost:** p95 above 16 ms at 4x throttle for the 5-watermelon Plane batch at
  390x844. Report the numbers; don't cut the batch size or the budget on your own.
- **Energy guard:** below 2.2× at real toughness.
- **Crowding:** fruit colliding mid-air or overlapping at spawn despite the 2.5-diameter
  rule. Report it and propose a fix.
- **Determinism:** fails for scripted batches.

### Process note for the xo

- **Engineer stalls:** the spec file is about 2,000 lines, and two engineers stalled
  reading it. Give the engineer targeted `grep` and line ranges, not whole-file reads.
- **Test runs:** keep Playwright runs in chunks of 5 minutes or less.
- **Dispatch:** 11a and 11b may go as one task. Verify 11a on its own first, with node
  tests and the toughness-free guarantees, before starting 11b.

## Tests (added or replaced; none loosened)

**Rules unit tests:**
- `m(t)` values and monotonicity.
- The margin rule.
- Severity tiers at boundaries (exactly 1.0, 1.6, 3.0).
- Piece counts per tier and fruit, with the cap.
- `chunkShape` and `shellPiece`: deterministic for a seed, and different seeds give
  different shapes. For `chunkShape`, radial distances from the centroid are not all
  equal (spread ≥ 0.2 × mean) and it has ≥ 12 vertices. For `shellPiece`, it is not
  flat, spanning a non-zero normal spread.
- Result text per tier and per fruit.

**Sim tests:**
- All pinned guarantees in §2.
- The watermelon tier sequence from Knee, then Counter, then Roof, then Plane at t = 5:
  held, then cracked or split, then higher tiers, with no tier going down as height
  rises.
- Existing tests adapted to the new break speeds: T1-T4, the spawn test, determinism,
  reset.
- Containment and energy per §6.

**Playwright:**
- Fruit selector by keyboard (arrows), pointer and touch. Disabled outside `ready`.
- Changing fruit in `ready` swaps the mesh and resets the height bar.
- A Counter watermelon drop at default toughness shows "cracked" or "split" text.
- `fruit -> drop -> reset -> other fruit -> drop`, run twice in one session.
- The undeclared-request, live-region and error checks still pass.

**Mutations (xo):**
- Swap the tier thresholds.
- Make `chunkShape` return a unit cube.
- Remove the fruit-size scaling from the burst.

Each must fail a test; restore each afterwards.

**Screenshots** go to the session scratchpad. For each fruit: settled after a Plane
t = 5 drop, and the watermelon at Counter t = 5. Take them at 390x844 and 1280x900. They
are for Jose to eyeball, since shape realism is judged by eye.

## Files

- `projects/melon-smash-lab/`: `rules.js`, `sim.js`, `view.js`, `index.html`,
  `style.css`, `README.md` (fruit table, "approximate numbers" note), and `project.json`
  (summary and description mention the fruit; no new dependencies).
- The three `tests/melon-smash-lab*` files.
- `projects/index.json`, via the index script only.

## Boundaries

- No new URLs, image files, audio or storage. No liquids or juice particles; those are
  step 3.
- No catapult and no targets.
- The rename in §0 is the only rename. The slug is `splat-lab` from then on.
- No git commit, push, branch or stash.

## Stop conditions

- Frame-cost p95 at 4x throttle above 16 ms with all five fruits (measure the
  watermelon Plane smash and the tomato Plane smash).
- The margin rule can't hold with these numbers. Report the table; don't retune the
  fruit on your own.
- No K meets §6.
- A convex-hull render mesh can't be built without a new URL. `ConvexGeometry` lives in
  three's addons, which would be another URL. In that case build the hull directly as a
  `BufferGeometry` from the icosahedron's fixed face indices, since scaling vertices
  radially keeps it convex. Only report if that also fails.
- Determinism fails.

## Report

The same format as round 2: K sweep, files, foreground command output, invariants and
guarantees mapped to tests, mutation results, frame cost, screenshot paths, untested risk.
