// The only module that imports three.js. Owns the render loop, all
// listeners (visibility, resize, matchMedia), the renderer, geometries and
// materials, and the mapping from sim bodies to meshes.
import * as THREE from "three";

import { createSim } from "./sim.js";
import {
  DEFAULT_FRUIT_KEY,
  DEFAULT_TOUGHNESS,
  FIXED_STEP,
  HEIGHT_SLIDER_MAX,
  LANDMARKS,
  chunkShape,
  controlsEnabledForPhase,
  fruitByKey,
  heightBarFor,
  heightFromSlider,
  heightSliderLabel,
  impactViewFor,
  incomingFor,
  instructionsForPhase,
  layoutHash,
  shellPiece,
  sliderFromHeight,
  splatSoundFor
} from "./rules.js";

const MAX_STEPS_PER_FRAME = 5;
const DEFAULT_HEIGHT_SLIDER_VALUE = 662; // Roof (see rules.js sliderFromHeight)
const GROUND_TOP_Y = 0;
const GROUND_HALF_THICKNESS = 5;
// Height-bar marker/label DOM writes are skipped unless the fraction moves
// by at least this much of the track, or the rounded label text changes.
// The runtime rule's floor is 0.5%; 2% is used here (strictly coarser, so
// every write still satisfies "changed by at least 0.5%") to keep the total
// number of writes over one full-height fall well under the write budget.
// (Raised from 1% to 2%: at 1%, a Plane fall measured exactly 150 mutations,
// tripping the "< 150" Playwright budget test with no margin.)
const HEIGHT_BAR_FRACTION_EPSILON = 0.02;
// Blob shadow: grows and darkens as the fruit's lowest point approaches the
// ground, reaching full size/darkness within this many metres of it. The
// two scales were tuned as absolute metres (0.35-1.1m) against the OLD,
// containment-tied camera, where the frame was ~12.5x a fruit's own
// diameter wide (diameter = 8% of view width) — a ~1m shadow was a modest
// fraction of that wide frame. Step 1b §8's per-fruit close-up framing
// makes the fruit's diameter 25% of view width instead (frame = 8x the
// fruit's radius wide), so keeping the shadow an absolute size — or even
// keeping it a multiple of the OLD radius-relative ratio (still tuned
// against the old, much wider frame) — made it enormous relative to the
// new, tightly-framed shot: a solid dark blob covering most of the canvas,
// completely hiding the fruit (found via a `ready` screenshot review).
// Retuned as a multiple of the fruit's own radius, sized against the NEW
// frame width (8R): 1.5R-3.5R keeps the shadow visually smaller than the
// fruit's own diameter (2R) at its smallest and at most ~44% of the frame
// width at its largest (near touchdown), leaving the fruit clearly the
// larger, dominant shape in frame at every distance.
const SHADOW_MIN_SCALE = 1.5;
const SHADOW_MAX_SCALE = 3.5;
const SHADOW_CLOSE_DISTANCE_M = 4;
const SHADOW_MIN_OPACITY = 0.12;
const SHADOW_MAX_OPACITY = 0.5;

const GROUND_COLOR = 0xc9a875;

// Step 1b §7: an unpinned seed is fresh crypto randomness on every Drop;
// `?seed=<1-10 digits>` pins the same seed for every drop this session.
function parsePinnedSeed() {
  const raw = new URLSearchParams(window.location.search).get("seed");

  if (raw && /^\d{1,10}$/.test(raw)) {
    return Number(raw) >>> 0;
  }

  return null;
}

