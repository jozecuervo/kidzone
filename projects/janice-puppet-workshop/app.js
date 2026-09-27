import { PUPPETS } from "./puppets/index.js";
import { validatePuppetSet } from "./janice-validator.js";
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
} from "./janice-runtime.js";

const stage = document.querySelector("[data-stage]");
const puppetName = document.querySelector("[data-puppet-name]");
const puppetSummary = document.querySelector("[data-puppet-summary]");
const puppetButtons = document.querySelector("[data-puppet-buttons]");
const outfitButtons = document.querySelector("[data-outfit-buttons]");
const accessoryButtons = document.querySelector("[data-accessory-buttons]");
const moveButtons = document.querySelector("[data-move-buttons]");
const checks = document.querySelector("[data-checks]");
const showSkeleton = document.querySelector("[data-show-skeleton]");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

const state = {
  puppet: PUPPETS[0],
  outfitId: null,
  accessoryIds: new Set(),
  moveId: "chill",
  walkDirection: "right",
  animationStartedAt: performance.now()
};

let animationFrameId = null;

function el(name, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);

  for (const [key, value] of Object.entries(attributes)) {
    if (value !== undefined && value !== null) {
      node.setAttribute(key, String(value));
    }
  }

  return node;
}

function htmlButton(label, pressed, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-pressed", String(pressed));
  button.addEventListener("click", onClick);
  return button;
}

function renderControls() {
  puppetButtons.replaceChildren(
    ...PUPPETS.map((puppet) =>
      htmlButton(puppet.name, puppet.puppetId === state.puppet.puppetId, () => {
        state.puppet = puppet;
        state.outfitId = null;
        state.accessoryIds = new Set();
        state.moveId = puppet.moves[0]?.id ?? null;
        state.walkDirection = "right";
        restartAnimation();
        render();
      })
    )
  );

  outfitButtons.replaceChildren(
    htmlButton("Body Only", state.outfitId === null, () => {
      state.outfitId = null;
      render();
    }),
    ...state.puppet.outfits.map((outfit) =>
      htmlButton(outfit.name, outfit.id === state.outfitId, () => {
        state.outfitId = outfit.id;
        render();
      })
    )
  );

  accessoryButtons.replaceChildren(
    ...state.puppet.accessories.map((accessory) =>
      htmlButton(accessory.name, state.accessoryIds.has(accessory.id), () => {
        if (state.accessoryIds.has(accessory.id)) {
          state.accessoryIds.delete(accessory.id);
        } else {
          state.accessoryIds.add(accessory.id);
        }
        render();
      })
    )
  );

  moveButtons.replaceChildren(
    ...state.puppet.moves.map((move) =>
      htmlButton(move.name, move.id === state.moveId, () => {
        selectMove(move);
        restartAnimation();
        render();
      })
    )
  );
}

function renderChecks() {
  const result = validatePuppetSet(PUPPETS);
  const items = result.valid
    ? ["JANICE schema fixtures pass.", ...result.warnings]
    : result.errors;

  checks.replaceChildren(
    ...items.map((message) => {
      const item = document.createElement("div");
      item.className = "check-item";
      item.dataset.status = result.valid ? "pass" : "fail";

      const dot = document.createElement("span");
      dot.className = "check-dot";
      dot.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.textContent = message;

      item.append(dot, text);
      return item;
    })
  );
}

function render(options = {}) {
  const shouldRenderControls = options.controls !== false;
  const shouldRenderChecks = options.checks !== false;

  if (shouldRenderControls) renderControls();
  if (shouldRenderChecks) renderChecks();

  const puppet = state.puppet;
  const baseClip = activeClip(puppet, state.moveId, { direction: state.walkDirection });
  const elapsedMs = performance.now() - state.animationStartedAt;
  const clip = reduceMotion.matches ? baseClip : animatedClipAt(baseClip, elapsedMs);
  const transforms = worldTransforms(puppet, clip);
  const parts = new Map(puppet.bodyParts.map((part) => [part.id, part]));
  const allPoints = [...puppet.bodyPoints, ...puppet.outfitPoints].map((point) => pointForClip(point, clip));
  const pointMap = new Map(allPoints.map((point) => [point.id, point]));
  const visibleParts = visiblePartIds(puppet, clip);
  const variants = variantSelection(puppet, clip);

  puppetName.textContent = puppet.name;
  puppetSummary.textContent = puppet.summary;
  stage.replaceChildren();

  const drawnItems = [
    ...puppet.bodyParts
      .filter((part) => visibleParts.has(part.id))
      .map((part) => ({ type: "part", layer: drawLayerForItem(part, clip, puppet), value: part })),
    ...selectedOutfitItems(puppet).map((item) => ({ type: "outfit", layer: drawLayerForItem(item, clip, puppet), value: item })),
    ...puppet.accessories
      .filter((accessory) => state.accessoryIds.has(accessory.id))
      .map((accessory) => ({ type: "accessory", layer: drawLayerForItem(accessory, clip, puppet), value: accessory }))
  ].sort((first, second) => first.layer - second.layer);

  for (const item of drawnItems) {
    if (item.type === "part") {
      drawBodyPart(item.value, transforms, variants);
    } else {
      drawAttachedItem(item.value, pointMap, parts, transforms, item.type);
    }
  }

  if (showSkeleton.checked) {
    drawSkeleton(puppet, transforms, visibleParts, clip);
  }

  syncAnimationLoop(baseClip);
}

