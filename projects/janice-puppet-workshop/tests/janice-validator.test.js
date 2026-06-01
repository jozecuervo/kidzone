import { PUPPETS } from "../puppets/index.js";
import { JANICE_PUPPET } from "../puppets/janice.puppet.js";
import {
  activeClip,
  animatedClipAt,
  attachedPointTransform,
  drawLayerForItem,
  pointForClip,
  shapeForPart,
  variantSelection,
  visiblePartIds,
  worldTransforms
} from "../janice-runtime.js";
import { validatePuppet, validatePuppetSet } from "../janice-validator.js";

const tests = [];

function test(name, run) {
  tests.push({ name, run });
}

function clone(value) {
  return structuredClone(value);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertClose(actual, expected, label) {
  const delta = Math.abs(actual - expected);
  assert(delta < 0.0001, `${label}: expected ${expected}, got ${actual}`);
}

function assertInvalid(puppet, expectedText) {
  const result = validatePuppet(puppet);
  assert(!result.valid, "Expected puppet to be invalid.");
  assert(
    result.errors.some((error) => error.includes(expectedText)),
    `Expected error containing "${expectedText}", got: ${result.errors.join("; ")}`
  );
}

function bodyLayer(puppet, partId) {
  return puppet.bodyParts.find((part) => part.id === partId).layer;
}

function outfitLayer(puppet, outfitId, itemId) {
  const outfit = puppet.outfits.find((item) => item.id === outfitId);
  return outfit.items.find((item) => item.id === itemId).layer;
}

function accessoryLayer(puppet, accessoryId) {
  return puppet.accessories.find((item) => item.id === accessoryId).layer;
}

function bodyPart(puppet, partId) {
  return puppet.bodyParts.find((part) => part.id === partId);
}

function outfitItem(puppet, outfitId, itemId) {
  const outfit = puppet.outfits.find((item) => item.id === outfitId);
  return outfit.items.find((item) => item.id === itemId);
}

function accessoryItem(puppet, accessoryId) {
  return puppet.accessories.find((item) => item.id === accessoryId);
}

test("MVP puppet set is valid", () => {
  const result = validatePuppetSet(PUPPETS);
  assert(result.valid, result.errors.join("; "));
});

test("JANICE fixture satisfies MVP requirements", () => {
  const result = validatePuppet(JANICE_PUPPET, { requireMvp: true });
  assert(result.valid, result.errors.join("; "));
});

test("JANICE fixture keeps back arm, back leg, torso, front leg, and front arm in depth order", () => {
  const puppet = JANICE_PUPPET;
  const torso = bodyLayer(puppet, "torso");
  const top = outfitLayer(puppet, "greenRunway", "greenTop");
  const belt = outfitLayer(puppet, "greenRunway", "greenBelt");

  assert(bodyLayer(puppet, "leftUpperArm") < bodyLayer(puppet, "leftUpperLeg"), "back arm should sit behind the back leg.");
  assert(bodyLayer(puppet, "leftUpperLeg") < torso, "back leg should sit behind the torso.");
  assert(torso < bodyLayer(puppet, "rightUpperLeg"), "front leg should sit over the torso.");
  assert(bodyLayer(puppet, "rightUpperLeg") < bodyLayer(puppet, "rightUpperArm"), "front arm should sit over the front leg.");
  assert(torso < top, "tops should sit over the body torso.");
  assert(top < bodyLayer(puppet, "rightUpperArm"), "screen-right arm should sit over the top.");
  assert(belt < bodyLayer(puppet, "rightForearm"), "near forearm should sit over outfit belts.");
  assert(bodyLayer(puppet, "leftFoot") < bodyLayer(puppet, "rightFoot"), "near foot should sit over far foot.");
  assert(outfitLayer(puppet, "greenRunway", "greenShoesLeft") < outfitLayer(puppet, "greenRunway", "greenShoesRight"), "near shoe should sit over far shoe.");
  assert(accessoryLayer(puppet, "tinyBag") < torso, "far wrist accessory should stay behind the torso.");
  assert(bodyLayer(puppet, "rightHand") < bodyLayer(puppet, "headShape"), "near hand should not cover the head.");
  assert(accessoryLayer(puppet, "wristSparkle") < bodyLayer(puppet, "headShape"), "near wrist accessory should not cover the head.");
});

test("JANICE fixture keeps proximal limb pieces over distal pieces", () => {
  const puppet = JANICE_PUPPET;

  assert(bodyLayer(puppet, "leftLowerLeg") < bodyLayer(puppet, "leftFoot"), "far foot should sit over its lower leg.");
  assert(bodyLayer(puppet, "leftFoot") < outfitLayer(puppet, "greenRunway", "greenShoesLeft"), "far shoe should sit over its foot.");
  assert(outfitLayer(puppet, "greenRunway", "greenShoesLeft") < bodyLayer(puppet, "leftUpperLeg"), "far upper leg should cap its knee stack.");
  assert(bodyLayer(puppet, "rightLowerLeg") < bodyLayer(puppet, "rightFoot"), "near foot should sit over its lower leg.");
  assert(bodyLayer(puppet, "rightFoot") < outfitLayer(puppet, "greenRunway", "greenShoesRight"), "near shoe should sit over its foot.");
  assert(outfitLayer(puppet, "greenRunway", "greenShoesRight") < bodyLayer(puppet, "rightUpperLeg"), "near upper leg should cap its knee stack.");
  assert(bodyLayer(puppet, "leftForearm") < bodyLayer(puppet, "leftHand"), "far hand should sit over its forearm.");
  assert(bodyLayer(puppet, "leftHand") < bodyLayer(puppet, "leftUpperArm"), "far upper arm should cap its elbow stack.");
  assert(bodyLayer(puppet, "rightForearm") < bodyLayer(puppet, "rightHand"), "near hand should sit over its forearm.");
  assert(bodyLayer(puppet, "rightHand") < bodyLayer(puppet, "rightUpperArm"), "near upper arm should cap its elbow stack.");
});

test("JANICE mirrors side depth when a clip faces left", () => {
  const puppet = JANICE_PUPPET;
  const leftClip = activeClip(puppet, "walk", { direction: "left" });
  const rightClip = activeClip(puppet, "walk", { direction: "right" });
  const leftArm = bodyPart(puppet, "leftUpperArm");
  const rightArm = bodyPart(puppet, "rightUpperArm");
  const leftShoe = outfitItem(puppet, "greenRunway", "greenShoesLeft");
  const rightShoe = outfitItem(puppet, "greenRunway", "greenShoesRight");
  const bag = accessoryItem(puppet, "tinyBag");
  const sparkle = accessoryItem(puppet, "wristSparkle");

  assert(drawLayerForItem(leftArm, rightClip, puppet) < drawLayerForItem(rightArm, rightClip, puppet), "walk-right should keep the screen-right arm in front.");
  assert(drawLayerForItem(leftArm, leftClip, puppet) > drawLayerForItem(rightArm, leftClip, puppet), "walk-left should bring the screen-left arm in front.");
  assert(drawLayerForItem(bodyPart(puppet, "leftUpperArm"), leftClip, puppet) > drawLayerForItem(bodyPart(puppet, "leftUpperLeg"), leftClip, puppet), "walk-left front arm should sit over the front leg.");
  assert(drawLayerForItem(bodyPart(puppet, "leftUpperLeg"), leftClip, puppet) > bodyLayer(puppet, "torso"), "walk-left front leg should sit over the torso.");
  assert(bodyLayer(puppet, "torso") > drawLayerForItem(bodyPart(puppet, "rightUpperLeg"), leftClip, puppet), "walk-left back leg should sit behind the torso.");
  assert(drawLayerForItem(bodyPart(puppet, "rightUpperLeg"), leftClip, puppet) > drawLayerForItem(bodyPart(puppet, "rightUpperArm"), leftClip, puppet), "walk-left back leg should sit over the back arm.");
  assert(drawLayerForItem(leftShoe, leftClip, puppet) > drawLayerForItem(rightShoe, leftClip, puppet), "walk-left should bring the screen-left shoe in front.");
  assert(drawLayerForItem(bag, leftClip, puppet) > bodyLayer(puppet, "torso"), "walk-left should bring the screen-left wrist accessory in front.");
  assert(drawLayerForItem(sparkle, leftClip, puppet) < bodyLayer(puppet, "torso"), "walk-left should send the screen-right wrist accessory behind.");
});

test("JANICE walk directions start on readable opposite gait phases", () => {
  const puppet = JANICE_PUPPET;
  const leftClip = animatedClipAt(activeClip(puppet, "walk", { direction: "left" }), 0);
  const rightClip = animatedClipAt(activeClip(puppet, "walk", { direction: "right" }), 0);

  assert(leftClip.jointTurns.leftHip > rightClip.jointTurns.leftHip, "walk-left should immediately put the screen-left/front hip forward.");
  assert(leftClip.jointTurns.rightHip < rightClip.jointTurns.rightHip, "walk-left should immediately put the screen-right/back hip behind.");
  assert(leftClip.jointTurns.leftShoulder < rightClip.jointTurns.leftShoulder, "walk-left should immediately swing the screen-left/front shoulder back.");
  assert(leftClip.jointTurns.rightShoulder > rightClip.jointTurns.rightShoulder, "walk-left should immediately swing the screen-right/back shoulder forward.");
});

test("duplicate ids are rejected", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.skeleton.joints[1].id = puppet.skeleton.joints[0].id;
  assertInvalid(puppet, "Duplicate joint id");
});