function nextDropSeed(pinnedSeed) {
  if (pinnedSeed !== null) return pinnedSeed;

  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function hexToRgb01(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

// Step 1b §9: the height bar's marker and the incoming circle both use the
// selected fruit's own skin colour via a CSS custom property, so neither
// hard-codes a colour.
function hexToCssColor(hex) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

// --- Unbroken-fruit skin (code-drawn CanvasTexture, no image files) --------

function drawFruitSkin(context, size, fruit) {
  const hex = (value) => `#${value.toString(16).padStart(6, "0")}`;

  context.fillStyle = hex(fruit.skinColor);
  context.fillRect(0, 0, size, size);

  if (fruit.key === "watermelon") {
    context.strokeStyle = "rgba(20, 60, 20, 0.55)";
    context.lineWidth = size * 0.045;
    const stripeCount = 8;
    for (let i = 0; i < stripeCount; i += 1) {
      const x = (size / stripeCount) * i + size * 0.03;
      context.beginPath();
      context.moveTo(x, 0);
      context.quadraticCurveTo(x + size * 0.08, size / 2, x, size);
      context.stroke();
    }
  } else if (fruit.key === "orange") {
    context.fillStyle = "rgba(150, 90, 10, 0.35)";
    const dimpleCount = 60;
    // Deterministic dimple placement (no user-facing randomness needed here).
    let state = 12345;
    const rand = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    for (let i = 0; i < dimpleCount; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const r = size * (0.006 + rand() * 0.01);
      context.beginPath();
      context.arc(x, y, r, 0, Math.PI * 2);
      context.fill();
    }
  } else if (fruit.key === "coconut") {
    context.strokeStyle = "rgba(30, 15, 5, 0.5)";
    context.lineWidth = size * 0.01;
    let state = 999;
    const rand = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff;
      return state / 0x7fffffff;
    };
    for (let i = 0; i < 40; i += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const length = size * (0.05 + rand() * 0.1);
      const angle = rand() * Math.PI * 2;
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
      context.stroke();
    }
  }
  // Apple and tomato: flat skin colour is enough at this size.
}

function createFruitSkinTexture(fruit) {
  const size = 128;
  const canvas = document.createElement("canvas");

  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");

  drawFruitSkin(context, size, fruit);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  return texture;
}

// --- Ground texture (step 1b §9): a faint, code-drawn soil speckle, no ----
// image files. A deterministic LCG (not Math.random) keeps repeated calls
// with the same fruit visually identical, matching the pattern already
// used for the orange skin's dimples.
const GROUND_TILE_WORLD_SIZE = 30; // matches the ground BoxGeometry's width/depth
const GROUND_TEXTURE_SIZE = 64;

function drawGroundTexture(context, size) {
  const hex = (value) => `#${value.toString(16).padStart(6, "0")}`;

  context.fillStyle = hex(GROUND_COLOR);
  context.fillRect(0, 0, size, size);

  let state = 0x9e3779b1;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };

  // Faint speckle: a handful of slightly lighter/darker dots, low opacity,
  // so the ground reads as ground without competing with the fruit/debris.
  for (let i = 0; i < 40; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const radius = size * (0.01 + rand() * 0.03);
    const lighter = rand() > 0.5;

    context.fillStyle = lighter ? "rgba(255, 255, 255, 0.10)" : "rgba(0, 0, 0, 0.10)";
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  // A faint tile outline, so the repeat is visible as a subtle grid at
  // close range without looking like a harsh checkerboard.
  context.strokeStyle = "rgba(0, 0, 0, 0.06)";
  context.lineWidth = Math.max(1, size * 0.015);
  context.strokeRect(0, 0, size, size);
}

// One tile is about 2 * fruit.radius world metres, so the close-up shot
// (step 1b §8) shows a sense of scale and depth regardless of fruit size.
function createGroundTexture(fruit) {
  const canvas = document.createElement("canvas");

  canvas.width = GROUND_TEXTURE_SIZE;
  canvas.height = GROUND_TEXTURE_SIZE;

  const context = canvas.getContext("2d");

  drawGroundTexture(context, GROUND_TEXTURE_SIZE);

  const texture = new THREE.CanvasTexture(canvas);
  const repeatCount = GROUND_TILE_WORLD_SIZE / (2 * fruit.radius);

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatCount, repeatCount);
  texture.needsUpdate = true;

  return texture;
}

// --- Step 1b §10: synthesized splat sound (Web Audio, no files) ------------
//
// Autoplay rules: the AudioContext is created (or resumed) ONLY inside the
// Drop button's click handler — a native <button> click event fires for
// both a mouse click and a Space/Enter keypress while it's focused, so one
// listener covers both. The actual sound plays later, at the impact step
// (well after the click returns); that's fine for autoplay policy, which
// gates the CONTEXT itself, not each individual node scheduled on it once
// unlocked.
//
// If AudioContext is missing, or its constructor throws, sound is marked
// permanently unavailable and every playback call becomes a silent no-op —
// never a console error.
let audioContext = null;
let audioAvailable = true;
let noiseBufferCache = null;

function ensureAudioContext() {
  if (!audioAvailable) return null;

  if (audioContext) {
    if (audioContext.state === "suspended") {
      audioContext.resume().catch(() => {});
    }

    return audioContext;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextCtor) {
    audioAvailable = false;
    return null;
  }

  try {
    audioContext = new AudioContextCtor();
    return audioContext;
  } catch {
    audioAvailable = false;
    return null;
  }
}

// A shared white-noise buffer, long enough for the longest noise burst
// (splatSoundFor clamps noiseDuration <= 0.6s); each play uses only the
// slice it needs via AudioBufferSourceNode.start(when, offset, duration).
// A simple LCG (not Math.random), matching this project's other
// deterministic-canvas-texture code, though audio timing/output isn't
// itself asserted on in tests.
function getNoiseBuffer(context) {
  if (noiseBufferCache && noiseBufferCache.sampleRate === context.sampleRate) {
    return noiseBufferCache;
  }

  const seconds = 0.6;
  const length = Math.max(1, Math.round(context.sampleRate * seconds));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 0x2545f491;

  for (let i = 0; i < length; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    data[i] = (state / 0xffffffff) * 2 - 1;
  }

  noiseBufferCache = buffer;
  return buffer;
}

const CRACK_DURATION_SECONDS = 0.03;
const CRACK_CUTOFF_HZ = 6000;

