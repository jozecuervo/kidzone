// Pure rules for Splat Lab: no engine, no DOM, no imports.
// sim.js and view.js both depend on this module for shared, testable logic.

// Step 1b §7: landmarks replace height presets (no more discrete ids — the
// height slider is now continuous). Named heights are still used for the
// height bar's ticks and for the "(about <name>)" hint on the readout.
export const LANDMARKS = [
  { name: "Knee", meters: 0.3 },
  { name: "Counter", meters: 1 },
  { name: "Treehouse", meters: 5 },
  { name: "Roof", meters: 10 },
  { name: "Crane", meters: 25 },
  { name: "Plane", meters: 60 }
];

// Continuous height slider (§7): heightFromSlider(0) = Knee (0.3 m),
// heightFromSlider(1000) = Plane (60 m), exponential in between so the
// low-height end (where fine control matters most for "does it survive a
// kitchen counter drop?") isn't compressed into a few slider steps.
export const HEIGHT_SLIDER_MIN = 0;
export const HEIGHT_SLIDER_MAX = 1000;
const HEIGHT_SLIDER_BASE = 200;
const HEIGHT_SLIDER_MIN_METERS = 0.3;

export function heightFromSlider(sliderValue) {
  return HEIGHT_SLIDER_MIN_METERS * Math.pow(HEIGHT_SLIDER_BASE, sliderValue / 1000);
}

export function sliderFromHeight(heightMeters) {
  return (1000 * Math.log(heightMeters / HEIGHT_SLIDER_MIN_METERS)) / Math.log(HEIGHT_SLIDER_BASE);
}

// formatHeight is the one function used by both the height slider's
// readout and the result text's opening line, so they never disagree.
export function formatHeight(heightMeters) {
  if (heightMeters < 10) return `${heightMeters.toFixed(1)} m`;

  return `${Math.round(heightMeters)} m`;
}

// The height slider's own readout additionally names the nearest landmark
// when it's within 10% of it (e.g. "1.0 m (about Counter)"); the result
// text never gets this suffix (formatHeight alone).
export function heightSliderLabel(heightMeters) {
  let nearestName = null;
  let nearestRelativeDelta = Infinity;

  for (const landmark of LANDMARKS) {
    const relativeDelta = Math.abs(heightMeters - landmark.meters) / landmark.meters;

    if (relativeDelta < nearestRelativeDelta) {
      nearestRelativeDelta = relativeDelta;
      nearestName = landmark.name;
    }
  }

  const base = formatHeight(heightMeters);

  return nearestRelativeDelta <= 0.1 ? `${base} (about ${nearestName})` : base;
}

export const MAX_DYNAMIC_BODIES = 150;
export const MAX_PIECES_PER_FRUIT = 64;

export const GRAVITY = 9.81;
export const FIXED_STEP = 1 / 60;
export const MAX_SIMULATED_SECONDS = 8;
export const MAX_SETTLE_STEPS = Math.round(MAX_SIMULATED_SECONDS / FIXED_STEP);

// Step 1b §10 (CTO amendment, "two phases, two layers"): the UI's own phase
// no longer waits for every piece to physically settle (up to
// MAX_SETTLE_STEPS/480 — 8s — since the §7 wobble spin can keep debris
// awake that whole time). UI settle begins this many simulation steps after
// the impact step (72 steps = 1.2s at 60Hz), counted in steps rather than
// wall-clock time so it stays deterministic and a hidden tab (which pauses
// stepping) delays it correctly. The physics phase and MAX_SETTLE_STEPS are
// unchanged: containment, energy, determinism and spawn tests keep
// stepping to the physics end.
export const UI_SETTLE_STEPS_AFTER_IMPACT = 72;

// Step 1b (2026-09-12): five fruits, each a playful approximation (see
// README). breakSpeed here is the real break speed used at drop time via
// breakSpeedFor(fruit).
// outerCount/innerCount/seedCount are each fruit's SMASHED (100%) piece
// counts; cracked/split scale them down (see pieceCountsForTier).
export const FRUITS = {
  tomato: {
    key: "tomato",
    name: "tomato",
    article: "a",
    radius: 0.035,
    mass: 0.15,
    breakSpeed: 2.0,
    outerCount: 10,
    innerCount: 10,
    seedCount: 30,
    shellOuterColor: 0xd62828,
    shellInnerColor: 0xff9b9b,
    fleshColor: 0xff5a5a,
    fleshCoreColor: 0xffd1d1,
    seedColor: 0xf6c445,
    skinColor: 0xd62828
  },
  watermelon: {
    key: "watermelon",
    name: "watermelon",
    article: "a",
    radius: 0.15,
    mass: 6,
    breakSpeed: 3.5,
    outerCount: 12,
    innerCount: 12,
    seedCount: 40,
    shellOuterColor: 0x2e7d32,
    shellInnerColor: 0xf3e9d2,
    fleshColor: 0xe63946,
    fleshCoreColor: 0xff8f9c,
    seedColor: 0x1b1b1b,
    skinColor: 0x3a8f3f
  },
  apple: {
    key: "apple",
    name: "apple",
    article: "an",
    radius: 0.04,
    mass: 0.2,
    breakSpeed: 6.3,
    outerCount: 8,
    innerCount: 8,
    seedCount: 6,
    shellOuterColor: 0xc21e1e,
    shellInnerColor: 0xfaf7ee,
    fleshColor: 0xfaf7ee,
    fleshCoreColor: 0xffffff,
    seedColor: 0x3b2a1a,
    skinColor: 0xc21e1e
  },
  orange: {
    key: "orange",
    name: "orange",
    article: "an",
    radius: 0.04,
    mass: 0.2,
    breakSpeed: 8.5,
    outerCount: 10,
    innerCount: 8,
    seedCount: 5,
    shellOuterColor: 0xf28c1e,
    shellInnerColor: 0xfff3d6,
    fleshColor: 0xffb238,
    fleshCoreColor: 0xffe0a3,
    seedColor: 0xece5c8,
    skinColor: 0xf28c1e
  },
  coconut: {
    key: "coconut",
    name: "coconut",
    article: "a",
    radius: 0.1,
    mass: 1.5,
    breakSpeed: 18.5,
    outerCount: 10,
    innerCount: 8,
    seedCount: 0,
    shellOuterColor: 0x5a3a22,
    shellInnerColor: 0xf5f0e1,
    fleshColor: 0xfaf7ee,
    fleshCoreColor: 0xffffff,
    seedColor: 0x3b2a1a,
    skinColor: 0x5a3a22
  }
};