test("bones cannot reference missing joints", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.skeleton.bones[0].to = "missingJoint";
  assertInvalid(puppet, "to must reference a joint");
});

test("body parts must reference real joints", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.bodyParts[0].joint = "lostJoint";
  assertInvalid(puppet, "joint must reference an existing joint");
});

test("outfit items must attach to outfit points", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.outfits[0].items[0].point = "eyes";
  assertInvalid(puppet, "point must reference an outfitPoint");
});

test("accessories may attach to body points or outfit points", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.accessories[0].point = "mouth";
  const result = validatePuppet(puppet);
  assert(result.valid, result.errors.join("; "));
});

test("clips cannot turn unknown joints", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.clips[0].jointTurns = { mysteryElbow: 20 };
  assertInvalid(puppet, "turns unknown joint");
});

test("visibility sets cannot reference missing body parts", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.visibilitySets.standing.show.push("invisibleCape");
  assertInvalid(puppet, "references unknown bodyPart");
});

test("root is required for puppet placement", () => {
  const puppet = clone(JANICE_PUPPET);
  delete puppet.root;
  assertInvalid(puppet, "root must be an object");
});

test("joint cycles are rejected", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.skeleton.joints.find((joint) => joint.id === "chest").parent = "neck";
  assertInvalid(puppet, "cycle");
});