// Plays once per drop, at the impact step: a white-noise burst through a
// lowpass filter with a falling cutoff (splatSoundFor's cutoffStart ->
// cutoffEnd) and a gain envelope, an oscillator thud, and — for fruits with
// crackGain > 0 (coconut) — a very short, high-cutoff noise click. Every
// node is disconnected once it ends. Wrapped in try/catch so any Web Audio
// failure never becomes a page/console error.
function playSplatSound({ fruit, severity, impactSpeed }) {
  const context = audioContext;

  if (!context) return;

  try {
    const sound = splatSoundFor({ fruit, severity, impactSpeed });
    const now = context.currentTime;

    if (sound.noiseGain > 0) {
      const noiseSource = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();

      noiseSource.buffer = getNoiseBuffer(context);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(sound.cutoffStart, now);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, sound.cutoffEnd), now + sound.noiseDuration);
      gain.gain.setValueAtTime(sound.noiseGain, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + sound.noiseDuration);

      noiseSource.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);

      noiseSource.onended = () => {
        noiseSource.disconnect();
        filter.disconnect();
        gain.disconnect();
      };

      noiseSource.start(now, 0, sound.noiseDuration);
    }

    const oscillator = context.createOscillator();
    const thudGainNode = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(sound.thudFreq, now);
    thudGainNode.gain.setValueAtTime(sound.thudGain, now);
    thudGainNode.gain.exponentialRampToValueAtTime(0.001, now + sound.thudDuration);

    oscillator.connect(thudGainNode);
    thudGainNode.connect(context.destination);

    oscillator.onended = () => {
      oscillator.disconnect();
      thudGainNode.disconnect();
    };

    oscillator.start(now);
    oscillator.stop(now + sound.thudDuration);

    if (sound.crackGain > 0) {
      const crackSource = context.createBufferSource();
      const crackFilter = context.createBiquadFilter();
      const crackGainNode = context.createGain();

      crackSource.buffer = getNoiseBuffer(context);
      crackFilter.type = "lowpass";
      crackFilter.frequency.setValueAtTime(CRACK_CUTOFF_HZ, now);
      crackGainNode.gain.setValueAtTime(sound.crackGain, now);
      crackGainNode.gain.exponentialRampToValueAtTime(0.001, now + CRACK_DURATION_SECONDS);

      crackSource.connect(crackFilter);
      crackFilter.connect(crackGainNode);
      crackGainNode.connect(context.destination);

      crackSource.onended = () => {
        crackSource.disconnect();
        crackFilter.disconnect();
        crackGainNode.disconnect();
      };

      crackSource.start(now, 0, CRACK_DURATION_SECONDS);
    }
  } catch {
    // Never let a Web Audio failure become a page/console error.
  }
}

