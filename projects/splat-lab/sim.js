// The only module that imports cannon-es. Everything engine-shaped lives
// here so swapping physics engines later touches this file only. No DOM,
// no three.js.
import * as CANNON from "cannon-es";

import {
  BURST_K,
  DEFAULT_FRUIT_KEY,
  E_BOUNCE,
  GRAVITY,
  FIXED_STEP,
  MAX_SETTLE_STEPS,
  UI_SETTLE_STEPS_AFTER_IMPACT,
  batchResultText,
  breakSpeedFor,
  budgetTrimPlan,
  createRng,
  fruitByKey,
  jitterFactor,
  kFruitFor,
  pieceCountsForTier,
  pieceVelocity,
  releaseWobble,
  resultText,
  severityFor,
  shouldBreakFruit,
  spawnPlanFor,
  tierForSeverity
} from "./rules.js";

const GROUND_HALF_THICKNESS = 5;

// Step 1b §11b (spawn ruling v3, decision 2): body budget across the whole
// scene, enforced at break time via budgetTrimPlan.
const BODY_BUDGET = 200;

// Step 1b §11b (spawn ruling v3, decision 1): the scene holds at most this
// many non-removed fruit at once (the rolling window).
const FRUIT_WINDOW = 5;

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
// the same per-piece mass (not a re-split of a smaller total).
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

// A piece body's effective radius for spawn-clearance purposes (decision 2a):
// spheres report their own radius; boxes (outer/rind pieces) report their
// placement bounding radius (halfExtent * sqrt(3), the same value used when
// they were placed non-overlapping at split time).
function clearanceRadiusOf(meta) {
  return meta.radius !== undefined ? meta.radius : meta.boundingRadius;
}