test("disconnected joints are rejected", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.skeleton.joints.push({
    id: "lostJoint",
    parent: null,
    position: { x: 0, y: 0 }
  });
  assertInvalid(puppet, "exactly one parentless root joint");
});

test("circle shapes require a radius", () => {
  const puppet = clone(JANICE_PUPPET);
  delete puppet.bodyParts.find((part) => part.id === "face").shape.width;
  delete puppet.bodyParts.find((part) => part.id === "face").shape.height;
  puppet.bodyParts.find((part) => part.id === "face").shape = { kind: "circle", fill: "#fff" };
  assertInvalid(puppet, "radius must be a positive number");
});

test("clip joint turns must be numeric", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.clips[0].jointTurns = { neck: "tilt" };
  assertInvalid(puppet, "turn for neck must be a number");
});

test("clip hold turns must reference real joints", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.clips[0].holdTurns = { mysteryShoulder: -20 };
  assertInvalid(puppet, "hold turns unknown joint");
});

test("clip facing must be left or right", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.clips[0].facing = "sideways";
  assertInvalid(puppet, "facing must be left or right");
});

test("clip phase offset must be numeric", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.clips[0].phaseOffset = "quarter";
  assertInvalid(puppet, "phaseOffset must be a number");
});

test("clip bounce motion must be numeric", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.clips[0].bounceMotion = "bouncy";
  assertInvalid(puppet, "bounceMotion must be a number");
});