export const FRUIT_KEYS = ["tomato", "watermelon", "apple", "orange", "coconut"];
export const DEFAULT_FRUIT_KEY = "watermelon";

export function fruitByKey(key) {
  const fruit = FRUITS[key];

  if (!fruit) {
    throw new RangeError(`unknown fruit "${key}"`);
  }

  return fruit;
}

export function expectedImpactSpeed(heightMeters) {
  return Math.sqrt(2 * GRAVITY * heightMeters);
}

// Deterministic, seedable PRNG (mulberry32). Returns a function that
// produces floats in [0, 1) and is stable across runs given the same seed.
export function createRng(seed) {
  let state = seed >>> 0;

  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pure phase transitions shared by sim.js (source of truth) and view.js
// (status text and control enablement).
// Step 1b §11b (spawn ruling v3, decision 5): phases are `ready` / `active`
// / `settled` only ("falling" is gone). `active` covers both "something is
// falling" and "an impact happened under 72 steps ago" — sim.js computes
// that directly rather than through this reducer, since it now depends on
// elapsed steps, not just the action taken. `drop` never changes phase
// coming from `ready` by itself; the scene becomes `active` because a fruit
// is now falling, which sim.js derives from its own state.
export function phaseAfter(phase, action) {
  if (action === "reset") return "ready";
  if (phase === "ready" && action === "drop") return "active";
  if (phase === "active" && action === "settle") return "settled";
  return phase;
}

// Step 1b §11a: every fruit uses its real break speed (formerly "t = 5,
// multiplier 1.0" before that control was removed).
export function breakSpeedFor(fruit) {
  return fruit.breakSpeed;
}

export function shouldBreakFruit(impactSpeed, fruit) {
  return Math.abs(impactSpeed) >= breakSpeedFor(fruit);
}

export function severityFor(impactSpeed, fruit) {
  return Math.abs(impactSpeed) / breakSpeedFor(fruit);
}

// Severity tiers (invariant 4 replaced, step 1b §3). Boundaries are
// half-open on the low end: exactly 1.0 is "cracked", exactly 1.6 is
// "split", exactly 3.0 is "smashed".
export function tierForSeverity(severity) {
  if (severity < 1) return "held";
  if (severity < 1.6) return "cracked";
  if (severity < 3) return "split";

  return "smashed";
}

export const TIER_SHARES = {
  held: 0,
  cracked: 0.25,
  split: 0.5,
  smashed: 1
};

// Piece counts for a tier: outerCount/innerCount/seedCount are each fruit's
// smashed (100%) counts; cracked/split scale them down by the tier's share,
// with at least 2 outer pieces whenever the share is below 1 (so "cracked"
// still visibly produces pieces, never just 0 or 1).
export function pieceCountsForTier(fruit, tier) {
  if (tier === "held") {
    return { outer: 0, inner: 0, seeds: 0 };
  }

  const share = TIER_SHARES[tier];
  const outerRaw = Math.round(share * fruit.outerCount);
  const outer = share < 1 ? Math.max(2, outerRaw) : outerRaw;
  const inner = Math.round(share * fruit.innerCount);
  const seeds = Math.round(share * fruit.seedCount);

  return { outer, inner, seeds };
}

// Amended invariant 4 (2026-09-12, Jose chose option C; re-tuned for step
// 1b §6): on break, each piece's velocity is
// `v_t - e*v_n + ω × r + burst_i`, replacing the original "v + ω × r" that
// aimed every piece straight into the ground. e is a partial-bounce
// coefficient along the ground normal; burst_i turns the excess energy
// beyond the breaking point into splatter, scaled per fruit size
// (kFruitFor), with a small per-piece seeded jitter so debris does not all
// move identically.
export const E_BOUNCE = 0.3;
export const BURST_JITTER_RANGE = 0.2;
// Step 1b §6 ruling: chosen from the sweep e ∈ {0.10,0.15,0.20,0.30} ×
// K ∈ {0,0.005,0.01,0.02} against the relative energy guard (≥ 2x the dead
// control, K=0/e=0/lift-kept) and containment (≥90% within 0.5·W, 100%
// within W). e = 0.3, K = 0.01 is the largest e, then largest K, meeting
// both: energy ≥9x (watermelon) / ≥85x (tomato); containment holds for all
// five fruits (see the engineer's report for the measured numbers).
export const BURST_K = 0.01;
// Reference radius the sweep's K was tuned against (watermelon).
const BURST_K_REFERENCE_RADIUS = 0.15;

export function kFruitFor(fruit, k = BURST_K) {
  return k * (fruit.radius / BURST_K_REFERENCE_RADIUS);
}

export function jitterFactor(randomUnit) {
  return 1 + (randomUnit * 2 - 1) * BURST_JITTER_RANGE;
}

// v_t - e*v_n for ground normal n = (0, 1, 0): the tangential (horizontal)
// part of velocity is kept, and the normal (vertical) part becomes a
// partial bounce scaled by e.
export function bounceVelocity(velocity, e = E_BOUNCE) {
  const [vx, vy, vz] = velocity;

  return [vx, -e * vy, vz];
}

export function crossVec3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

// d_i: unit vector from the fruit centre to the piece (r), with its
// vertical component made non-negative first, so burst never points back
// into the ground. Falls back to straight up if r is (near) the centre.
export function burstDirection(r) {
  const [x, y, z] = r;
  const liftedY = Math.max(0, y);
  const length = Math.hypot(x, liftedY, z);

  if (length < 1e-9) return [0, 1, 0];

  return [x / length, liftedY / length, z / length];
}

export function burstSpeed(impactSpeed, breakSpeedValue, k = BURST_K) {
  return k * Math.max(0, impactSpeed - breakSpeedValue);
}

export function burstVelocity({ impactSpeed, breakSpeedValue, r, jitter, k = BURST_K }) {
  const speed = burstSpeed(impactSpeed, breakSpeedValue, k) * jitter;
  const direction = burstDirection(r);

  return direction.map((component) => component * speed);
}

export function pieceVelocity({
  velocity,
  angularVelocity,
  r,
  impactSpeed,
  breakSpeedValue,
  jitter,
  k = BURST_K,
  e = E_BOUNCE
}) {
  const bounce = bounceVelocity(velocity, e);
  const spin = crossVec3(angularVelocity, r);
  const burst = burstVelocity({ impactSpeed, breakSpeedValue, r, jitter, k });

  return [bounce[0] + spin[0] + burst[0], bounce[1] + spin[1] + burst[1], bounce[2] + spin[2] + burst[2]];
}

const TIER_VERBS = { cracked: "cracked", split: "split", smashed: "smashed" };
const TIER_FLY_WORDS = { cracked: "fell out", split: "fell out", smashed: "flew out" };

// Result text (step 1b defines what the plan leaves open). Height uses the
// preset's raw metres value (no rounding); speed has one decimal.
export function resultText({ fruit, heightMeters, impactSpeed, tier, outerCount, seedCount }) {
  const opening = `Dropped ${fruit.article} ${fruit.name} from ${formatHeight(heightMeters)}. Hit the ground at ${impactSpeed.toFixed(1)} m/s.`;

  if (tier === "held") {
    return `${opening} It held and bounced.`;
  }

  const verb = TIER_VERBS[tier];
  const flyWord = TIER_FLY_WORDS[tier];

  if (seedCount === 0) {
    return `${opening} It ${verb} into ${outerCount} pieces.`;
  }

  return `${opening} It ${verb} into ${outerCount} pieces and ${seedCount} seeds ${flyWord}.`;
}

function batchFruitClause({ fruit, tier, outerCount, seedCount }) {
  if (tier === "held") {
    return `The ${fruit.name} held.`;
  }

  const verb = TIER_VERBS[tier];
  const flyWord = TIER_FLY_WORDS[tier];

  if (seedCount === 0) {
    return `The ${fruit.name} ${verb} into ${outerCount} pieces.`;
  }

  return `The ${fruit.name} ${verb} into ${outerCount} pieces and ${seedCount} seeds ${flyWord}.`;
}

// Step 1b §11b: announced once per settle, for every fruit that landed since
// the last announcement (removed fruit are never mentioned — callers must
// filter those out before calling this). One fruit keeps today's
// `resultText` wording verbatim (height + impact speed); several fruit use
// the shorter per-fruit clause above, joined after a lead sentence.
// CTO ruling 2026-09-14 (replaces decision 2 in the original handoff):
// `heightMeters` here is always the height the player chose (the slider
// value at press time), never a spawn height raised to avoid an overlap —
// callers must pass the chosen height, not the actual release y.
export function batchResultText(results) {
  if (results.length === 1) {
    const [r] = results;

    return resultText({
      fruit: r.fruit,
      heightMeters: r.heightMeters,
      impactSpeed: r.impactSpeed,
      tier: r.tier,
      outerCount: r.outerCount,
      seedCount: r.seedCount
    });
  }

  const clauses = results.map((r) => batchFruitClause(r));

  return `Dropped ${results.length} fruit. ${clauses.join(" ")}`;
}

// Step 1b §11b (spawn ruling v3): body budget of 200. Removes the oldest
// fruit first (never the breaking fruit itself), then — if that alone is
// not enough — trims the breaking fruit's own pieces: seeds first, then
// inner chunks, keeping at least 2 outer pieces. Pure: takes plain counts,
// returns a plan; sim.js is responsible for actually removing bodies.
//
// `existingCounts`: [{ id, bodyCount }] for every other fruit currently in
// the scene, oldest first (press order). `breakingCounts`: the newly
// broken fruit's own { outer, inner, seeds } piece counts (bodyCount =
// outer+inner+seeds), not yet added to the world when this runs.
export function budgetTrimPlan({ existingCounts, breakingCounts, limit = 200 }) {
  const breakingTotal = () => breakingCounts.outer + breakingCounts.inner + breakingCounts.seeds;

  let total = existingCounts.reduce((sum, entry) => sum + entry.bodyCount, 0) + breakingTotal();
  const removeFruitIds = [];
  const trimmed = { ...breakingCounts };

  for (const entry of existingCounts) {
    if (total <= limit) break;

    removeFruitIds.push(entry.id);
    total -= entry.bodyCount;
  }

  while (total > limit && trimmed.seeds > 0) {
    trimmed.seeds -= 1;
    total -= 1;
  }

  while (total > limit && trimmed.inner > 0) {
    trimmed.inner -= 1;
    total -= 1;
  }

  while (total > limit && trimmed.outer > 2) {
    trimmed.outer -= 1;
    total -= 1;
  }

  return { removeFruitIds, trimmedBreakingCounts: trimmed };
}

// Step 1b §11b (spawn ruling v3, decision 3): a new drop's spawn point and
// what it displaces. `bodies` is plain data:
// { id, fruitId, kind, position:[x,y,z], radius, falling:boolean }, where
// "falling" means an unbroken fruit that has not yet made its first
// contact. Pure and deterministic — no world access.
export function spawnPlanFor({ fruit, heightM, bodies }) {
  const Rnew = fruit.radius;
  let y = heightM + Rnew;

  function clearance(other) {
    const Rother = other.radius;
    const dx = other.position[0] - 0;
    const dz = other.position[2] - 0;
    const dy = other.position[1] - y;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    return dist - Rother - Rnew - 0.02;
  }

  // Raise above falling fruit in the way, re-checking after each raise
  // since raising the spawn can bring it into range of a different falling
  // fruit than the one that triggered the raise.
  let raised = true;

  while (raised) {
    raised = false;

    for (const other of bodies) {
      if (!other.falling) continue;

      if (clearance(other) < 0) {
        const candidateY = other.position[1] + other.radius + Rnew + 0.02;

        if (candidateY > y) {
          y = candidateY;
          raised = true;
        }
      }
    }
  }

  // Landed bodies overlapping the final spawn point are removed (whole
  // fruit if unbroken, or the individual piece if broken) rather than
  // raising further.
  const removeIds = [];

  for (const other of bodies) {
    if (other.falling) continue;

    if (clearance(other) < 0) {
      removeIds.push(other.id);
    }
  }

  return { y, removeIds };
}

export function instructionsForPhase(phase) {
  if (phase === "ready") return "Pick a fruit and a height, then press Drop.";
  if (phase === "active") return "Watch it fall... Drop still works for more fruit.";
  return "Read the result below, then change anything or press Drop to try again.";
}

// Step 1b §11b: Drop always works, instantly, in every phase.
// Fruit/height/Drop/sound are all enabled in every phase and a control
// change never clears the scene; it only affects the next drop.
// `skipButton` (reduced-motion "Skip to result") is the one control still
// limited: it only makes sense, and is only enabled, while something is
// `active`.
export function controlsEnabledForPhase(phase) {
  return {
    fruitRadios: true,
    heightSlider: true,
    dropButton: true,
    skipButton: phase === "active",
    soundToggle: true
  };
}

// Containment width (step 1b §8, split off from camera framing): 25x the
// fruit's radius. Framing (below) is no longer tied to this — it is now
// sized to make the fruit visibly large in frame — but containment and the
// energy guard still reference this exact number, restated in fruit radii
// (0.5W = 12.5R, W = 25R), asserted purely on physics.
export function containmentWidthFor(fruit) {
  return 25 * fruit.radius;
}

// Camera framing per fruit (step 1b §8, replacing the containment-tied step
// 1b §5 camera): a low three-quarter view, looking at the impact point
// (0,0,0). The 8% ground-width framing was too weak to see the impact
// ("the screenshots show dots"); framing is now sized so the UNBROKEN
// fruit's diameter is ~25% of the view width (tested within 20-30%),
// measured with pinhole maths at the target distance, per fruit and aspect.
//
// Both the elevation angle and the horizontal field of view are fixed
// constants, independent of fruit and aspect: elevation because the plan
// asks for "20-30 degrees above ground" as a single camera pose, and
// horizontal fov because fixing it (and solving distance per-fruit from the
// diameter-fraction target) makes the diameter fraction come out the same
// at any aspect ratio for a given fruit — the fraction only depends on
// horizontal fov and distance, not aspect (see impactViewFor below). Only
// the per-fruit distance (which scales with R) and the derived vertical fov
// (which varies with aspect, larger at the narrower portrait aspect,
// exactly like the old camera) change.
const IMPACT_VIEW_ELEVATION_DEG = 25;
const IMPACT_VIEW_DIAMETER_FRACTION = 0.25;
const IMPACT_VIEW_MAX_VERTICAL_FOV_DEG = 75;
const IMPACT_VIEW_REFERENCE_ASPECT = 390 / 844; // narrowest supported aspect: needs the most vertical fov
// A small margin so floating-point rounding never nudges the reference
// aspect's fov a hair past the 75 degree cap.
const IMPACT_VIEW_FOV_MARGIN = 0.98;

const IMPACT_VIEW_ELEVATION_RAD = (IMPACT_VIEW_ELEVATION_DEG * Math.PI) / 180;
// Fixed elevation direction from the target to the camera: horizontal
// forward/back (z) and vertical (y) components of a unit vector at
// IMPACT_VIEW_ELEVATION_DEG above the ground plane.
const IMPACT_VIEW_DIRECTION = [0, Math.sin(IMPACT_VIEW_ELEVATION_RAD), Math.cos(IMPACT_VIEW_ELEVATION_RAD)];

// Horizontal half-fov (radians), fixed for every fruit and aspect: the
// largest value whose derived vertical fov at the reference (portrait)
// aspect still stays under the 75 degree cap, times a small safety margin.
const IMPACT_VIEW_HALF_HFOV_RAD = (() => {
  const capHalfRad = (IMPACT_VIEW_MAX_VERTICAL_FOV_DEG * Math.PI) / 180 / 2;
  const rawHalfHfovRad = Math.atan(Math.tan(capHalfRad) * IMPACT_VIEW_REFERENCE_ASPECT);

  return rawHalfHfovRad * IMPACT_VIEW_FOV_MARGIN;
})();

export function impactViewFor({ width, height, fruit }) {
  const aspect = width / height;
  const diameter = 2 * fruit.radius;
  // fraction = 2R / visibleWidth = 2R / (2 * distance * tan(hfov/2))
  // => distance = R / (fraction * tan(hfov/2))
  const distance = fruit.radius / (IMPACT_VIEW_DIAMETER_FRACTION * Math.tan(IMPACT_VIEW_HALF_HFOV_RAD));
  const position = IMPACT_VIEW_DIRECTION.map((component) => component * distance);
  const target = [0, 0, 0];
  const verticalHalfFovRad = Math.atan(Math.tan(IMPACT_VIEW_HALF_HFOV_RAD) / aspect);
  const fov = verticalHalfFovRad * 2 * (180 / Math.PI);
  const visibleWidth = 2 * distance * Math.tan(IMPACT_VIEW_HALF_HFOV_RAD);
  const diameterFraction = diameter / visibleWidth;
  // Ground fraction: the horizon (an infinitely distant point at the
  // camera's own height) projects to NDC y = tan(elevation) / tan(vfov/2)
  // when that is < 1 (horizon inside the frame); a camera pitched down by
  // `elevation` from horizontal shows that ray `elevation` above its own
  // forward direction. Ground fills everything below it: (y_h + 1) / 2 of
  // the frame height, clamped to [0, 1] (a horizon above/below the frame
  // means all-ground or all-sky).
  const horizonNdcY = Math.tan(IMPACT_VIEW_ELEVATION_RAD) / Math.tan(verticalHalfFovRad);
  const groundFraction = clampNumber((clampNumber(horizonNdcY, -1, 1) + 1) / 2, 0, 1);

  return {
    position,
    target,
    fov,
    elevationDeg: IMPACT_VIEW_ELEVATION_DEG,
    diameterFraction,
    groundFraction
  };
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

// Step 1b §9: the "incoming" marker. Resolves the plan's self-contradiction
// (marker hides "the moment any part of the fruit enters the frame" vs. the
// test wording "the fruit's top projection is above the frame") in favour
// of the first: visibility is keyed on the fruit's LOWEST point (centre y -
// radius), on the vertical line through the impact point.
//
// Uses angles, not NDC projection: NDC's sign flips for points behind the
// camera plane (camZ <= 0), which happens for points high above the camera
// (e.g. a fruit released from Plane, 60 m up, is behind the camera's near
// plane in the camera's own forward direction terms) — exactly the case
// this marker exists to handle.
export function incomingFor({ fruitY, fruitRadius, view }) {
  const camY = view.position[1];
  const horiz = Math.hypot(view.position[0], view.position[2]);
  const targetY = view.target[1];
  const pitch = Math.atan2(camY - targetY, horiz);
  const halfFovRad = (view.fov * Math.PI) / 180 / 2;

  // Height (on the impact point's vertical line) exactly at the frame's top
  // edge: solving a(h) = halfFov for h, where
  // a(h) = atan2(h - camY, horiz) + pitch is a point at height h's angle
  // above the camera's forward axis.
  const hEdge = Math.max(0, camY + horiz * Math.tan(halfFovRad - pitch));

  const lowestPoint = fruitY - fruitRadius;
  const visible = lowestPoint > hEdge;
  const metresAbove = Math.max(0, lowestPoint - hEdge);

  return { visible, metresAbove, label: formatHeight(metresAbove) };
}

// Step 1b §8: the height bar now uses the same log scale as the height
// slider (sliderFromHeight), so landmark ticks spread out instead of
// bunching near the bottom of a linear scale. s(0.3) is exactly 0 by
// construction (heightFromSlider(0) = 0.3), so this is written out in full
// per the spec rather than relying on that being zero.
function heightBarFraction(valueMeters, heightM) {
  const sMin = sliderFromHeight(HEIGHT_SLIDER_MIN_METERS);
  const sHeight = sliderFromHeight(heightM);

  if (sHeight - sMin <= 1e-9) {
    // Degenerate case: a drop at (or effectively at) the 0.3 m minimum, so
    // the log scale has no usable range. Fall back to a linear fraction.
    return clampNumber(valueMeters / heightM, 0, 1);
  }

  const sValue = sliderFromHeight(clampNumber(valueMeters, HEIGHT_SLIDER_MIN_METERS, heightM));

  return clampNumber((sValue - sMin) / (sHeight - sMin), 0, 1);
}

// The height bar's data: melonY is the fruit's lowest point above the
// ground (view.js passes centre y minus radius while the fruit exists, and
// 0 once it has split), and heightM is the chosen drop height.
export function heightBarFor({ melonY, heightM }) {
  const fraction = heightBarFraction(melonY, heightM);
  const label = formatHeight(clampNumber(melonY, 0, heightM));
  const ticks = LANDMARKS.filter((landmark) => landmark.meters <= heightM).map((landmark) => ({
    name: landmark.name,
    meters: landmark.meters,
    fraction: heightBarFraction(landmark.meters, heightM)
  }));

  return { fraction, label, ticks };
}

// --- Real chunk shapes (step 1b §4): pure vertex/index generators. Physics
// shapes stay simple spheres/boxes in sim.js; only the rendered mesh data
// comes from here. Both are built from a fixed icosahedron so scaling
// vertices radially keeps the hull convex — no ConvexGeometry, no new URL.

// Step 1b §7: a small release wobble, replacing the old fixed spin range,
// so identical settings no longer give an identical result. Draws happen
// from the sim's seeded PRNG, in this exact order (any later draws —
// placement, jitter — come after): tilt axis angle, tilt angle (sets the
// body's quaternion), spin axis (uniform on the sphere), spin magnitude,
// horizontal direction, horizontal speed. Vertical velocity is always 0
// (a release wobble, not a throw).
const WOBBLE_MAX_TILT_DEG = 8;
const WOBBLE_MAX_SPIN = 1.5;
const WOBBLE_MAX_HORIZONTAL_SPEED = 0.05;

export function releaseWobble(rng) {
  const tiltAxisAngle = rng() * 2 * Math.PI;
  const tiltAxis = [Math.cos(tiltAxisAngle), 0, Math.sin(tiltAxisAngle)];
  const tiltAngleRad = (((rng() * 2 - 1) * WOBBLE_MAX_TILT_DEG) * Math.PI) / 180;
  const halfAngle = tiltAngleRad / 2;
  const sinHalf = Math.sin(halfAngle);
  const quaternion = [tiltAxis[0] * sinHalf, tiltAxis[1] * sinHalf, tiltAxis[2] * sinHalf, Math.cos(halfAngle)];

  const spinZ = 2 * rng() - 1;
  const spinPhi = rng() * 2 * Math.PI;
  const spinPlanarRadius = Math.sqrt(Math.max(0, 1 - spinZ * spinZ));
  const spinAxis = [spinPlanarRadius * Math.cos(spinPhi), spinPlanarRadius * Math.sin(spinPhi), spinZ];
  const spinMagnitude = rng() * WOBBLE_MAX_SPIN;
  const angularVelocity = spinAxis.map((component) => component * spinMagnitude);

  const horizontalDirection = rng() * 2 * Math.PI;
  const horizontalSpeed = rng() * WOBBLE_MAX_HORIZONTAL_SPEED;
  const velocity = [
    horizontalSpeed * Math.cos(horizontalDirection),
    0,
    horizontalSpeed * Math.sin(horizontalDirection)
  ];

  return { quaternion, angularVelocity, velocity };
}

// FNV-1a 32-bit over each settled piece position, rounded to 1e-4 m, in
// bodies() order. Pure, deterministic, sensitive to any 1e-3 m change.
export function layoutHash(positions) {
  const FNV_OFFSET_BASIS = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  let hash = FNV_OFFSET_BASIS;

  for (const position of positions) {
    for (const component of position) {
      let rounded = Math.round(component / 1e-4) * 1e-4;

      if (Object.is(rounded, -0)) rounded = 0;

      const text = rounded.toFixed(4);

      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME) >>> 0;
      }
    }
  }

  return hash.toString(16).padStart(8, "0");
}

