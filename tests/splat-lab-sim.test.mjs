import assert from "node:assert/strict";
import test from "node:test";

import { createSim } from "../projects/splat-lab/sim.js";
import {
  BURST_K,
  E_BOUNCE,
  FRUIT_KEYS,
  LANDMARKS,
  MAX_DYNAMIC_BODIES,
  MAX_SETTLE_STEPS,
  UI_SETTLE_STEPS_AFTER_IMPACT,
  containmentWidthFor,
  expectedImpactSpeed,
  fruitByKey,
  kFruitFor
} from "../projects/splat-lab/rules.js";

const landmarkMeters = Object.fromEntries(LANDMARKS.map((l) => [l.name.toUpperCase(), l.meters]));
const KNEE_M = landmarkMeters.KNEE;
const COUNTER_M = landmarkMeters.COUNTER;
const TREEHOUSE_M = landmarkMeters.TREEHOUSE;
const ROOF_M = landmarkMeters.ROOF;
const CRANE_M = landmarkMeters.CRANE;
const PLANE_M = landmarkMeters.PLANE;

const MAX_STEPS_TO_SETTLE = 600;
const SEEDS_20 = Array.from({ length: 20 }, (_, i) => i + 1);

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function norm(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function reconstructBurst(split, r, jitter) {
  const excess = Math.max(0, split.impactSpeed - split.breakSpeed);
  const magnitude = split.k * excess * jitter;
  const liftedY = Math.max(0, r[1]);
  const length = Math.hypot(r[0], liftedY, r[2]);
  const direction = length < 1e-9 ? [0, 1, 0] : [r[0] / length, liftedY / length, r[2] / length];

  return direction.map((component) => component * magnitude);
}

// Step 1b §11b (spawn ruling v3): `phase` now settles for display purposes
// well before physics necessarily does (decision 7: active/settled merge
// the old phase/uiPhase distinction). step() itself keeps advancing real
// physics past a "settled" phase and only becomes a true no-op once the
// scene is physics-idle (every body asleep, or 480 steps since the last
// press — decision 8). So to reach the same numeric end-state the old
// physics-settle loop reached (full sleep or the 480 cap), keep stepping
// until sim.steps stops advancing (a no-op call), not until phase reads
// "settled". Returns sim.steps at that point, same as the old return value.
function runToSettled(sim, maxSteps = MAX_STEPS_TO_SETTLE) {
  let iterations = 0;
  let prevSteps = sim.steps;

  while (iterations < maxSteps) {
    sim.step();
    iterations += 1;

    if (sim.steps === prevSteps) break; // physics went idle; step() was a no-op

    prevSteps = sim.steps;
  }

  assert.equal(sim.phase, "settled", "sim did not settle within the step budget");

  return sim.steps;
}

// A single full Plane run (real break speed) per (fruit, seed), computed once
// and shared across containment, ground-clause, spawn and energy assertions
// (the sim test file's own performance budget: 20 seeds x 5 fruits would
// otherwise re-run the same drop 3-4 times each).
const planeRunCache = new Map();

function runPlaneReal(fruitKey) {
  return (seed) => {
    const cacheKey = `${fruitKey}:${seed}`;

    if (planeRunCache.has(cacheKey)) return planeRunCache.get(cacheKey);

    const sim = createSim({ seed, heightM: PLANE_M, fruit: fruitKey });

    sim.drop();

    let splitStep = null;
    let spawnPieces = null;
    let impactPoint = null;
    let impactSpeed = null;
    let meanSpeedPlus10 = null;
    let lowestCentreEver = Infinity;
    let steps = 0;
    let anyNaN = false;
    let prevSimSteps = sim.steps;

    while (steps < MAX_STEPS_TO_SETTLE) {
      const before = sim.bodies();

      sim.step();
      steps += 1;

      const after = sim.bodies();

      if (splitStep === null && before.length === 1 && after.length > 1) {
        splitStep = steps;
        spawnPieces = after;
        impactPoint = [sim.lastSplit.centre[0], sim.lastSplit.centre[2]];
        impactSpeed = sim.lastSplit.impactSpeed;
      }

      if (splitStep !== null) {
        for (const body of after) {
          for (const value of [...body.position, ...body.velocity, ...body.angularVelocity]) {
            if (!Number.isFinite(value)) anyNaN = true;
          }

          lowestCentreEver = Math.min(lowestCentreEver, body.position[1]);
        }

        if (steps === splitStep + 10) {
          const speeds = after.map((body) => Math.hypot(...body.velocity));

          meanSpeedPlus10 = speeds.reduce((a, b) => a + b, 0) / speeds.length;
        }
      }

      // Physics went idle (a step() call that made no progress): keep the
      // loop's own `steps` counter as the number of step() calls issued
      // (matching the old return semantics used below), but stop — nothing
      // further will change.
      if (sim.steps === prevSimSteps) break;

      prevSimSteps = sim.steps;
    }

    const settled = sim.phase === "settled";
    const finalBodies = sim.bodies();
    const lastSplit = sim.lastSplit;

    const result = {
      fruitKey,
      seed,
      settled,
      splitStep,
      spawnPieces,
      impactPoint,
      impactSpeed,
      meanSpeedPlus10,
      lowestCentreEver,
      finalBodies,
      lastSplit,
      anyNaN
    };

    planeRunCache.set(cacheKey, result);

    return result;
  };
}

function runDeadControlPlaneReal(fruitKey, seed) {
  const sim = createSim({
    seed,
    heightM: PLANE_M,
    fruit: fruitKey,
    tuning: { burstK: 0, bounceE: 0, lift: true }
  });

  sim.drop();

  let splitStep = null;
  let meanSpeedPlus10 = null;
  let steps = 0;
  let prevSimSteps = sim.steps;

  while (steps < MAX_STEPS_TO_SETTLE) {
    const before = sim.bodies();

    sim.step();
    steps += 1;

    const after = sim.bodies();

    if (splitStep === null && before.length === 1 && after.length > 1) {
      splitStep = steps;
    }

    if (splitStep !== null && steps === splitStep + 10) {
      const speeds = after.map((body) => Math.hypot(...body.velocity));

      meanSpeedPlus10 = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    }

    if (sim.steps === prevSimSteps) break;

    prevSimSteps = sim.steps;
  }

  return meanSpeedPlus10;
}

// --- §2 pinned guarantees at t=5, over seeds 1-20 -----------------------------

test("§2 pin: watermelon holds from Knee, cracks from Counter (t=5, seeds 1-20)", () => {
  for (const seed of SEEDS_20) {
    const knee = createSim({ seed, heightM: KNEE_M, fruit: "watermelon" });
    knee.drop();
    runToSettled(knee);
    assert.equal(knee.summary.tier, "held", `seed ${seed}`);

    const counter = createSim({ seed, heightM: COUNTER_M, fruit: "watermelon" });
    counter.drop();
    runToSettled(counter);
    assert.notEqual(counter.summary.tier, "held", `seed ${seed}`);
  }
});

test("§2 pin: tomato cracks from Knee (t=5, seeds 1-20)", () => {
  for (const seed of SEEDS_20) {
    const sim = createSim({ seed, heightM: KNEE_M, fruit: "tomato" });
    sim.drop();
    runToSettled(sim);
    assert.notEqual(sim.summary.tier, "held", `seed ${seed}`);
  }
});

test("§2 pin: apple holds from Counter, breaks from Treehouse (t=5, seeds 1-20)", () => {
  for (const seed of SEEDS_20) {
    const counter = createSim({ seed, heightM: COUNTER_M, fruit: "apple" });
    counter.drop();
    runToSettled(counter);
    assert.equal(counter.summary.tier, "held", `seed ${seed}`);

    const treehouse = createSim({ seed, heightM: TREEHOUSE_M, fruit: "apple" });
    treehouse.drop();
    runToSettled(treehouse);
    assert.notEqual(treehouse.summary.tier, "held", `seed ${seed}`);
  }
});

test("§2 pin: orange holds from Counter, breaks from Treehouse (t=5, seeds 1-20)", () => {
  for (const seed of SEEDS_20) {
    const counter = createSim({ seed, heightM: COUNTER_M, fruit: "orange" });
    counter.drop();
    runToSettled(counter);
    assert.equal(counter.summary.tier, "held", `seed ${seed}`);

    const treehouse = createSim({ seed, heightM: TREEHOUSE_M, fruit: "orange" });
    treehouse.drop();
    runToSettled(treehouse);
    assert.notEqual(treehouse.summary.tier, "held", `seed ${seed}`);
  }
});

test("§2 pin: coconut holds from Roof, breaks from Crane (t=5, seeds 1-20)", () => {
  for (const seed of SEEDS_20) {
    const roof = createSim({ seed, heightM: ROOF_M, fruit: "coconut" });
    roof.drop();
    runToSettled(roof);
    assert.equal(roof.summary.tier, "held", `seed ${seed}`);

    const crane = createSim({ seed, heightM: CRANE_M, fruit: "coconut" });
    crane.drop();
    runToSettled(crane);
    assert.notEqual(crane.summary.tier, "held", `seed ${seed}`);
  }
});

// Report the min/max severity per pin across seeds 1-20 (report requirement).
test("§2 pin severities: report min/max severity per pin across seeds 1-20", () => {
  const report = {};
  const pins = [
    ["watermelon", KNEE_M, "Knee"],
    ["watermelon", COUNTER_M, "Counter"],
    ["tomato", KNEE_M, "Knee"],
    ["apple", COUNTER_M, "Counter"],
    ["apple", TREEHOUSE_M, "Treehouse"],
    ["orange", COUNTER_M, "Counter"],
    ["orange", TREEHOUSE_M, "Treehouse"],
    ["coconut", ROOF_M, "Roof"],
    ["coconut", CRANE_M, "Crane"]
  ];

  for (const [fruitKey, heightM, label] of pins) {
    const severities = SEEDS_20.map((seed) => {
      const sim = createSim({ seed, heightM, fruit: fruitKey });
      sim.drop();
      runToSettled(sim);
      return sim.summary.severity;
    });

    report[`${fruitKey}@${label}`] = { min: Math.min(...severities), max: Math.max(...severities) };
  }

  // eslint-disable-next-line no-console
  console.log("§2 pin severities (min/max over seeds 1-20):", JSON.stringify(report, null, 2));
});

test("watermelon tier sequence never decreases from Knee to Counter to Roof to Plane (t=5, seeds 1-20)", () => {
  const TIER_RANK = { held: 0, cracked: 1, split: 2, smashed: 3 };

  for (const seed of SEEDS_20) {
    const sequence = [KNEE_M, COUNTER_M, ROOF_M, PLANE_M].map((heightM) => {
      const sim = createSim({ seed, heightM, fruit: "watermelon" });
      sim.drop();
      runToSettled(sim);
      return sim.summary.tier;
    });

    for (let i = 1; i < sequence.length; i += 1) {
      assert.ok(
        TIER_RANK[sequence[i]] >= TIER_RANK[sequence[i - 1]],
        `seed ${seed}: tier went down: ${sequence[i - 1]} -> ${sequence[i]} (full sequence ${sequence.join(", ")})`
      );
    }
  }
});

// --- T1: velocity formula, for watermelon AND tomato, computing K_fruit itself -

function runT1(fruitKey) {
  const sim = createSim({ seed: 7, heightM: PLANE_M, fruit: fruitKey });

  sim.drop();

  let preSplitFruit = null;
  let pieces = null;
  let steps = 0;

  while (pieces === null && steps < MAX_STEPS_TO_SETTLE) {
    const before = sim.bodies();

    sim.step();
    steps += 1;

    const after = sim.bodies();

    if (before.length === 1 && before[0].kind === "fruit" && after.length > 1) {
      preSplitFruit = before[0];
      pieces = after;
    }
  }

  assert.ok(preSplitFruit, `${fruitKey}: split never happened`);

  const split = sim.lastSplit;
  assert.ok(split, `${fruitKey}: expected lastSplit to be populated after a break`);

  // T1 requirement (step 1b §7): needs measurable spin. Confirm the release
  // wobble gave this drop a spin magnitude >= 0.5 rad/s.
  const spinMagnitude = norm(preSplitFruit.angularVelocity);
  assert.ok(spinMagnitude >= 0.5, `${fruitKey}: seed 7's wobble spin ${spinMagnitude} is below 0.5 rad/s`);

  const centreDistance = norm(sub(split.centre, preSplitFruit.position));
  assert.ok(centreDistance <= 0.6, `${fruitKey}: lastSplit.centre too far from captured pre-step position`);

  const velocityDistance = norm(sub(split.velocity, preSplitFruit.velocity));
  assert.ok(velocityDistance <= 0.2, `${fruitKey}: lastSplit.velocity too far from captured pre-step velocity`);

  // T1 must compute K_fruit itself from BURST_K and the fruit radius in the
  // rules fruit table, not from lastSplit.kFruit.
  const fruit = fruitByKey(fruitKey);
  const expectedKFruit = kFruitFor(fruit, BURST_K);

  const jitterById = new Map(split.pieces.map((p) => [p.id, p.jitter]));
  const v = preSplitFruit.velocity;
  const w = preSplitFruit.angularVelocity;
  const perPiece = [];

  for (const piece of pieces) {
    const unliftedPosition = [piece.position[0], piece.position[1] - split.lift, piece.position[2]];
    const r = sub(unliftedPosition, split.centre);
    const jitter = jitterById.get(piece.id);

    assert.ok(jitter !== undefined, `${fruitKey}: no recorded jitter for piece ${piece.id}`);

    const bounce = [v[0], -E_BOUNCE * v[1], v[2]];
    const spin = cross(w, r);
    const burst = reconstructBurst({ ...split, k: expectedKFruit }, r, jitter);
    const expected = add(add(bounce, spin), burst);
    const actual = piece.velocity;
    const error = norm(sub(actual, expected));
    const expectedMagnitude = norm(expected);

    assert.ok(
      error <= 0.05 * expectedMagnitude || expectedMagnitude < 1e-6,
      `${fruitKey}: piece ${piece.id} (${piece.kind}) velocity error ${error} exceeds 5% of expected ${expectedMagnitude}`
    );

    perPiece.push({ piece, r, burst });
  }

  const pairMagnitudeThreshold = 0.05 * (fruit.radius / 0.15);
  let checkedPairCount = 0;

  for (let i = 0; i < perPiece.length; i += 1) {
    for (let j = i + 1; j < perPiece.length; j += 1) {
      const rDiff = sub(perPiece[i].r, perPiece[j].r);
      const omegaCrossRDiff = cross(w, rDiff);
      const magnitude = norm(omegaCrossRDiff);

      if (magnitude < pairMagnitudeThreshold) continue;

      checkedPairCount += 1;

      const velocityDiff = sub(perPiece[i].piece.velocity, perPiece[j].piece.velocity);
      const burstDiff = sub(perPiece[i].burst, perPiece[j].burst);
      const adjustedDiff = sub(velocityDiff, burstDiff);
      const error = norm(sub(adjustedDiff, omegaCrossRDiff));

      assert.ok(
        error <= 0.05 * magnitude,
        `${fruitKey}: pair (${perPiece[i].piece.id}, ${perPiece[j].piece.id}) adjusted diff error ${error} exceeds 5% of ${magnitude}`
      );
    }
  }

  assert.ok(checkedPairCount > 0, `${fruitKey}: expected at least one piece pair with a measurable ω×r term`);
}

test("T1 (watermelon): each piece's velocity matches the formula within 5%, K_fruit computed from the rules table", () => {
  runT1("watermelon");
});

test("T1 (tomato): each piece's velocity matches the formula within 5%, K_fruit computed from the rules table", () => {
  runT1("tomato");
});

// --- Spawn test: all five fruits, seeds 1-20 ------------------------------------

test("spawn: no piece starts inside the ground, for all five fruits at Plane, seeds 1-20", () => {
  for (const fruitKey of FRUIT_KEYS) {
    const runner = runPlaneReal(fruitKey);

    for (const seed of SEEDS_20) {
      const run = runner(seed);

      assert.ok(run.spawnPieces, `${fruitKey} seed ${seed}: split never happened`);

      for (const piece of run.spawnPieces) {
        const extent = piece.kind === "seed" || piece.kind === "inner" ? piece.radius : piece.halfExtent * Math.sqrt(3);

        assert.ok(
          piece.position[1] - extent >= -1e-9,
          `${fruitKey} seed ${seed}: piece ${piece.id} (${piece.kind}) at y=${piece.position[1]} with extent ${extent} starts inside the ground`
        );
      }
    }
  }
});

// --- Containment: all five fruits x seeds 1-20 at Plane, real break speed --------

test("containment: all five fruits x seeds 1-20 at Plane", () => {
  const report = {};

  for (const fruitKey of FRUIT_KEYS) {
    const fruit = fruitByKey(fruitKey);
    const W = containmentWidthFor(fruit); // step 1b §8: 0.5W = 12.5R, W = 25R, physics-only
    const runner = runPlaneReal(fruitKey);
    let minWithinHalfW = Infinity;
    let maxFarOverW = 0;

    for (const seed of SEEDS_20) {
      const run = runner(seed);

      assert.equal(run.settled, true, `${fruitKey} seed ${seed}: did not settle within the step budget`);
      assert.equal(run.anyNaN, false, `${fruitKey} seed ${seed}: NaN detected`);
      assert.ok(
        run.lowestCentreEver >= -0.5,
        `${fruitKey} seed ${seed}: a centre went below -0.5 m (${run.lowestCentreEver})`
      );

      for (const body of run.finalBodies) {
        assert.ok(
          body.position[1] >= -0.01,
          `${fruitKey} seed ${seed}: settled body ${body.id} centre y ${body.position[1]} is below -0.01 m`
        );
      }

      const distances = run.finalBodies.map((body) =>
        Math.hypot(body.position[0] - run.impactPoint[0], body.position[2] - run.impactPoint[1])
      );
      const withinHalfW = distances.filter((d) => d <= 0.5 * W).length / distances.length;
      const allWithinW = distances.every((d) => d <= W);
      const farOverW = Math.max(...distances) / W;

      minWithinHalfW = Math.min(minWithinHalfW, withinHalfW);
      maxFarOverW = Math.max(maxFarOverW, farOverW);

      assert.ok(
        withinHalfW >= 0.9,
        `${fruitKey} seed ${seed}: only ${(withinHalfW * 100).toFixed(1)}% of pieces within 0.5*W`
      );
      assert.ok(allWithinW, `${fruitKey} seed ${seed}: not every piece is within W of the impact point`);
    }

    report[fruitKey] = { minWithinHalfW, maxFarOverW };
  }

  // eslint-disable-next-line no-console
  console.log("Containment (min fraction within 0.5W, max far/W) per fruit:", JSON.stringify(report, null, 2));
});

// --- Energy guard: watermelon and tomato, relative to the dead control, seeds 1-20

test("energy guard: watermelon and tomato mean piece speed at +10 steps is at least 2x the dead control (seeds 1-20)", () => {
  const report = {};

  for (const fruitKey of ["watermelon", "tomato"]) {
    const runner = runPlaneReal(fruitKey);
    let minRatio = Infinity;

    for (const seed of SEEDS_20) {
      const run = runner(seed);
      const deadSpeed = runDeadControlPlaneReal(fruitKey, seed);

      assert.ok(
        run.meanSpeedPlus10 !== null && deadSpeed !== null,
        `${fruitKey} seed ${seed}: never reached split+10 steps`
      );

      const ratio = run.meanSpeedPlus10 / deadSpeed;
      minRatio = Math.min(minRatio, ratio);

      assert.ok(
        ratio >= 2.2,
        `${fruitKey} seed ${seed}: energy ratio ${ratio.toFixed(2)}x is below the 2.2x stop line`
      );
    }

    report[fruitKey] = { minRatio };
  }

  // eslint-disable-next-line no-console
  console.log("Energy guard min ratio vs dead control:", JSON.stringify(report, null, 2));
});

// --- Burst ordering (§11a): watermelon at three breaking heights, real break speed

test("burst ordering: watermelon mean burst speed is strictly Plane > Crane > Roof (seeds 1-20)", () => {
  const heights = [
    ["Plane", PLANE_M],
    ["Crane", CRANE_M],
    ["Roof", ROOF_M]
  ];
  const meanBurstByHeight = {};

  for (const [name, heightM] of heights) {
    const bursts = SEEDS_20.map((seed) => {
      const sim = createSim({ seed, heightM, fruit: "watermelon" });

      sim.drop();
      runToSettled(sim);

      assert.notEqual(sim.summary.tier, "held", `watermelon at ${name} seed ${seed} did not break`);

      const split = sim.lastSplit;
      return split.k * Math.max(0, split.impactSpeed - split.breakSpeed);
    });

    meanBurstByHeight[name] = bursts.reduce((a, b) => a + b, 0) / bursts.length;
  }

  // eslint-disable-next-line no-console
  console.log("Burst ordering mean burst speed (m/s) by height:", JSON.stringify(meanBurstByHeight, null, 2));

  assert.ok(
    meanBurstByHeight.Plane > meanBurstByHeight.Crane,
    `Plane mean burst ${meanBurstByHeight.Plane} should exceed Crane mean burst ${meanBurstByHeight.Crane}`
  );
  assert.ok(
    meanBurstByHeight.Crane > meanBurstByHeight.Roof,
    `Crane mean burst ${meanBurstByHeight.Crane} should exceed Roof mean burst ${meanBurstByHeight.Roof}`
  );
});

// --- Determinism (§7): same seed twice matches; different seeds differ -------

test("same fruit and height: seed 1 twice gives deep-equal settled positions; seed 1 vs seed 2 differ", () => {
  function run(seed) {
    const sim = createSim({ seed, heightM: PLANE_M, fruit: "watermelon" });
    sim.drop();
    runToSettled(sim);
    return sim.bodies();
  }

  const a1 = run(1);
  const a1Again = run(1);
  const a2 = run(2);

  assert.deepEqual(a1, a1Again);
  assert.notDeepEqual(a1, a2);
});

test("same seed and settings run twice give deep-equal positions after 300 steps, and deep-equal non-null summaries and final bodies at settled", () => {
  function runFixedSteps(sim) {
    for (let i = 0; i < 300; i += 1) sim.step();

    return { summary: sim.summary, bodies: sim.bodies() };
  }

  const simA = createSim({ seed: 42, heightM: PLANE_M, fruit: "watermelon" });
  const simB = createSim({ seed: 42, heightM: PLANE_M, fruit: "watermelon" });

  simA.drop();
  simB.drop();

  const first = runFixedSteps(simA);
  const second = runFixedSteps(simB);

  assert.deepEqual(first.summary, second.summary);
  assert.deepEqual(first.bodies, second.bodies);

  runToSettled(simA);
  runToSettled(simB);

  assert.notEqual(simA.summary, null, "expected a real, non-null summary once settled");
  assert.deepEqual(simA.summary, simB.summary);
  assert.deepEqual(simA.bodies(), simB.bodies());
});

// Step 1b §11b (spawn ruling v3, decision 7): "ready" is now an empty
// scene — a fruit only spawns once drop() actually runs, not on
// reset()/createSim() as before. Renamed from "...yields ready/1 body/0
// steps..." (the body count changed from 1 to 0 to match).
test("drop -> reset -> drop -> reset yields ready/0 bodies/0 steps each time and equal summaries", () => {
  const sim = createSim({ seed: 3, heightM: KNEE_M, fruit: "watermelon" });

  sim.drop();
  runToSettled(sim);
  const firstSummary = sim.summary;

  sim.reset();
  assert.equal(sim.phase, "ready");
  assert.equal(sim.bodies().length, 0);
  assert.equal(sim.steps, 0);
  assert.equal(sim.summary, null);
  assert.equal(sim.lastSplit, null);

  sim.drop();
  runToSettled(sim);
  const secondSummary = sim.summary;

  assert.deepEqual(firstSummary, secondSummary);

  sim.reset();
  assert.equal(sim.phase, "ready");
  assert.equal(sim.bodies().length, 0);
  assert.equal(sim.steps, 0);
});

// Step 1b §11b: reset() no longer pre-spawns a body (ready is empty); the
// changed fruit/height only shows up once drop() is called.
test("reset can change fruit and height", () => {
  const sim = createSim({ seed: 1, heightM: PLANE_M, fruit: "watermelon" });

  sim.reset({ fruit: "coconut", heightM: ROOF_M });
  assert.equal(sim.bodies().length, 0);

  sim.drop();
  assert.equal(sim.bodies()[0].kind, "fruit");
  assert.ok(Math.abs(sim.bodies()[0].radius - fruitByKey("coconut").radius) < 1e-9);

  runToSettled(sim);
  assert.equal(sim.summary.fruit, "coconut");
  assert.equal(sim.summary.heightM, ROOF_M);
  assert.equal(sim.summary.toughness, undefined);
});

test("a stray toughness key is ignored, not thrown", () => {
  const sim = createSim({ seed: 1, heightM: KNEE_M, toughness: 5, fruit: "watermelon" });

  sim.reset({ fruit: "coconut", heightM: ROOF_M, toughness: 9 });
  sim.drop();
  runToSettled(sim);

  assert.equal(sim.summary.fruit, "coconut");
  assert.equal(sim.summary.heightM, ROOF_M);
});

// Step 1b §11b (spawn ruling v3, decision 2): "drop always works, instantly"
// replaces the old ready-phase-only guard — a second drop() while the first
// fruit is still falling (or after it has settled) now adds another fruit
// to the rolling window instead of doing nothing. Renamed and rewritten
// from "drop() outside ready is a no-op".
test("drop() works in every phase and grows the rolling window", () => {
  const sim = createSim({ seed: 1, heightM: KNEE_M, fruit: "watermelon" });

  sim.drop();
  assert.equal(sim.phase, "active");
  assert.equal(sim.fruitCount, 1);

  sim.drop();
  assert.equal(sim.phase, "active", "a second drop() while falling must add a fruit, not no-op");
  assert.equal(sim.fruitCount, 2, "a second drop() while falling must add a fruit, not no-op");

  runToSettled(sim);
  assert.equal(sim.phase, "settled");

  sim.drop();
  assert.equal(sim.phase, "active", "drop() while settled must start a new fruit falling");
  assert.equal(sim.fruitCount, 3);
});

test("step() is a no-op in ready phase (invariant 1 phase guard)", () => {
  const sim = createSim({ seed: 1, heightM: KNEE_M, fruit: "watermelon" });

  assert.equal(sim.phase, "ready");
  const before = sim.bodies();

  sim.step();
  assert.equal(sim.steps, 0, "step() must not advance in ready phase");
  assert.deepEqual(sim.bodies(), before);
});

test("invariant 8: reset mid-fall clears pending state, and settling after reset matches a fresh sim", () => {
  const sim = createSim({ seed: 9, heightM: PLANE_M, fruit: "watermelon" });

  sim.drop();

  for (let i = 0; i < 30; i += 1) sim.step();

  sim.reset();

  for (let i = 0; i < 600; i += 1) sim.step();

  assert.equal(sim.phase, "ready");
  assert.equal(sim.steps, 0);
  assert.equal(sim.summary, null);
  assert.equal(sim.lastSplit, null);
  assert.equal(sim.bodies().length, 0, "ready is now an empty scene");

  sim.drop();

  const bodies = sim.bodies();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].kind, "fruit");
  assert.ok(Math.abs(bodies[0].position[1] - (PLANE_M + bodies[0].radius)) < 1e-9);

  runToSettled(sim);

  const freshSim = createSim({ seed: 9, heightM: PLANE_M, fruit: "watermelon" });
  freshSim.drop();
  runToSettled(freshSim);

  assert.deepEqual(sim.summary, freshSim.summary);
});

