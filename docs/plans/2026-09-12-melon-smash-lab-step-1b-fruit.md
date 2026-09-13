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