function selectedOutfitItems(puppet) {
  const outfit = puppet.outfits.find((item) => item.id === state.outfitId);
  return outfit?.items ?? [];
}

function drawBodyPart(part, transforms, variants) {
  const transform = transforms.get(part.joint);
  const group = el("g", {
    transform: `translate(${transform.x} ${transform.y}) rotate(${transform.rotation}) scale(${transform.scale})`
  });
  const shape = drawShape(shapeForPart(part, variants), "body-part");

  group.append(shape);
  stage.append(group);
}

function drawAttachedItem(item, pointMap, parts, transforms, className) {
  const point = pointMap.get(item.point);
  const part = parts.get(point.part);
  const transform = attachedPointTransform(point, part, transforms);
  const group = el("g", {
    transform: `translate(${transform.x} ${transform.y}) rotate(${transform.rotation}) scale(${transform.scale})`
  });

  group.append(drawShape(item.shape, className));
  stage.append(group);
}

function drawShape(shape, className) {
  const offset = shape.offset ?? { x: 0, y: 0 };
  const attrs = {
    class: className,
    fill: shape.fill ?? "transparent",
    stroke: shape.stroke
  };

  if (shape.kind === "circle") {
    return el("circle", {
      ...attrs,
      cx: offset.x ?? 0,
      cy: offset.y ?? 0,
      r: shape.radius
    });
  }

  if (shape.kind === "ellipse") {
    return el("ellipse", {
      ...attrs,
      cx: offset.x ?? 0,
      cy: offset.y ?? 0,
      rx: shape.width / 2,
      ry: shape.height / 2
    });
  }

  if (shape.kind === "rect") {
    return el("rect", {
      ...attrs,
      x: (offset.x ?? 0) - shape.width / 2,
      y: (offset.y ?? 0) - shape.height / 2,
      width: shape.width,
      height: shape.height
    });
  }

  if (shape.kind === "capsule") {
    return el("rect", {
      ...attrs,
      x: (offset.x ?? 0) - shape.width / 2,
      y: (offset.y ?? 0) - shape.height / 2,
      width: shape.width,
      height: shape.height,
      rx: shape.width / 2
    });
  }

  if (shape.kind === "polygon") {
    return el("polygon", {
      ...attrs,
      points: shape.points.map((point) => `${point.x},${point.y}`).join(" ")
    });
  }

  return el("path", {
    ...attrs,
    d: shape.d
  });
}

function drawSkeleton(puppet, transforms, visibleParts, clip) {
  const skeleton = el("g", { "aria-hidden": "true" });

  for (const bone of puppet.skeleton.bones) {
    const from = transforms.get(bone.from);
    const to = transforms.get(bone.to);
    skeleton.append(el("line", {
      class: "skeleton-line",
      x1: from.x,
      y1: from.y,
      x2: to.x,
      y2: to.y
    }));
  }

  for (const joint of puppet.skeleton.joints) {
    const transform = transforms.get(joint.id);
    skeleton.append(el("circle", {
      class: "joint-dot",
      cx: transform.x,
      cy: transform.y,
      r: 4.5
    }));
  }

  for (const sourcePoint of [...puppet.bodyPoints, ...puppet.outfitPoints]) {
    const point = pointForClip(sourcePoint, clip);
    const part = puppet.bodyParts.find((item) => item.id === point.part);
    if (!visibleParts.has(part.id)) continue;
    const transform = attachedPointTransform(point, part, transforms);
    skeleton.append(el("circle", {
      class: "point-dot",
      cx: transform.x,
      cy: transform.y,
      r: 3.5
    }));
  }

  stage.append(skeleton);
}

showSkeleton.addEventListener("change", render);

reduceMotion.addEventListener("change", () => {
  restartAnimation();
  render();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    state.walkDirection = "left";
    state.moveId = moveForIntent(state.puppet, "left")?.id ?? state.moveId;
    restartAnimation();
    render();
  }

  if (event.key === "ArrowRight") {
    state.walkDirection = "right";
    state.moveId = moveForIntent(state.puppet, "right")?.id ?? state.moveId;
    restartAnimation();
    render();
  }
});

function selectMove(move) {
  if (move.clips?.left && move.clips?.right) {
    state.walkDirection = state.moveId === move.id && state.walkDirection === "right" ? "left" : "right";
  }

  state.moveId = move.id;
}

function moveForIntent(puppet, intent) {
  return puppet.moves.find((move) => activeClip(puppet, move.id, { direction: intent })?.intent === intent);
}

function restartAnimation() {
  state.animationStartedAt = performance.now();
}

function syncAnimationLoop(clip) {
  const shouldAnimate = clip?.loops && !reduceMotion.matches;

  if (!shouldAnimate) {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    return;
  }

  if (animationFrameId !== null) return;

  function tick() {
    animationFrameId = null;
    render({ controls: false, checks: false });
  }

  animationFrameId = requestAnimationFrame(tick);
}

render();