test("bodies().length never exceeds MAX_DYNAMIC_BODIES during a Plane smash", () => {
  const sim = createSim({ seed: 5, heightM: PLANE_M, fruit: "watermelon" });

  sim.drop();

  let steps = 0;
  let prevSimSteps = sim.steps;

  while (steps < MAX_STEPS_TO_SETTLE) {
    sim.step();
    steps += 1;
    assert.ok(sim.bodies().length <= MAX_DYNAMIC_BODIES);

    if (sim.steps === prevSimSteps) break;

    prevSimSteps = sim.steps;
  }

  assert.equal(sim.phase, "settled");
});

test("D4: settled is reached by sleep OR by the 480-step limit, and at least one real scene settles by sleep before step 480", () => {
  const scenarios = [
    // Seed 4 is a held drop that settles by sleep well inside the 480-step
    // budget (verified: settles at step 231); seed 1 for the same scenario
    // happens to roll on its wobble and hit the step limit instead, so it
    // cannot be used to prove the sleep path is reachable.
    { name: "Knee watermelon (held)", seed: 4, heightM: KNEE_M, fruit: "watermelon" },
    { name: "Plane watermelon (smashed)", seed: 1, heightM: PLANE_M, fruit: "watermelon" }
  ];

  let atLeastOneSettledBySleep = false;

  for (const scenario of scenarios) {
    const sim = createSim({
      seed: scenario.seed,
      heightM: scenario.heightM,
      fruit: scenario.fruit
    });

    sim.drop();
    const steps = runToSettled(sim);

    const bodies = sim.bodies();
    const allAsleep = bodies.every((body) => body.sleeping === true);
    const hitStepLimit = sim.steps === MAX_SETTLE_STEPS;

    assert.ok(
      allAsleep || hitStepLimit,
      `${scenario.name}: settled without either all bodies asleep or reaching the ${MAX_SETTLE_STEPS}-step limit`
    );

    if (allAsleep && steps < MAX_SETTLE_STEPS) {
      atLeastOneSettledBySleep = true;
    }
  }

  assert.ok(atLeastOneSettledBySleep, "expected at least one real scene to settle by sleep before the 480-step limit");
});