const PHI = (1 + Math.sqrt(5)) / 2;

const ICOSAHEDRON_RAW_VERTICES = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1]
];

const ICOSAHEDRON_VERTICES = ICOSAHEDRON_RAW_VERTICES.map((v) => {
  const length = Math.hypot(...v);

  return v.map((c) => c / length);
});

export const ICOSAHEDRON_FACES = [
  0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
  1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
  3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
  4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1
];

const CHUNK_RADIAL_FACTOR_MIN = 0.7;
const CHUNK_RADIAL_FACTOR_RANGE = 0.6;

// A pure, deterministic "convex rock" shape for inner chunks and seeds: the
// icosahedron's 12 vertices, each scaled radially by a seeded factor in
// [0.7, 1.3]. The result renders as a flat-shaded convex hull (the fixed
// ICOSAHEDRON_FACES index list, unchanged — radial scaling of vertices
// cannot make a convex shape non-convex).
export function chunkShape(seed) {
  const rng = createRng(seed);
  const radialFactors = ICOSAHEDRON_VERTICES.map(
    () => CHUNK_RADIAL_FACTOR_MIN + rng() * CHUNK_RADIAL_FACTOR_RANGE
  );
  const positions = ICOSAHEDRON_VERTICES.map((vertex, index) =>
    vertex.map((component) => component * radialFactors[index])
  );

  return { positions, indices: [...ICOSAHEDRON_FACES], radialFactors };
}

