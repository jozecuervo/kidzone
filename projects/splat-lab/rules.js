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

export const MIN_TOUGHNESS = 1;
export const MAX_TOUGHNESS = 10;
export const DEFAULT_TOUGHNESS = 5;

export const MAX_DYNAMIC_BODIES = 150;
export const MAX_PIECES_PER_FRUIT = 64;

export const GRAVITY = 9.81;
export const FIXED_STEP = 1 / 60;
export const MAX_SIMULATED_SECONDS = 8;
export const MAX_SETTLE_STEPS = Math.round(MAX_SIMULATED_SECONDS / FIXED_STEP);

// Step 1b (2026-09-12): five fruits, each a playful approximation (see
// README). breakSpeed here is "at normal toughness" (t = 5); the actual
// threshold used at drop time is breakSpeedFor(fruit, toughness).
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
export function phaseAfter(phase, action) {
  if (action === "reset") return "ready";
  if (phase === "ready" && action === "drop") return "falling";
  if (phase === "falling" && action === "settle") return "settled";
  return phase;
}

// Toughness multiplier m(t): piecewise-geometric (CTO-accepted; one
// geometric sequence can't hit all three pins m(1)=0.4, m(5)=1, m(10)=4).
// Both branches agree at t = 5 (each gives 1), so m is continuous and
// strictly increasing over the whole 1-10 range.
export function toughnessMultiplier(t) {
  if (t <= 5) return 0.4 * Math.pow(2.5, (t - 1) / 4);

  return Math.pow(4, (t - 5) / 5);
}

export function breakSpeedFor(fruit, toughness) {
  return fruit.breakSpeed * toughnessMultiplier(toughness);
}

export function shouldBreakFruit(impactSpeed, fruit, toughness) {
  return Math.abs(impactSpeed) >= breakSpeedFor(fruit, toughness);
}

export function severityFor(impactSpeed, fruit, toughness) {
  return Math.abs(impactSpeed) / breakSpeedFor(fruit, toughness);
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

export function instructionsForPhase(phase) {
  if (phase === "ready") return "Pick a fruit, a height and a toughness, then press Drop.";
  if (phase === "falling") return "Watch it fall...";
  return "Read the result below, then press Reset to try again.";
}

export function controlsEnabledForPhase(phase) {
  return {
    fruitRadios: phase === "ready",
    heightSlider: phase === "ready",
    toughnessSlider: phase === "ready",
    dropButton: phase === "ready",
    resetButton: true,
    skipButton: phase === "falling"
  };
}

// Camera framing per fruit (step 1b §5, replacing the fixed-width step 1
// camera): the ground width is exactly 25x the fruit's radius (so the fruit
// is 8% of the frame width), and the vertical field of view stays at or
// below 75 degrees at every aspect ratio. Position/target are constants for
// a given fruit — the same for every screen size — and only the vertical
// fov (three.js convention) varies with aspect, exactly like step 1's
// camera. The narrowest supported aspect (390x844 portrait) needs the
// largest vertical fov for a given width, so sizing the camera distance
// against that aspect and the fov cap keeps every wider aspect safely
// under the cap too (a wider aspect needs LESS vertical fov for the same
// width). Because horizontal fov is fixed by width/distance alone, the
// visible width comes out to exactly W at any aspect, not just the
// reference one.
export function viewWidthFor(fruit) {
  return 25 * fruit.radius;
}

const IMPACT_VIEW_MAX_VERTICAL_FOV_DEG = 75;
const IMPACT_VIEW_REFERENCE_ASPECT = 390 / 844;
// A small margin so floating-point rounding never nudges the reference
// aspect's fov a hair past the 75 degree cap.
const IMPACT_VIEW_DISTANCE_MARGIN = 1.02;
// Fixed elevation direction from the target to the camera (same angle for
// every fruit and aspect; only the distance along it changes per fruit).
const IMPACT_VIEW_DIRECTION = (() => {
  const raw = [0, 0.24, 1];
  const length = Math.hypot(...raw);

  return raw.map((component) => component / length);
})();

function impactViewDistanceForWidth(width) {
  const capRad = (IMPACT_VIEW_MAX_VERTICAL_FOV_DEG * Math.PI) / 180;
  const minDistance = width / (2 * IMPACT_VIEW_REFERENCE_ASPECT * Math.tan(capRad / 2));

  return minDistance * IMPACT_VIEW_DISTANCE_MARGIN;
}

export function impactViewFor({ width, height, fruit }) {
  const aspect = width / height;
  const groundWidth = viewWidthFor(fruit);
  const distance = impactViewDistanceForWidth(groundWidth);
  const position = IMPACT_VIEW_DIRECTION.map((component) => component * distance);
  const target = [0, 0, 0];
  const horizontalHalfFovRad = Math.atan(groundWidth / 2 / distance);
  const verticalHalfFovRad = Math.atan(Math.tan(horizontalHalfFovRad) / aspect);
  const fov = verticalHalfFovRad * 2 * (180 / Math.PI);

  return { position, target, fov };
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

// The height bar's data (unchanged from step 1): melonY is the fruit's
// lowest point above the ground (view.js passes centre y minus radius
// while the fruit exists, and 0 once it has split), and heightM is the
// chosen drop height.
export function heightBarFor({ melonY, heightM }) {
  const fraction = clampNumber(melonY / heightM, 0, 1);
  const label = formatHeight(clampNumber(melonY, 0, heightM));
  const ticks = LANDMARKS.filter((landmark) => landmark.meters <= heightM).map((landmark) => ({
    name: landmark.name,
    meters: landmark.meters,
    fraction: landmark.meters / heightM
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