test("displayed impact speed matches sqrt(2gh) within 0.25 m/s for every landmark height (watermelon)", () => {
  const measured = [];

  for (const landmark of LANDMARKS) {
    const sim = createSim({ seed: 11, heightM: landmark.meters, fruit: "watermelon" });

    sim.drop();
    runToSettled(sim);

    const expected = expectedImpactSpeed(landmark.meters);
    const actual = sim.summary.impactSpeed;

    measured.push({ name: landmark.name, meters: landmark.meters, actual, expected, diff: actual - expected });

    assert.ok(
      Math.abs(actual - expected) <= 0.25,
      `${landmark.name}: impactSpeed ${actual} differs from expected ${expected} by more than 0.25 m/s`
    );
  }

  // eslint-disable-next-line no-console
  console.log("Measured impact speeds:", JSON.stringify(measured, null, 2));
});

// --- step 1b §10: firstImpact -----------------------------------------------

test("firstImpact: null before impact, set at the impact step with the correct tier, null after reset", () => {
  const sim = createSim({ seed: 1, heightM: PLANE_M, fruit: "watermelon" });

  assert.equal(sim.firstImpact, null);

  sim.drop();
  assert.equal(sim.firstImpact, null, "must stay null while falling, before ground contact");

  let steps = 0;

  while (sim.firstImpact === null && steps < MAX_STEPS_TO_SETTLE) {
    sim.step();
    steps += 1;
  }

  assert.ok(sim.firstImpact, "firstImpact should be set once ground contact is decided");
  assert.equal(sim.firstImpact.step, steps);
  assert.ok(sim.firstImpact.impactSpeed > 0);
  assert.ok(sim.firstImpact.severity > 0);
  assert.equal(sim.firstImpact.fruit, "watermelon");
  // Plane always breaks watermelon (§2 pins), so this is never "held".
  assert.notEqual(sim.firstImpact.tier, "held");

  // Stays set (not cleared) as the sim continues settling.
  runToSettled(sim);
  assert.ok(sim.firstImpact);

  sim.reset();
  assert.equal(sim.firstImpact, null);
});