test("clip travel duration must be positive", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.clips[0].travelDurationMs = 0;
  assertInvalid(puppet, "travelDurationMs must be a positive number");
});

test("depth mirrored layer bands must be valid ranges", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.depth.mirroredLayerBands[0].far.from = 14;
  puppet.depth.mirroredLayerBands[0].far.to = 10;
  assertInvalid(puppet, "from must be less than or equal to to");
});

test("moves must reference existing clips", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.moves[0].clip = "lostClip";
  assertInvalid(puppet, "clip must reference an existing clip");
});

test("directional moves must reference existing clips", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.moves.find((move) => move.id === "walk").clips.left = "lostClip";
  assertInvalid(puppet, "clips.left must reference an existing clip");
});

test("directional moves must use known directions", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.moves.find((move) => move.id === "walk").clips.forward = "walkRightClip";
  assertInvalid(puppet, "clips direction must be left or right");
});

test("clips cannot override unknown attachment points", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.clips[0].pointPositions = { mysteryShoe: { x: 0, y: 0 } };
  assertInvalid(puppet, "pointPositions references unknown point");
});

test("visibility set variants must reference known part variants", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.visibilitySets.walking.variants.leftFoot = "moonBoot";
  assertInvalid(puppet, "unknown variant leftFoot.moonBoot");
});

test("clip end events need an emitted name", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.clips[0].events = [{ at: "middle", emit: "" }];
  assertInvalid(puppet, "event at must be start or end");
  assertInvalid(puppet, "event emit must be a non-empty string");
});

test("JANICE MVP catches missing walk moves", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.moves = puppet.moves.filter((move) => move.id !== "walk");
  const result = validatePuppet(puppet, { requireMvp: true });
  assert(!result.valid, "Expected missing walk to fail.");
  assert(result.errors.some((error) => error.includes("walk")), result.errors.join("; "));
});

test("world transforms compose parent-local joint rotation", () => {
  const puppet = clone(JANICE_PUPPET);
  const transforms = worldTransforms(puppet, {
    id: "test",
    jointTurns: {
      leftShoulder: 90
    }
  });
  const shoulder = transforms.get("leftShoulder");
  const elbow = transforms.get("leftElbow");

  assertClose(elbow.x, shoulder.x - 48, "elbow inherits shoulder rotation x");
  assertClose(elbow.y, shoulder.y, "elbow inherits shoulder rotation y");
});

test("looping clips animate joint turns over time", () => {
  const clip = {
    id: "testWalk",
    loops: true,
    phaseOffset: 0.25,
    rootMotion: { x: 10, y: 0 },
    travelMotion: { x: 40, y: 0 },
    travelDurationMs: 900,
    jointTurns: {
      leftHip: 20,
      rightHip: -20
    }
  };

  const quarter = animatedClipAt(clip, 225);
  const threeQuarter = animatedClipAt(clip, 675);
  const start = animatedClipAt(clip, 0);

  assertClose(start.jointTurns.leftHip, 20, "phase offset should start on a walking pose");
  assertClose(start.jointTurns.rightHip, -20, "phase offset should start with opposite hip");
  assertClose(quarter.jointTurns.leftHip, 0, "quarter leftHip");
  assertClose(quarter.jointTurns.rightHip, 0, "quarter rightHip");
  assertClose(threeQuarter.jointTurns.leftHip, 0, "three-quarter leftHip");
  assertClose(quarter.rootMotion.x, 50, "root x should include slow travel");
  assertClose(threeQuarter.rootMotion.x, -30, "root x should travel back across the stage");
});

