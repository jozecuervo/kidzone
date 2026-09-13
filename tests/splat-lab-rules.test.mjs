import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  BURST_JITTER_RANGE,
  BURST_K,
  E_BOUNCE,
  FRUIT_KEYS,
  HEIGHT_SLIDER_MAX,
  HEIGHT_SLIDER_MIN,
  LANDMARKS,
  MAX_TOUGHNESS,
  MIN_TOUGHNESS,
  bounceVelocity,
  breakSpeedFor,
  burstDirection,
  burstSpeed,
  burstVelocity,
  chunkShape,
  crossVec3,
  expectedImpactSpeed,
  formatHeight,
  fruitByKey,
  heightBarFor,
  heightFromSlider,
  heightSliderLabel,
  impactViewFor,
  jitterFactor,
  kFruitFor,
  layoutHash,
  pieceCountsForTier,
  pieceVelocity,
  releaseWobble,
  resultText,
  severityFor,
  shellPiece,
  shouldBreakFruit,
  sliderFromHeight,
  tierForSeverity,
  toughnessMultiplier,
  viewWidthFor
} from "../projects/splat-lab/rules.js";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// --- toughness multiplier m(t) ---------------------------------------------

test("toughnessMultiplier: exact pins at t=1, t=5, t=10", () => {
  assert.ok(Math.abs(toughnessMultiplier(1) - 0.4) < 1e-9);
  assert.ok(Math.abs(toughnessMultiplier(5) - 1) < 1e-9);
  assert.ok(Math.abs(toughnessMultiplier(10) - 4) < 1e-9);
});

test("toughnessMultiplier: strictly increasing over 1-10, continuous at t=5", () => {
  for (let t = MIN_TOUGHNESS; t < MAX_TOUGHNESS; t += 1) {
    assert.ok(
      toughnessMultiplier(t + 1) > toughnessMultiplier(t),
      `m(${t + 1}) should exceed m(${t})`
    );
  }
});

test("margin rule: at t=5, no landmark's sqrt(2gh) is within 10% of any fruit's break speed", () => {
  const presetSpeeds = LANDMARKS.map((landmark) => ({
    name: landmark.name,
    speed: expectedImpactSpeed(landmark.meters)
  }));

  for (const key of FRUIT_KEYS) {
    const fruit = fruitByKey(key);
    const bs = breakSpeedFor(fruit, 5);

    for (const preset of presetSpeeds) {
      const relToBreakSpeed = Math.abs(preset.speed - bs) / bs;
      const relToPresetSpeed = Math.abs(preset.speed - bs) / preset.speed;

      assert.ok(
        relToBreakSpeed >= 0.1 && relToPresetSpeed >= 0.1,
        `${key} breakSpeed ${bs} is within 10% of ${preset.name} (${preset.speed})`
      );
    }
  }
});

// --- severity tiers ----------------------------------------------------------

test("severity tier boundaries are exactly at 1.0, 1.6 and 3.0", () => {
  assert.equal(tierForSeverity(0.999999), "held");
  assert.equal(tierForSeverity(1), "cracked");
  assert.equal(tierForSeverity(1.599999), "cracked");
  assert.equal(tierForSeverity(1.6), "split");
  assert.equal(tierForSeverity(2.999999), "split");
  assert.equal(tierForSeverity(3), "smashed");
  assert.equal(tierForSeverity(10), "smashed");
});

test("severityFor divides impact speed by the fruit's break speed at that toughness", () => {
  const fruit = fruitByKey("watermelon");
  const bs = breakSpeedFor(fruit, 5);

  assert.ok(Math.abs(severityFor(bs * 2, fruit, 5) - 2) < 1e-9);
});

test("shouldBreakFruit matches the tier boundary at severity 1", () => {
  const fruit = fruitByKey("apple");
  const bs = breakSpeedFor(fruit, 5);

  assert.equal(shouldBreakFruit(bs, fruit, 5), true);
  assert.equal(shouldBreakFruit(bs - 0.001, fruit, 5), false);
});

// --- piece counts per tier and fruit -----------------------------------------

test("pieceCountsForTier: held tier has no pieces", () => {
  for (const key of FRUIT_KEYS) {
    const counts = pieceCountsForTier(fruitByKey(key), "held");
    assert.deepEqual(counts, { outer: 0, inner: 0, seeds: 0 });
  }
});