test("firstImpact: a held drop (Knee) reports tier 'held'", () => {
  const sim = createSim({ seed: 4, heightM: KNEE_M, fruit: "watermelon" });

  sim.drop();

  let steps = 0;

  while (sim.firstImpact === null && steps < MAX_STEPS_TO_SETTLE) {
    sim.step();
    steps += 1;
  }

  assert.ok(sim.firstImpact);
  assert.equal(sim.firstImpact.tier, "held");
});

// --- step 1b §10 (CTO amendment): uiPhase, decoupled from physics settle ----

function stepToImpact(sim) {
  let steps = 0;

  while (sim.firstImpact === null && steps < MAX_STEPS_TO_SETTLE) {
    sim.step();
    steps += 1;
  }

  assert.ok(sim.firstImpact, "expected an impact within the step budget");

  return sim.firstImpact.step;
}

function stepToAbsoluteStep(sim, targetStep) {
  while (sim.steps < targetStep) sim.step();
}

// Step 1b §11b (spawn ruling v3, decision 5/11): `phase` and `uiPhase` are
// now the same thing (uiPhase is an alias) — the old dual-phase system
// (physics phase frozen until true sleep/480, a separate faster uiPhase at
// +72) is gone. These two tests are rewritten from
// "uiPhase: ... while physics phase stays 'falling'" to check the merged
// phase directly; `step()` itself still keeps the physics world advancing
// past a "settled" phase read (decision 8), which `runToSettled` below
// relies on for its own numeric assertions elsewhere in this file.
test("phase: a held watermelon at Knee (seed 4) is 'active' at impact+71 and 'settled' at impact+72, with summary appearing exactly then", () => {
  const sim = createSim({ seed: 4, heightM: KNEE_M, fruit: "watermelon" });

  sim.drop();
  const impactStep = stepToImpact(sim);

  stepToAbsoluteStep(sim, impactStep + 71);
  assert.equal(sim.phase, "active");
  assert.equal(sim.uiPhase, sim.phase);
  assert.equal(sim.summary, null);

  sim.step(); // impact + 72
  assert.equal(sim.steps, impactStep + 72);
  assert.equal(sim.phase, "settled");
  assert.equal(sim.uiPhase, sim.phase);
  assert.notEqual(sim.summary, null);
  assert.equal(sim.summary.tier, "held");
});

