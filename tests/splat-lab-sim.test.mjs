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

function runToSettled(sim, maxSteps = MAX_STEPS_TO_SETTLE) {
  let steps = 0;

  while (sim.phase !== "settled" && steps < maxSteps) {
    sim.step();
    steps += 1;
  }

  assert.equal(sim.phase, "settled", "sim did not settle within the step budget");

  return steps;
}

// A single full Plane t=1 run per (fruit, seed), computed once and shared
// across containment, ground-clause, spawn and energy assertions (the sim
// test file's own performance budget: 20 seeds x 5 fruits would otherwise
// re-run the same drop 3-4 times each).
const planeRunCache = new Map();

function runPlaneT1(fruitKey) {
  return (seed) => {
    const cacheKey = `${fruitKey}:${seed}`;

    if (planeRunCache.has(cacheKey)) return planeRunCache.get(cacheKey);

    const sim = createSim({ seed, heightM: PLANE_M, toughness: 1, fruit: fruitKey });

    sim.drop();

    let splitStep = null;
    let spawnPieces = null;
    let impactPoint = null;
    let impactSpeed = null;
    let meanSpeedPlus10 = null;
    let lowestCentreEver = Infinity;
    let steps = 0;
    let anyNaN = false;

    while (sim.phase !== "settled" && steps < MAX_STEPS_TO_SETTLE) {
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

function runDeadControlPlaneT1(fruitKey, seed) {
  const sim = createSim({
    seed,
    heightM: PLANE_M,
    toughness: 1,
    fruit: fruitKey,
    tuning: { burstK: 0, bounceE: 0, lift: true }
  });

  sim.drop();

  let splitStep = null;
  let meanSpeedPlus10 = null;
  let steps = 0;

  while (sim.phase !== "settled" && steps < MAX_STEPS_TO_SETTLE) {
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
  }

  return meanSpeedPlus10;
}

// --- §2 pinned guarantees at t=5, over seeds 1-20 -----------------------------

test("§2 pin: watermelon holds from Knee, cracks from Counter (t=5, seeds 1-20)", () => {
  for (const seed of SEEDS_20) {
    const knee = createSim({ seed, heightM: KNEE_M, toughness: 5, fruit: "watermelon" });
    knee.drop();
    runToSettled(knee);
    assert.equal(knee.summary.tier, "held", `seed ${seed}`);

    const counter = createSim({ seed, heightM: COUNTER_M, toughness: 5, fruit: "watermelon" });
    counter.drop();
    runToSettled(counter);
    assert.notEqual(counter.summary.tier, "held", `seed ${seed}`);
  }
});

test("§2 pin: tomato cracks from Knee (t=5, seeds 1-20)", () => {
  for (const seed of SEEDS_20) {
    const sim = createSim({ seed, heightM: KNEE_M, toughness: 5, fruit: "tomato" });
    sim.drop();
    runToSettled(sim);
    assert.notEqual(sim.summary.tier, "held", `seed ${seed}`);
  }
});

test("§2 pin: apple holds from Counter, breaks from Treehouse (t=5, seeds 1-20)", () => {
  for (const seed of SEEDS_20) {
    const counter = createSim({ seed, heightM: COUNTER_M, toughness: 5, fruit: "apple" });
    counter.drop();
    runToSettled(counter);
    assert.equal(counter.summary.tier, "held", `seed ${seed}`);

    const treehouse = createSim({ seed, heightM: TREEHOUSE_M, toughness: 5, fruit: "apple" });
    treehouse.drop();
    runToSettled(treehouse);
    assert.notEqual(treehouse.summary.tier, "held", `seed ${seed}`);
  }
});

test("§2 pin: orange holds from Counter, breaks from Treehouse (t=5, seeds 1-20)", () => {
  for (const seed of SEEDS_20) {
    const counter = createSim({ seed, heightM: COUNTER_M, toughness: 5, fruit: "orange" });
    counter.drop();
    runToSettled(counter);
    assert.equal(counter.summary.tier, "held", `seed ${seed}`);

    const treehouse = createSim({ seed, heightM: TREEHOUSE_M, toughness: 5, fruit: "orange" });
    treehouse.drop();
    runToSettled(treehouse);
    assert.notEqual(treehouse.summary.tier, "held", `seed ${seed}`);
  }
});

test("§2 pin: coconut holds from Roof, breaks from Crane (t=5, seeds 1-20)", () => {
  for (const seed of SEEDS_20) {
    const roof = createSim({ seed, heightM: ROOF_M, toughness: 5, fruit: "coconut" });
    roof.drop();
    runToSettled(roof);
    assert.equal(roof.summary.tier, "held", `seed ${seed}`);

    const crane = createSim({ seed, heightM: CRANE_M, toughness: 5, fruit: "coconut" });
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
      const sim = createSim({ seed, heightM, toughness: 5, fruit: fruitKey });
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
      const sim = createSim({ seed, heightM, toughness: 5, fruit: "watermelon" });
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
  const sim = createSim({ seed: 7, heightM: PLANE_M, toughness: 1, fruit: fruitKey });

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

test("spawn: no piece starts inside the ground, for all five fruits at Plane t=1, seeds 1-20", () => {
  for (const fruitKey of FRUIT_KEYS) {
    const runner = runPlaneT1(fruitKey);

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

// --- Containment: all five fruits x seeds 1-20 at Plane t=1 --------------------

test("containment: all five fruits x seeds 1-20 at Plane t=1", () => {
  const report = {};

  for (const fruitKey of FRUIT_KEYS) {
    const fruit = fruitByKey(fruitKey);
    const W = 25 * fruit.radius;
    const runner = runPlaneT1(fruitKey);
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
    const runner = runPlaneT1(fruitKey);
    let minRatio = Infinity;

    for (const seed of SEEDS_20) {
      const run = runner(seed);
      const deadSpeed = runDeadControlPlaneT1(fruitKey, seed);

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

// --- Determinism (§7): same seed twice matches; different seeds differ -------

test("same fruit, height and toughness: seed 1 twice gives deep-equal settled positions; seed 1 vs seed 2 differ", () => {
  function run(seed) {
    const sim = createSim({ seed, heightM: PLANE_M, toughness: 1, fruit: "watermelon" });
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

  const simA = createSim({ seed: 42, heightM: PLANE_M, toughness: 1, fruit: "watermelon" });
  const simB = createSim({ seed: 42, heightM: PLANE_M, toughness: 1, fruit: "watermelon" });

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

test("drop -> reset -> drop -> reset yields ready/1 body/0 steps each time and equal summaries", () => {
  const sim = createSim({ seed: 3, heightM: KNEE_M, toughness: 5, fruit: "watermelon" });

  sim.drop();
  runToSettled(sim);
  const firstSummary = sim.summary;

  sim.reset();
  assert.equal(sim.phase, "ready");
  assert.equal(sim.bodies().length, 1);
  assert.equal(sim.steps, 0);
  assert.equal(sim.summary, null);
  assert.equal(sim.lastSplit, null);

  sim.drop();
  runToSettled(sim);
  const secondSummary = sim.summary;

  assert.deepEqual(firstSummary, secondSummary);

  sim.reset();
  assert.equal(sim.phase, "ready");
  assert.equal(sim.bodies().length, 1);
  assert.equal(sim.steps, 0);
});

test("reset can change fruit, height and toughness", () => {
  const sim = createSim({ seed: 1, heightM: PLANE_M, toughness: 5, fruit: "watermelon" });

  sim.reset({ fruit: "coconut", heightM: ROOF_M, toughness: 9 });

  assert.equal(sim.bodies()[0].kind, "fruit");
  assert.ok(Math.abs(sim.bodies()[0].radius - fruitByKey("coconut").radius) < 1e-9);

  sim.drop();
  runToSettled(sim);
  assert.equal(sim.summary.fruit, "coconut");
  assert.equal(sim.summary.toughness, 9);
  assert.equal(sim.summary.heightM, ROOF_M);
});

test("drop() outside ready is a no-op", () => {
  const sim = createSim({ seed: 1, heightM: KNEE_M, toughness: 5, fruit: "watermelon" });

  sim.drop();
  assert.equal(sim.phase, "falling");

  sim.drop();
  assert.equal(sim.phase, "falling", "a second drop() while falling must not do anything");

  runToSettled(sim);
  assert.equal(sim.phase, "settled");

  sim.drop();
  assert.equal(sim.phase, "settled", "drop() while settled must not do anything");
});

test("step() and drop() are no-ops outside falling (invariant 1 phase guard)", () => {
  const sim = createSim({ seed: 1, heightM: KNEE_M, toughness: 5, fruit: "watermelon" });

  assert.equal(sim.phase, "ready");
  const before = sim.bodies();

  sim.step();
  assert.equal(sim.steps, 0, "step() must not advance in ready phase");
  assert.deepEqual(sim.bodies(), before);
});

test("invariant 8: reset mid-fall clears pending state, and settling after reset matches a fresh sim", () => {
  const sim = createSim({ seed: 9, heightM: PLANE_M, toughness: 1, fruit: "watermelon" });

  sim.drop();

  for (let i = 0; i < 30; i += 1) sim.step();

  sim.reset();

  for (let i = 0; i < 600; i += 1) sim.step();

  assert.equal(sim.phase, "ready");
  assert.equal(sim.steps, 0);
  assert.equal(sim.summary, null);
  assert.equal(sim.lastSplit, null);

  const bodies = sim.bodies();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].kind, "fruit");
  assert.ok(Math.abs(bodies[0].position[1] - (PLANE_M + bodies[0].radius)) < 1e-9);

  sim.drop();
  runToSettled(sim);

  const freshSim = createSim({ seed: 9, heightM: PLANE_M, toughness: 1, fruit: "watermelon" });
  freshSim.drop();
  runToSettled(freshSim);

  assert.deepEqual(sim.summary, freshSim.summary);
});

test("bodies().length never exceeds MAX_DYNAMIC_BODIES during a Plane smash", () => {
  const sim = createSim({ seed: 5, heightM: PLANE_M, toughness: 1, fruit: "watermelon" });

  sim.drop();

  let steps = 0;

  while (sim.phase !== "settled" && steps < MAX_STEPS_TO_SETTLE) {
    sim.step();
    steps += 1;
    assert.ok(sim.bodies().length <= MAX_DYNAMIC_BODIES);
  }

  assert.equal(sim.phase, "settled");
});

test("D4: settled is reached by sleep OR by the 480-step limit, and at least one real scene settles by sleep before step 480", () => {
  const scenarios = [
    // Seed 4 is a held drop that settles by sleep well inside the 480-step
    // budget (verified: settles at step 231); seed 1 for the same scenario
    // happens to roll on its wobble and hit the step limit instead, so it
    // cannot be used to prove the sleep path is reachable.
    { name: "Knee watermelon t=5 (held)", seed: 4, heightM: KNEE_M, toughness: 5, fruit: "watermelon" },
    { name: "Plane watermelon t=1 (smashed)", seed: 1, heightM: PLANE_M, toughness: 1, fruit: "watermelon" }
  ];

  let atLeastOneSettledBySleep = false;

  for (const scenario of scenarios) {
    const sim = createSim({
      seed: scenario.seed,
      heightM: scenario.heightM,
      toughness: scenario.toughness,
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

test("displayed impact speed matches sqrt(2gh) within 0.25 m/s for every landmark height (watermelon, t=5)", () => {
  const measured = [];

  for (const landmark of LANDMARKS) {
    const sim = createSim({ seed: 11, heightM: landmark.meters, toughness: 5, fruit: "watermelon" });

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
