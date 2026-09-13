// The only module that imports cannon-es. Everything engine-shaped lives
// here so swapping physics engines later touches this file only. No DOM,
// no three.js.
import * as CANNON from "cannon-es";

import {
  BURST_K,
  DEFAULT_FRUIT_KEY,
  DEFAULT_TOUGHNESS,
  E_BOUNCE,
  GRAVITY,
  FIXED_STEP,
  MAX_DYNAMIC_BODIES,
  MAX_SETTLE_STEPS,
  breakSpeedFor,
  createRng,
  fruitByKey,
  jitterFactor,
  kFruitFor,
  phaseAfter,
  pieceCountsForTier,
  pieceVelocity,
  releaseWobble,
  resultText,
  severityFor,
  shouldBreakFruit,
  tierForSeverity
} from "./rules.js";

const GROUND_HALF_THICKNESS = 5;

// Piece geometry fractions (of the fruit's own radius), shared by every
// fruit, per the engineer's sweep model in the step-1b correction:
const OUTER_HALF_EXTENT_FRACTION = 0.32;
const OUTER_SHELL_RADIUS_FRACTION = 0.9;
const INNER_RADIUS_FRACTION = 0.2;
const INNER_MAX_RADIUS_FRACTION = 0.9;
const SEED_RADIUS_FRACTION = 0.048;
const SEED_MAX_RADIUS_FRACTION = 0.95;

// Mass split across a fruit's total mass at the smashed (100%) piece
// counts: outer 40%, inner 55%, seeds 5%. Cracked/split use fewer pieces of
// the same per-piece mass (not a re-split of a smaller total), which is
// simpler and keeps individual piece masses independent of toughness.
const OUTER_MASS_SHARE = 0.4;
const INNER_MASS_SHARE = 0.55;
const SEED_MASS_SHARE = 0.05;

const MAX_PIECE_LINEAR_SPEED = 40;
const MAX_PIECE_ANGULAR_SPEED = 25;

function goldenSpiralOffsets(count, radius) {
  const offsets = [];

  for (let i = 0; i < count; i += 1) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;

    offsets.push(
      new CANNON.Vec3(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.sin(phi) * Math.sin(theta),
        radius * Math.cos(phi)
      )
    );
  }

  return offsets;
}

function randomPointInSphere(rng, maxRadius) {
  // Uniform-in-volume via cube-root radius scaling.
  const u = rng();
  const v = rng();
  const w = rng();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  const r = maxRadius * Math.cbrt(w);

  return new CANNON.Vec3(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi)
  );
}

