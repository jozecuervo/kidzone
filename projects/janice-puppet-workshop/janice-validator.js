import { JANICE_SCHEMA, JANICE_MVP_RULES } from "./janice-schema.js";

const idPattern = /^[a-z][a-zA-Z0-9]*$/;

export function validatePuppet(puppet, options = {}) {
  const errors = [];
  const warnings = [];
  const requireMvp = options.requireMvp === true;

  function fail(message) {
    errors.push(message);
  }

  function warn(message) {
    warnings.push(message);
  }

  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function arrayField(owner, field, label = field) {
    if (!Array.isArray(owner?.[field])) {
      fail(`${label} must be an array.`);
      return [];
    }
    return owner[field];
  }

  if (!object(puppet)) {
    return {
      valid: false,
      errors: ["Puppet must be an object."],
      warnings
    };
  }

  for (const field of JANICE_SCHEMA.requiredTopLevelFields) {
    if (puppet[field] === undefined) {
      fail(`Missing required field: ${field}.`);
    }
  }

  if (puppet.schema !== JANICE_SCHEMA.schema) {
    fail(`schema must be "${JANICE_SCHEMA.schema}".`);
  }

  if (typeof puppet.schemaVersion !== "string" || !puppet.schemaVersion) {
    fail("schemaVersion must be a non-empty string.");
  }

  if (!idPattern.test(puppet.puppetId ?? "")) {
    fail("puppetId must be camelCase and start with a lowercase letter.");
  }

  for (const field of ["name", "summary", "favoriteColor"]) {
    if (typeof puppet[field] !== "string" || !puppet[field].trim()) {
      fail(`${field} must be a non-empty string.`);
    }
  }

  const skeleton = object(puppet.skeleton) ? puppet.skeleton : {};
  if (!object(puppet.skeleton)) {
    fail("skeleton must be an object.");
  }

  if (!object(puppet.root)) {
    fail("root must be an object.");
  } else {
    validatePoint(puppet.root.position, "root.position", fail);
    if (puppet.root.rotation !== undefined && !Number.isFinite(puppet.root.rotation)) {
      fail("root.rotation must be a number when provided.");
    }
    if (puppet.root.scale !== undefined && (!Number.isFinite(puppet.root.scale) || puppet.root.scale <= 0)) {
      fail("root.scale must be a positive number when provided.");
    }
  }

  validateDepth(puppet.depth, fail);

  const joints = arrayField(skeleton, "joints", "skeleton.joints");
  const bones = arrayField(skeleton, "bones", "skeleton.bones");
  const bodyParts = arrayField(puppet, "bodyParts");
  const bodyPoints = arrayField(puppet, "bodyPoints");
  const outfitPoints = arrayField(puppet, "outfitPoints");
  const outfits = arrayField(puppet, "outfits");
  const accessories = arrayField(puppet, "accessories");
  const clips = arrayField(puppet, "clips");
  const moves = arrayField(puppet, "moves");

  const jointIds = collectIds(joints, "joint", fail);
  const boneIds = collectIds(bones, "bone", fail);
  const partIds = collectIds(bodyParts, "bodyPart", fail);
  const bodyPointIds = collectIds(bodyPoints, "bodyPoint", fail);
  const outfitPointIds = collectIds(outfitPoints, "outfitPoint", fail);
  const outfitIds = collectIds(outfits, "outfit", fail);
  const accessoryIds = collectIds(accessories, "accessory", fail);
  const clipIds = collectIds(clips, "clip", fail);
  const moveIds = collectIds(moves, "move", fail);

  if (!jointIds.has(skeleton.rootJoint)) {
    fail("skeleton.rootJoint must reference an existing joint.");
  }

  let parentlessJointCount = 0;
  for (const joint of joints) {
    validatePoint(joint.position, `joint ${joint.id} position`, fail);
    if (joint.parent === null) {
      parentlessJointCount += 1;
    } else if (joint.parent === joint.id) {
      fail(`joint ${joint.id} cannot parent itself.`);
    } else if (joint.parent !== undefined && !jointIds.has(joint.parent)) {
      fail(`joint ${joint.id} parent must reference an existing joint or null.`);
    }
  }

  if (parentlessJointCount !== 1) {
    fail("skeleton must have exactly one parentless root joint.");
  }

  if (jointIds.size > 0 && jointIds.has(skeleton.rootJoint)) {
    validateJointTree(skeleton.rootJoint, joints, jointIds, fail);
  }

  for (const bone of bones) {
    if (!jointIds.has(bone.from)) fail(`bone ${bone.id} from must reference a joint.`);
    if (!jointIds.has(bone.to)) fail(`bone ${bone.id} to must reference a joint.`);
    if (bone.from === bone.to) fail(`bone ${bone.id} cannot connect a joint to itself.`);
  }

  for (const part of bodyParts) {
    if (!JANICE_SCHEMA.allowed.bodyPartKinds.includes(part.kind)) {
      fail(`bodyPart ${part.id} has unknown kind "${part.kind}".`);
    }
    if (!jointIds.has(part.joint)) {
      fail(`bodyPart ${part.id} joint must reference an existing joint.`);
    }
    if (!Number.isFinite(part.layer)) {
      fail(`bodyPart ${part.id} layer must be a number.`);
    }
    validateShape(part.shape, `bodyPart ${part.id} shape`, fail);
    if (part.variants !== undefined) {
      if (!object(part.variants)) {
        fail(`bodyPart ${part.id} variants must be an object.`);
      } else {
        for (const [variantId, shape] of Object.entries(part.variants)) {
          if (!idPattern.test(variantId)) {
            fail(`bodyPart ${part.id} variant id must be camelCase.`);
          }
          validateShape(shape, `bodyPart ${part.id} variant ${variantId}`, fail);
        }
      }
    }
  }

  for (const point of [...bodyPoints, ...outfitPoints]) {
    const label = `${point.kind ?? "point"} ${point.id}`;
    if (!partIds.has(point.part)) fail(`${label} part must reference a bodyPart.`);
    validatePoint(point.position, `${label} position`, fail);
  }

  for (const outfit of outfits) {
    if (!Array.isArray(outfit.items) || outfit.items.length === 0) {
      fail(`outfit ${outfit.id} must include at least one item.`);
      continue;
    }
    for (const item of outfit.items) {
      if (!outfitPointIds.has(item.point)) {
        fail(`outfit ${outfit.id} item ${item.id} point must reference an outfitPoint.`);
      }
      validateShape(item.shape, `outfit ${outfit.id} item ${item.id} shape`, fail);
    }
  }

  for (const accessory of accessories) {
    if (!outfitPointIds.has(accessory.point) && !bodyPointIds.has(accessory.point)) {
      fail(`accessory ${accessory.id} point must reference a bodyPoint or outfitPoint.`);
    }
    validateShape(accessory.shape, `accessory ${accessory.id} shape`, fail);
  }

  if (!object(puppet.visibilitySets)) {
    fail("visibilitySets must be an object.");
  } else {
    for (const [setId, set] of Object.entries(puppet.visibilitySets)) {
      const show = Array.isArray(set.show) ? set.show : [];
      const hide = Array.isArray(set.hide) ? set.hide : [];
      for (const partId of [...show, ...hide]) {
        if (!partIds.has(partId)) {
          fail(`visibilitySet ${setId} references unknown bodyPart ${partId}.`);
        }
      }
      validateVariantReferences(set.variants, `visibilitySet ${setId}`, bodyParts, partIds, fail);
    }
  }

  const pointIds = new Set([...bodyPointIds, ...outfitPointIds]);

  for (const clip of clips) {
    validateClip(clip, puppet, jointIds, pointIds, bodyParts, partIds, fail);
  }

  for (const move of moves) {
    if (typeof move.name !== "string" || !move.name.trim()) {
      fail(`move ${move.id} must have a non-empty name.`);
    }
    if (move.defaultDirection !== undefined && !["left", "right"].includes(move.defaultDirection)) {
      fail(`move ${move.id} defaultDirection must be left or right.`);
    }
    if (move.clips !== undefined) {
      validateDirectionalMoveClips(move, clipIds, fail);
    } else if (!clipIds.has(move.clip)) {
      fail(`move ${move.id} clip must reference an existing clip.`);
    }
  }

  if (bodyParts.length && !bodyParts.some((part) => part.kind === "torso" || part.kind === "body")) {
    warn("Puppet has no torso/body part; that may be intentional for unusual characters.");
  }

  if (boneIds.size === 0) {
    warn("Puppet has no bones, so skeleton debug view will be sparse.");
  }

  if (requireMvp && puppet.puppetId === JANICE_MVP_RULES.mainPuppetId) {
    validateJaniceMvp(puppet, { outfitIds, accessoryIds, moveIds, outfitPointIds, moves, clips }, fail);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function validateDirectionalMoveClips(move, clipIds, fail) {
  if (!move.clips || typeof move.clips !== "object" || Array.isArray(move.clips)) {
    fail(`move ${move.id} clips must be an object.`);
    return;
  }

  for (const direction of Object.keys(move.clips)) {
    if (!["left", "right"].includes(direction)) {
      fail(`move ${move.id} clips direction must be left or right.`);
    } else if (!clipIds.has(move.clips[direction])) {
      fail(`move ${move.id} clips.${direction} must reference an existing clip.`);
    }
  }
}

function validateClip(clip, puppet, jointIds, pointIds, bodyParts, partIds, fail) {
  if (!JANICE_SCHEMA.allowed.moveKinds.includes(clip.kind)) {
    fail(`clip ${clip.id} has unknown kind "${clip.kind}".`);
  }
  if (clip.visibilitySet && !puppet.visibilitySets?.[clip.visibilitySet]) {
    fail(`clip ${clip.id} visibilitySet must reference an existing set.`);
  }
  if (clip.intent !== undefined && !["left", "right", "up", "down", "select"].includes(clip.intent)) {
    fail(`clip ${clip.id} intent is not supported.`);
  }
  if (clip.facing !== undefined && !["left", "right"].includes(clip.facing)) {
    fail(`clip ${clip.id} facing must be left or right.`);
  }
  if (clip.phaseOffset !== undefined && !Number.isFinite(clip.phaseOffset)) {
    fail(`clip ${clip.id} phaseOffset must be a number.`);
  }
  if (clip.bounceMotion !== undefined && !Number.isFinite(clip.bounceMotion)) {
    fail(`clip ${clip.id} bounceMotion must be a number.`);
  }
  if (clip.rootMotion !== undefined) {
    validatePoint(clip.rootMotion, `clip ${clip.id} rootMotion`, fail);
  }
  if (clip.travelMotion !== undefined) {
    validatePoint(clip.travelMotion, `clip ${clip.id} travelMotion`, fail);
  }
  if (clip.travelDurationMs !== undefined && (!Number.isFinite(clip.travelDurationMs) || clip.travelDurationMs <= 0)) {
    fail(`clip ${clip.id} travelDurationMs must be a positive number.`);
  }
  if (clip.pointPositions !== undefined) {
    validateClipPointPositions(clip, pointIds, fail);
  }
  if (clip.jointTurns && typeof clip.jointTurns === "object" && !Array.isArray(clip.jointTurns)) {
    validateJointTurns(clip.jointTurns, `clip ${clip.id}`, jointIds, fail);
  }
  if (clip.holdTurns && typeof clip.holdTurns === "object" && !Array.isArray(clip.holdTurns)) {
    validateJointTurns(clip.holdTurns, `clip ${clip.id} hold`, jointIds, fail);
  }
  validateVariantReferences(clip.variants, `clip ${clip.id}`, bodyParts, partIds, fail);

  if (clip.events !== undefined) {
    if (!Array.isArray(clip.events)) {
      fail(`clip ${clip.id} events must be an array.`);
    } else {
      for (const event of clip.events) {
        if (!["start", "end"].includes(event.at)) {
          fail(`clip ${clip.id} event at must be start or end.`);
        }
        if (typeof event.emit !== "string" || !event.emit.trim()) {
          fail(`clip ${clip.id} event emit must be a non-empty string.`);
        }
      }
    }
  }
}

function validateClipPointPositions(clip, pointIds, fail) {
  if (!clip.pointPositions || typeof clip.pointPositions !== "object" || Array.isArray(clip.pointPositions)) {
    fail(`clip ${clip.id} pointPositions must be an object.`);
    return;
  }

  for (const [pointId, position] of Object.entries(clip.pointPositions)) {
    if (!pointIds.has(pointId)) {
      fail(`clip ${clip.id} pointPositions references unknown point ${pointId}.`);
    }
    validatePoint(position, `clip ${clip.id} pointPositions.${pointId}`, fail);
  }
}

function validateJointTurns(turns, label, jointIds, fail) {
  for (const jointId of Object.keys(turns)) {
    if (!jointIds.has(jointId)) {
      fail(`${label} turns unknown joint ${jointId}.`);
    } else if (!Number.isFinite(turns[jointId])) {
      fail(`${label} turn for ${jointId} must be a number.`);
    }
  }
}

function validateDepth(depth, fail) {
  if (depth === undefined) return;

  if (!depth || typeof depth !== "object" || Array.isArray(depth)) {
    fail("depth must be an object when provided.");
    return;
  }

  if (!["left", "right"].includes(depth.defaultFacing)) {
    fail("depth.defaultFacing must be left or right.");
  }

  if (depth.mirroredLayerBands !== undefined) {
    if (!Array.isArray(depth.mirroredLayerBands)) {
      fail("depth.mirroredLayerBands must be an array.");
      return;
    }

    for (const [index, band] of depth.mirroredLayerBands.entries()) {
      validateLayerRange(band?.far, `depth.mirroredLayerBands[${index}].far`, fail);
      validateLayerRange(band?.near, `depth.mirroredLayerBands[${index}].near`, fail);
    }
  }
}

function validateLayerRange(range, label, fail) {
  if (!range || typeof range !== "object" || Array.isArray(range)) {
    fail(`${label} must be an object.`);
    return;
  }

  if (!Number.isFinite(range.from) || !Number.isFinite(range.to)) {
    fail(`${label} from and to must be numbers.`);
  } else if (range.from > range.to) {
    fail(`${label} from must be less than or equal to to.`);
  }
}

function validateVariantReferences(variants, label, bodyParts, partIds, fail) {
  if (variants === undefined) return;

  if (!variants || typeof variants !== "object" || Array.isArray(variants)) {
    fail(`${label} variants must be an object.`);
    return;
  }

  const bodyPartById = new Map(bodyParts.map((part) => [part.id, part]));

  for (const [partId, variantId] of Object.entries(variants)) {
    if (!partIds.has(partId)) {
      fail(`${label} variants references unknown bodyPart ${partId}.`);
      continue;
    }
    if (!bodyPartById.get(partId).variants?.[variantId]) {
      fail(`${label} variants references unknown variant ${partId}.${variantId}.`);
    }
  }
}

export function validatePuppetSet(puppets) {
  const errors = [];
  const warnings = [];
  const ids = new Set();

  if (!Array.isArray(puppets)) {
    return {
      valid: false,
      errors: ["Puppet set must be an array."],
      warnings
    };
  }

  if (puppets.length < JANICE_MVP_RULES.minPuppets) {
    errors.push(`MVP needs at least ${JANICE_MVP_RULES.minPuppets} puppets.`);
  }

  for (const puppet of puppets) {
    if (ids.has(puppet.puppetId)) {
      errors.push(`Duplicate puppetId: ${puppet.puppetId}.`);
    }
    ids.add(puppet.puppetId);

    const result = validatePuppet(puppet, { requireMvp: true });
    for (const error of result.errors) errors.push(`${puppet.puppetId}: ${error}`);
    for (const warning of result.warnings) warnings.push(`${puppet.puppetId}: ${warning}`);
  }

  if (!ids.has(JANICE_MVP_RULES.mainPuppetId)) {
    errors.push(`MVP must include main puppet "${JANICE_MVP_RULES.mainPuppetId}".`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

function collectIds(items, label, fail) {
  const ids = new Set();

  for (const item of items) {
    if (!idPattern.test(item?.id ?? "")) {
      fail(`${label} id must be camelCase and start with a lowercase letter.`);
      continue;
    }
    if (ids.has(item.id)) {
      fail(`Duplicate ${label} id: ${item.id}.`);
    }
    ids.add(item.id);
  }

  return ids;
}

function validatePoint(point, label, fail) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    fail(`${label} must have numeric x and y.`);
  }
}

function validateShape(shape, label, fail) {
  if (!shape || !JANICE_SCHEMA.allowed.shapeKinds.includes(shape.kind)) {
    fail(`${label} must use a known shape kind.`);
    return;
  }

  if (shape.kind === "path") {
    if (typeof shape.d !== "string" || !shape.d.trim()) {
      fail(`${label} path needs a d value.`);
    }
    return;
  }

  if (shape.kind === "polygon") {
    if (!Array.isArray(shape.points) || shape.points.length < 3) {
      fail(`${label} polygon needs at least three points.`);
      return;
    }
    for (const [index, point] of shape.points.entries()) {
      validatePoint(point, `${label} polygon point ${index}`, fail);
    }
    return;
  }

  if (["ellipse", "rect", "capsule"].includes(shape.kind)) {
    for (const field of ["width", "height"]) {
      if (!Number.isFinite(shape[field]) || shape[field] <= 0) {
        fail(`${label} ${field} must be a positive number.`);
      }
    }
  }

  if (shape.kind === "circle" && (!Number.isFinite(shape.radius) || shape.radius <= 0)) {
    fail(`${label} radius must be a positive number.`);
  }
}

function validateJointTree(rootJoint, joints, jointIds, fail) {
  const children = new Map();

  for (const joint of joints) {
    if (!children.has(joint.parent)) children.set(joint.parent, []);
    children.get(joint.parent).push(joint);
  }

  const visiting = new Set();
  const visited = new Set();

  function visit(jointId) {
    if (visiting.has(jointId)) {
      fail(`joint tree has a cycle at ${jointId}.`);
      return;
    }
    if (visited.has(jointId)) return;

    visiting.add(jointId);
    for (const child of children.get(jointId) ?? []) {
      visit(child.id);
    }
    visiting.delete(jointId);
    visited.add(jointId);
  }

  visit(rootJoint);

  for (const jointId of jointIds) {
    visit(jointId);
  }

  for (const jointId of jointIds) {
    if (!visited.has(jointId)) {
      fail(`joint ${jointId} is not reachable from skeleton.rootJoint.`);
    }
  }
}

function validateJaniceMvp(puppet, refs, fail) {
  const needs = JANICE_MVP_RULES.mainPuppetNeeds;

  if (refs.outfitIds.size < needs.outfitCount) {
    fail(`JANICE needs at least ${needs.outfitCount} outfits.`);
  }

  if (refs.accessoryIds.size < needs.accessoryCount) {
    fail(`JANICE needs at least ${needs.accessoryCount} accessories.`);
  }

  for (const moveId of needs.moveIds) {
    if (!refs.moveIds.has(moveId)) {
      fail(`JANICE needs move ${moveId}.`);
    }
  }

  const poseCount = refs.clips.filter((clip) => clip.kind === "pose").length;
  if (poseCount < needs.poseCount) {
    fail(`JANICE needs at least ${needs.poseCount} fashion poses.`);
  }

  for (const pointId of needs.requiredOutfitPoints) {
    if (!refs.outfitPointIds.has(pointId)) {
      fail(`JANICE needs outfitPoint ${pointId}.`);
    }
  }
}
