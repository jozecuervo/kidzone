// The only module that imports three.js. Owns the render loop, all
// listeners (visibility, resize, matchMedia), the renderer, geometries and
// materials, and the mapping from sim bodies to meshes.
import * as THREE from "three";

import { createSim } from "./sim.js";
import {
  DEFAULT_FRUIT_KEY,
  FIXED_STEP,
  HEIGHT_SLIDER_MAX,
  LANDMARKS,
  chunkShape,
  controlsEnabledForPhase,
  formatHeight,
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

// Step 1b §11b Stage 3: a 150ms shrink-to-zero pop for removed bodies
// (rolling-window eviction or budget trimming), cosmetic only — the
// physics bodies are already gone from the sim. Instant with reduced
// motion.
const POP_DURATION_MS = 150;

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
// Step 1b §11b Stage 3: one shared master GainNode -> DynamicsCompressorNode
// -> destination, so up to 5 overlapping splats (one per rapid-drop impact)
// don't clip. Created once, lazily, alongside the context itself; every
// splat node below connects into masterGain instead of context.destination
// directly.
let masterGain = null;
let masterCompressor = null;

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
    masterGain = audioContext.createGain();
    masterCompressor = audioContext.createDynamicsCompressor();
    masterGain.connect(masterCompressor);
    masterCompressor.connect(audioContext.destination);
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
      gain.connect(masterGain);

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
    thudGainNode.connect(masterGain);

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
      crackGainNode.connect(masterGain);

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
    dropButton,
    skipButton,
    soundToggle,
    statusEl,
    instructionsEl,
    heightBarTrack,
    heightBarTicks,
    heightBarLabel,
    heightBarIndicator,
    heightBarMarker,
    incomingMarker,
    incomingMarkerDot
  } = elements;

  // Step 1b §11b Stage 3: additional simultaneously-falling fruit (beyond
  // the primary, static, id'd marker) get dynamically created siblings
  // appended directly next to it — a sibling of #incoming-marker under the
  // stage panel, a sibling of #height-bar-indicator under the track — so a
  // single-fruit drop's DOM shape is byte-for-byte the pre-Stage-3 shape
  // (see the B3 Playwright test for the height bar's exact-children check).
  const incomingMarkersContainer = incomingMarker.parentElement;

  const fruitRadios = Array.from(fruitFieldset.querySelectorAll('input[name="fruit"]'));

  function checkedFruitKey() {
    const checked = fruitRadios.find((radio) => radio.checked);
    return checked ? checked.value : DEFAULT_FRUIT_KEY;
  }

  const pinnedSeed = parsePinnedSeed();

  let currentFruitKey = checkedFruitKey();
  let currentHeightSliderValue = Number.parseInt(heightSlider.value, 10) || DEFAULT_HEIGHT_SLIDER_VALUE;
  let currentHeightM = heightFromSlider(currentHeightSliderValue);
  // Step 1b §10: default on, not persisted across reloads.
  let soundEnabled = true;
  // Step 1b §11b Stage 3: the k-th press since page load (k starting 0) is
  // used to derive the pinned seed (`n + k`); an unpinned run ignores this
  // and draws fresh crypto randomness on every press instead.
  let pressCount = 0;

  const sim = createSim({
    seed: pinnedSeed ?? 1,
    heightM: currentHeightM,
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
  // the previous texture whenever it replaces it on a framing change.
  let groundTexture = createGroundTexture(fruitByKey(currentFruitKey));
  groundMaterial.map = groundTexture;
  groundMaterial.needsUpdate = true;

  function applyGroundTexture(fruitKey) {
    const nextTexture = createGroundTexture(fruitByKey(fruitKey));

    groundTexture.dispose();
    groundTexture = nextTexture;
    groundMaterial.map = groundTexture;
    groundMaterial.needsUpdate = true;
  }

  // Camera framing (step 1b §11b Stage 3, replacing the single-fruit step
  // 1b §5/§8 camera): Rmax over the fruit CURRENTLY IN THE SCENE, falling
  // back to the selected radio fruit in `ready` (an empty scene, per the
  // v3 spawn ruling). Snaps once, instantly, whenever a larger fruit
  // appears; never shrinks back mid-batch (avoids camera flicker as the
  // biggest fruit settles or leaves the rolling window) — it only resets
  // to the selected fruit on a genuine return to `ready`.
  let currentView = null;
  let framingFruitKey = currentFruitKey;

  function applyImpactView(fruitKey) {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    const view = impactViewFor({ width, height, fruit: fruitByKey(fruitKey) });

    currentView = view;
    camera.position.set(view.position[0], view.position[1], view.position[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(view.target[0], view.target[1], view.target[2]);
    camera.fov = view.fov;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  function largestPresentFruitKey() {
    let best = null;

    for (const body of sim.bodies()) {
      if (body.kind !== "fruit") continue;
      if (!best || body.radius > best.radius) best = body;
    }

    if (!best) return null;

    const record = sim.fruits().find((f) => f.id === best.fruitId);

    return record ? record.fruit : null;
  }

  function updateFraming() {
    if (sim.phase === "ready") {
      if (framingFruitKey !== currentFruitKey) {
        framingFruitKey = currentFruitKey;
        applyImpactView(framingFruitKey);
        applyGroundTexture(framingFruitKey);
      }
      return;
    }

    const candidateKey = largestPresentFruitKey();

    if (candidateKey && fruitByKey(candidateKey).radius > fruitByKey(framingFruitKey).radius) {
      framingFruitKey = candidateKey;
      applyImpactView(framingFruitKey);
      applyGroundTexture(framingFruitKey);
    }
  }

  // Blob shadow: a single flat mesh, the sole owner of its texture,
  // material and geometry for the page's lifetime (never recreated, so no
  // runtime dispose call is needed in normal operation — the ground mesh
  // and lights above follow the same reuse pattern). Follows the fruit
  // closest to the ground among the falling ones.
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

  function updateShadow(fruitBodies) {
    // The lowest (closest to landing) falling fruit gets the shadow; with
    // none falling, no shadow.
    let lowest = null;

    for (const body of fruitBodies) {
      const y = body.position[1] - body.radius;

      if (!lowest || y < lowest.position[1] - lowest.radius) lowest = body;
    }

    if (!lowest) {
      shadowMesh.visible = false;
      return;
    }

    shadowMesh.visible = true;

    const fruitY = Math.max(0, lowest.position[1] - lowest.radius);
    const closeness = 1 - Math.min(1, fruitY / SHADOW_CLOSE_DISTANCE_M);
    const scale = lowest.radius * (SHADOW_MIN_SCALE + (SHADOW_MAX_SCALE - SHADOW_MIN_SCALE) * closeness);

    shadowMesh.scale.set(scale, scale, 1);
    shadowMesh.position.set(lowest.position[0], GROUND_TOP_Y + 0.002, lowest.position[2]);
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

  // Step 1b §11b Stage 3: meshFor now takes the OWNING body's own fruit key
  // (from sim.fruits(), keyed by body.fruitId) rather than the globally
  // selected radio — several different fruit can be in the scene at once.
  function meshFor(body, fruitKey) {
    const fruit = fruitByKey(fruitKey);

    if (body.kind === "fruit") {
      const mesh = new THREE.Mesh(fruitSphereGeometry(body.radius), fruitSkinMaterial(fruitKey));
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
      const mesh = new THREE.Mesh(geometry, flatMaterialFor("inner", fruitKey, fruit.fleshColor));
      mesh.userData.ownsGeometry = true;
      return mesh;
    }

    // seed
    const mesh = new THREE.Mesh(seedGeometryFor(body.radius), flatMaterialFor("seed", fruitKey, fruit.seedColor));
    mesh.scale.set(1, 1, 1.4);
    mesh.userData.ownsGeometry = false;
    return mesh;
  }

  const meshesById = new Map();
  // Step 1b §11b Stage 3: bodies removed by the sim (rolling-window
  // eviction, body-budget trimming) get a 150ms shrink-to-zero pop here
  // before disposal, cosmetic only — the physics bodies are already gone.
  const poppingMeshes = new Map(); // id -> { mesh, startTime }

  function disposeMesh(mesh) {
    if (mesh.userData.ownsGeometry) {
      mesh.geometry.dispose();
    }
  }

  function reducedMotionActive() {
    return reducedMotionQuery.matches;
  }

  function popMesh(id) {
    const mesh = meshesById.get(id);

    if (!mesh) return;

    meshesById.delete(id);

    if (reducedMotionActive()) {
      scene.remove(mesh);
      disposeMesh(mesh);
      return;
    }

    scene.add(mesh); // already in the scene, but harmless/no-op if so
    poppingMeshes.set(id, { mesh, startTime: performance.now() });
  }

  // Drains sim.consumeRemovals() and starts a pop for each removed body.
  // Called right after every sim.drop() (removals can happen synchronously
  // at press time: spawn-overlap clearing, rolling-window eviction) and
  // once per frame after stepping (later removals: body-budget trimming on
  // a break).
  function processRemovals() {
    for (const id of sim.consumeRemovals()) {
      popMesh(id);
    }
  }

  function advancePops() {
    if (poppingMeshes.size === 0) return;

    const now = performance.now();

    for (const [id, entry] of poppingMeshes.entries()) {
      const elapsed = now - entry.startTime;
      const t = Math.min(1, elapsed / POP_DURATION_MS);
      const scale = Math.max(0, 1 - t);

      entry.mesh.scale.set(scale, scale, scale);

      if (t >= 1) {
        scene.remove(entry.mesh);
        disposeMesh(entry.mesh);
        poppingMeshes.delete(id);
      }
    }
  }

  function syncSceneFromSim() {
    const bodies = sim.bodies();
    const fruitKeyById = new Map(sim.fruits().map((f) => [f.id, f.fruit]));
    const seenIds = new Set();
    const fruitBodies = [];

    for (const body of bodies) {
      seenIds.add(body.id);

      if (body.kind === "fruit") fruitBodies.push(body);

      let mesh = meshesById.get(body.id);

      if (!mesh) {
        const fruitKey = fruitKeyById.get(body.fruitId) ?? currentFruitKey;

        mesh = meshFor(body, fruitKey);
        mesh.scale.set(1, 1, 1);
        meshesById.set(body.id, mesh);
        scene.add(mesh);
      }

      mesh.position.set(body.position[0], body.position[1], body.position[2]);
      mesh.quaternion.set(body.quaternion[0], body.quaternion[1], body.quaternion[2], body.quaternion[3]);
    }

    // Defensive net: a body that vanished from sim.bodies() without coming
    // through consumeRemovals() (should not happen per the sim's contract)
    // still gets cleaned up, instantly (no animation) rather than leaking.
    for (const [id, mesh] of meshesById.entries()) {
      if (seenIds.has(id)) continue;

      scene.remove(mesh);
      disposeMesh(mesh);
      meshesById.delete(id);
    }

    updateShadow(fruitBodies);
  }

  function resetSceneMeshes() {
    for (const mesh of meshesById.values()) {
      scene.remove(mesh);
      disposeMesh(mesh);
    }
    for (const entry of poppingMeshes.values()) {
      scene.remove(entry.mesh);
      disposeMesh(entry.mesh);
    }

    meshesById.clear();
    poppingMeshes.clear();
    syncSceneFromSim();
  }

  // --- DOM sync ----------------------------------------------------------
  function updateReadouts() {
    const label = heightSliderLabel(currentHeightM);

    heightReadout.textContent = label;
    heightSlider.setAttribute("aria-valuetext", label);
  }

  // Step 1b §11b Stage 3: Drop always works, in every phase.
  // Fruit/height/Drop/sound stay enabled in every phase. `skipButton`
  // (reduced-motion "Skip to result") is the one control still limited: it
  // only makes sense, and is only enabled, while something is `active`.
  function updateControlsEnabled() {
    const enabled = controlsEnabledForPhase(sim.phase);

    for (const radio of fruitRadios) {
      radio.disabled = !enabled.fruitRadios;
    }

    heightSlider.disabled = !enabled.heightSlider;
    soundToggle.disabled = !enabled.soundToggle; // always false; never disabled

    const reducedMotion = reducedMotionActive();

    skipButton.hidden = !reducedMotion;
    skipButton.disabled = !enabled.skipButton;
  }

  // Step 1b §11b Stage 3: the live region is written once per quiet
  // period, from sim.consumeAnnouncement() (non-null exactly once, on
  // entry to `settled`) — never derived from a "summary" snapshot re-read
  // every frame, which would re-announce unchanged text. Instructions
  // still follow the phase and are written only when the text changes.
  function updateStatusText() {
    const announcement = sim.consumeAnnouncement();

    if (announcement !== null && statusEl.textContent !== announcement) {
      statusEl.textContent = announcement;
    }

    const nextInstructionsText = instructionsForPhase(sim.phase);

    if (instructionsEl.textContent !== nextInstructionsText) {
      instructionsEl.textContent = nextInstructionsText;
    }
  }

  // data-phase follows sim.phase (ready/active/settled). data-steps keeps
  // counting physics steps. data-fruit-count mirrors sim.fruitCount.
  // data-mesh-count is the number of body meshes currently rendered
  // (including ones still mid-pop), so a Playwright test can inspect the
  // pop animation's actual completion instead of only fruit count.
  // data-layout-hash is set once, from sim.settleLayout, the moment phase
  // first becomes `settled`, and cleared on the next press.
  function updatePhaseAttributes() {
    main.dataset.phase = sim.phase;
    main.dataset.steps = String(sim.steps);
    main.dataset.fruitCount = String(sim.fruitCount);
    main.dataset.meshCount = String(meshesById.size + poppingMeshes.size);

    if (sim.settleLayout !== null && main.dataset.layoutHash === undefined) {
      main.dataset.layoutHash = layoutHash(sim.settleLayout);
    }
  }

  // --- Height bar: one fruit-coloured marker per falling fruit -----------
  // (step 1b §11b Stage 3). The bar's top is the largest chosen height
  // among the fruit currently in the scene, or the slider height in
  // `ready` (an empty scene, so there is nothing to take a max over).
  // The FIRST (oldest, by press order) falling fruit uses the static,
  // id'd elements from index.html (`#height-bar-indicator` /
  // `#height-bar-marker`), so every pre-Stage-3 single-fruit Playwright
  // test keeps working unchanged; any additional simultaneously-falling
  // fruit get dynamically created siblings (same classes, no id) appended
  // directly to heightBarTrack, right next to the primary indicator.
  let lastBarLabel = null;
  let lastBarHeightM = null;
  let tickNameEntries = []; // { tick, nameEl } for the current top height

  function setHidden(nameEl, hidden) {
    if (nameEl.hidden !== hidden) {
      nameEl.hidden = hidden;
    }
  }

  // movingLabelFraction: the primary #height-bar-label's own current
  // fraction (it can land anywhere on the track, not just at a fixed tick
  // position) — a tick name within one label-height of it is hidden too,
  // same as a pre-Stage-3 single-fruit run (see the "moving label never
  // intersects a visible tick name" kept Playwright test).
  function layoutHeightBarNames(movingLabelFraction) {
    if (tickNameEntries.length === 0) return;

    const trackHeightPx = heightBarTrack.clientHeight || 1;
    const labelHeightPx = tickNameEntries[tickNameEntries.length - 1].nameEl.getBoundingClientRect().height || 14;
    const movingLabelPx = movingLabelFraction === null ? null : movingLabelFraction * trackHeightPx;
    let lastShownPx = null;

    for (let i = tickNameEntries.length - 1; i >= 0; i -= 1) {
      const { tick, nameEl } = tickNameEntries[i];
      const px = tick.fraction * trackHeightPx;
      const isTopTick = i === tickNameEntries.length - 1;
      const tooCloseToShownTick = lastShownPx !== null && Math.abs(lastShownPx - px) < labelHeightPx;
      const tooCloseToMovingLabel = movingLabelPx !== null && Math.abs(movingLabelPx - px) < labelHeightPx;

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

  // Falling-fruit entries used by the incoming marker (falling only — it
  // hides on landing). In `ready` (an empty scene) this synthesizes a
  // single preview entry for the selected-but-not-yet-dropped fruit, at
  // the full chosen height (centre = heightM + radius, matching
  // spawnPlanFor's own `y = heightM + Rnew`, so the lowest point sits
  // exactly at heightM) — matching what the single-fruit sim used to show
  // before the v3 spawn ruling made `ready` genuinely empty.
  function fallingFruitEntries() {
    if (sim.phase === "ready") {
      const radius = fruitByKey(currentFruitKey).radius;

      return [
        {
          id: "__preview__",
          fruitKey: currentFruitKey,
          heightM: currentHeightM,
          centerY: currentHeightM + radius,
          radius,
          x: 0,
          z: 0
        }
      ];
    }

    return sceneFruitEntries().filter((entry) => entry.state === "falling");
  }

  // All non-removed fruit currently in the scene, for the height bar
  // (step 1b §11b Stage 3): unlike the incoming marker, a landed or broken
  // fruit's marker STAYS at the bar's bottom (see the kept B2/B3
  // Playwright test), it just stops moving. Only eviction from the
  // rolling window removes its marker (handled by the caller diffing
  // against this list's ids).
  function sceneFruitEntries() {
    if (sim.phase === "ready") return fallingFruitEntries();

    const bodyByFruitId = new Map();

    for (const body of sim.bodies()) {
      if (body.kind === "fruit") bodyByFruitId.set(body.fruitId, body);
    }

    // Newest press first: the primary (static, id'd) marker slot below is
    // always entries[0], and should track the most recently dropped fruit
    // — the one a player just watched fall — not the oldest, already-
    // landed one (which would otherwise permanently squat on the primary
    // slot once several fruit are in the scene at once).
    return sim
      .fruits()
      .sort((a, b) => b.pressIndex - a.pressIndex)
      .map((f) => {
        const body = bodyByFruitId.get(f.id);

        // A body still exists (falling or landed, unbroken): use its real
        // position. Once it has split, there is no single "fruit" body
        // any more — heightBarFor's own contract is 0 once split.
        if (body) {
          return {
            id: f.id,
            fruitKey: f.fruit,
            heightM: f.heightM,
            state: f.state,
            centerY: body.position[1],
            radius: body.radius,
            x: body.position[0],
            z: body.position[2]
          };
        }

        return {
          id: f.id,
          fruitKey: f.fruit,
          heightM: f.heightM,
          state: f.state,
          centerY: 0,
          radius: fruitByKey(f.fruit).radius,
          x: 0,
          z: 0
        };
      });
  }

  // Step 1b §11b Stage 3: the primary (static, id'd) element ALWAYS
  // mirrors entries[0] (the newest fruit currently in the scene), tracked
  // by fraction/colour only — not by id. This avoids a subtler bug an
  // id-sticky slot map had: once fruit A's id had claimed the static
  // elements, a NEWER fruit B becoming entries[0] would still try to
  // create its own slot pointing at those same static elements (id-keyed
  // lookup only checks "have we seen id B before", not "who currently
  // holds the static elements"), so two ids fought over one draggable
  // element and the STALE one (processed later in entries.forEach) won
  // each frame. Extra elements (entries[1+]) are still pooled by id, since
  // there is no ownership ambiguity there — an id never needs to hand its
  // own dedicated extra element to another id.
  let primaryBarFraction = null;
  let primaryBarColor = null;
  const heightBarExtraSlots = new Map(); // fruit-entry id -> { indicator, marker, lastFraction, lastColor }

  function ensureHeightBarExtraSlot(id) {
    let slot = heightBarExtraSlots.get(id);

    if (slot) return slot;

    const indicator = document.createElement("div");
    const marker = document.createElement("span");

    indicator.className = "height-bar-indicator";
    marker.className = "height-bar-marker";
    indicator.appendChild(marker);
    heightBarTrack.appendChild(indicator);

    slot = { indicator, marker, lastFraction: null, lastColor: null };
    heightBarExtraSlots.set(id, slot);
    return slot;
  }

  function releaseHeightBarExtraSlot(id) {
    const slot = heightBarExtraSlots.get(id);

    if (!slot) return;

    slot.indicator.remove();
    heightBarExtraSlots.delete(id);
  }

  function updateHeightBar() {
    const entries = sceneFruitEntries();
    // The scale (topHeightM) is the largest height among currently FALLING
    // fruit only, falling back to the selected height when nothing is
    // falling (`ready`, or `settled` with only landed/broken fruit
    // around). A landed/broken fruit's own fraction is always exactly 0
    // regardless of scale (heightBarFraction(0, h) === 0 for any h), so
    // this does not change where old debris's marker sits — it only keeps
    // an old, larger drop from silently re-scaling a smaller NEW drop's
    // marker so it never reaches the top.
    const fallingHeights = entries.filter((e) => e.state === "falling" || e.id === "__preview__").map((e) => e.heightM);
    const topHeightM = fallingHeights.length ? Math.max(...fallingHeights) : currentHeightM;

    if (topHeightM !== lastBarHeightM) {
      const { ticks } = heightBarFor({ melonY: 0, heightM: topHeightM });

      renderHeightBarTicks(ticks);
      lastBarHeightM = topHeightM;
    }

    // Step 1b §11b Stage 3: only the primary (newest) entry gets a text
    // label — "one height on screen" (step 1b §10) still holds with
    // several fruit at once; it follows that fruit's own descent exactly
    // like the pre-Stage-3 single-fruit label did (heightBarFor's `label`,
    // not a static top-of-bar value).
    const primaryEntry = entries[0] ?? null;
    const nextLabel = primaryEntry
      ? heightBarFor({ melonY: Math.max(0, primaryEntry.centerY - primaryEntry.radius), heightM: topHeightM }).label
      : formatHeight(currentHeightM);

    if (nextLabel !== lastBarLabel) {
      heightBarLabel.textContent = nextLabel;
      lastBarLabel = nextLabel;
    }

    if (primaryEntry) {
      heightBarIndicator.style.display = "";

      const lowestY = Math.max(0, primaryEntry.centerY - primaryEntry.radius);
      const { fraction } = heightBarFor({ melonY: lowestY, heightM: topHeightM });

      if (
        primaryBarFraction === null ||
        fraction === 0 ||
        fraction === 1 ||
        Math.abs(fraction - primaryBarFraction) >= HEIGHT_BAR_FRACTION_EPSILON
      ) {
        heightBarIndicator.style.setProperty("--fraction", String(fraction));
        primaryBarFraction = fraction;
      }

      const color = hexToCssColor(fruitByKey(primaryEntry.fruitKey).skinColor);

      if (color !== primaryBarColor) {
        heightBarMarker.style.setProperty("--fruit-color", color);
        primaryBarColor = color;
      }
    } else {
      heightBarIndicator.style.display = "none";
      primaryBarFraction = null;
      primaryBarColor = null;
    }

    const seenExtraIds = new Set();

    for (let i = 1; i < entries.length; i += 1) {
      const entry = entries[i];

      seenExtraIds.add(entry.id);

      const lowestY = Math.max(0, entry.centerY - entry.radius);
      const { fraction } = heightBarFor({ melonY: lowestY, heightM: topHeightM });
      const slot = ensureHeightBarExtraSlot(entry.id);

      if (
        slot.lastFraction === null ||
        fraction === 0 ||
        fraction === 1 ||
        Math.abs(fraction - slot.lastFraction) >= HEIGHT_BAR_FRACTION_EPSILON
      ) {
        slot.indicator.style.setProperty("--fraction", String(fraction));
        slot.lastFraction = fraction;
      }

      const color = hexToCssColor(fruitByKey(entry.fruitKey).skinColor);

      if (color !== slot.lastColor) {
        slot.marker.style.setProperty("--fruit-color", color);
        slot.lastColor = color;
      }
    }

    for (const id of Array.from(heightBarExtraSlots.keys())) {
      if (!seenExtraIds.has(id)) releaseHeightBarExtraSlot(id);
    }

    layoutHeightBarNames(primaryBarFraction);
  }

  // --- Incoming markers: one per falling fruit (step 1b §11b Stage 3) ----
  // Visible while the fruit's lowest point is above the frame's top edge
  // (rules.js incomingFor). Same primary-always-mirrors-entries[0], extras-
  // pooled-by-id split as the height bar above, and for the same reason
  // (see the comment on primaryBarFraction).
  let primaryIncomingVisible = null;
  let primaryIncomingColor = null;
  let primaryIncomingLeft = null;
  const incomingExtraSlots = new Map(); // id -> { container, dot, lastVisible, lastColor, lastLeft }

  function ensureIncomingExtraSlot(id) {
    let slot = incomingExtraSlots.get(id);

    if (slot) return slot;

    const container = document.createElement("div");
    const arrow = document.createElement("span");
    const dot = document.createElement("span");

    container.className = "incoming-marker";
    container.setAttribute("aria-hidden", "true");
    arrow.className = "incoming-marker-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "▼";
    dot.className = "incoming-marker-dot";

    container.appendChild(arrow);
    container.appendChild(dot);
    incomingMarkersContainer.appendChild(container);

    slot = { container, dot, lastVisible: null, lastColor: null, lastLeft: null };
    incomingExtraSlots.set(id, slot);
    return slot;
  }

  function releaseIncomingExtraSlot(id) {
    const slot = incomingExtraSlots.get(id);

    if (!slot) return;

    slot.container.remove();
    incomingExtraSlots.delete(id);
  }

  function horizontalLeftPercent(entry) {
    if (!currentView) return 50;

    const projected = new THREE.Vector3(entry.x, entry.centerY, entry.z).project(camera);

    return Math.max(-25, Math.min(125, (projected.x * 0.5 + 0.5) * 100));
  }

  function updateIncomingMarker() {
    const entries = fallingFruitEntries();
    const primaryEntry = entries[0] ?? null;

    if (primaryEntry) {
      const visible = currentView
        ? incomingFor({ fruitY: primaryEntry.centerY, fruitRadius: primaryEntry.radius, view: currentView }).visible
        : false;

      if (visible !== primaryIncomingVisible) {
        incomingMarker.hidden = !visible;
        primaryIncomingVisible = visible;
      }

      if (visible) {
        const color = hexToCssColor(fruitByKey(primaryEntry.fruitKey).skinColor);

        if (color !== primaryIncomingColor) {
          incomingMarkerDot.style.setProperty("--fruit-color", color);
          primaryIncomingColor = color;
        }

        const left = entries.length === 1 ? 50 : horizontalLeftPercent(primaryEntry);

        if (primaryIncomingLeft === null || Math.abs(left - primaryIncomingLeft) >= 1) {
          incomingMarker.style.left = `${left}%`;
          primaryIncomingLeft = left;
        }
      }
    } else if (primaryIncomingVisible !== false) {
      incomingMarker.hidden = true;
      primaryIncomingVisible = false;
      primaryIncomingColor = null;
      primaryIncomingLeft = null;
    }

    const seenExtraIds = new Set();

    for (let i = 1; i < entries.length; i += 1) {
      const entry = entries[i];

      seenExtraIds.add(entry.id);

      const visible = currentView
        ? incomingFor({ fruitY: entry.centerY, fruitRadius: entry.radius, view: currentView }).visible
        : false;
      const slot = ensureIncomingExtraSlot(entry.id);

      if (visible !== slot.lastVisible) {
        slot.container.hidden = !visible;
        slot.lastVisible = visible;
      }

      if (!visible) continue;

      const color = hexToCssColor(fruitByKey(entry.fruitKey).skinColor);

      if (color !== slot.lastColor) {
        slot.dot.style.setProperty("--fruit-color", color);
        slot.lastColor = color;
      }

      const left = horizontalLeftPercent(entry);

      if (slot.lastLeft === null || Math.abs(left - slot.lastLeft) >= 1) {
        slot.container.style.left = `${left}%`;
        slot.lastLeft = left;
      }
    }

    for (const id of Array.from(incomingExtraSlots.keys())) {
      if (!seenExtraIds.has(id)) releaseIncomingExtraSlot(id);
    }
  }

  function updateDom() {
    updateFraming();
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

  // Step 1b §11b Stage 3: plays one splat per sim.consumeImpacts() event —
  // not "the first impact of the drop", since a batch can have several
  // impacts (and several breaks) landing across different frames.
  function processImpacts() {
    for (const impact of sim.consumeImpacts()) {
      if (soundEnabled) {
        playSplatSound(impact);
      }
    }
  }

  function frameLoop(now) {
    rafId = requestAnimationFrame(frameLoop);

    if (lastFrameTime === null) {
      lastFrameTime = now;
      return;
    }

    const delta = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    accumulator += delta;

    // Step regardless of sim.phase: sim.phase reaches "settled" at UI
    // settle (72 steps after the last impact), well before debris is done
    // physically moving (sim.step() itself keeps stepping real physics
    // until truly idle — asleep, or 480 steps since the last press; it is
    // a documented no-op only then, or in `ready`). Gating this loop on
    // "active" would freeze debris the instant the UI reads settled.
    const stepsBefore = sim.steps;
    let stepsAttempted = 0;

    while (accumulator >= FIXED_STEP && stepsAttempted < MAX_STEPS_PER_FRAME) {
      sim.step();
      accumulator -= FIXED_STEP;
      stepsAttempted += 1;
    }

    processImpacts();
    processRemovals();
    advancePops();
    syncSceneFromSim();
    updateDom();
    render();

    // Idle (not just "not attempted yet this frame"): we DID try to step
    // at least once, and the sim's own step count didn't move — its
    // no-op contract for `ready`/truly-idle. Stopping only on a genuine
    // no-op (rather than "phase !== active") avoids freezing debris that
    // is still physically settling after UI settle.
    const genuinelyIdle = stepsAttempted > 0 && sim.steps === stepsBefore;

    if (genuinelyIdle && poppingMeshes.size === 0) {
      stopLoop();
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
  // main.dataset.layoutHash is set once, when phase becomes settled (in
  // updateDom), and cleared here on every fresh Drop press, so a test can
  // never read a stale hash.
  function clearLayoutHash() {
    delete main.dataset.layoutHash;
  }

  // Step 1b §11b Stage 3 (spawn ruling v3, decision 1): a control change
  // NEVER clears the scene — fruit/height apply to the NEXT drop only.
  function applyFruitChange() {
    currentFruitKey = checkedFruitKey();
    updateReadouts();
    updateDom();
    render();
  }

  function applyHeightChange() {
    currentHeightSliderValue = Number.parseInt(heightSlider.value, 10);
    currentHeightM = heightFromSlider(currentHeightSliderValue);
    updateReadouts();
    updateDom();
    render();
  }

  fruitFieldset.addEventListener("change", (event) => {
    if (event.target && event.target.name === "fruit") applyFruitChange();
  });
  heightSlider.addEventListener("input", applyHeightChange);

  // Step 1b §11b Stage 3 (spawn ruling v3): Drop always works, instantly,
  // in every phase. Each `click` counts (a native <button> click event
  // fires for both a mouse/touch click and an Enter/Space keypress while
  // it's focused, so one listener covers all three) — see the keydown
  // listener below for the auto-repeat guard.
  dropButton.addEventListener("click", () => {
    // Autoplay rules (step 1b §10): create or resume the AudioContext only
    // here, inside the Drop click/key handler — never on page load, never
    // from the render loop where the sound actually plays later.
    ensureAudioContext();

    const seed = pinnedSeed !== null ? pinnedSeed + pressCount : nextDropSeed(null);

    pressCount += 1;
    clearLayoutHash();

    sim.drop({ fruit: currentFruitKey, heightM: currentHeightM, seed });

    // Removals from spawn-overlap clearing or rolling-window eviction can
    // happen synchronously inside drop(), before any step() — pop them
    // right away rather than waiting for the next animation frame.
    processRemovals();
    syncSceneFromSim();
    updateDom();
    render();
    startLoop();
  });

  // The auto-repeat guard: a native <button> already fires `click` for a
  // non-repeat Enter/Space keypress, so this listener's only job is to
  // preventDefault a REPEAT keydown (held key) before it can produce
  // another click. `event.repeat` is the only signal used — dropping this
  // guard is the mutation the held-Space Playwright test is meant to catch.
  dropButton.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " " || event.key === "Spacebar") && event.repeat) {
      event.preventDefault();
    }
  });

  skipButton.addEventListener("click", () => {
    if (sim.phase !== "active") return;

    stopLoop();

    let guard = 0;

    while (sim.phase === "active" && guard < 100000) {
      sim.step();
      guard += 1;
    }

    processImpacts();
    processRemovals();
    syncSceneFromSim();
    updateDom();
    render();

    // Skip jumps straight to UI settle (matching sim.phase), the same way
    // a normal fall does — debris can still be physically moving past that
    // point, so the loop resumes to keep animating it (see frameLoop's own
    // "genuinely idle" stop condition, not "phase !== active").
    startLoop();
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
    } else if (sim.phase !== "ready" || poppingMeshes.size > 0) {
      // Not just "active": debris can still be physically settling after
      // UI settle too (see frameLoop's "genuinely idle" stop condition).
      // The loop harmlessly self-stops within one frame if there is
      // nothing left to do.
      startLoop();
    }
  });

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  reducedMotionQuery.addEventListener("change", updateDom);

  function resizeRendererToDisplaySize() {
    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;

    renderer.setSize(width, height, false);
    applyImpactView(framingFruitKey);
    render();
  }

  window.addEventListener("resize", resizeRendererToDisplaySize);

  // --- initial paint -------------------------------------------------------
  renderHeightSliderTicks();
  updateSoundToggleUI();
  resizeRendererToDisplaySize();
  syncSceneFromSim();
  updateReadouts();
  updateDom();
  render();
}