test("looping clips pulse knees and elbows as one-way bends", () => {
  const clip = {
    id: "testWalkBends",
    loops: true,
    durationMs: 900,
    jointTurns: {
      leftKnee: -24,
      rightKnee: 24,
      leftElbow: 18,
      rightElbow: -18
    }
  };

  const quarter = animatedClipAt(clip, 225);
  const threeQuarter = animatedClipAt(clip, 675);

  assertClose(quarter.jointTurns.leftKnee, -6, "quarter far knee keeps a soft bend");
  assertClose(quarter.jointTurns.rightKnee, 24, "quarter near knee bends fully");
  assertClose(quarter.jointTurns.leftElbow, 18, "quarter far elbow bends fully");
  assertClose(quarter.jointTurns.rightElbow, -4.5, "quarter near elbow keeps a soft bend");
  assertClose(threeQuarter.jointTurns.leftKnee, -24, "three-quarter far knee bends fully");
  assertClose(threeQuarter.jointTurns.rightKnee, 6, "three-quarter near knee keeps a soft bend");
  assertClose(threeQuarter.jointTurns.leftElbow, 4.5, "three-quarter far elbow keeps a soft bend");
  assertClose(threeQuarter.jointTurns.rightElbow, -18, "three-quarter near elbow bends fully");
});

test("looping clips can hold a base pose while animating accent joints", () => {
  const clip = {
    id: "testWave",
    loops: true,
    durationMs: 800,
    holdTurns: {
      rightShoulder: -52,
      rightElbow: -26
    },
    jointTurns: {
      rightElbow: -10,
      rightWrist: 22
    }
  };

  const quarter = animatedClipAt(clip, 200);
  const threeQuarter = animatedClipAt(clip, 600);

  assertClose(quarter.jointTurns.rightShoulder, -52, "wave shoulder stays raised");
  assertClose(quarter.jointTurns.rightElbow, -28.5, "wave elbow starts from held bend");
  assertClose(quarter.jointTurns.rightWrist, 22, "wave wrist swings outward");
  assertClose(threeQuarter.jointTurns.rightShoulder, -52, "wave shoulder stays raised later");
  assertClose(threeQuarter.jointTurns.rightElbow, -36, "wave elbow pulses from held bend");
  assertClose(threeQuarter.jointTurns.rightWrist, -22, "wave wrist swings inward");
  assertClose(quarter.rootMotion.y, 0, "non-walk looping clips should not bounce by default");
});

test("non-looping clips are not animated", () => {
  const clip = {
    id: "pose",
    jointTurns: {
      leftHip: 20
    }
  };

  assert(animatedClipAt(clip, 225) === clip, "non-looping clips should be returned unchanged.");
});

test("root scale affects child joint positions and attached points", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.root.scale = 2;
  const transforms = worldTransforms(puppet, activeClip(puppet, puppet.moves[0].id));
  const hips = transforms.get("hips");
  const chest = transforms.get("chest");
  const parts = new Map(puppet.bodyParts.map((part) => [part.id, part]));
  const point = puppet.outfitPoints.find((item) => item.id === "belt");
  const torso = parts.get(point.part);
  const belt = attachedPointTransform(point, torso, transforms);

  assertClose(hips.y, 36, "root scale applies to root joint");
  assertClose(chest.y, -76, "root scale applies to child joint");
  assertClose(belt.y, -8, "root scale applies to attached point");
});