const SHELL_PATCH_GRID = 3;
const SHELL_LAT_SPAN_MIN = 0.3;
const SHELL_LAT_SPAN_RANGE = 0.25;
const SHELL_LON_SPAN_MIN = 0.3;
const SHELL_LON_SPAN_RANGE = 0.25;
const SHELL_OUTER_RADIUS_FRACTION = 0.95;
const SHELL_THICKNESS_FRACTION = 0.15;

// A curved patch of the fruit's outer shell, between seeded latitude and
// longitude bounds, with matching outer and inner sphere surfaces (a thin
// slab, not a flat plane) so it renders with a visible outer colour on one
// face and an inner colour on the other, thickness scaled to the fruit.
export function shellPiece(seed, fruit) {
  const rng = createRng(seed);
  const latCenter = (rng() - 0.5) * Math.PI * 0.8;
  const lonCenter = rng() * Math.PI * 2;
  const latSpan = SHELL_LAT_SPAN_MIN + rng() * SHELL_LAT_SPAN_RANGE;
  const lonSpan = SHELL_LON_SPAN_MIN + rng() * SHELL_LON_SPAN_RANGE;

  const outerRadius = fruit.radius * SHELL_OUTER_RADIUS_FRACTION;
  const thickness = fruit.radius * SHELL_THICKNESS_FRACTION;
  const innerRadius = outerRadius - thickness;

  const outerPositions = [];
  const innerPositions = [];
  const outerNormals = [];

  for (let i = 0; i < SHELL_PATCH_GRID; i += 1) {
    const lat = latCenter - latSpan / 2 + (latSpan * i) / (SHELL_PATCH_GRID - 1);

    for (let j = 0; j < SHELL_PATCH_GRID; j += 1) {
      const lon = lonCenter - lonSpan / 2 + (lonSpan * j) / (SHELL_PATCH_GRID - 1);
      const nx = Math.cos(lat) * Math.cos(lon);
      const ny = Math.sin(lat);
      const nz = Math.cos(lat) * Math.sin(lon);

      outerPositions.push([nx * outerRadius, ny * outerRadius, nz * outerRadius]);
      innerPositions.push([nx * innerRadius, ny * innerRadius, nz * innerRadius]);
      outerNormals.push([nx, ny, nz]);
    }
  }

  const indices = [];
  const grid = SHELL_PATCH_GRID;

  for (let i = 0; i < grid - 1; i += 1) {
    for (let j = 0; j < grid - 1; j += 1) {
      const a = i * grid + j;
      const b = i * grid + j + 1;
      const c = (i + 1) * grid + j + 1;
      const d = (i + 1) * grid + j;

      indices.push(a, b, c, a, c, d);
    }
  }

  const innerOffset = outerPositions.length;
  const innerIndices = [];

  for (let i = 0; i < grid - 1; i += 1) {
    for (let j = 0; j < grid - 1; j += 1) {
      const a = innerOffset + i * grid + j;
      const b = innerOffset + i * grid + j + 1;
      const c = innerOffset + (i + 1) * grid + j + 1;
      const d = innerOffset + (i + 1) * grid + j;

      // Reversed winding: this face points inward.
      innerIndices.push(a, c, b, a, d, c);
    }
  }

  return {
    positions: [...outerPositions, ...innerPositions],
    indices: [...indices, ...innerIndices],
    outerVertexCount: outerPositions.length,
    outerNormals,
    outerColor: fruit.shellOuterColor,
    innerColor: fruit.shellInnerColor
  };
}