test("phase: a Plane watermelon smash (seed 7) is 'active' at impact+71 and 'settled' at impact+72, even though debris is still moving", () => {
  const sim = createSim({ seed: 7, heightM: PLANE_M, fruit: "watermelon" });

  sim.drop();
  const impactStep = stepToImpact(sim);
  assert.equal(sim.firstImpact.tier, "smashed");

  stepToAbsoluteStep(sim, impactStep + 71);
  assert.equal(sim.phase, "active");
  assert.equal(sim.summary, null);

  sim.step(); // impact + 72
  assert.equal(sim.phase, "settled");
  assert.equal(sim.uiPhase, sim.phase);
  assert.notEqual(sim.summary, null);

  const settleSummary = sim.summary;

  // Physics itself keeps advancing past this "settled" read (decision 8):
  // a Plane smash's debris (fresh wobble spin) keeps moving well past +72,
  // and runToSettled steps it all the way to true physics-idle (sleep or
  // the 480-step cap) without the summary changing.
  runToSettled(sim);
  assert.equal(sim.phase, "settled");
  assert.deepEqual(sim.summary, settleSummary, "summary must not change between display settle and physics-idle");
});

function stepToUiSettleLayout(sim, maxSteps = MAX_STEPS_TO_SETTLE) {
  let steps = 0;

  while (sim.uiSettleLayout === null && steps < maxSteps) {
    sim.step();
    steps += 1;
  }

  assert.ok(sim.uiSettleLayout !== null, "uiSettleLayout was not captured within the step budget");

  return sim.steps;
}