// A fruit's outer/inner/seed pieces cannot fit inside its own small volume
// without overlap if placed by a single unconstrained random draw each.
// Reject-and-retry against every piece already placed (deterministic:
// driven by the same seeded PRNG), falling back to the least-bad candidate
// found if the volume is simply too tight to avoid overlap altogether
// (outer pieces, placed first on a fixed shell).
function placeNonOverlapping(rng, maxRadius, boundingRadius, placedPieces, maxAttempts = 200) {
  let bestCandidate = null;
  let bestClearance = -Infinity;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = randomPointInSphere(rng, maxRadius);
    let clearance = Infinity;

    for (const placed of placedPieces) {
      const gap = candidate.distanceTo(placed.offset) - placed.boundingRadius - boundingRadius;
      clearance = Math.min(clearance, gap);
    }

    if (clearance >= 0) return candidate;

    if (clearance > bestClearance) {
      bestClearance = clearance;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}

// Zero damping is needed only up to the first ground contact, so the
// free-fall speed used for the sqrt(2gh) check is undistorted (cannon-es's
// default 0.01 linear damping shaves real speed off a long fall). Once the
// first collision has decided the tier, bodies get damping restored so they
// can actually fall asleep instead of drifting at a near-constant tiny
// speed for all 480 steps of the settle budget.
const FRUIT_POST_IMPACT_LINEAR_DAMPING = 0.01;
const FRUIT_POST_IMPACT_ANGULAR_DAMPING = 0.3;

function noDamping(body) {
  body.linearDamping = 0;
  body.angularDamping = 0;
}

function restoreFruitDamping(body) {
  body.linearDamping = FRUIT_POST_IMPACT_LINEAR_DAMPING;
  body.angularDamping = FRUIT_POST_IMPACT_ANGULAR_DAMPING;
}

const DEFAULT_TUNING = { burstK: BURST_K, bounceE: E_BOUNCE, lift: true };

export function createSim({ seed, heightM, toughness = DEFAULT_TOUGHNESS, fruit = DEFAULT_FRUIT_KEY, tuning }) {
  let state = null;
  const resolvedTuning = { ...DEFAULT_TUNING, ...tuning };

  function buildFreshState(nextSeed, nextHeightM, nextToughness, nextFruitKey) {
    const fruitData = fruitByKey(nextFruitKey);
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });

    world.allowSleep = true;

    const ground = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(50, GROUND_HALF_THICKNESS, 50))
    });

    ground.position.set(0, -GROUND_HALF_THICKNESS, 0);
    noDamping(ground);
    world.addBody(ground);

    const rng = createRng(nextSeed);

    const fruitBody = new CANNON.Body({
      mass: fruitData.mass,
      shape: new CANNON.Sphere(fruitData.radius)
    });

    fruitBody.position.set(0, nextHeightM + fruitData.radius, 0);
    // Step 1b §7: a small release wobble (replacing the old fixed spin
    // range) drawn first from the seeded PRNG, before any placement/jitter
    // draws later. Vertical velocity is always 0 (free fall still applies).
    const wobble = releaseWobble(rng);

    fruitBody.quaternion.set(wobble.quaternion[0], wobble.quaternion[1], wobble.quaternion[2], wobble.quaternion[3]);
    fruitBody.angularVelocity.set(wobble.angularVelocity[0], wobble.angularVelocity[1], wobble.angularVelocity[2]);
    fruitBody.velocity.set(wobble.velocity[0], wobble.velocity[1], wobble.velocity[2]);
    noDamping(fruitBody);
    world.addBody(fruitBody);

    let nextLocalId = 1;
    const kinds = new Map(); // cannon body -> { kind, id, sizeField }

    kinds.set(fruitBody, { kind: "fruit", id: nextLocalId++, radius: fruitData.radius });

    let pendingImpact = null;
    let firstImpactCaptured = false;

    function onFruitCollide(event) {
      if (firstImpactCaptured) return;

      firstImpactCaptured = true;

      const impactSpeed = Math.abs(event.contact.getImpactVelocityAlongNormal());

      pendingImpact = {
        impactSpeed,
        position: fruitBody.position.clone(),
        quaternion: fruitBody.quaternion.clone(),
        velocity: fruitBody.velocity.clone(),
        angularVelocity: fruitBody.angularVelocity.clone()
      };
    }

    fruitBody.addEventListener("collide", onFruitCollide);

    // Lifecycle safety for invariant 8 (no stale callbacks): every drop/reset
    // calls buildFreshState, which creates a brand-new world, fruit body and
    // closures. `state` (the enclosing variable) is reassigned wholesale, so
    // step()/drop()/bodies() always dereference the current generation only.
    // On split and on reset we additionally detach the fruit's own listener
    // (below / in reset) so a body that outlives its world cannot act.
    const nextState = {
      world,
      ground,
      fruitBody,
      fruit: fruitData,
      heightM: nextHeightM,
      toughness: nextToughness,
      seed: nextSeed,
      rng,
      kinds,
      nextLocalIdRef: { current: nextLocalId },
      phase: "ready",
      steps: 0,
      summary: null,
      lastSplit: null,
      firstCollisionDecided: false,
      getPendingImpact: () => pendingImpact,
      clearPendingImpact: () => {
        pendingImpact = null;
      },
      detachFruitListener: () => {
        fruitBody.removeEventListener("collide", onFruitCollide);
      }
    };

    return nextState;
  }

  function splitFruit(snapshot, tier) {
    const { world, fruitBody, fruit: fruitData, kinds, nextLocalIdRef, rng } = state;

    world.removeBody(fruitBody);
    kinds.delete(fruitBody);
    state.detachFruitListener();

    const { position, quaternion, velocity, angularVelocity, impactSpeed } = snapshot;
    const centre = [position.x, position.y, position.z];
    const preImpactVelocity = [velocity.x, velocity.y, velocity.z];
    const preImpactAngularVelocity = [angularVelocity.x, angularVelocity.y, angularVelocity.z];
    const breakSpeedValue = state.breakSpeedValue;
    const kFruit = kFruitFor(fruitData, resolvedTuning.burstK);

    const counts = pieceCountsForTier(fruitData, tier);
    const R = fruitData.radius;
    const outerHalfExtent = OUTER_HALF_EXTENT_FRACTION * R;
    const outerShellRadius = OUTER_SHELL_RADIUS_FRACTION * R;
    const innerRadius = INNER_RADIUS_FRACTION * R;
    const innerMaxRadius = INNER_MAX_RADIUS_FRACTION * R;
    const seedRadius = SEED_RADIUS_FRACTION * R;
    const seedMaxRadius = SEED_MAX_RADIUS_FRACTION * R;

    const outerMassEach = counts.outer > 0 ? (fruitData.mass * OUTER_MASS_SHARE) / counts.outer : 0;
    const innerMassEach = counts.inner > 0 ? (fruitData.mass * INNER_MASS_SHARE) / counts.inner : 0;
    const seedMassEach = counts.seeds > 0 ? (fruitData.mass * SEED_MASS_SHARE) / counts.seeds : 0;

    const placedPieces = []; // { offset, boundingRadius } for overlap rejection
    const pieceDescriptors = []; // { kind, offset (local), boundingRadius, shape, mass, sizeField }

    function registerPlacement(kind, localOffset, boundingRadius, shape, mass, sizeField) {
      placedPieces.push({ offset: localOffset, boundingRadius });
      pieceDescriptors.push({ kind, offset: localOffset, boundingRadius, shape, mass, sizeField });
    }

    const OUTER_BOUNDING_RADIUS = outerHalfExtent * Math.sqrt(3);

    if (counts.outer > 0) {
      for (const offset of goldenSpiralOffsets(counts.outer, outerShellRadius)) {
        registerPlacement(
          "outer",
          offset,
          OUTER_BOUNDING_RADIUS,
          new CANNON.Box(new CANNON.Vec3(outerHalfExtent, outerHalfExtent, outerHalfExtent)),
          outerMassEach,
          { halfExtent: outerHalfExtent }
        );
      }
    }

    for (let i = 0; i < counts.inner; i += 1) {
      const offset = placeNonOverlapping(rng, innerMaxRadius, innerRadius, placedPieces);

      registerPlacement("inner", offset, innerRadius, new CANNON.Sphere(innerRadius), innerMassEach, {
        radius: innerRadius
      });
    }

    for (let i = 0; i < counts.seeds; i += 1) {
      const offset = placeNonOverlapping(rng, seedMaxRadius, seedRadius, placedPieces);

      registerPlacement("seed", offset, seedRadius, new CANNON.Sphere(seedRadius), seedMassEach, {
        radius: seedRadius
      });
    }

    // Jitter is drawn once per piece, in this fixed order (outer, then
    // inner, then seeds — the same order pieceDescriptors was built in),
    // and only after every placement draw above, so determinism does not
    // depend on how many rejection attempts each piece's placement needed.
    const computedPieces = pieceDescriptors.map((descriptor) => {
      const jitter = jitterFactor(rng());
      const worldOffset = new CANNON.Vec3();

      quaternion.vmult(descriptor.offset, worldOffset);

      const r = [worldOffset.x, worldOffset.y, worldOffset.z];
      const velocityVector = pieceVelocity({
        velocity: preImpactVelocity,
        angularVelocity: preImpactAngularVelocity,
        r,
        impactSpeed,
        breakSpeedValue,
        jitter,
        k: kFruit,
        e: resolvedTuning.bounceE
      });

      return { ...descriptor, worldOffset, r, velocity: velocityVector, jitter };
    });

    // Lift: pieces spawn packed inside the fruit's small volume, so some
    // can start below the ground (their world y minus bounding radius is
    // negative) even after non-overlap placement. Raise the whole group by
    // the same amount so the lowest piece just clears the ground;
    // velocities are unaffected. `tuning.lift = false` exists only for the
    // dead-control test (removing lift is guarded by the spawn test, not
    // the energy guard).
    let lift = 0;

    if (resolvedTuning.lift && computedPieces.length > 0) {
      let lowest = Infinity;

      for (const piece of computedPieces) {
        const y = position.y + piece.worldOffset.y;

        lowest = Math.min(lowest, y - piece.boundingRadius);
      }

      lift = lowest < 0 ? -lowest + 0.001 : 0;
    }

    const lastSplitPieces = [];

    for (const piece of computedPieces) {
      const body = new CANNON.Body({ mass: piece.mass, shape: piece.shape });

      body.position.set(
        position.x + piece.worldOffset.x,
        position.y + piece.worldOffset.y + lift,
        position.z + piece.worldOffset.z
      );
      body.velocity.set(piece.velocity[0], piece.velocity[1], piece.velocity[2]);
      body.angularVelocity.set(
        preImpactAngularVelocity[0],
        preImpactAngularVelocity[1],
        preImpactAngularVelocity[2]
      );
      restoreFruitDamping(body);

      world.addBody(body);

      const id = nextLocalIdRef.current++;

      kinds.set(body, { kind: piece.kind, id, ...piece.sizeField });
      lastSplitPieces.push({ id, jitter: piece.jitter });
    }

    state.lastSplit = {
      fruit: fruitData.key,
      impactSpeed,
      breakSpeed: breakSpeedValue,
      k: kFruit,
      kFruit,
      e: resolvedTuning.bounceE,
      tier,
      centre,
      lift,
      velocity: preImpactVelocity,
      angularVelocity: preImpactAngularVelocity,
      pieces: lastSplitPieces
    };
  }

  function clampPieceVelocities() {
    for (const [body, meta] of state.kinds.entries()) {
      if (meta.kind === "fruit") continue;

      const linSpeed = body.velocity.length();
      if (linSpeed > MAX_PIECE_LINEAR_SPEED) {
        body.velocity.scale(MAX_PIECE_LINEAR_SPEED / linSpeed, body.velocity);
      }

      const angSpeed = body.angularVelocity.length();
      if (angSpeed > MAX_PIECE_ANGULAR_SPEED) {
        body.angularVelocity.scale(MAX_PIECE_ANGULAR_SPEED / angSpeed, body.angularVelocity);
      }
    }
  }

  function allDynamicBodiesAsleep() {
    for (const body of state.kinds.keys()) {
      if (body.sleepState !== CANNON.Body.SLEEPING) return false;
    }

    return true;
  }

  function finishSettling() {
    const pending = state.getPendingImpact();
    const severity = pending ? severityFor(pending.impactSpeed, state.fruit, state.toughness) : 0;
    const tier = pending ? tierForSeverity(severity) : "held";
    const counts = pieceCountsForTier(state.fruit, tier);

    state.summary = {
      fruit: state.fruit.key,
      heightM: state.heightM,
      toughness: state.toughness,
      seed: state.seed,
      impactSpeed: pending ? pending.impactSpeed : 0,
      severity,
      tier,
      broke: tier !== "held",
      outerCount: counts.outer,
      innerCount: counts.inner,
      seedCount: counts.seeds,
      text: resultText({
        fruit: state.fruit,
        heightMeters: state.heightM,
        impactSpeed: pending ? pending.impactSpeed : 0,
        tier,
        outerCount: counts.outer,
        seedCount: counts.seeds
      })
    };

    state.phase = phaseAfter(state.phase, "settle");
  }

  function drop() {
    if (state.phase !== "ready") return;

    state.phase = phaseAfter(state.phase, "drop");
  }

  function step() {
    if (state.phase !== "falling") return;

    const wasDecidedBeforeThisStep = state.firstCollisionDecided;

    state.world.step(FIXED_STEP);
    state.steps += 1;

    const pending = state.getPendingImpact();

    if (pending && !state.firstCollisionDecided) {
      state.firstCollisionDecided = true;
      state.breakSpeedValue = breakSpeedFor(state.fruit, state.toughness);

      if (shouldBreakFruit(pending.impactSpeed, state.fruit, state.toughness)) {
        const severity = severityFor(pending.impactSpeed, state.fruit, state.toughness);
        const tier = tierForSeverity(severity);

        splitFruit(pending, tier);
      } else {
        restoreFruitDamping(state.fruitBody);
      }
    }

    // Pieces spawn lifted clear of the ground and non-overlapping, with
    // velocity from the amended v_t - e*v_n + ω × r + burst formula, so this
    // clamp is only a safety net against solver spikes the first few steps
    // after a close-but-not-overlapping spawn can still produce. It never
    // runs on the split step itself (`wasDecidedBeforeThisStep` is false
    // there), so the spawn velocities T1 reads are exactly the formula,
    // unclamped.
    if (wasDecidedBeforeThisStep) {
      clampPieceVelocities();
    }

    if (state.kinds.size > MAX_DYNAMIC_BODIES) {
      throw new Error(`dynamic body count ${state.kinds.size} exceeded ${MAX_DYNAMIC_BODIES}`);
    }

    const settledBySleep = state.firstCollisionDecided && allDynamicBodiesAsleep();
    const settledByTimeout = state.steps >= MAX_SETTLE_STEPS;

    if (settledBySleep || settledByTimeout) {
      finishSettling();
    }
  }

  function reset(opts = {}) {
    const nextSeed = opts.seed ?? state.seed;
    const nextHeightM = opts.heightM ?? state.heightM;
    const nextToughness = opts.toughness ?? state.toughness;
    const nextFruitKey = opts.fruit ?? state.fruit.key;

    if (!state.firstCollisionDecided) {
      state.detachFruitListener();
    }

    state = buildFreshState(nextSeed, nextHeightM, nextToughness, nextFruitKey);
  }

  function bodies() {
    const result = [];

    for (const [body, meta] of state.kinds.entries()) {
      const { kind, id, ...sizeFields } = meta;

      result.push({
        id,
        kind,
        position: [body.position.x, body.position.y, body.position.z],
        quaternion: [body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w],
        velocity: [body.velocity.x, body.velocity.y, body.velocity.z],
        angularVelocity: [body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z],
        sleeping: body.sleepState === CANNON.Body.SLEEPING,
        ...sizeFields
      });
    }

    return result;
  }

  state = buildFreshState(seed, heightM, toughness, fruit);

  return {
    drop,
    step,
    reset,
    bodies,
    get phase() {
      return state.phase;
    },
    get summary() {
      return state.summary;
    },
    get steps() {
      return state.steps;
    },
    get lastSplit() {
      return state.lastSplit;
    }
  };
}