test("visibility sets hide and show body parts", () => {
  const puppet = clone(JANICE_PUPPET);
  puppet.visibilitySets.debugHideHands = {
    show: ["leftHand"],
    hide: ["leftHand", "rightHand"]
  };
  const visible = visiblePartIds(puppet, { visibilitySet: "debugHideHands" });

  assert(visible.has("leftHand"), "show should restore leftHand after hide.");
  assert(!visible.has("rightHand"), "hide should remove rightHand.");
});

test("clips select body part variants through visibility sets", () => {
  const puppet = clone(JANICE_PUPPET);
  const rightClip = activeClip(puppet, "walk", { direction: "right" });
  const leftClip = activeClip(puppet, "walk", { direction: "left" });
  const rightVariants = variantSelection(puppet, rightClip);
  const leftVariants = variantSelection(puppet, leftClip);
  const leftFoot = puppet.bodyParts.find((part) => part.id === "leftFoot");
  const rightFoot = puppet.bodyParts.find((part) => part.id === "rightFoot");

  assert(rightVariants.leftFoot === "right", "walk-right should select right-facing left foot.");
  assert(rightVariants.rightFoot === "right", "walk-right should select right-facing right foot.");
  assert(leftVariants.leftFoot === "left", "walk-left should select left-facing left foot.");
  assert(leftVariants.rightFoot === "left", "walk-left should select left-facing right foot.");
  assert(shapeForPart(leftFoot, rightVariants).d === rightFoot.variants.right.d, "both feet should point right together.");
  assert(shapeForPart(rightFoot, leftVariants).d === leftFoot.variants.left.d, "both feet should point left together.");
});

test("clips can move shoe anchors to the shared heel side", () => {
  const puppet = clone(JANICE_PUPPET);
  const leftClip = activeClip(puppet, "walk", { direction: "left" });
  const rightClip = activeClip(puppet, "walk", { direction: "right" });
  const leftShoe = puppet.outfitPoints.find((point) => point.id === "leftShoe");
  const rightShoe = puppet.outfitPoints.find((point) => point.id === "rightShoe");

  assertClose(pointForClip(leftShoe, rightClip).position.x, 17, "right-facing left shoe anchor");
  assertClose(pointForClip(rightShoe, rightClip).position.x, 17, "right-facing right shoe anchor");
  assertClose(pointForClip(leftShoe, leftClip).position.x, -17, "left-facing left shoe anchor");
  assertClose(pointForClip(rightShoe, leftClip).position.x, -17, "left-facing right shoe anchor");
});

export function runJaniceTests() {
  const results = [];

  for (const item of tests) {
    try {
      item.run();
      results.push({ name: item.name, passed: true });
    } catch (error) {
      results.push({ name: item.name, passed: false, message: error.message });
    }
  }

  return results;
}

function renderBrowserResults(results) {
  const summary = document.querySelector("[data-test-summary]");
  const list = document.querySelector("[data-test-results]");

  if (!summary || !list) return;

  const passed = results.filter((result) => result.passed).length;
  summary.textContent = `${passed} of ${results.length} tests passed.`;
  list.replaceChildren(
    ...results.map((result) => {
      const item = document.createElement("div");
      item.className = "check-item";
      item.dataset.status = result.passed ? "pass" : "fail";

      const dot = document.createElement("span");
      dot.className = "check-dot";
      dot.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.textContent = result.passed ? result.name : `${result.name}: ${result.message}`;

      item.append(dot, text);
      return item;
    })
  );
}

const results = runJaniceTests();
if (typeof document !== "undefined") {
  renderBrowserResults(results);
}

if (typeof process !== "undefined" && process.argv[1]?.endsWith("janice-validator.test.js")) {
  const failed = results.filter((result) => !result.passed);

  for (const result of results) {
    const prefix = result.passed ? "PASS" : "FAIL";
    console.log(`${prefix} ${result.name}${result.message ? `: ${result.message}` : ""}`);
  }

  if (failed.length) {
    process.exitCode = 1;
  }
}