test("uiSettleLayout is captured at exactly the UI-settle step, stays fixed, and resets", () => {
  const cases = [
    { name: "Plane watermelon smash (seed 7)", opts: { seed: 7, heightM: PLANE_M, fruit: "watermelon" } },
    { name: "held watermelon (seed 7, heightM 0.3)", opts: { seed: 7, heightM: 0.3, fruit: "watermelon" } }
  ];

  for (const { name, opts } of cases) {
    const sim = createSim(opts);

    sim.drop();
    const settleStep = stepToUiSettleLayout(sim);

    // The snapshot fires on whichever comes first: UI settle
    // (firstImpact.step + 72) or physics settle (finishSettling, e.g. a
    // held fruit that sleeps fast). If physics settle fired first, phase
    // is already "settled" at this step; otherwise it must be exactly
    // firstImpact.step + 72.
    if (sim.phase !== "settled") {
      assert.equal(
        settleStep,
        sim.firstImpact.step + 72,
        `${name}: expected UI-settle step to be firstImpact.step + 72`
      );
    } else {
      assert.ok(
        settleStep <= sim.firstImpact.step + 72,
        `${name}: physics settle before UI settle should not exceed firstImpact.step + 72`
      );
    }

    const freshSim = createSim(opts);

    freshSim.drop();
    for (let i = 0; i < settleStep; i += 1) freshSim.step();

    assert.deepEqual(
      freshSim.bodies().map((b) => b.position),
      sim.uiSettleLayout,
      `${name}: a fresh sim stepped the same number of steps must match the captured layout`
    );

    const layoutAtSettle = JSON.parse(JSON.stringify(sim.uiSettleLayout));

    runToSettled(sim);
    assert.deepEqual(
      sim.uiSettleLayout,
      layoutAtSettle,
      `${name}: uiSettleLayout must not drift as debris keeps moving after the snapshot`
    );

    sim.reset();
    assert.equal(sim.uiSettleLayout, null, `${name}: reset() must clear uiSettleLayout`);
  }
});

// === Step 1b §11b, stage 2: rolling window of up to 5 fruit =================

function radiusOf(body) {
  return body.radius !== undefined ? body.radius : body.boundingRadius;
}

function stepMany(sim, n) {
  for (let i = 0; i < n; i += 1) sim.step();
}

function drainAll(sim) {
  return { removals: sim.consumeRemovals(), impacts: sim.consumeImpacts(), announcement: sim.consumeAnnouncement() };
}

test("rolling window: 6 scripted drops evict the oldest on the 6th", () => {
  const sim = createSim({ seed: 1, heightM: COUNTER_M, fruit: "watermelon" });
  const pressedIds = [];

  for (let i = 0; i < 6; i += 1) {
    sim.drop({ fruit: "watermelon", heightM: COUNTER_M, seed: i + 1 });
    pressedIds.push(sim.fruits()[sim.fruits().length - 1].id);
    stepMany(sim, 40);
    drainAll(sim);
  }

  assert.equal(sim.fruitCount, 5);

  const firstId = pressedIds[0];
  assert.ok(!sim.fruits().some((f) => f.id === firstId), "the oldest fruit's record must be gone from fruits()");
  assert.ok(!sim.bodies().some((b) => b.fruitId === firstId), "the oldest fruit's bodies must be gone from bodies()");

  // Confirm it never resurfaces in impacts/announcements after eviction.
  stepMany(sim, MAX_STEPS_TO_SETTLE);
  const drained = drainAll(sim);

  assert.ok(!drained.impacts.some((e) => e.fruitId === firstId), "removed fruit must never produce an impact event");
});

test("removed before landing: a 6th Plane drop in 6 consecutive steps removes the first mid-air", () => {
  const sim = createSim({ seed: 1, heightM: PLANE_M, fruit: "watermelon" });
  const pressedIds = [];
  const allImpacts = [];

  for (let i = 0; i < 6; i += 1) {
    sim.drop({ fruit: "watermelon", heightM: PLANE_M, seed: i + 1 });
    pressedIds.push(sim.fruits()[sim.fruits().length - 1].id);
    sim.step();

    const drained = drainAll(sim);
    allImpacts.push(...drained.impacts);
  }

  const firstId = pressedIds[0];

  assert.ok(!sim.fruits().some((f) => f.id === firstId), "the first drop must have been removed before it could land");
  assert.ok(!sim.bodies().some((b) => b.fruitId === firstId));
  assert.ok(!allImpacts.some((e) => e.fruitId === firstId), "a fruit removed before landing must produce no impact event");

  // Run the rest out to settle and confirm the removed fruit is still never
  // named in any subsequent announcement (fruits() no longer knows about it
  // at all, so there is nothing further to check beyond "it never appears").
  stepMany(sim, MAX_STEPS_TO_SETTLE);
  drainAll(sim);
  assert.ok(!sim.fruits().some((f) => f.id === firstId));
});

test("rapid clicks: 5 Plane watermelon drops in 5 consecutive steps never overlap and each gets an impact", () => {
  const sim = createSim({ seed: 1, heightM: PLANE_M, fruit: "watermelon" });
  const fruitR = fruitByKey("watermelon").radius;
  const spawnYs = [];

  for (let i = 0; i < 5; i += 1) {
    const before = sim.bodies();

    sim.drop({ fruit: "watermelon", heightM: PLANE_M, seed: i + 1 });

    const after = sim.bodies();
    const newest = after.find((b) => !before.some((ob) => ob.id === b.id));

    assert.ok(newest, `drop ${i}: expected exactly one new body`);
    spawnYs.push(newest.position[1]);

    // No overlap with any body still present after the drop (bodies the
    // spawn plan itself removed as blockers no longer count — that's the
    // mechanism, not a violation of it).
    for (const other of after) {
      if (other.id === newest.id) continue;

      const dist = Math.hypot(
        newest.position[0] - other.position[0],
        newest.position[1] - other.position[1],
        newest.position[2] - other.position[2]
      );
      const clearance = dist - radiusOf(other) - fruitR - 0.02;

      assert.ok(clearance >= -1e-9, `drop ${i}: spawn overlaps body ${other.id} by ${-clearance}`);
    }

    sim.step();
  }

  for (let i = 1; i < spawnYs.length; i += 1) {
    assert.ok(spawnYs[i] > spawnYs[i - 1], `spawn y did not strictly increase: ${spawnYs.join(", ")}`);
    assert.ok(spawnYs[i] > PLANE_M + fruitR, `spawn y ${spawnYs[i]} should be raised above the chosen height`);
  }

  stepMany(sim, MAX_STEPS_TO_SETTLE);

  const impacts = drainAll(sim).impacts;

  assert.equal(new Set(impacts.map((e) => e.fruitId)).size, 5, "expected a first-contact impact for each of the 5 drops");
});