export function createSim({ seed, heightM, fruit = DEFAULT_FRUIT_KEY, tuning }) {
  let state = null;
  const resolvedTuning = { ...DEFAULT_TUNING, ...tuning };

  // Step 1b §11b (spawn ruling v3): reset()/createSim() build an *empty*
  // ready scene now (decision 7: "ready: empty scene") — nothing spawns
  // until drop() actually runs. initialDropDefaults is what a parameterless
  // drop() uses (decision 11: single-drop compatibility).
  function buildFreshState(nextSeed, nextHeightM, nextFruitKey) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVITY, 0) });

    world.allowSleep = true;

    const ground = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Box(new CANNON.Vec3(50, GROUND_HALF_THICKNESS, 50))
    });

    ground.position.set(0, -GROUND_HALF_THICKNESS, 0);
    noDamping(ground);
    world.addBody(ground);

    return {
      world,
      ground,
      initialDropDefaults: { fruit: nextFruitKey, heightM: nextHeightM, seed: nextSeed },
      records: [], // press order, never reordered; removed fruit stay with state "removed"
      recordsById: new Map(),
      kinds: new Map(), // cannon body -> meta { kind, id, fruitId, ...sizeFields }
      bodiesById: new Map(), // body id (number) -> cannon body
      nextBodyId: 1,
      nextFruitId: 1,
      nextPressIndex: 0,
      everDropped: false,
      steps: 0,
      lastPressStep: 0,
      lastImpactStep: null,
      impactsQueue: [],
      removalsQueue: [],
      pendingAnnouncementText: null,
      settleLayout: null,
      lastSplit: null,
      legacySummary: null,
      freshPieceIdsThisStep: new Set()
    };
  }

  function bodyOf(id) {
    return state.bodiesById.get(id);
  }

  function registerBody(body, meta) {
    state.kinds.set(body, meta);
    state.bodiesById.set(meta.id, body);
  }

  function detachBody(body) {
    state.kinds.delete(body);
    state.bodiesById.delete(state.kinds.get(body)?.id);
  }

  function countBodiesOf(record) {
    if (record.state === "broken") return record.pieceBodyIds.size;
    if (record.state === "falling" || record.state === "landed") return 1;

    return 0;
  }

  // Removes every body a record currently owns, unconditionally, marking it
  // "removed" (decision 3: removed fruit produce no impact/result/splat, and
  // any pending contact is dropped by never being processed again — the
  // guard in processContacts checks record.state).
  function removeFruitEntirely(record) {
    if (record.state === "removed") return;

    if (record.fruitBodyId !== null) {
      const body = bodyOf(record.fruitBodyId);

      if (body) {
        record.detachListener?.();
        state.world.removeBody(body);
        detachBody(body);
        state.removalsQueue.push(record.fruitBodyId);
      }

      record.fruitBodyId = null;
    }

    if (record.pieceBodyIds) {
      for (const id of record.pieceBodyIds) {
        const body = bodyOf(id);

        if (body) {
          state.world.removeBody(body);
          detachBody(body);
          state.removalsQueue.push(id);
        }
      }

      record.pieceBodyIds.clear();
    }

    record.state = "removed";
  }

  function removeSinglePiece(record, bodyId) {
    const body = bodyOf(bodyId);

    if (!body) return;

    state.world.removeBody(body);
    detachBody(body);
    record.pieceBodyIds.delete(bodyId);
    state.removalsQueue.push(bodyId);

    if (record.pieceBodyIds.size === 0) {
      record.state = "removed";
    }
  }

  function buildBodiesDataForSpawnPlan() {
    const data = [];

    for (const [body, meta] of state.kinds.entries()) {
      const record = state.recordsById.get(meta.fruitId);
      const falling = meta.kind === "fruit" && record.state === "falling";

      data.push({
        id: meta.id,
        position: [body.position.x, body.position.y, body.position.z],
        radius: clearanceRadiusOf(meta),
        falling
      });
    }

    return data;
  }

  function attachContactListener(record, body) {
    function onCollide(event) {
      if (record.stepContactCaptured) return;

      record.stepContactCaptured = true;
      record.contactSeq += 1;
      record.pendingContact = {
        impactSpeed: Math.abs(event.contact.getImpactVelocityAlongNormal()),
        position: body.position.clone(),
        quaternion: body.quaternion.clone(),
        velocity: body.velocity.clone(),
        angularVelocity: body.angularVelocity.clone(),
        seq: record.contactSeq
      };
    }

    body.addEventListener("collide", onCollide);
    record.detachListener = () => body.removeEventListener("collide", onCollide);
  }

  function spawnFruitRecord({ fruitKey, heightM, seed, spawnY }) {
    const fruitData = fruitByKey(fruitKey);
    const rng = createRng(seed);

    const record = {
      id: state.nextFruitId++,
      pressIndex: state.nextPressIndex++,
      fruitKey,
      fruitData,
      heightM,
      spawnY,
      seed,
      rng,
      state: "falling",
      fruitBodyId: null,
      pieceBodyIds: null,
      firstContactStep: null,
      firstImpact: null,
      result: null,
      announced: false,
      contactSeq: 0,
      processedContactSeq: 0,
      stepContactCaptured: false,
      pendingContact: null,
      detachListener: null
    };

    state.records.push(record);
    state.recordsById.set(record.id, record);

    const body = new CANNON.Body({ mass: fruitData.mass, shape: new CANNON.Sphere(fruitData.radius) });

    body.position.set(0, spawnY, 0);

    // Step 1b §7: a small release wobble drawn first from the seeded PRNG,
    // before any placement/jitter draws later. Vertical velocity is always
    // 0 (free fall still applies).
    const wobble = releaseWobble(rng);

    body.quaternion.set(wobble.quaternion[0], wobble.quaternion[1], wobble.quaternion[2], wobble.quaternion[3]);
    body.angularVelocity.set(wobble.angularVelocity[0], wobble.angularVelocity[1], wobble.angularVelocity[2]);
    body.velocity.set(wobble.velocity[0], wobble.velocity[1], wobble.velocity[2]);
    noDamping(body);
    state.world.addBody(body);

    const bodyId = state.nextBodyId++;

    record.fruitBodyId = bodyId;
    registerBody(body, { kind: "fruit", id: bodyId, fruitId: record.id, radius: fruitData.radius });
    attachContactListener(record, body);

    return record;
  }

  // Step 1b §11b (spawn ruling v3, decision 2): a drop always works,
  // instantly, in any phase and at any step.
  function drop(opts) {
    const base = state.initialDropDefaults;
    const chosen = opts
      ? {
          fruit: opts.fruit ?? base.fruit,
          heightM: opts.heightM ?? base.heightM,
          seed: opts.seed ?? base.seed
        }
      : { ...base };

    const fruitData = fruitByKey(chosen.fruit);

    state.everDropped = true;
    state.settleLayout = null;
    state.lastPressStep = state.steps;

    // (a) plain bodies data for the pre-removal scene.
    const bodiesData = buildBodiesDataForSpawnPlan();

    // (b) spawn plan: raise above falling fruit in the way, remove landed
    // bodies (whole fruit or individual pieces) overlapping the final spot.
    const plan = spawnPlanFor({ fruit: fruitData, heightM: chosen.heightM, bodies: bodiesData });

    for (const removeId of plan.removeIds) {
      const body = bodyOf(removeId);

      if (!body) continue; // already removed by an earlier id in this same plan

      const meta = state.kinds.get(body);
      const record = state.recordsById.get(meta.fruitId);

      if (meta.kind === "fruit") {
        removeFruitEntirely(record);
      } else {
        removeSinglePiece(record, removeId);
      }
    }

    // (c) rolling window of 5: dropping a 6th removes the oldest entirely.
    function nonRemovedOldestFirst() {
      return state.records.filter((r) => r.state !== "removed").sort((a, b) => a.pressIndex - b.pressIndex);
    }

    let existing = nonRemovedOldestFirst();

    while (existing.length >= FRUIT_WINDOW) {
      removeFruitEntirely(existing[0]);
      existing = nonRemovedOldestFirst();
    }

    // (d) spawn the new fruit at (0, plan.y, 0) with its own seeded wobble.
    spawnFruitRecord({ fruitKey: chosen.fruit, heightM: chosen.heightM, seed: chosen.seed, spawnY: plan.y });
  }

  function splitRecord(record, snapshot, tier, impactSpeed) {
    const { rng, fruitData } = record;
    const body = bodyOf(record.fruitBodyId);

    record.detachListener?.();
    state.world.removeBody(body);
    detachBody(body);
    record.fruitBodyId = null;
    record.pieceBodyIds = new Set();

    const { position, quaternion, velocity, angularVelocity } = snapshot;
    const centre = [position.x, position.y, position.z];
    const preImpactVelocity = [velocity.x, velocity.y, velocity.z];
    const preImpactAngularVelocity = [angularVelocity.x, angularVelocity.y, angularVelocity.z];
    const breakSpeedValue = breakSpeedFor(fruitData);
    const kFruit = kFruitFor(fruitData, resolvedTuning.burstK);

    // Step 1b §11b (spawn ruling v3, decision 2/4): body budget of 200,
    // applied at break time — remove other fruit oldest-first, then trim
    // this fruit's own seeds/inner/outer (never the breaking fruit's own
    // fruit-id itself).
    const existingCounts = state.records
      .filter((r) => r.state !== "removed" && r.id !== record.id)
      .sort((a, b) => a.pressIndex - b.pressIndex)
      .map((r) => ({ id: r.id, bodyCount: countBodiesOf(r) }));

    const rawCounts = pieceCountsForTier(fruitData, tier);
    const { removeFruitIds, trimmedBreakingCounts } = budgetTrimPlan({
      existingCounts,
      breakingCounts: rawCounts,
      limit: BODY_BUDGET
    });

    for (const id of removeFruitIds) {
      removeFruitEntirely(state.recordsById.get(id));
    }

    const counts = trimmedBreakingCounts;
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
          { boundingRadius: OUTER_BOUNDING_RADIUS, halfExtent: outerHalfExtent }
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

    // Lift: pieces spawn packed inside the fruit's small volume, so some can
    // start below the ground even after non-overlap placement. Raise the
    // whole group by the same amount so the lowest piece just clears the
    // ground; velocities are unaffected.
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
      const pieceBody = new CANNON.Body({ mass: piece.mass, shape: piece.shape });

      pieceBody.position.set(
        position.x + piece.worldOffset.x,
        position.y + piece.worldOffset.y + lift,
        position.z + piece.worldOffset.z
      );
      pieceBody.velocity.set(piece.velocity[0], piece.velocity[1], piece.velocity[2]);
      pieceBody.angularVelocity.set(
        preImpactAngularVelocity[0],
        preImpactAngularVelocity[1],
        preImpactAngularVelocity[2]
      );
      restoreFruitDamping(pieceBody);

      state.world.addBody(pieceBody);

      const id = state.nextBodyId++;

      registerBody(pieceBody, { kind: piece.kind, id, fruitId: record.id, ...piece.sizeField });
      record.pieceBodyIds.add(id);
      state.freshPieceIdsThisStep.add(id);
      lastSplitPieces.push({ id, jitter: piece.jitter });
    }

    record.state = "broken";
    record.result = {
      fruit: fruitData,
      heightMeters: record.heightM,
      impactSpeed,
      tier,
      severity: severityFor(impactSpeed, fruitData),
      outerCount: counts.outer,
      innerCount: counts.inner,
      seedCount: counts.seeds
    };

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

  function processContacts() {
    for (const record of state.records) {
      if (record.state !== "falling" && record.state !== "landed") continue;

      const pending = record.pendingContact;

      if (!pending || pending.seq === record.processedContactSeq) continue;

      record.processedContactSeq = pending.seq;

      const impactSpeed = pending.impactSpeed;

      if (record.firstContactStep === null) {
        // First contact ever for this fruit (decision 5i): always one
        // impact event, regardless of whether it breaks right away.
        record.firstContactStep = state.steps;

        const severity = severityFor(impactSpeed, record.fruitData);
        const tier = tierForSeverity(severity);

        record.firstImpact = { step: state.steps, impactSpeed, severity, tier, fruit: record.fruitKey };

        state.impactsQueue.push({
          fruitId: record.id,
          fruit: record.fruitKey,
          tier,
          severity,
          impactSpeed,
          step: state.steps
        });
        state.lastImpactStep = state.steps;

        if (shouldBreakFruit(impactSpeed, record.fruitData)) {
          splitRecord(record, pending, tier, impactSpeed);
        } else {
          record.state = "landed";
          restoreFruitDamping(bodyOf(record.fruitBodyId));

          const counts = pieceCountsForTier(record.fruitData, tier);

          record.result = {
            fruit: record.fruitData,
            heightMeters: record.heightM,
            impactSpeed,
            tier,
            severity,
            outerCount: counts.outer,
            innerCount: counts.inner,
            seedCount: counts.seeds
          };
        }
      } else if (record.state === "landed") {
        // A later contact on an already-held fruit (decision 5ii/4): one
        // more impact event only if this contact now breaks it.
        const severity = severityFor(impactSpeed, record.fruitData);
        const tier = tierForSeverity(severity);

        if (shouldBreakFruit(impactSpeed, record.fruitData)) {
          state.impactsQueue.push({
            fruitId: record.id,
            fruit: record.fruitKey,
            tier,
            severity,
            impactSpeed,
            step: state.steps
          });
          state.lastImpactStep = state.steps;
          splitRecord(record, pending, tier, impactSpeed);
        }
      }
    }
  }

  function clampPieceVelocities() {
    for (const [body, meta] of state.kinds.entries()) {
      if (meta.kind === "fruit") continue;
      if (state.freshPieceIdsThisStep.has(meta.id)) continue;

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

  function snapshotLayout() {
    const layout = [];

    for (const body of state.kinds.keys()) {
      layout.push([body.position.x, body.position.y, body.position.z]);
    }

    return layout;
  }

  // Step 1b §11b (spawn ruling v3, decision 7): phases are for status and
  // announcements only. `active` = anything falling, or an impact under
  // UI_SETTLE_STEPS_AFTER_IMPACT steps ago. `settled` otherwise.
  function computePhase() {
    if (!state.everDropped) return "ready";

    const anyFalling = state.records.some((r) => r.state === "falling");

    if (anyFalling) return "active";

    const recentImpact = state.lastImpactStep !== null && state.steps - state.lastImpactStep < UI_SETTLE_STEPS_AFTER_IMPACT;

    if (!recentImpact) return "settled";

    // Physics-idle (every body asleep) freezes the step counter (see
    // isPhysicsIdle/step()) — if that happens before the 72-step window
    // closes, no further step() call will ever advance steps to close the
    // gap. Treat "already asleep" as settled too, mirroring the old
    // phase/uiPhase "whichever comes first" behaviour for a fast-sleeping
    // held fruit.
    if (allDynamicBodiesAsleep()) return "settled";

    return "active";
  }

  // Step 1b §11b (decision 8): step() advances the world unless the phase
  // is "ready", or the scene is physics-idle (every dynamic body asleep, or
  // steps − lastPressStep ≥ 480).
  function isPhysicsIdle() {
    const asleep = allDynamicBodiesAsleep();
    const timedOut = state.steps - state.lastPressStep >= MAX_SETTLE_STEPS;

    return asleep || timedOut;
  }

  function buildLegacySummary(record) {
    const severity = record.result ? record.result.severity : 0;
    const tier = record.result ? record.result.tier : "held";
    const impactSpeed = record.result ? record.result.impactSpeed : 0;
    const counts = record.result
      ? { outer: record.result.outerCount, inner: record.result.innerCount, seeds: record.result.seedCount }
      : { outer: 0, inner: 0, seeds: 0 };

    return {
      fruit: record.fruitKey,
      heightM: record.heightM,
      seed: record.seed,
      impactSpeed,
      severity,
      tier,
      broke: tier !== "held",
      outerCount: counts.outer,
      innerCount: counts.inner,
      seedCount: counts.seeds,
      text: resultText({
        fruit: record.fruitData,
        heightMeters: record.heightM,
        impactSpeed,
        tier,
        outerCount: counts.outer,
        seedCount: counts.seeds
      })
    };
  }

  // Step 1b §11b (decision 11): `summary` stays a single-fruit-only alias
  // of "today's summary object at settle", revealed at the same delayed
  // moment as before (UI settle at firstContact+72, or earlier physics
  // settle by sleep) — not the instant a result is known. Only meaningful
  // (and only tested) while exactly one fruit has ever been dropped.
  function updateLegacySummary() {
    if (state.legacySummary !== null) return;
    if (state.records.length !== 1) return;

    const record = state.records[0];

    if (record.result === null) return;

    const uiSettleReached = state.steps >= record.firstContactStep + UI_SETTLE_STEPS_AFTER_IMPACT;
    const physicsSettled = allDynamicBodiesAsleep();

    if (uiSettleReached || physicsSettled) {
      state.legacySummary = buildLegacySummary(record);
    }
  }

  function step() {
    if (!state.everDropped) return;
    if (isPhysicsIdle()) return;

    const prevPhase = computePhase();

    for (const record of state.records) record.stepContactCaptured = false;
    state.freshPieceIdsThisStep = new Set();

    state.world.step(FIXED_STEP);
    state.steps += 1;

    processContacts();
    clampPieceVelocities();

    const newPhase = computePhase();

    if (prevPhase !== "settled" && newPhase === "settled") {
      const eligible = state.records.filter(
        (r) => !r.announced && (r.state === "landed" || r.state === "broken")
      );

      if (eligible.length > 0) {
        const results = eligible.map((r) => ({
          fruit: r.result.fruit,
          heightMeters: r.result.heightMeters,
          impactSpeed: r.result.impactSpeed,
          tier: r.result.tier,
          outerCount: r.result.outerCount,
          seedCount: r.result.seedCount
        }));

        state.pendingAnnouncementText = batchResultText(results);

        for (const r of eligible) r.announced = true;
      }

      state.settleLayout = snapshotLayout();
    }

    updateLegacySummary();
  }

  function reset(opts = {}) {
    const base = state.initialDropDefaults;
    const nextSeed = opts.seed ?? base.seed;
    const nextHeightM = opts.heightM ?? base.heightM;
    const nextFruitKey = opts.fruit ?? base.fruit;

    for (const record of state.records) {
      record.detachListener?.();
    }

    state = buildFreshState(nextSeed, nextHeightM, nextFruitKey);
  }

  function bodies() {
    const result = [];

    for (const [body, meta] of state.kinds.entries()) {
      const { kind, id, fruitId, ...sizeFields } = meta;

      result.push({
        id,
        fruitId,
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

  function fruits() {
    return state.records
      .filter((r) => r.state !== "removed")
      .map((r) => ({
        id: r.id,
        fruit: r.fruitKey,
        heightM: r.heightM,
        spawnY: r.spawnY,
        state: r.state,
        pressIndex: r.pressIndex
      }));
  }

  function consumeRemovals() {
    const drained = state.removalsQueue;

    state.removalsQueue = [];

    return drained;
  }

  function consumeImpacts() {
    const drained = state.impactsQueue;

    state.impactsQueue = [];

    return drained;
  }

  function consumeAnnouncement() {
    const text = state.pendingAnnouncementText;

    state.pendingAnnouncementText = null;

    return text;
  }

  state = buildFreshState(seed, heightM, fruit);

  return {
    drop,
    step,
    reset,
    bodies,
    fruits,
    consumeRemovals,
    consumeImpacts,
    consumeAnnouncement,
    get fruitCount() {
      return state.records.filter((r) => r.state !== "removed").length;
    },
    get phase() {
      return computePhase();
    },
    // Step 1b §11b (decision 11): uiPhase is now identical to phase.
    get uiPhase() {
      return computePhase();
    },
    get summary() {
      return state.legacySummary;
    },
    get steps() {
      return state.steps;
    },
    get lastSplit() {
      return state.lastSplit;
    },
    get firstImpact() {
      return state.records.length ? state.records[0].firstImpact : null;
    },
    get settleLayout() {
      return state.settleLayout;
    },
    // Step 1b §11b (decision 11): uiSettleLayout is now identical to
    // settleLayout.
    get uiSettleLayout() {
      return state.settleLayout;
    },
    get tuning() {
      return resolvedTuning;
    }
  };
}