// --- Step 1b §10: synthesized splat sound parameters (pure numbers only; --
// view.js does the actual Web Audio synthesis). Character per fruit, picked
// by ear from the plan's descriptions:
// - tomato, watermelon: soft and wet — a bright-to-dull noise burst (a
//   falling low-pass cutoff reads as "wet squelch"), a soft low thud, no
//   crack. Watermelon is the bigger of the two: longer/gainier burst, a
//   lower (bigger-sounding) thud.
// - apple: crisp — a short noise burst that STAYS bright (cutoff barely
//   falls, unlike the wet fruits), and a higher-pitched, snappy thud. No
//   crack (a bite/snap reads through brightness and shortness, not a
//   separate click).
// - orange: juicy — between tomato and apple: a brighter, shorter burst
//   than the melon-family fruits (a "spray" rather than a "splat"), a
//   mid-pitched thud. No crack (juice is a burst, not a shell breaking).
// - coconut: the only fruit with a crack (`crackGain > 0`) — a hard shell
//   breaking — plus a deep, hollow thud. Its own noise burst is quiet and
//   short; the crack carries the character.
const SPLAT_SOUND_MAX_GAIN = 0.6;
const SPLAT_SOUND_MAX_NOISE_DURATION = 0.6;
const SPLAT_SOUND_MAX_THUD_DURATION = 0.3;
const SPLAT_SOUND_MIN_FREQ_HZ = 60;
const SPLAT_SOUND_MAX_FREQ_HZ = 4000;