export function start(elements) {
  const {
    main,
    canvas,
    fruitFieldset,
    heightSlider,
    heightSliderTicks,
    heightReadout,
    toughnessSlider,
    toughnessReadout,
    dropButton,
    skipButton,
    soundToggle,
    statusEl,
    instructionsEl,
    heightBarTrack,
    heightBarTicks,
    heightBarIndicator,
    heightBarLabel,
    heightBarMarker,
    incomingMarker,
    incomingMarkerDot
  } = elements;

  const fruitRadios = Array.from(fruitFieldset.querySelectorAll('input[name="fruit"]'));

  function checkedFruitKey() {
    const checked = fruitRadios.find((radio) => radio.checked);
    return checked ? checked.value : DEFAULT_FRUIT_KEY;
  }

  const pinnedSeed = parsePinnedSeed();

  let currentFruitKey = checkedFruitKey();
  let currentHeightSliderValue = Number.parseInt(heightSlider.value, 10) || DEFAULT_HEIGHT_SLIDER_VALUE;
  let currentHeightM = heightFromSlider(currentHeightSliderValue);
  let currentToughness = Number.parseInt(toughnessSlider.value, 10) || DEFAULT_TOUGHNESS;
  // Step 1b §10: default on, not persisted across reloads.
  let soundEnabled = true;
  // Guards playSplatSound to exactly once per drop; reset to false
  // everywhere sim.reset() is called (every settled edit, and the Drop
  // handler's own reset-before-drop).
  let impactSoundPlayed = false;

  const sim = createSim({
    seed: pinnedSeed ?? 1,
    heightM: currentHeightM,
    toughness: currentToughness,
    fruit: currentFruitKey
  });

  // --- three.js scene setup -------------------------------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe3f5);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 500);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
  sunLight.position.set(5, 10, 7);
  scene.add(ambientLight, sunLight);

  const groundGeometry = new THREE.BoxGeometry(30, GROUND_HALF_THICKNESS * 2, 30);
  // The texture (below) carries the ground's actual colour and speckle;
  // material.color stays white so the map is not additionally tinted.
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff });
  const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
  groundMesh.position.set(0, GROUND_TOP_Y - GROUND_HALF_THICKNESS, 0);
  scene.add(groundMesh);

  // Ground texture (step 1b §9): view.js is the sole owner, and disposes
  // the previous texture whenever it replaces it on a fruit change.
  let groundTexture = createGroundTexture(fruitByKey(currentFruitKey));
  groundMaterial.map = groundTexture;
  groundMaterial.needsUpdate = true;

  function applyGroundTexture() {
    const nextTexture = createGroundTexture(fruitByKey(currentFruitKey));

    groundTexture.dispose();
    groundTexture = nextTexture;
    groundMaterial.map = groundTexture;
    groundMaterial.needsUpdate = true;
  }

  // Camera framing per fruit (step 1b §5): position/target/fov come from
  // impactViewFor, recomputed at start, on resize, and whenever the fruit
  // changes (in ready). Never during a drop.
  // Step 1b §9: cached so the incoming marker (recomputed every frame while
  // shown) reuses the same view the camera itself is using, rather than
  // recomputing impactViewFor from scratch each frame. Recomputed only
  // where applyImpactView is called: on resize and on fruit change, in
  // `ready`, never during a drop (no camera motion).
  let currentView = null;

  function applyImpactView() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    const view = impactViewFor({ width, height, fruit: fruitByKey(currentFruitKey) });

    currentView = view;
    camera.position.set(view.position[0], view.position[1], view.position[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(view.target[0], view.target[1], view.target[2]);
    camera.fov = view.fov;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  // Blob shadow: a single flat mesh, the sole owner of its texture,
  // material and geometry for the page's lifetime (never recreated, so no
  // runtime dispose call is needed in normal operation — the ground mesh
  // and lights above follow the same reuse pattern).
  function createShadowTexture() {
    const size = 128;
    const shadowCanvas = document.createElement("canvas");

    shadowCanvas.width = size;
    shadowCanvas.height = size;

    const context = shadowCanvas.getContext("2d");
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);

    gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    return new THREE.CanvasTexture(shadowCanvas);
  }

  const shadowTexture = createShadowTexture();
  const shadowGeometry = new THREE.PlaneGeometry(1, 1);
  const shadowMaterial = new THREE.MeshBasicMaterial({
    map: shadowTexture,
    transparent: true,
    depthWrite: false,
    opacity: SHADOW_MIN_OPACITY
  });
  const shadowMesh = new THREE.Mesh(shadowGeometry, shadowMaterial);

  shadowMesh.rotation.x = -Math.PI / 2;
  shadowMesh.position.set(0, GROUND_TOP_Y + 0.002, 0);
  shadowMesh.visible = false;
  scene.add(shadowMesh);

  function updateShadow(fruitBody) {
    if (!fruitBody) {
      shadowMesh.visible = false;
      return;
    }

    shadowMesh.visible = true;

    const fruitY = Math.max(0, fruitBody.position[1] - fruitBody.radius);
    const closeness = 1 - Math.min(1, fruitY / SHADOW_CLOSE_DISTANCE_M);
    const scale = fruitBody.radius * (SHADOW_MIN_SCALE + (SHADOW_MAX_SCALE - SHADOW_MIN_SCALE) * closeness);

    shadowMesh.scale.set(scale, scale, 1);
    shadowMesh.position.set(fruitBody.position[0], GROUND_TOP_Y + 0.002, fruitBody.position[2]);
    shadowMaterial.opacity = SHADOW_MIN_OPACITY + (SHADOW_MAX_OPACITY - SHADOW_MIN_OPACITY) * closeness;
  }

  // --- geometry/material pools -------------------------------------------
  // Unbroken-fruit sphere geometry is shared/cached by radius (a handful of
  // distinct fruit radii), never disposed. Its skin texture is one
  // CanvasTexture per fruit key, drawn once and reused for the page's
  // lifetime (five small textures total).
  const fruitGeometryCache = new Map();
  const fruitMaterialCache = new Map();
  // Inner-chunk and seed materials are flat, pooled per fruit key/kind
  // (colour only; the interesting per-piece variation is the geometry).
  const flatMaterialCache = new Map();
  // The outer (shell) material uses vertex colours (each piece's geometry
  // carries its own outer/inner colours), so ONE material serves every
  // fruit's shell pieces.
  const outerMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
  const seedGeometryCache = new Map(); // by radius: a shared "ellipsoid" (scaled sphere)

  function fruitSphereGeometry(radius) {
    if (!fruitGeometryCache.has(radius)) {
      fruitGeometryCache.set(radius, new THREE.SphereGeometry(radius, 20, 14));
    }
    return fruitGeometryCache.get(radius);
  }

  function fruitSkinMaterial(fruitKey) {
    if (!fruitMaterialCache.has(fruitKey)) {
      const fruit = fruitByKey(fruitKey);
      const texture = createFruitSkinTexture(fruit);
      fruitMaterialCache.set(fruitKey, new THREE.MeshStandardMaterial({ map: texture }));
    }
    return fruitMaterialCache.get(fruitKey);
  }

  function flatMaterialFor(kind, fruitKey, colorHex) {
    const key = `${kind}:${fruitKey}`;
    if (!flatMaterialCache.has(key)) {
      flatMaterialCache.set(key, new THREE.MeshStandardMaterial({ color: colorHex, flatShading: true }));
    }
    return flatMaterialCache.get(key);
  }

  function seedGeometryFor(radius) {
    if (!seedGeometryCache.has(radius)) {
      seedGeometryCache.set(radius, new THREE.SphereGeometry(radius, 8, 6));
    }
    return seedGeometryCache.get(radius);
  }

  // A per-piece BufferGeometry from chunkShape's unit-icosahedron data,
  // scaled to the piece's own physics radius. Seeded by the piece's own id
  // (stable and unique within a sim generation) so pieces of the same fruit
  // and size still get visually distinct shapes.
  function buildChunkGeometry(seedValue, radius) {
    const shape = chunkShape(seedValue);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(shape.positions.length * 3);

    shape.positions.forEach((p, i) => {
      positions[i * 3] = p[0] * radius;
      positions[i * 3 + 1] = p[1] * radius;
      positions[i * 3 + 2] = p[2] * radius;
    });

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(shape.indices);
    geometry.computeVertexNormals();

    return geometry;
  }

  // A per-piece BufferGeometry from shellPiece's curved-patch data, with
  // vertex colours for the outer/inner faces.
  function buildShellGeometry(seedValue, fruit) {
    const shape = shellPiece(seedValue, fruit);
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(shape.positions.length * 3);

    shape.positions.forEach((p, i) => {
      positions[i * 3] = p[0];
      positions[i * 3 + 1] = p[1];
      positions[i * 3 + 2] = p[2];
    });

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(shape.indices);
    geometry.computeVertexNormals();

    const colors = new Float32Array(shape.positions.length * 3);
    const outerRgb = hexToRgb01(shape.outerColor);
    const innerRgb = hexToRgb01(shape.innerColor);

    for (let i = 0; i < shape.positions.length; i += 1) {
      const rgb = i < shape.outerVertexCount ? outerRgb : innerRgb;
      colors[i * 3] = rgb[0];
      colors[i * 3 + 1] = rgb[1];
      colors[i * 3 + 2] = rgb[2];
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    return geometry;
  }

  function meshFor(body) {
    const fruit = fruitByKey(currentFruitKey);

    if (body.kind === "fruit") {
      const mesh = new THREE.Mesh(fruitSphereGeometry(body.radius), fruitSkinMaterial(currentFruitKey));
      mesh.userData.ownsGeometry = false;
      return mesh;
    }

    if (body.kind === "outer") {
      // body.id is stable and unique within this sim generation, so it
      // doubles as a deterministic per-piece shape seed.
      const geometry = buildShellGeometry(body.id, fruit);
      const mesh = new THREE.Mesh(geometry, outerMaterial);
      mesh.userData.ownsGeometry = true;
      return mesh;
    }

    if (body.kind === "inner") {
      const geometry = buildChunkGeometry(body.id, body.radius);
      const mesh = new THREE.Mesh(geometry, flatMaterialFor("inner", currentFruitKey, fruit.fleshColor));
      mesh.userData.ownsGeometry = true;
      return mesh;
    }

    // seed
    const mesh = new THREE.Mesh(seedGeometryFor(body.radius), flatMaterialFor("seed", currentFruitKey, fruit.seedColor));
    mesh.scale.set(1, 1, 1.4);
    mesh.userData.ownsGeometry = false;
    return mesh;
  }

  const meshesById = new Map();

  function disposeMesh(mesh) {
    if (mesh.userData.ownsGeometry) {
      mesh.geometry.dispose();
    }
  }

  function syncSceneFromSim() {
    const bodies = sim.bodies();
    const seenIds = new Set();
    let fruitBody = null;

    for (const body of bodies) {
      seenIds.add(body.id);

      if (body.kind === "fruit") fruitBody = body;

      let mesh = meshesById.get(body.id);

      if (!mesh) {
        mesh = meshFor(body);
        meshesById.set(body.id, mesh);
        scene.add(mesh);
      }

      mesh.position.set(body.position[0], body.position[1], body.position[2]);
      mesh.quaternion.set(body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]);
    }

    for (const [id, mesh] of meshesById.entries()) {
      if (seenIds.has(id)) continue;

      scene.remove(mesh);
      disposeMesh(mesh);
      meshesById.delete(id);
    }

    updateShadow(fruitBody);
  }

  // fruitY for the height bar: the fruit's lowest point above the ground
  // while it exists, 0 once it has split (per heightBarFor's contract).
  function currentFruitY() {
    const fruit = sim.bodies().find((body) => body.kind === "fruit");

    if (!fruit) return 0;

    return Math.max(0, fruit.position[1] - fruit.radius);
  }

  function resetSceneMeshes() {
    for (const mesh of meshesById.values()) {
      scene.remove(mesh);
      disposeMesh(mesh);
    }

    meshesById.clear();
    syncSceneFromSim();
  }

  // --- DOM sync ----------------------------------------------------------
  function updateReadouts() {
    const label = heightSliderLabel(currentHeightM);

    heightReadout.textContent = label;
    heightSlider.setAttribute("aria-valuetext", label);
    toughnessReadout.textContent = String(currentToughness);
  }

  // Step 1b §10: no Reset button — fruit/height/toughness/Drop follow
  // sim.uiPhase (enabled in `ready` and `settled`, disabled only while
  // `falling`). Drop is never given the `disabled` attribute (see the
  // style.css comment on #drop-button[aria-disabled] for why) — its
  // enabled/disabled state is carried by `aria-disabled` instead, always
  // explicitly "true" or "false" (never absent).
  function updateControlsEnabled() {
    const enabled = controlsEnabledForPhase(sim.uiPhase);

    for (const radio of fruitRadios) {
      radio.disabled = !enabled.fruitRadios;
    }

    heightSlider.disabled = !enabled.heightSlider;
    toughnessSlider.disabled = !enabled.toughnessSlider;

    const dropAriaDisabled = enabled.dropButton ? "false" : "true";

    if (dropButton.getAttribute("aria-disabled") !== dropAriaDisabled) {
      dropButton.setAttribute("aria-disabled", dropAriaDisabled);
    }

    soundToggle.disabled = !enabled.soundToggle; // always false; never disabled

    const reducedMotion = reducedMotionQuery.matches;

    skipButton.hidden = !reducedMotion;
    skipButton.disabled = !enabled.skipButton;
  }

  function updateStatusText() {
    const nextStatusText =
      sim.uiPhase === "settled" && sim.summary ? sim.summary.text : instructionsForPhase(sim.uiPhase);
    const nextInstructionsText = instructionsForPhase(sim.uiPhase);

    // Only write these text nodes when the string actually changes: both are
    // aria-live (or read by assistive tech) and get checked every animation
    // frame, so an unconditional write would make screen readers re-announce
    // unchanged text up to 60 times a second (D5).
    if (statusEl.textContent !== nextStatusText) {
      statusEl.textContent = nextStatusText;
    }

    if (instructionsEl.textContent !== nextInstructionsText) {
      instructionsEl.textContent = nextInstructionsText;
    }
  }

  // Step 1b §10 (CTO amendment); D1 fix: data-phase follows the UI phase,
  // not physics. data-steps keeps counting physics steps while debris still
  // simulates after UI settle. data-layout-hash is derived from
  // sim.uiSettleLayout — sim.js's own step-exact snapshot taken the moment
  // uiPhase first becomes "settled" — rather than from sim.bodies() read at
  // frame time, which drifted with frame timing (D1: MAX_STEPS_PER_FRAME
  // lets a frame's steps land anywhere from +1 to +5 past the UI-settle
  // step, so debris still in motion could be captured at different steps on
  // different runs of the same seed).
  function updatePhaseAttributes() {
    main.dataset.phase = sim.uiPhase;
    main.dataset.steps = String(sim.steps);

    if (sim.uiSettleLayout !== null && main.dataset.layoutHash === undefined) {
      main.dataset.layoutHash = layoutHash(sim.uiSettleLayout);
    }
  }

  // Height bar: writes to the DOM only when the label text changes or the
  // marker moves by at least 1% of the track, and rebuilds tick marks only
  // when the height preset itself changes. Never touches #status or
  // #instructions.
  //
  // Tick-name collision avoidance (step 1 review V1, extended step 1b §5):
  // every tick keeps its dash mark, but its name is only shown if showing it
  // would not sit within one label-height (in px) of the last SHOWN name
  // above it (walking top-down), and ALSO not within one label-height of the
  // moving metres label itself (which can land anywhere on the track, not
  // just at a fixed tick position) — fixing the "Tab'e 0 m" overlap seen at
  // settled. The top tick (the chosen height preset) always shows its name.
  let lastBarLabel = null;
  let lastBarFraction = null;
  let lastBarHeightM = null;
  let tickNameEntries = []; // { tick, nameEl } for the current height preset

  function setHidden(nameEl, hidden) {
    // Write only on an actual change: this runs on every fraction-changed
    // frame, and an unconditional write here blew the bar's DOM-mutation
    // budget (each write is an observed attribute mutation, even when the
    // value doesn't change).
    if (nameEl.hidden !== hidden) {
      nameEl.hidden = hidden;
    }
  }

  function layoutHeightBarNames(movingLabelFraction) {
    if (tickNameEntries.length === 0) return;

    const trackHeightPx = heightBarTrack.clientHeight || 1;
    const labelHeightPx = tickNameEntries[tickNameEntries.length - 1].nameEl.getBoundingClientRect().height || 14;
    const movingLabelPx = movingLabelFraction * trackHeightPx;
    let lastShownPx = null;

    for (let i = tickNameEntries.length - 1; i >= 0; i -= 1) {
      const { tick, nameEl } = tickNameEntries[i];
      const px = tick.fraction * trackHeightPx;
      const isTopTick = i === tickNameEntries.length - 1;
      const tooCloseToShownTick = lastShownPx !== null && Math.abs(lastShownPx - px) < labelHeightPx;
      const tooCloseToMovingLabel = Math.abs(movingLabelPx - px) < labelHeightPx;

      // The top tick always sits at fraction 1 (it names the currently
      // chosen preset), which is exactly where the moving label sits in
      // `ready` (fruit at full height) — a permanent, not occasional,
      // coincidence. It stays visible (per the runtime rule) but gets a
      // fixed CSS offset (`.height-bar-tick--top`) so its box clears the
      // label's box even when they share the same fraction; no JS
      // proximity check is needed for it specifically.
      if (isTopTick) {
        setHidden(nameEl, false);
        lastShownPx = px;
        continue;
      }

      if (tooCloseToShownTick || tooCloseToMovingLabel) {
        setHidden(nameEl, true);
      } else {
        setHidden(nameEl, false);
        lastShownPx = px;
      }
    }
  }

  function renderHeightBarTicks(ticks) {
    heightBarTicks.textContent = "";
    tickNameEntries = [];

    ticks.forEach((tick, index) => {
      const tickEl = document.createElement("div");
      const nameEl = document.createElement("span");
      const dashEl = document.createElement("span");
      const isTopTick = index === ticks.length - 1;

      tickEl.className = isTopTick ? "height-bar-tick height-bar-tick--top" : "height-bar-tick";
      tickEl.style.setProperty("--fraction", String(tick.fraction));
      nameEl.className = "height-bar-tick-name";
      nameEl.textContent = tick.name;
      dashEl.className = "height-bar-tick-dash";

      tickEl.appendChild(nameEl);
      tickEl.appendChild(dashEl);
      heightBarTicks.appendChild(tickEl);

      tickNameEntries.push({ tick, nameEl });
    });
  }

  // Step 1b §8: decorative marks under the height slider for the six
  // landmarks, positioned at sliderFromHeight(L)/1000 of the track width.
  // Static (rendered once) — these mark fixed positions on the 0-1000
  // slider, independent of the currently chosen height, unlike the height
  // bar's own ticks (which only show landmarks at or below the chosen
  // height). No `<datalist>`: see .height-slider-wrap's CSS comment.
  function renderHeightSliderTicks() {
    if (!heightSliderTicks) return;

    heightSliderTicks.textContent = "";

    for (const landmark of LANDMARKS) {
      const tickEl = document.createElement("span");
      const fraction = sliderFromHeight(landmark.meters) / HEIGHT_SLIDER_MAX;

      tickEl.className = "height-slider-tick";
      tickEl.style.left = `${fraction * 100}%`;
      heightSliderTicks.appendChild(tickEl);
    }
  }

  function updateHeightBar() {
    const heightM = currentHeightM;
    const fruitY = currentFruitY();
    const { fraction, label, ticks } = heightBarFor({ melonY: fruitY, heightM });

    if (heightM !== lastBarHeightM) {
      renderHeightBarTicks(ticks);
      lastBarHeightM = heightM;
      lastBarFraction = null; // force a fresh layout pass below
    }

    // Endpoints (0 = settled/ground, 1 = ready/full height) always write,
    // regardless of the epsilon: otherwise the coarser threshold (raised to
    // fix the write-budget test) can leave the marker short of the track's
    // bottom edge at settled if the second-to-last update landed within the
    // threshold of exactly 0.
    const fractionChanged =
      lastBarFraction === null ||
      fraction === 0 ||
      fraction === 1 ||
      Math.abs(fraction - lastBarFraction) >= HEIGHT_BAR_FRACTION_EPSILON;

    if (label !== lastBarLabel) {
      heightBarLabel.textContent = label;
      lastBarLabel = label;
    }

    if (fractionChanged) {
      heightBarIndicator.style.setProperty("--fraction", String(fraction));
      lastBarFraction = fraction;
      layoutHeightBarNames(fraction);
    }
  }

  // Step 1b §9/§10: the "incoming" marker (arrow + fruit-coloured dot only
  // — step 1b §10 removed its metres label, "one height on screen": the
  // height bar is the only height readout). Visible in UI `ready` and
  // `falling` while the fruit's LOWEST point is above the frame's top edge
  // (see rules.js incomingFor). Hidden at UI `settled` (§10 amendment: this
  // follows sim.uiPhase, not sim.phase — a held fruit that bounces past UI
  // settle must hide the marker even though its physics phase, and hence
  // its fruit body, persists well past that point) and whenever there is no
  // fruit body (post-split) or incomingFor says it's not visible. Shares
  // the height bar's write discipline: a DOM write only on an actual
  // visibility change, never every frame.
  let lastIncomingVisible = null;

  function setIncomingHidden(hidden) {
    if (incomingMarker.hidden !== hidden) {
      incomingMarker.hidden = hidden;
    }
  }

  function updateIncomingMarker() {
    const shownPhase = sim.uiPhase === "ready" || sim.uiPhase === "falling";
    const fruitBody = shownPhase ? sim.bodies().find((body) => body.kind === "fruit") : null;

    let visible = false;

    if (fruitBody && currentView) {
      visible = incomingFor({ fruitY: fruitBody.position[1], fruitRadius: fruitBody.radius, view: currentView }).visible;
    }

    if (visible !== lastIncomingVisible) {
      setIncomingHidden(!visible);
      lastIncomingVisible = visible;
    }
  }

  function updateDom() {
    updateControlsEnabled();
    updateStatusText();
    updatePhaseAttributes();
    updateHeightBar();
    updateIncomingMarker();
  }

  function render() {
    renderer.render(scene, camera);
  }

  // --- render loop: fixed-step accumulator, capped catch-up -------------
  let rafId = null;
  let lastFrameTime = null;
  let accumulator = 0;

  function frameLoop(now) {
    rafId = requestAnimationFrame(frameLoop);

    if (lastFrameTime === null) {
      lastFrameTime = now;
      return;
    }

    const delta = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    accumulator += delta;

    let stepsThisFrame = 0;

    while (accumulator >= FIXED_STEP && stepsThisFrame < MAX_STEPS_PER_FRAME && sim.phase === "falling") {
      sim.step();
      accumulator -= FIXED_STEP;
      stepsThisFrame += 1;
    }

    checkImpactSound();
    syncSceneFromSim();
    updateDom();
    render();

    if (sim.phase !== "falling") {
      stopLoop();
    }
  }

  // Step 1b §10: plays the splat once per drop, on the first frame
  // sim.firstImpact is non-null (immediately, whether or not sound is
  // currently enabled — the guard just governs whether the disabled state
  // is skipped instead of stuck waiting for a later frame).
  function checkImpactSound() {
    if (impactSoundPlayed) return;

    const impact = sim.firstImpact;

    if (!impact) return;

    impactSoundPlayed = true;

    if (soundEnabled) {
      playSplatSound(impact);
    }
  }

  function startLoop() {
    if (rafId !== null) return;

    lastFrameTime = null;
    accumulator = 0;
    rafId = requestAnimationFrame(frameLoop);
  }

  function stopLoop() {
    if (rafId === null) return;

    cancelAnimationFrame(rafId);
    rafId = null;
  }

  // --- control handlers ---------------------------------------------------
  // Step 1b §7: main.dataset.layoutHash is set once, when phase becomes
  // settled (in updateDom), and cleared here on every action that starts a
  // fresh generation, so a test can never read a stale hash.
  function clearLayoutHash() {
    delete main.dataset.layoutHash;
  }

  // Step 1b §9: both markers use the selected fruit's own skin colour, no
  // hard-coded colour anywhere.
  function updateFruitColor() {
    const cssColor = hexToCssColor(fruitByKey(currentFruitKey).skinColor);

    heightBarMarker.style.setProperty("--fruit-color", cssColor);
    incomingMarkerDot.style.setProperty("--fruit-color", cssColor);
  }

  function applyFruitChange() {
    currentFruitKey = checkedFruitKey();
    sim.reset({ fruit: currentFruitKey });
    clearLayoutHash();
    applyImpactView();
    applyGroundTexture();
    updateFruitColor();
    resetSceneMeshes();
    updateReadouts();
    updateDom();
    render();
  }

  function applyHeightChange() {
    currentHeightSliderValue = Number.parseInt(heightSlider.value, 10);
    currentHeightM = heightFromSlider(currentHeightSliderValue);
    sim.reset({ heightM: currentHeightM });
    clearLayoutHash();
    resetSceneMeshes();
    updateReadouts();
    updateDom();
    render();
  }

  // Step 1b §10: settled edit. Fruit/height changes above already do the
  // equivalent (sim.reset + resetSceneMeshes); toughness previously didn't
  // need resetSceneMeshes (toughness could only be edited in `ready`, where
  // there was never any debris to clear) — now it can be edited from
  // `settled` too, so it needs the same clearing.
  function applyToughnessChange() {
    currentToughness = Number.parseInt(toughnessSlider.value, 10);
    sim.reset({ toughness: currentToughness });
    clearLayoutHash();
    resetSceneMeshes();
    updateReadouts();
    updateDom();
    render();
  }

  fruitFieldset.addEventListener("change", (event) => {
    if (event.target && event.target.name === "fruit") applyFruitChange();
  });
  heightSlider.addEventListener("input", applyHeightChange);
  toughnessSlider.addEventListener("input", applyToughnessChange);

  // Step 1b §10: no Reset button. Drop is enabled (via aria-disabled, never
  // the `disabled` attribute — see updateControlsEnabled) in both `ready`
  // and `settled`; in `settled` this clears the still-there (or still
  // moving) debris and drops again immediately with a fresh seed, as one
  // action — the same sim.reset()-then-drop() path `ready` already used.
  // aria-disabled is checked explicitly here because it never actually
  // blocks a click/synthetic activation the way the `disabled` attribute
  // would (that's the whole point of using it instead).
  dropButton.addEventListener("click", () => {
    if (dropButton.getAttribute("aria-disabled") === "true") return;
    if (sim.uiPhase === "falling") return; // defensive; aria-disabled already prevents reaching here

    // Autoplay rules (step 1b §10): create or resume the AudioContext only
    // here, inside the Drop click/key handler — never on page load, never
    // from the render loop where the sound actually plays later.
    ensureAudioContext();

    // A fresh seed per drop (or the pinned ?seed= value for every drop),
    // applied via reset() immediately before drop() so this drop's wobble,
    // placement and jitter all come from it.
    sim.reset({
      seed: nextDropSeed(pinnedSeed),
      fruit: currentFruitKey,
      heightM: currentHeightM,
      toughness: currentToughness
    });
    impactSoundPlayed = false;
    clearLayoutHash();
    resetSceneMeshes();

    sim.drop();
    updateDom();
    startLoop();
  });

  skipButton.addEventListener("click", () => {
    if (sim.uiPhase !== "falling") return;

    stopLoop();

    let guard = 0;

    while (sim.phase === "falling" && guard < 100000) {
      sim.step();
      guard += 1;
    }

    checkImpactSound();
    syncSceneFromSim();
    updateDom();
    render();
  });

  // Step 1b §10: default on, not persisted, enabled in every phase.
  function updateSoundToggleUI() {
    soundToggle.setAttribute("aria-pressed", String(soundEnabled));
    soundToggle.textContent = soundEnabled ? "Sound: on" : "Sound: off";
  }

  soundToggle.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    updateSoundToggleUI();
  });

  // --- lifecycle: visibility, resize, reduced motion ---------------------
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLoop();
    } else if (sim.phase === "falling") {
      startLoop();
    }
  });

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  reducedMotionQuery.addEventListener("change", updateDom);

  function resizeRendererToDisplaySize() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;

    renderer.setSize(width, height, false);
    applyImpactView();
    render();
  }

  window.addEventListener("resize", resizeRendererToDisplaySize);

  // --- initial paint -------------------------------------------------------
  renderHeightSliderTicks();
  updateFruitColor();
  updateSoundToggleUI();
  resizeRendererToDisplaySize();
  syncSceneFromSim();
  updateReadouts();
  updateDom();
  render();
}