test("pieceCountsForTier: smashed tier matches each fruit's full counts exactly", () => {
  const watermelon = fruitByKey("watermelon");
  const counts = pieceCountsForTier(watermelon, "smashed");

  assert.deepEqual(counts, { outer: 12, inner: 12, seeds: 40 });

  const coconut = fruitByKey("coconut");
  const coconutCounts = pieceCountsForTier(coconut, "smashed");

  assert.deepEqual(coconutCounts, { outer: 10, inner: 8, seeds: 0 });
});

test("pieceCountsForTier: cracked and split scale down, with at least 2 outer pieces", () => {
  for (const key of FRUIT_KEYS) {
    const fruit = fruitByKey(key);

    for (const tier of ["cracked", "split"]) {
      const counts = pieceCountsForTier(fruit, tier);

      assert.ok(counts.outer >= 2, `${key} ${tier} outer count ${counts.outer} should be >= 2`);

      const total = counts.outer + counts.inner + counts.seeds;
      assert.ok(total <= 64, `${key} ${tier} total pieces ${total} exceeds 64`);
    }
  }
});

test("pieceCountsForTier: every fruit's smashed total is at most 64", () => {
  for (const key of FRUIT_KEYS) {
    const fruit = fruitByKey(key);
    const counts = pieceCountsForTier(fruit, "smashed");
    const total = counts.outer + counts.inner + counts.seeds;

    assert.ok(total <= 64, `${key} smashed total ${total} exceeds 64`);
  }
});

// --- chunkShape / shellPiece --------------------------------------------------

test("chunkShape: deterministic for a seed, has at least 12 vertices, and has radial spread", () => {
  const a = chunkShape(7);
  const b = chunkShape(7);

  assert.deepEqual(a, b);
  assert.ok(a.positions.length >= 12);

  const distances = a.positions.map((p) => Math.hypot(...p));
  const mean = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  const spread = Math.max(...distances) - Math.min(...distances);

  assert.ok(spread >= 0.2 * mean, `spread ${spread} should be >= 0.2 * mean (${mean})`);
});

test("chunkShape: different seeds give different shapes", () => {
  const a = chunkShape(1);
  const b = chunkShape(2);

  assert.notDeepEqual(a.positions, b.positions);
});

test("shellPiece: deterministic for a seed, not flat (non-zero normal spread)", () => {
  const fruit = fruitByKey("watermelon");
  const a = shellPiece(3, fruit);
  const b = shellPiece(3, fruit);

  assert.deepEqual(a, b);

  // "Not flat": the outer face's sampled normals must not all be equal.
  const normals = a.outerNormals;
  let maxPairwiseDistance = 0;

  for (let i = 0; i < normals.length; i += 1) {
    for (let j = i + 1; j < normals.length; j += 1) {
      const distance = Math.hypot(
        normals[i][0] - normals[j][0],
        normals[i][1] - normals[j][1],
        normals[i][2] - normals[j][2]
      );
      maxPairwiseDistance = Math.max(maxPairwiseDistance, distance);
    }
  }

  assert.ok(maxPairwiseDistance > 0, "shellPiece outer normals should vary across the patch (a curved surface)");
});

test("shellPiece: different seeds give different patches, and colors come from the fruit", () => {
  const fruit = fruitByKey("watermelon");
  const a = shellPiece(1, fruit);
  const b = shellPiece(2, fruit);

  assert.notDeepEqual(a.positions, b.positions);
  assert.equal(a.outerColor, fruit.shellOuterColor);
  assert.equal(a.innerColor, fruit.shellInnerColor);
});

// --- result text ---------------------------------------------------------------

test("resultText: held", () => {
  const text = resultText({
    fruit: fruitByKey("watermelon"),
    heightMeters: 1,
    impactSpeed: 4.4,
    tier: "held",
    outerCount: 0,
    seedCount: 0
  });

  assert.equal(text, "Dropped a watermelon from 1.0 m. Hit the ground at 4.4 m/s. It held and bounced.");
});