test("low drop onto a pile: a second Knee watermelon replaces a resting one and gets its own result", () => {
  const sim = createSim({ seed: 1, heightM: KNEE_M, fruit: "watermelon" });
  const R = fruitByKey("watermelon").radius;

  sim.drop();

  // Wait for the first watermelon to land, then a short beat — not a full
  // settle, which would let its release-wobble spin roll it away from the
  // drop column before the second drop arrives.
  let steps = 0;
  while (sim.fruits()[0].state === "falling" && steps < MAX_STEPS_TO_SETTLE) {
    sim.step();
    steps += 1;
  }
  stepMany(sim, 10);

  const firstId = sim.fruits()[0].id;
  assert.equal(sim.fruits()[0].state, "landed");

  sim.drop({ fruit: "watermelon", heightM: KNEE_M, seed: 2 });

  assert.ok(!sim.fruits().some((f) => f.id === firstId), "the resting watermelon should be removed via spawnPlanFor's removeIds");

  const secondId = sim.fruits()[sim.fruits().length - 1].id;
  const spawned = sim.bodies().find((b) => b.fruitId === secondId);

  assert.ok(Math.abs(spawned.position[1] - (KNEE_M + R)) < 1e-9, "new spawn should land exactly at 0.3 + R");

  runToSettled(sim);

  const result = sim.consumeAnnouncement();
  assert.ok(result, "expected an announcement once the second watermelon settles");
});

test("held then smashed: a coconut later breaks a held Knee watermelon (2 impact events)", () => {
  const sim = createSim({ seed: 4, heightM: KNEE_M, fruit: "watermelon" });

  sim.drop();
  runToSettled(sim);

  const watermelonId = sim.fruits()[0].id;
  assert.equal(sim.fruits()[0].state, "landed", "expected the watermelon to hold");

  // Collect the watermelon's own first-contact (held) event from settling,
  // so the running total below covers both of its events.
  let watermelonImpacts = sim.consumeImpacts().filter((e) => e.fruitId === watermelonId);

  sim.drop({ fruit: "coconut", heightM: PLANE_M, seed: 1 });

  let steps = 0;

  while (steps < MAX_STEPS_TO_SETTLE) {
    sim.step();
    steps += 1;

    const events = sim.consumeImpacts();
    watermelonImpacts.push(...events.filter((e) => e.fruitId === watermelonId));

    const watermelonRecord = sim.fruits().find((f) => f.id === watermelonId);
    if (watermelonRecord === undefined || watermelonRecord.state === "broken") break;
  }

  const watermelonRecord = sim.fruits().find((f) => f.id === watermelonId);
  assert.ok(watermelonRecord, "the watermelon should still be tracked (broken, not removed)");
  assert.equal(watermelonRecord.state, "broken");
  assert.equal(watermelonImpacts.length, 2, "expected exactly 2 impact events for the watermelon: first contact, then break");
  assert.notEqual(watermelonImpacts[1].tier, "held");
});

test("mixed batch: a tomato at 5 m then a coconut at 1 m are both announced, in press order, with their chosen heights", () => {
  const sim = createSim({ seed: 1, heightM: TREEHOUSE_M, fruit: "tomato" });

  sim.drop({ fruit: "tomato", heightM: TREEHOUSE_M, seed: 1 });
  stepMany(sim, 90); // let the tomato land (short fall) before the coconut follows

  sim.drop({ fruit: "coconut", heightM: COUNTER_M, seed: 2 });

  const fruitsBeforeSettle = sim.fruits();
  assert.equal(fruitsBeforeSettle[0].fruit, "tomato");
  assert.equal(fruitsBeforeSettle[0].heightM, TREEHOUSE_M);
  assert.equal(fruitsBeforeSettle[1].fruit, "coconut");
  assert.equal(fruitsBeforeSettle[1].heightM, COUNTER_M);

  let announcement = null;
  let steps = 0;

  while (announcement === null && steps < MAX_STEPS_TO_SETTLE) {
    sim.step();
    steps += 1;
    announcement = sim.consumeAnnouncement();
  }

  assert.ok(announcement, "expected an announcement once the batch settles");
  assert.match(announcement, /^Dropped 2 fruit\./);

  const tomatoIndex = announcement.indexOf("tomato");
  const coconutIndex = announcement.indexOf("coconut");

  assert.ok(tomatoIndex >= 0 && coconutIndex >= 0, `announcement should name both fruit: ${announcement}`);
  assert.ok(tomatoIndex < coconutIndex, `tomato should be named before coconut (press order): ${announcement}`);
});

test("settle clock: phase becomes settled exactly 72 steps after the last impact, never while a fruit is falling", () => {
  const sim = createSim({ seed: 1, heightM: KNEE_M, fruit: "watermelon" });

  sim.drop({ fruit: "watermelon", heightM: KNEE_M, seed: 1 });
  stepMany(sim, 30);
  sim.drop({ fruit: "watermelon", heightM: COUNTER_M, seed: 2 });

  let lastImpactStep = null;
  let steps = 0;

  while (steps < MAX_STEPS_TO_SETTLE) {
    const anyFalling = sim.fruits().some((f) => f.state === "falling");

    sim.step();
    steps += 1;

    if (anyFalling) {
      assert.notEqual(sim.phase, "settled", `phase must not be settled at step ${steps} while a fruit is falling`);
    }

    for (const event of sim.consumeImpacts()) lastImpactStep = event.step;

    if (sim.phase === "settled") break;
  }

  assert.ok(lastImpactStep !== null, "expected at least one impact");
  assert.equal(sim.steps, lastImpactStep + UI_SETTLE_STEPS_AFTER_IMPACT);
});

test("reset mid-batch: 0 bodies, 0 fruit, no pending impacts or announcement", () => {
  const sim = createSim({ seed: 1, heightM: COUNTER_M, fruit: "watermelon" });

  sim.drop({ fruit: "watermelon", heightM: COUNTER_M, seed: 1 });
  stepMany(sim, 10);
  sim.drop({ fruit: "coconut", heightM: PLANE_M, seed: 2 });
  stepMany(sim, 5);

  sim.reset();

  assert.equal(sim.bodies().length, 0);
  assert.equal(sim.fruitCount, 0);
  assert.deepEqual(sim.consumeImpacts(), []);
  assert.equal(sim.consumeAnnouncement(), null);
});