const SPLAT_SOUND_CHARACTER = {
  tomato: { noiseGainBase: 0.35, noiseDurationBase: 0.22, cutoffStart: 3000, cutoffEnd: 400, thudFreq: 150, crackGain: 0 },
  watermelon: { noiseGainBase: 0.4, noiseDurationBase: 0.3, cutoffStart: 2500, cutoffEnd: 300, thudFreq: 100, crackGain: 0 },
  apple: { noiseGainBase: 0.25, noiseDurationBase: 0.12, cutoffStart: 4000, cutoffEnd: 1200, thudFreq: 300, crackGain: 0 },
  orange: { noiseGainBase: 0.3, noiseDurationBase: 0.18, cutoffStart: 3500, cutoffEnd: 800, thudFreq: 220, crackGain: 0 },
  coconut: { noiseGainBase: 0.15, noiseDurationBase: 0.1, cutoffStart: 2000, cutoffEnd: 600, thudFreq: 90, crackGain: 0.35 }
};

function clampSplatNumber(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

// Pure: no engine, no Web Audio API. severity < 1 (held) is always a short
// dull thud with zero noise gain and zero crack, regardless of fruit — the
// fruit character (above) only applies once something has actually broken.
// `growth` scales monotonically with severity above 1 (clamped), so
// noiseGain/noiseDuration/thudGain/thudDuration/crackGain never decrease as
// severity rises through the tiers for a given fruit (unit-tested).
export function splatSoundFor({ fruit, severity, impactSpeed }) {
  void impactSpeed; // not currently used in the formula, kept for the call shape/future tuning

  const character = SPLAT_SOUND_CHARACTER[fruit] ?? SPLAT_SOUND_CHARACTER.watermelon;
  const held = severity < 1;
  const growth = clampSplatNumber((severity - 1) / 5, 0, 1); // 0 just past breaking, 1 by severity=6+

  if (held) {
    return {
      noiseGain: 0,
      noiseDuration: 0,
      cutoffStart: clampSplatNumber(character.cutoffStart, SPLAT_SOUND_MIN_FREQ_HZ, SPLAT_SOUND_MAX_FREQ_HZ),
      cutoffEnd: clampSplatNumber(character.cutoffEnd, SPLAT_SOUND_MIN_FREQ_HZ, SPLAT_SOUND_MAX_FREQ_HZ),
      thudFreq: clampSplatNumber(character.thudFreq, SPLAT_SOUND_MIN_FREQ_HZ, SPLAT_SOUND_MAX_FREQ_HZ),
      thudGain: clampSplatNumber(0.2, 0, SPLAT_SOUND_MAX_GAIN),
      thudDuration: clampSplatNumber(0.1, 0, SPLAT_SOUND_MAX_THUD_DURATION),
      crackGain: 0
    };
  }

  const noiseGain = clampSplatNumber(character.noiseGainBase + 0.15 * growth, 0, SPLAT_SOUND_MAX_GAIN);
  const noiseDuration = clampSplatNumber(character.noiseDurationBase + 0.2 * growth, 0, SPLAT_SOUND_MAX_NOISE_DURATION);
  const thudGain = clampSplatNumber(0.3 + 0.25 * growth, 0, SPLAT_SOUND_MAX_GAIN);
  const thudDuration = clampSplatNumber(0.14 + 0.08 * growth, 0, SPLAT_SOUND_MAX_THUD_DURATION);
  const crackGain = character.crackGain > 0 ? clampSplatNumber(character.crackGain + 0.1 * growth, 0, SPLAT_SOUND_MAX_GAIN) : 0;

  return {
    noiseGain,
    noiseDuration,
    cutoffStart: clampSplatNumber(character.cutoffStart, SPLAT_SOUND_MIN_FREQ_HZ, SPLAT_SOUND_MAX_FREQ_HZ),
    cutoffEnd: clampSplatNumber(character.cutoffEnd, SPLAT_SOUND_MIN_FREQ_HZ, SPLAT_SOUND_MAX_FREQ_HZ),
    thudFreq: clampSplatNumber(character.thudFreq, SPLAT_SOUND_MIN_FREQ_HZ, SPLAT_SOUND_MAX_FREQ_HZ),
    thudGain,
    thudDuration,
    crackGain
  };
}