test("resultText: cracked, split and smashed use their own verb and fly-word", () => {
  const fruit = fruitByKey("watermelon");
  const base = { fruit, heightMeters: 1, impactSpeed: 4.4, outerCount: 3, seedCount: 10 };

  assert.equal(
    resultText({ ...base, tier: "cracked" }),
    "Dropped a watermelon from 1.0 m. Hit the ground at 4.4 m/s. It cracked into 3 pieces and 10 seeds fell out."
  );
  assert.equal(
    resultText({ ...base, tier: "split" }),
    "Dropped a watermelon from 1.0 m. Hit the ground at 4.4 m/s. It split into 3 pieces and 10 seeds fell out."
  );
  assert.equal(
    resultText({ ...base, tier: "smashed", outerCount: 12, seedCount: 40 }),
    "Dropped a watermelon from 1.0 m. Hit the ground at 4.4 m/s. It smashed into 12 pieces and 40 seeds flew out."
  );
});

test("resultText: coconut's no-seed form ends after 'pieces.'", () => {
  const text = resultText({
    fruit: fruitByKey("coconut"),
    heightMeters: 25,
    impactSpeed: 22.1,
    tier: "cracked",
    outerCount: 3,
    seedCount: 0
  });

  assert.equal(text, "Dropped a coconut from 25 m. Hit the ground at 22.1 m/s. It cracked into 3 pieces.");
});

test("resultText: a/an by fruit", () => {
  assert.ok(
    resultText({
      fruit: fruitByKey("apple"),
      heightMeters: 5,
      impactSpeed: 10,
      tier: "held",
      outerCount: 0,
      seedCount: 0
    }).startsWith("Dropped an apple")
  );
  assert.ok(
    resultText({
      fruit: fruitByKey("orange"),
      heightMeters: 5,
      impactSpeed: 10,
      tier: "held",
      outerCount: 0,
      seedCount: 0
    }).startsWith("Dropped an orange")
  );
  assert.ok(
    resultText({
      fruit: fruitByKey("tomato"),
      heightMeters: 5,
      impactSpeed: 10,
      tier: "held",
      outerCount: 0,
      seedCount: 0
    }).startsWith("Dropped a tomato")
  );
  assert.ok(
    resultText({
      fruit: fruitByKey("coconut"),
      heightMeters: 5,
      impactSpeed: 10,
      tier: "held",
      outerCount: 0,
      seedCount: 0
    }).startsWith("Dropped a coconut")
  );
});

// --- velocity formula (unchanged pure functions, still fruit-agnostic) -------

test("bounceVelocity keeps the tangential part and partially reflects the normal part", () => {
  const result = bounceVelocity([2, -34.3, -1], E_BOUNCE);

  assert.equal(result[0], 2);
  assert.ok(Math.abs(result[1] - E_BOUNCE * 34.3) < 1e-9);
  assert.equal(result[2], -1);
});