// Asserts the per-step invariants that must hold at every step of the
// pile-up stream, whether mid-drop or during the run-out to physics-idle:
// the 200-body cap, finite values, and no centre below -0.5 m. Correction
// pass (CTO review, 2026-09-14): the original version of this test only
// called this check inside the 45-step drop loop, before any Plane fall had
// landed (~210 steps) — so the actual pile-up (multiple smashes' worth of
// debris coexisting) happened entirely in the unchecked run-out loop.
function assertPileUpStepInvariants(sim) {
  const bodies = sim.bodies();

  assert.ok(bodies.length <= 200, `body count ${bodies.length} exceeded 200`);

  for (const body of bodies) {
    for (const v of [...body.position, ...body.velocity, ...body.angularVelocity]) {
      assert.ok(Number.isFinite(v), "non-finite value found mid-stream");
    }
    assert.ok(body.position[1] >= -0.5, `centre ${body.position[1]} below -0.5 m mid-stream`);
  }

  return bodies.length;
}

test("pile-up stream: 5 Plane watermelons 9 steps apart stay within body/position bounds and are deterministic", () => {
  function runStream() {
    const sim = createSim({ seed: 1, heightM: PLANE_M, fruit: "watermelon" });
    const announcements = [];
    let maxBodies = 0;
    let breakEventCount = 0;

    for (let i = 0; i < 5; i += 1) {
      sim.drop({ fruit: "watermelon", heightM: PLANE_M, seed: i + 1 });

      for (let s = 0; s < 9; s += 1) {
        sim.step();

        maxBodies = Math.max(maxBodies, assertPileUpStepInvariants(sim));

        for (const event of sim.consumeImpacts()) {
          if (event.tier !== "held") breakEventCount += 1;
        }

        const text = sim.consumeAnnouncement();
        if (text) announcements.push(text);
      }
    }

    // Run out to physics-idle — this is where the actual pile-up (several
    // smashes' worth of debris coexisting) happens, so the invariants above
    // must keep being checked here too, not just during the drop loop.
    let prevSteps = sim.steps;
    for (let i = 0; i < MAX_STEPS_TO_SETTLE; i += 1) {
      sim.step();

      maxBodies = Math.max(maxBodies, assertPileUpStepInvariants(sim));

      for (const event of sim.consumeImpacts()) {
        if (event.tier !== "held") breakEventCount += 1;
      }

      const text = sim.consumeAnnouncement();
      if (text) announcements.push(text);

      if (sim.steps === prevSteps) break;
      prevSteps = sim.steps;
    }

    for (const body of sim.bodies()) {
      assert.ok(body.position[1] >= -0.01, `settled centre ${body.position[1]} below -0.01 m`);
    }

    return { maxBodies, breakEventCount, announcements, finalPositions: sim.bodies().map((b) => b.position) };
  }

  const a = runStream();
  const b = runStream();

  assert.deepEqual(a.finalPositions, b.finalPositions, "pile-up stream must be deterministic");
  assert.deepEqual(a.announcements, b.announcements, "announcements must be deterministic");

  // Prove the scene actually piled up: more than one smash's worth of
  // bodies coexisted, and at least 3 fruit actually broke.
  assert.ok(a.maxBodies > 64, `expected more than one smash's worth of bodies (64) to coexist, got ${a.maxBodies}`);
  assert.ok(a.breakEventCount >= 3, `expected at least 3 break events, got ${a.breakEventCount}`);

  // eslint-disable-next-line no-console
  console.log("Pile-up stream: max bodies", a.maxBodies, "break events", a.breakEventCount);
});

test("fuzz: seeds 1-20, 40 random presses each, stay within bounds and settle within 600 steps of the last press", () => {
  const FRUIT_LIST = FRUIT_KEYS;

  function scriptFor(seed) {
    const rng = createFuzzRng(seed);
    const presses = [];

    for (let i = 0; i < 40; i += 1) {
      const fruit = FRUIT_LIST[Math.floor(rng() * FRUIT_LIST.length)];
      const heightM = 0.3 + rng() * (60 - 0.3);
      const gap = Math.floor(rng() * 31); // 0-30 steps

      presses.push({ fruit, heightM, seed: seed * 1000 + i, gap });
    }

    return presses;
  }

  function createFuzzRng(seed) {
    let state = seed >>> 0;

    return function next() {
      state = (state + 0x9e3779b9) | 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function runScript(script) {
    const sim = createSim({ seed: 1, heightM: KNEE_M, fruit: "watermelon" });
    let maxFruit = 0;
    let maxBodies = 0;
    let lastPressStep = 0;

    for (const press of script) {
      for (let s = 0; s < press.gap; s += 1) sim.step();

      const before = sim.bodies();

      sim.drop({ fruit: press.fruit, heightM: press.heightM, seed: press.seed });
      lastPressStep = sim.steps;

      const after = sim.bodies();
      const newest = after.find((b) => !before.some((ob) => ob.id === b.id));

      if (newest) {
        // Only bodies still present after the drop count — the spawn plan
        // itself may have removed a blocker as part of making room.
        for (const other of after) {
          if (other.id === newest.id) continue;

          const dist = Math.hypot(
            newest.position[0] - other.position[0],
            newest.position[1] - other.position[1],
            newest.position[2] - other.position[2]
          );
          const clearance = dist - radiusOf(other) - radiusOf(newest) - 0.02;

          assert.ok(clearance >= -1e-9, `overlap at spawn: ${clearance}`);
        }
      }

      maxFruit = Math.max(maxFruit, sim.fruitCount);
      maxBodies = Math.max(maxBodies, sim.bodies().length);

      assert.ok(sim.fruitCount <= 5, `fruitCount ${sim.fruitCount} exceeded 5`);
      assert.ok(sim.bodies().length <= 200, `bodies ${sim.bodies().length} exceeded 200`);

      for (const body of sim.bodies()) {
        for (const v of [...body.position, ...body.velocity, ...body.angularVelocity]) {
          assert.ok(Number.isFinite(v), "non-finite value in fuzz run");
        }
      }
    }

    let settleSteps = 0;
    let prevSteps = sim.steps;

    while (settleSteps < 600) {
      sim.step();
      settleSteps += 1;

      maxFruit = Math.max(maxFruit, sim.fruitCount);
      maxBodies = Math.max(maxBodies, sim.bodies().length);

      assert.ok(sim.fruitCount <= 5);
      assert.ok(sim.bodies().length <= 200);

      if (sim.phase === "settled" || sim.steps === prevSteps) break;
      prevSteps = sim.steps;
    }

    assert.equal(sim.phase, "settled", `did not settle within 600 steps of the last press (last press step ${lastPressStep})`);

    return {
      maxFruit,
      maxBodies,
      settleStepsAfterLastPress: sim.steps - lastPressStep,
      finalPositions: sim.bodies().map((b) => b.position)
    };
  }

  const report = { maxFruit: 0, maxBodies: 0, worstSettleSteps: 0 };

  for (let seed = 1; seed <= 20; seed += 1) {
    const script = scriptFor(seed);
    const runA = runScript(script);
    const runB = runScript(script);

    assert.deepEqual(runA.finalPositions, runB.finalPositions, `seed ${seed}: determinism failed`);

    report.maxFruit = Math.max(report.maxFruit, runA.maxFruit);
    report.maxBodies = Math.max(report.maxBodies, runA.maxBodies);
    report.worstSettleSteps = Math.max(report.worstSettleSteps, runA.settleStepsAfterLastPress);
  }

  // eslint-disable-next-line no-console
  console.log("Fuzz report:", JSON.stringify(report, null, 2));
});
