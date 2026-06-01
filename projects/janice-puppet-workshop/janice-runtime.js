export function activeClip(puppet, moveId, options = {}) {
  const move = puppet.moves.find((item) => item.id === moveId) ?? puppet.moves[0];
  const clipId = move?.clips?.[options.direction ?? move.defaultDirection] ?? move?.clip;
  const clip = puppet.clips.find((item) => item.id === clipId);

  return clip ?? move;
}

export function animatedClipAt(clip, elapsedMs = 0) {
  if (!clip?.loops) return clip;

  const durationMs = clip.durationMs ?? 900;
  const phasedElapsedMs = elapsedMs + (clip.phaseOffset ?? 0) * durationMs;
  const cycle = ((phasedElapsedMs % durationMs) + durationMs) % durationMs / durationMs;
  const swing = Math.sin(cycle * Math.PI * 2);
  const bounce = Math.sin(cycle * Math.PI * 4);
  const bounceAmount = clip.bounceMotion ?? (clip.kind === "walk" ? 3 : 0);
  const rootMotion = clip.rootMotion ?? { x: 0, y: 0 };
  const travelMotion = clip.travelMotion ?? { x: 0, y: 0 };
  const travelDurationMs = clip.travelDurationMs ?? 5200;
  const travelCycle = ((elapsedMs % travelDurationMs) + travelDurationMs) % travelDurationMs / travelDurationMs;
  const travelSwing = Math.sin(travelCycle * Math.PI * 2);
  const travelDirection = clip.intent === "left" ? -1 : 1;
  const jointTurns = { ...(clip.holdTurns ?? {}) };

  for (const [jointId, turn] of Object.entries(clip.jointTurns ?? {})) {
    if (isBendJoint(jointId)) {
      const bendPulse = turn >= 0 ? Math.max(0, swing) : Math.max(0, -swing);
      jointTurns[jointId] = (jointTurns[jointId] ?? 0) + turn * (0.25 + bendPulse * 0.75);
    } else {
      jointTurns[jointId] = (jointTurns[jointId] ?? 0) + turn * swing;
    }
  }

  return {
    ...clip,
    rootMotion: {
      x: rootMotion.x + travelMotion.x * travelSwing * travelDirection,
      y: rootMotion.y + travelMotion.y * travelSwing + bounce * bounceAmount
    },
    jointTurns
  };
}

function isBendJoint(jointId) {
  return /(?:Knee|Elbow)$/.test(jointId);
}

export function worldTransforms(puppet, clip) {
  const joints = new Map(puppet.skeleton.joints.map((joint) => [joint.id, joint]));
  const children = new Map();
  const transforms = new Map();
  const root = puppet.root ?? {};
  const rootMotion = clip?.rootMotion ?? { x: 0, y: 0 };

  for (const joint of puppet.skeleton.joints) {
    if (!children.has(joint.parent)) children.set(joint.parent, []);
    children.get(joint.parent).push(joint);
  }

  function visit(joint, parentTransform) {
    const localTurn = (clip?.holdTurns?.[joint.id] ?? 0) + (clip?.jointTurns?.[joint.id] ?? 0);
    const scaledPosition = scalePoint(joint.position, parentTransform.scale);
    const rotated = rotatePoint(scaledPosition, parentTransform.rotation);
    const transform = {
      x: parentTransform.x + rotated.x,
      y: parentTransform.y + rotated.y,
      rotation: parentTransform.rotation + localTurn,
      scale: parentTransform.scale
    };

    transforms.set(joint.id, transform);

    for (const child of children.get(joint.id) ?? []) {
      visit(child, transform);
    }
  }

  visit(joints.get(puppet.skeleton.rootJoint), {
    x: (root.position?.x ?? 0) + rootMotion.x,
    y: (root.position?.y ?? 0) + rootMotion.y,
    rotation: root.rotation ?? 0,
    scale: root.scale ?? 1
  });

  return transforms;
}

export function visiblePartIds(puppet, clip) {
  const ids = new Set(puppet.bodyParts.map((part) => part.id));
  const set = puppet.visibilitySets?.[clip?.visibilitySet];

  if (!set) return ids;

  for (const partId of set.hide ?? []) {
    ids.delete(partId);
  }

  for (const partId of set.show ?? []) {
    ids.add(partId);
  }

  return ids;
}

export function variantSelection(puppet, clip) {
  return {
    ...(puppet.visibilitySets?.[clip?.visibilitySet]?.variants ?? {}),
    ...(clip?.variants ?? {})
  };
}

export function pointForClip(point, clip) {
  return {
    ...point,
    position: clip?.pointPositions?.[point.id] ?? point.position
  };
}

export function shapeForPart(part, variants = {}) {
  const variantId = variants[part.id];

  if (!variantId) return part.shape;

  return part.variants?.[variantId] ?? part.shape;
}

export function drawLayerForItem(item, clip, puppet) {
  if (!shouldMirrorDepth(clip, puppet) || !sideFromItem(item)) {
    return item.layer;
  }

  return mirroredLayer(item.layer, puppet.depth?.mirroredLayerBands) ?? item.layer;
}

export function attachedPointTransform(point, part, transforms) {
  const transform = transforms.get(part.joint);
  const scaledPoint = scalePoint(point.position, transform.scale);
  const rotatedPoint = rotatePoint(scaledPoint, transform.rotation);

  return {
    x: transform.x + rotatedPoint.x,
    y: transform.y + rotatedPoint.y,
    rotation: transform.rotation,
    scale: transform.scale
  };
}

export function rotatePoint(point, degrees) {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  };
}

export function scalePoint(point, scale) {
  return {
    x: point.x * scale,
    y: point.y * scale
  };
}

function shouldMirrorDepth(clip, puppet) {
  const defaultFacing = puppet.depth?.defaultFacing ?? "right";
  const facing = clip?.facing ?? (["left", "right"].includes(clip?.intent) ? clip.intent : defaultFacing);

  return ["left", "right"].includes(facing) && facing !== defaultFacing;
}

function sideFromItem(item) {
  const sideTexts = [item.id, item.point].filter(Boolean);
  if (sideTexts.some((text) => /^left[A-Z]/.test(text) || /Left/.test(text))) return "left";
  if (sideTexts.some((text) => /^right[A-Z]/.test(text) || /Right/.test(text))) return "right";
  return null;
}

function mirroredLayer(layer, bands = []) {
  for (const band of bands) {
    const far = band.far;
    const near = band.near;
    if (!far || !near) continue;

    if (layer >= far.from && layer <= far.to) {
      return near.from + (layer - far.from);
    }

    if (layer >= near.from && layer <= near.to) {
      return far.from + (layer - near.from);
    }
  }

  return null;
}