test("crossVec3 matches the standard right-hand-rule cross product", () => {
  assert.deepEqual(crossVec3([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
  assert.deepEqual(crossVec3([0, 1, 0], [1, 0, 0]), [0, 0, -1]);
});

test("burstDirection lifts a downward-pointing r to point sideways/up, and normalises", () => {
  const direction = burstDirection([1, -1, 0]);

  assert.ok(direction[1] >= 0, "burst direction must never point into the ground");
  const length = Math.hypot(...direction);
  assert.ok(Math.abs(length - 1) < 1e-9);
});

test("burstDirection falls back to straight up when r is (near) the centre", () => {
  assert.deepEqual(burstDirection([0, 0, 0]), [0, 1, 0]);
  assert.deepEqual(burstDirection([1e-10, -1e-10, 1e-10]), [0, 1, 0]);
});

test("burstSpeed is zero at or below breakSpeed and grows linearly with K above it", () => {
  assert.equal(burstSpeed(10, 15, 0.04), 0);
  assert.equal(burstSpeed(15, 15, 0.04), 0);
  assert.ok(Math.abs(burstSpeed(20, 15, 0.04) - 0.04 * 5) < 1e-9);
});

test("jitterFactor stays within 1 +/- BURST_JITTER_RANGE and is linear in its input", () => {
  assert.ok(Math.abs(jitterFactor(0) - (1 - BURST_JITTER_RANGE)) < 1e-9);
  assert.ok(Math.abs(jitterFactor(1) - (1 + BURST_JITTER_RANGE)) < 1e-9);
  assert.ok(Math.abs(jitterFactor(0.5) - 1) < 1e-9);
});

test("burstVelocity has zero magnitude below breakSpeed regardless of direction", () => {
  const result = burstVelocity({
    impactSpeed: 10,
    breakSpeedValue: 15,
    r: [1, 1, 1],
    jitter: 1.1,
    k: BURST_K
  });

  assert.deepEqual(result, [0, 0, 0]);
});

test("pieceVelocity combines bounce, spin and burst additively", () => {
  const velocity = [1, -10, 2];
  const angularVelocity = [0, 1, 0];
  const r = [1, 0, 0];

  const result = pieceVelocity({
    velocity,
    angularVelocity,
    r,
    impactSpeed: 30,
    breakSpeedValue: 10,
    jitter: 1,
    k: 0,
    e: E_BOUNCE
  });

  const expectedBounce = bounceVelocity(velocity, E_BOUNCE);
  const expectedSpin = crossVec3(angularVelocity, r);

  assert.ok(Math.abs(result[0] - (expectedBounce[0] + expectedSpin[0])) < 1e-9);
  assert.ok(Math.abs(result[1] - (expectedBounce[1] + expectedSpin[1])) < 1e-9);
  assert.ok(Math.abs(result[2] - (expectedBounce[2] + expectedSpin[2])) < 1e-9);
});

test("kFruitFor scales the burst constant by fruit radius relative to the watermelon reference", () => {
  const watermelon = fruitByKey("watermelon");
  const tomato = fruitByKey("tomato");

  assert.ok(Math.abs(kFruitFor(watermelon, 0.01) - 0.01) < 1e-9);
  assert.ok(Math.abs(kFruitFor(tomato, 0.01) - 0.01 * (tomato.radius / 0.15)) < 1e-9);
});

// --- height bar --------------------------------------------------------------

test("heightBarFor: fraction is exactly 1 at melonY = heightM and 0 at melonY = 0", () => {
  assert.equal(heightBarFor({ melonY: 10, heightM: 10 }).fraction, 1);
  assert.equal(heightBarFor({ melonY: 0, heightM: 10 }).fraction, 0);
});

test("heightBarFor: fraction and melonY are clamped for out-of-range melonY", () => {
  assert.equal(heightBarFor({ melonY: 15, heightM: 10 }).fraction, 1);
  assert.equal(heightBarFor({ melonY: -1, heightM: 10 }).fraction, 0);
  assert.equal(heightBarFor({ melonY: 15, heightM: 10 }).label, "10 m");
  assert.equal(heightBarFor({ melonY: -1, heightM: 10 }).label, "0.0 m");
});

test("heightBarFor: ticks include only landmarks at or below heightM", () => {
  const roofTicks = heightBarFor({ melonY: 5, heightM: 10 }).ticks.map((tick) => tick.name);
  assert.deepEqual(roofTicks, ["Knee", "Counter", "Treehouse", "Roof"]);

  const planeTicks = heightBarFor({ melonY: 30, heightM: 60 }).ticks.map((tick) => tick.name);
  assert.deepEqual(planeTicks, LANDMARKS.map((landmark) => landmark.name));
});

test("heightBarFor: label uses formatHeight (one decimal below 10 m, whole metres at or above)", () => {
  assert.equal(heightBarFor({ melonY: 60, heightM: 60 }).label, "60 m");
  assert.equal(heightBarFor({ melonY: 9.6, heightM: 10 }).label, formatHeight(9.6));
  assert.equal(heightBarFor({ melonY: 0.4, heightM: 10 }).label, "0.4 m");
});

// --- §7: continuous height slider ---------------------------------------------

test("heightFromSlider: endpoints are 0.3 m and 60 m", () => {
  assert.ok(Math.abs(heightFromSlider(HEIGHT_SLIDER_MIN) - 0.3) < 1e-9);
  assert.ok(Math.abs(heightFromSlider(HEIGHT_SLIDER_MAX) - 60) < 1e-6);
});

test("heightFromSlider: monotonically increasing", () => {
  let previous = heightFromSlider(0);

  for (let v = 50; v <= 1000; v += 50) {
    const current = heightFromSlider(v);
    assert.ok(current > previous, `heightFromSlider(${v}) should exceed the previous value`);
    previous = current;
  }
});

test("sliderFromHeight is the inverse of heightFromSlider", () => {
  for (const v of [0, 1, 227, 500, 662, 999, 1000]) {
    const height = heightFromSlider(v);
    const roundTripped = sliderFromHeight(height);

    assert.ok(Math.abs(roundTripped - v) < 1e-6, `round trip for slider value ${v} gave ${roundTripped}`);
  }
});

test("sliderFromHeight places every landmark meters value inside [0, 1000]", () => {
  for (const landmark of LANDMARKS) {
    const v = sliderFromHeight(landmark.meters);
    assert.ok(v >= HEIGHT_SLIDER_MIN - 1e-6 && v <= HEIGHT_SLIDER_MAX + 1e-6, `${landmark.name} slider value ${v} out of range`);
  }
});

test("formatHeight: one decimal place below 10 m, rounded whole metres at or above 10 m", () => {
  assert.equal(formatHeight(0.3), "0.3 m");
  assert.equal(formatHeight(7.3), "7.3 m");
  assert.equal(formatHeight(9.96), "10.0 m");
  assert.equal(formatHeight(10), "10 m");
  assert.equal(formatHeight(10.4), "10 m");
  assert.equal(formatHeight(60), "60 m");
});

test("heightSliderLabel: appends '(about <Landmark>)' within 10% relative distance, omits it otherwise", () => {
  assert.equal(heightSliderLabel(1.0), "1.0 m (about Counter)");
  assert.equal(heightSliderLabel(60), "60 m (about Plane)");
  assert.equal(heightSliderLabel(7.3), "7.3 m");
});

// --- camera framing per fruit --------------------------------------------------

test("viewWidthFor equals 25x the fruit's radius", () => {
  for (const key of FRUIT_KEYS) {
    const fruit = fruitByKey(key);
    assert.ok(Math.abs(viewWidthFor(fruit) - 25 * fruit.radius) < 1e-9);
  }
});

// Pinhole camera maths, independent of view.js/three.js: builds a camera
// basis from position -> target with world up (0,1,0), then projects a
// world point to normalized device coordinates using the returned vertical
// fov and the given aspect ratio.
function projectToNdc(point, { position, target, fov }, aspect) {
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

  const forward = normalize(sub(target, position));
  const worldUp = [0, 1, 0];
  const right = normalize(cross(forward, worldUp));
  const up = cross(right, forward);
  const relative = sub(point, position);
  const camX = dot(relative, right);
  const camY = dot(relative, up);
  const camZ = dot(relative, forward);
  const verticalHalfFovRad = (fov * Math.PI) / 180 / 2;
  const tanVertical = Math.tan(verticalHalfFovRad);

  return {
    ndcX: camX / (camZ * tanVertical * aspect),
    ndcY: camY / (camZ * tanVertical),
    inFront: camZ > 0
  };
}

function visibleWidthAt({ position, target, fov }, aspect) {
  const distance = Math.hypot(
    position[0] - target[0],
    position[1] - target[1],
    position[2] - target[2]
  );
  const verticalHalfFovRad = (fov * Math.PI) / 180 / 2;
  const visibleHeight = 2 * distance * Math.tan(verticalHalfFovRad);

  return visibleHeight * aspect;
}

const VIEW_SIZES = [
  { width: 390, height: 844 },
  { width: 1280, height: 900 }
];

test("impactViewFor: vertical fov stays <= 75 degrees at both sizes, for every fruit", () => {
  for (const key of FRUIT_KEYS) {
    const fruit = fruitByKey(key);

    for (const size of VIEW_SIZES) {
      const view = impactViewFor({ ...size, fruit });

      assert.ok(view.fov <= 75, `${key} at ${JSON.stringify(size)}: fov ${view.fov} exceeds 75`);
    }
  }
});

test("impactViewFor: visible ground width matches viewWidthFor within +/-5%, for every fruit at both sizes", () => {
  for (const key of FRUIT_KEYS) {
    const fruit = fruitByKey(key);
    const expectedWidth = viewWidthFor(fruit);

    for (const size of VIEW_SIZES) {
      const view = impactViewFor({ ...size, fruit });
      const aspect = size.width / size.height;
      const width = visibleWidthAt(view, aspect);

      assert.ok(
        Math.abs(width - expectedWidth) / expectedWidth <= 0.05,
        `${key} at ${JSON.stringify(size)}: visible width ${width} not within 5% of ${expectedWidth}`
      );
    }
  }
});

test("impactViewFor: the contact point is inside the view, for every fruit at both sizes", () => {
  for (const key of FRUIT_KEYS) {
    const fruit = fruitByKey(key);

    for (const size of VIEW_SIZES) {
      const view = impactViewFor({ ...size, fruit });
      const aspect = size.width / size.height;
      const projected = projectToNdc([0, 0, 0], view, aspect);

      assert.ok(projected.inFront);
      assert.ok(Math.abs(projected.ndcX) <= 1);
      assert.ok(Math.abs(projected.ndcY) <= 1);
    }
  }
});

test("impactViewFor: same inputs give deep-equal outputs", () => {
  const fruit = fruitByKey("watermelon");
  const first = impactViewFor({ width: 1280, height: 900, fruit });
  const second = impactViewFor({ width: 1280, height: 900, fruit });

  assert.deepEqual(first, second);
});

// --- §7: release wobble --------------------------------------------------------

function makeRng(sequence) {
  let i = 0;
  return () => sequence[i++ % sequence.length];
}

test("releaseWobble: deterministic for the same rng sequence", () => {
  const a = releaseWobble(makeRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]));
  const b = releaseWobble(makeRng([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]));

  assert.deepEqual(a, b);
});

test("releaseWobble: tilt stays within +/-8 degrees, spin within [0, 1.5], horizontal speed within [0, 0.05]", () => {
  for (let seed = 0; seed < 50; seed += 1) {
    let s = seed + 1;
    const rng = () => {
      s = (s * 1103515245 + 12345) >>> 0;
      return s / 0xffffffff;
    };

    const wobble = releaseWobble(rng);

    // quaternion axis-angle: |sin(angle/2)| bounds the tilt angle directly.
    const sinHalf = Math.hypot(wobble.quaternion[0], wobble.quaternion[1], wobble.quaternion[2]);
    const tiltAngleDeg = 2 * Math.asin(Math.min(1, sinHalf)) * (180 / Math.PI);
    assert.ok(tiltAngleDeg <= 8 + 1e-6, `tilt ${tiltAngleDeg} exceeds 8 degrees`);

    const spinMagnitude = Math.hypot(...wobble.angularVelocity);
    assert.ok(spinMagnitude >= 0 && spinMagnitude <= 1.5 + 1e-9, `spin ${spinMagnitude} out of [0, 1.5]`);

    const horizontalSpeed = Math.hypot(wobble.velocity[0], wobble.velocity[2]);
    assert.ok(horizontalSpeed >= 0 && horizontalSpeed <= 0.05 + 1e-9, `horizontal speed ${horizontalSpeed} out of [0, 0.05]`);
    assert.equal(wobble.velocity[1], 0, "release wobble must not add vertical velocity");
  }
});

// --- §7: layoutHash --------------------------------------------------------------

test("layoutHash: deterministic for the same positions", () => {
  const positions = [[1, 2, 3], [4, 5, 6]];

  assert.equal(layoutHash(positions), layoutHash(positions));
  assert.equal(layoutHash([[1, 2, 3], [4, 5, 6]]), layoutHash([[1, 2, 3], [4, 5, 6]]));
});

test("layoutHash: sensitive to a 1e-3 m change in a single coordinate", () => {
  const base = [[1, 2, 3], [4, 5, 6]];
  const nudged = [[1, 2, 3], [4.001, 5, 6]];

  assert.notEqual(layoutHash(base), layoutHash(nudged));
});

test("layoutHash: order-sensitive (different piece order gives a different hash)", () => {
  const a = [[1, 2, 3], [4, 5, 6]];
  const b = [[4, 5, 6], [1, 2, 3]];

  assert.notEqual(layoutHash(a), layoutHash(b));
});

test("devDependency versions match the CDN URL versions declared in project.json", async () => {
  const packageJson = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8"));
  const projectJson = JSON.parse(
    await readFile(join(repoRoot, "projects/splat-lab/project.json"), "utf8")
  );

  const urlVersion = (url) => {
    const match = url.match(/\/npm\/([^/]+)@([^/]+)\//);
    assert.ok(match, `could not parse package/version from ${url}`);
    return { name: match[1], version: match[2] };
  };

  const dependencies = projectJson.runtime.externalDependencies;
  assert.equal(dependencies.length, 3, "expected three declared external dependencies");

  for (const dependency of dependencies) {
    const { name, version } = urlVersion(dependency.url);
    const devDependencyVersion = packageJson.devDependencies[name];

    assert.ok(devDependencyVersion, `package.json devDependencies is missing ${name}`);
    assert.equal(
      devDependencyVersion,
      version,
      `${name} devDependency version should match the CDN URL version in ${dependency.url}`
    );
  }
});

