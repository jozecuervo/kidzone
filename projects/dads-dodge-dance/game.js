const stage = document.querySelector("#stage");
const dad = document.querySelector("#dad");
const dadChore = document.querySelector("#dad-chore");
const foreground = document.querySelector("#foreground");
const gopher = document.querySelector("#gopher");
const reticle = document.querySelector("#reticle");
const levelNumber = document.querySelector("#level-number");
const dadPointsNode = document.querySelector("#dad-points");
const dadLine = document.querySelector("#dad-line");
const taskName = document.querySelector("#task-name");
const levelList = document.querySelector("#level-list");
const tossButton = document.querySelector("#toss-button");
const reloadButton = document.querySelector("#reload-button");
const resetButton = document.querySelector("#reset-button");
const ammoCount = document.querySelector("#ammo-count");
const launcher = document.querySelector("#launcher");
const bucket = document.querySelector("#bucket");
const srStatus = document.querySelector("#sr-status");
const splashMeter = document.querySelector("#splash-meter");
const meterFill = document.querySelector("#meter-fill");
const meterSteps = document.querySelector("#meter-steps");
const meterCaption = document.querySelector("#meter-caption");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TOSS_DURATION = reduceMotion ? 120 : 420;
const MAX_BALLOONS = 4;
const BUCKET_SIZE = 10;
const MAX_FRAME_MS = 50;
const CROSS_RATE = 1.45;
const WANDER_RATE = 1.65;
const EVADE_RATE = 2.2;
const METER_STEPS = 6;
const RELOAD_MS = 1200;
const NORMAL_SPLASH_POINTS = 1;

const balloonColors = [
  { fill: "#1f9ee8", deep: "#0a6fb0", border: "rgba(10, 111, 176, 0.4)" },
  { fill: "#59c6ff", deep: "#2a8ec8", border: "rgba(42, 142, 200, 0.42)" },
  { fill: "#6ee7d4", deep: "#2f9e8a", border: "rgba(47, 158, 138, 0.42)" },
  { fill: "#8b9cff", deep: "#4f63c7", border: "rgba(79, 99, 199, 0.42)" },
  { fill: "#f59ee8", deep: "#b84da8", border: "rgba(184, 77, 168, 0.4)" },
  { fill: "#ffd166", deep: "#d4a12f", border: "rgba(212, 161, 47, 0.45)" },
  { fill: "#7dd3fc", deep: "#38a3d6", border: "rgba(56, 163, 214, 0.42)" }
];
const YARD_LEFT = 8;
const YARD_RIGHT = 92;
const YARD_Y = 52;
const CROSS_THRESHOLD = 2.8;

const foregroundScenes = {
  cooler: [
    { type: "bush", x: 24, y: 68, scale: 1.05, dadY: 54 },
    { type: "rock", x: 51, y: 71, scale: 1.1, dadY: 55 },
    { type: "bush", x: 78, y: 67, scale: 0.95, dadY: 53 }
  ],
  grill: [
    { type: "tree", x: 20, y: 65, scale: 0.92, dadY: 54 },
    { type: "bush", x: 48, y: 69, scale: 1.08, dadY: 55 },
    { type: "rock", x: 76, y: 70, scale: 1.05, dadY: 55 }
  ]
};

const levels = [
  {
    id: "mower",
    label: "Mow the lawn",
    timeOfDay: "bright",
    startLine: "I just need to mow this strip real quick!",
    crossLine: "Almost done mowing...",
    splashLine: "Hey, I'm still mowing!",
    winLine: "Okay okay, I'll finish inside!",
    fleeLine: "Fine, the lawn can wait!"
  },
  {
    id: "cooler",
    label: "Grab the cooler",
    timeOfDay: "morning",
    startLine: "The cooler is on the other side. Be right back!",
    crossLine: "Cooler run in progress...",
    splashLine: "That's chilly for a cooler trip!",
    winLine: "Alright, drinks can wait!",
    fleeLine: "I'm going inside before I melt!",
    peekaboo: true,
    foreground: foregroundScenes.cooler
  },
  {
    id: "poop",
    label: "Scoop the yard",
    timeOfDay: "afternoon",
    startLine: "Just scooping across the yard. Almost done!",
    crossLine: "Still scooping...",
    splashLine: "Not helping the scooping, kid!",
    winLine: "You win, I'll scoop later!",
    fleeLine: "Retreat! Chore postponed!"
  },
  {
    id: "grill",
    label: "Check the grill",
    timeOfDay: "golden",
    startLine: "Gotta check the grill on both sides!",
    crossLine: "Grill patrol continues...",
    splashLine: "Splashes are not grill tongs!",
    winLine: "Grill's safe, I'm heading in!",
    fleeLine: "Too wet to grill anyway!",
    peekaboo: true,
    foreground: foregroundScenes.grill
  },
  {
    id: "hose",
    label: "Water the flowers",
    timeOfDay: "sunset",
    startLine: "Flowers need water on the far side too!",
    crossLine: "Watering while crossing...",
    splashLine: "I'm already watering, thanks!",
    winLine: "Flowers are soaked enough!",
    fleeLine: "The hose can rest for today!"
  }
];

const dodgeSpots = [
  { x: 12, y: 50 },
  { x: 26, y: 57 },
  { x: 42, y: 46 },
  { x: 58, y: 55 },
  { x: 74, y: 48 },
  { x: 88, y: 56 }
];

const splashLines = [
  "Direct hit! Meter splashes up!",
  "Soaked! Dad hops back for a second.",
  "Big splash on the chore path!",
  "That one counted!",
  "Nice toss. Dad is dripping!"
];

const dodgeLines = [
  "Nice toss. Dad danced away!",
  "So close. Dad wiggled past it!",
  "Dad sidesteps and keeps his chore moving!",
  "He dodged back, but he's still heading out!"
];

/** Simple inline SVG props (Tabler-inspired lawn icons, embedded for static deploy). */
const choreSvg = {
  mower: `<svg class="chore-svg" viewBox="0 0 56 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="5" y="15" width="32" height="12" rx="2.5" fill="#7a8c96" stroke="#3f525c" stroke-width="1.4"/>
    <circle cx="13" cy="29" r="5.5" fill="#4a5c66" stroke="#2f3f48" stroke-width="1.3"/>
    <circle cx="33" cy="29" r="5.5" fill="#4a5c66" stroke="#2f3f48" stroke-width="1.3"/>
    <path d="M37 15h5v-2" stroke="#3f525c" stroke-width="1.4" fill="none"/>
    <path d="M40 4v13" stroke="#5b3a2d" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M40 4h8" stroke="#5b3a2d" stroke-width="2.6" stroke-linecap="round"/>
  </svg>`,
  cooler: `<svg class="chore-svg" viewBox="0 0 48 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="6" y="12" width="32" height="22" rx="3" fill="#4eb8f0" stroke="#1a7ab8" stroke-width="1.4"/>
    <rect x="6" y="8" width="32" height="6" rx="2" fill="#2f9fd4" stroke="#1a7ab8" stroke-width="1.4"/>
    <path d="M18 8V5a6 6 0 0 1 12 0v3" fill="none" stroke="#1a7ab8" stroke-width="2" stroke-linecap="round"/>
    <rect x="14" y="18" width="16" height="2" rx="1" fill="rgba(255,255,255,0.55)"/>
  </svg>`,
  poop: `<svg class="chore-svg" viewBox="0 0 52 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <rect x="28" y="12" width="16" height="22" rx="4" fill="#d4a82f" stroke="#9a7618" stroke-width="1.3"/>
    <path d="M30 18h12M30 22h12" stroke="#9a7618" stroke-width="1.1" stroke-linecap="round"/>
    <path d="M6 30h16" stroke="#6d4a38" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M8 30V14" stroke="#6d4a38" stroke-width="2" stroke-linecap="round"/>
    <path d="M8 14l10 8-10 8z" fill="#8d5d43" stroke="#6d4a38" stroke-width="1.2" stroke-linejoin="round"/>
  </svg>`,
  grill: `<svg class="chore-svg" viewBox="0 0 52 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <ellipse cx="26" cy="16" rx="18" ry="9" fill="#3a3a42" stroke="#222228" stroke-width="1.4"/>
    <ellipse cx="26" cy="14" rx="14" ry="6" fill="#4a4a54" stroke="#222228" stroke-width="1.2"/>
    <path d="M14 24v8M26 24v8M38 24v8" stroke="#222228" stroke-width="2.8" stroke-linecap="round"/>
    <path d="M12 32h28" stroke="#222228" stroke-width="2" stroke-linecap="round"/>
    <circle cx="26" cy="13" r="2" fill="#f26d50"/>
  </svg>`,
  hose: `<svg class="chore-svg" viewBox="0 0 56 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M6 26c10-8 18-8 28 0s18 8 28 0" fill="none" stroke="#2f9fd4" stroke-width="4" stroke-linecap="round"/>
    <path d="M6 26c10-6 18-6 28 0" fill="none" stroke="#59c6ff" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="2" y="22" width="10" height="8" rx="2" fill="#1a7ab8" stroke="#0e5a82" stroke-width="1.2"/>
    <path d="M48 22c4-6 8-10 8-16" fill="none" stroke="#2f9fd4" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M52 4c0 4-2 8-6 10" fill="none" stroke="#59c6ff" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2 3"/>
  </svg>`
};

const state = {
  aim: { x: 50, y: 55 },
  dad: { x: YARD_LEFT, y: YARD_Y },
  target: { x: YARD_LEFT, y: YARD_Y },
  levelIndex: 0,
  meter: 0,
  dadPoints: 0,
  ammo: BUCKET_SIZE,
  splashHits: 0,
  tosses: 0,
  inFlight: 0,
  goalSide: 1,
  yardLeg: 0,
  phase: "playing",
  evadeUntil: 0,
  lastMove: 0,
  lastFrame: 0,
  moveEvery: 1500,
  crossingCooldown: false,
  aiBias: 0.5,
  hideoutIndex: -1,
  peekUntil: 0
};

let runId = 0;
const runTimeouts = new Set();
const runAnimations = new Set();

function scheduleForRun(callback, delay) {
  const scheduledRun = runId;
  const timeout = window.setTimeout(() => {
    runTimeouts.delete(timeout);
    if (scheduledRun === runId) callback();
  }, delay);
  runTimeouts.add(timeout);
  return timeout;
}

function clearRunWork() {
  runId += 1;
  runTimeouts.forEach((timeout) => window.clearTimeout(timeout));
  runTimeouts.clear();
  runAnimations.forEach((animation) => animation.cancel());
  runAnimations.clear();
  stage.querySelectorAll(".balloon, .splash, .float-note").forEach((node) => node.remove());
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function currentLevel() {
  return levels[state.levelIndex % levels.length];
}

function goalX() {
  return state.goalSide > 0 ? YARD_RIGHT : YARD_LEFT;
}

function startX() {
  return state.goalSide > 0 ? YARD_LEFT : YARD_RIGHT;
}

function currentHideouts() {
  const level = currentLevel();
  return Array.isArray(level.foreground) ? level.foreground : [];
}

function isPeekabooLevel() {
  const level = currentLevel();
  return Boolean(level.peekaboo && currentHideouts().length);
}

function percentFromEvent(event) {
  const rect = stage.getBoundingClientRect();
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 6, 94),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 13, 84)
  };
}

function renderAim() {
  reticle.style.left = `${state.aim.x}%`;
  reticle.style.top = `${state.aim.y}%`;
}

function renderDad() {
  dad.style.setProperty("--dad-x", `${state.dad.x}%`);
  dad.style.setProperty("--dad-y", `${state.dad.y}%`);
  dad.dataset.facing = state.goalSide > 0 ? "right" : "left";
  const peeking = isPeekabooLevel() && state.phase === "playing" && performance.now() < state.peekUntil;
  dad.classList.toggle("is-hiding", isPeekabooLevel() && state.phase === "playing");
  dad.classList.toggle("is-peeking", peeking);
  updateYardLeg();
}

function updateYardLeg() {
  const start = startX();
  const end = goalX();
  const span = end - start;
  state.yardLeg = span === 0 ? 0 : clamp((state.dad.x - start) / span, 0, 1);
}

function renderDadPoints() {
  dadPointsNode.textContent = String(state.dadPoints);
}

function renderMeter() {
  const fillPercent = (state.meter / METER_STEPS) * 100;
  meterFill.style.width = `${fillPercent}%`;
  meterFill.style.setProperty("--meter-level", String(state.meter));
  splashMeter.setAttribute("aria-valuenow", String(state.meter));

  meterSteps.querySelectorAll(".meter-step").forEach((step, index) => {
    step.classList.toggle("is-filled", index < state.meter);
    step.classList.toggle("is-peak", index === METER_STEPS - 1 && state.meter >= METER_STEPS);
  });
}

function buildMeterSteps() {
  meterSteps.innerHTML = Array.from({ length: METER_STEPS }, (_, index) => {
    return `<span class="meter-step" data-step="${index + 1}"></span>`;
  }).join("");
}

function renderLevelPanel() {
  levelList.innerHTML = levels
    .map((level, index) => {
      const isDone = index < state.levelIndex;
      const isCurrent = index === state.levelIndex;
      const classes = [
        isDone ? "is-done" : "",
        isCurrent ? "is-current" : ""
      ].filter(Boolean).join(" ");
      let status = "later";

      if (isDone) {
        status = "done";
      } else if (isCurrent) {
        status = "now";
      }

      return `<li class="${classes}" data-level-id="${level.id}"><span>${level.label}</span><span class="status">${status}</span></li>`;
    })
    .join("");
}

function renderForegroundObjects(objects = []) {
  foreground.innerHTML = objects
    .map((object, index) => {
      const type = ["bush", "tree", "rock"].includes(object.type) ? object.type : "bush";
      const x = clamp(object.x ?? 50, 5, 95);
      const y = clamp(object.y ?? 68, 45, 84);
      const scale = clamp(object.scale ?? 1, 0.7, 1.35);

      return `<div class="foreground-object foreground-${type}" data-hideout="${index}" style="--fg-x: ${x}%; --fg-y: ${y}%; --fg-scale: ${scale};"><span></span></div>`;
    })
    .join("");
}

function renderAmmo() {
  ammoCount.textContent = String(state.ammo);
  bucket.dataset.level = String(Math.ceil(state.ammo / 4));
  launcher.classList.toggle("is-low", state.ammo > 0 && state.ammo <= 8);
  launcher.classList.toggle("is-empty", state.ammo <= 0);
}

function updateControls() {
  const needsReload = state.ammo <= 0 && state.phase === "playing";
  const isReloading = state.phase === "reloading";

  tossButton.hidden = needsReload || isReloading;
  reloadButton.hidden = !needsReload && !isReloading;
  reloadButton.disabled = isReloading;
  tossButton.disabled = isReloading || state.ammo <= 0;
  stage.dataset.phase = state.phase;
}

function pickBalloonColor() {
  return balloonColors[Math.floor(Math.random() * balloonColors.length)];
}

function styleBalloon(balloon) {
  const colors = pickBalloonColor();
  balloon.style.background = `
    radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.82) 0 0.24rem, transparent 0.25rem),
    ${colors.fill}`;
  balloon.style.borderColor = colors.border;
  balloon.style.setProperty("--balloon-deep", colors.deep);
}

function applyLevel(announce = true) {
  const level = currentLevel();
  levelNumber.textContent = String(state.levelIndex + 1);
  taskName.textContent = level.label;
  dad.dataset.chore = level.id;
  dadChore.className = "dad-chore";
  dadChore.innerHTML = choreSvg[level.id] || "";
  stage.dataset.time = level.timeOfDay || "bright";
  stage.classList.toggle("has-hideouts", isPeekabooLevel());
  renderForegroundObjects(level.foreground || []);

  if (announce) {
    dadLine.textContent = level.startLine;
    meterCaption.textContent = level.peekaboo
      ? "Catch Dad when he pops out from the yard hideouts."
      : "Soak Dad before he crosses the yard too many times.";
  }

  renderLevelPanel();
}

function reloadBucket() {
  if (state.phase !== "playing" || state.ammo > 0) {
    return;
  }

  state.phase = "reloading";
  updateControls();
  stage.classList.add("is-reloading");
  bucket.classList.add("is-refilling");
  dadLine.textContent = "Quick refill break...";
  announce("Reloading the water balloon bucket.");

  scheduleForRun(() => {
    state.ammo = BUCKET_SIZE;
    state.phase = "playing";
    stage.classList.remove("is-reloading");
    bucket.classList.remove("is-refilling");
    renderAmmo();
    updateControls();
    dadLine.textContent = currentLevel().startLine;
    announce(`Bucket full. ${BUCKET_SIZE} balloons ready.`);
  }, reduceMotion ? 450 : RELOAD_MS);
}

function announce(message) {
  srStatus.textContent = message;
}

function showFloat(text, x, y, tone = "") {
  const note = document.createElement("div");
  note.className = "float-note";
  if (tone) {
    note.classList.add(`is-${tone}`);
  }
  note.textContent = text;
  note.style.left = `${x}%`;
  note.style.top = `${y}%`;
  stage.append(note);
  scheduleForRun(() => note.remove(), 1000);
}

function triggerGopher() {
  const gopherX = clamp(state.dad.x + (state.dad.x < 50 ? 14 : -14), 13, 87);
  const gopherY = clamp(state.dad.y + 21, 67, 81);

  gopher.style.setProperty("--gopher-x", `${gopherX}%`);
  gopher.style.setProperty("--gopher-y", `${gopherY}%`);
  gopher.classList.remove("is-popping");
  void gopher.offsetWidth;
  gopher.classList.add("is-popping");
  showFloat("ha ha!", gopherX, Math.max(18, gopherY - 12), "gopher");
  scheduleForRun(() => gopher.classList.remove("is-popping"), 1300);
}

function makeSplash(x, y) {
  const splash = document.createElement("div");
  splash.className = "splash";
  splash.style.left = `${x}%`;
  splash.style.top = `${y}%`;

  for (let index = 0; index < 5; index += 1) {
    splash.append(document.createElement("span"));
  }

  stage.append(splash);
  scheduleForRun(() => splash.remove(), 760);
}

function randomSpot() {
  return dodgeSpots[Math.floor(Math.random() * dodgeSpots.length)];
}

function pickWanderTarget() {
  const spot = randomSpot();
  const wiggle = (Math.random() - 0.5) * 3;

  state.target = {
    x: clamp(state.dad.x + wiggle, YARD_LEFT, YARD_RIGHT),
    y: spot.y * 0.45 + YARD_Y * 0.55
  };
  state.moveEvery = 950 + Math.random() * 650;
}

function pickEvasiveTarget() {
  const retreat = 3 + Math.random() * 5;
  const lateral = dodgeSpots[Math.floor(Math.random() * dodgeSpots.length)];
  const backX = state.dad.x - state.goalSide * retreat;
  const minX = Math.min(startX(), goalX());
  const maxX = Math.max(startX(), goalX());

  state.target = {
    x: clamp(backX, minX, maxX),
    y: lateral.y
  };
  state.moveEvery = 650 + Math.random() * 400;
}

function pickPeekabooTarget() {
  const hideouts = currentHideouts();

  if (!hideouts.length) {
    pickWanderTarget();
    return;
  }

  state.hideoutIndex = (state.hideoutIndex + 1) % hideouts.length;
  const hideout = hideouts[state.hideoutIndex];

  state.target = {
    x: clamp(hideout.x, YARD_LEFT + 3, YARD_RIGHT - 3),
    y: clamp(hideout.dadY ?? hideout.y - 14, 45, 58)
  };
  state.peekUntil = performance.now() + (reduceMotion ? 320 : 850);
  state.moveEvery = 780 + Math.random() * 520;
}

function pickDadTarget(options = {}) {
  if (state.phase !== "playing") {
    return;
  }

  const forceEvade = options.evasive || performance.now() < state.evadeUntil;

  if (forceEvade) {
    pickEvasiveTarget();
    return;
  }

  if (isPeekabooLevel()) {
    pickPeekabooTarget();
    return;
  }

  pickWanderTarget();
}

function triggerEvade(duration = 480) {
  state.evadeUntil = performance.now() + duration;
  pickDadTarget({ evasive: true });
}

function meterJump() {
  dad.classList.remove("is-splashed");
  void dad.offsetWidth;
  dad.classList.add("is-meter-jump");
  scheduleForRun(() => dad.classList.remove("is-meter-jump"), 520);
}

function addMeter(amount = 1) {
  const previous = state.meter;
  state.meter = clamp(state.meter + amount, 0, METER_STEPS);
  renderMeter();

  if (state.meter > previous) {
    meterJump();
  }

  if (state.meter >= METER_STEPS) {
    scheduleForRun(() => beginVictory(), 420);
  }
}

function addDadPoint() {
  state.dadPoints += 1;
  renderDadPoints();
}

function completeCrossing() {
  if (state.phase !== "playing" || state.crossingCooldown) {
    return;
  }

  state.crossingCooldown = true;
  scheduleForRun(() => {
    state.crossingCooldown = false;
  }, 900);

  addDadPoint();
  state.goalSide *= -1;
  state.yardLeg = 0;
  state.aiBias = 0.55;
  state.dad.x = startX();
  state.dad.y = YARD_Y;

  const level = currentLevel();
  dadLine.textContent = level.crossLine;
  showFloat("+1 across", state.dad.x, state.dad.y - 18);
  announce(`Dad made it across. He has ${state.dadPoints} crossing point${state.dadPoints === 1 ? "" : "s"}.`);

  pickDadTarget();
}

function pointToStagePixels(point, stageRect) {
  return {
    x: (point.x / 100) * stageRect.width,
    y: (point.y / 100) * stageRect.height
  };
}

function rectToStage(rect, stageRect) {
  return {
    left: rect.left - stageRect.left,
    top: rect.top - stageRect.top,
    width: rect.width,
    height: rect.height
  };
}

function getDadHit(point) {
  const stageRect = stage.getBoundingClientRect();
  const dadRect = dad.getBoundingClientRect();
  const dadStageRect = rectToStage(dadRect, stageRect);
  const target = pointToStagePixels(point, stageRect);
  const dadCenter = {
    x: dadStageRect.left + dadStageRect.width / 2,
    y: dadStageRect.top + dadStageRect.height / 2
  };
  const distance = Math.hypot(target.x - dadCenter.x, target.y - dadCenter.y);
  const radius = Math.max(72, Math.min(stageRect.width, stageRect.height) * 0.21);

  if (distance <= radius) {
    return {
      zone: "splash-zone",
      points: NORMAL_SPLASH_POINTS,
      line: currentLevel().splashLine || splashLines[state.tosses % splashLines.length],
      floatText: "+1 splash",
      floatTone: "",
      floatX: state.dad.x,
      floatY: Math.max(16, state.dad.y - 26),
      announcement: null
    };
  }

  return null;
}

function handleSplash(point, hit) {
  state.splashHits += 1;
  addMeter(hit.points);
  if (state.splashHits % 3 === 0) {
    triggerGopher();
  }
  dad.classList.add("is-splashed");
  scheduleForRun(() => dad.classList.remove("is-splashed"), 520);

  triggerEvade(480);
  dadLine.textContent = hit.line;
  makeSplash(point.x, point.y);
  showFloat(hit.floatText, hit.floatX, hit.floatY, hit.floatTone);
  announce(`${hit.announcement || dadLine.textContent} Splash meter ${state.meter} of ${METER_STEPS}.`);
}

function handleDodge(point) {
  dadLine.textContent = dodgeLines[state.tosses % dodgeLines.length];
  makeSplash(point.x, point.y);
  showFloat("dodge", point.x, point.y);
  triggerEvade(620);
  announce(dadLine.textContent);
}

function beginVictory() {
  if (state.phase !== "playing") {
    return;
  }

  state.phase = "celebrate";
  updateControls();
  const level = currentLevel();
  dad.classList.remove("is-hiding", "is-peeking");
  dadLine.textContent = level.winLine;
  dad.classList.add("is-victory-dance");
  announce(level.winLine);

  scheduleForRun(() => {
    dad.classList.remove("is-victory-dance");
    dad.classList.add("is-fleeing");
    dadLine.textContent = level.fleeLine;
    state.target = { x: 108, y: YARD_Y - 6 };
    state.moveEvery = 400;

    scheduleForRun(() => advanceLevel(), reduceMotion ? 350 : 1400);
  }, reduceMotion ? 500 : 1100);
}

function advanceLevel() {
  clearRunWork();
  dad.classList.remove("is-fleeing");
  state.levelIndex = (state.levelIndex + 1) % levels.length;
  state.meter = 0;
  state.dadPoints = 0;
  state.ammo = BUCKET_SIZE;
  state.splashHits = 0;
  state.inFlight = 0;
  state.goalSide = 1;
  state.yardLeg = 0;
  state.phase = "playing";
  state.evadeUntil = 0;
  state.aiBias = 0.5;
  state.hideoutIndex = -1;
  state.peekUntil = 0;
  state.dad = { x: YARD_LEFT, y: YARD_Y };
  state.target = { x: YARD_LEFT, y: YARD_Y };

  renderMeter();
  renderDadPoints();
  renderAmmo();
  updateControls();
  applyLevel(true);
  renderDad();
  pickDadTarget();
  announce(`Level ${state.levelIndex + 1}: ${currentLevel().label}.`);
}

function tossBalloon(point = state.aim) {
  if (state.inFlight >= MAX_BALLOONS || state.phase !== "playing" || state.ammo <= 0) {
    if (state.ammo <= 0 && state.phase === "playing") {
      updateControls();
      announce(`Bucket empty. Reload to get ${BUCKET_SIZE} more balloons.`);
    }
    return;
  }

  state.inFlight += 1;
  state.tosses += 1;
  state.ammo -= 1;
  renderAmmo();
  updateControls();
  setAim(point);

  const balloon = document.createElement("div");
  balloon.className = "balloon";
  styleBalloon(balloon);
  balloon.style.left = "50%";
  balloon.style.top = "86%";
  stage.append(balloon);

  const startX = 50;
  const startY = 86;
  const midX = (startX + point.x) * 0.5;
  const arcLift = 24 + Math.abs(point.x - startX) * 0.18;
  const midY = clamp(Math.min(startY, point.y) - arcLift, 12, 78);
  // Snapshot hit geometry at launch so Dad moving during the arc cannot change the result.
  const aimedHit = getDadHit(point);

  const animation = balloon.animate(
    [
      {
        left: `${startX}%`,
        top: `${startY}%`,
        transform: "translate(-50%, -50%) scale(0.78)"
      },
      {
        left: `${midX}%`,
        top: `${midY}%`,
        transform: "translate(-50%, -50%) scale(1.06)"
      },
      {
        left: `${point.x}%`,
        top: `${point.y}%`,
        transform: "translate(-50%, -50%) scale(1.08)"
      }
    ],
    {
      duration: TOSS_DURATION,
      easing: "cubic-bezier(0.22, 0.05, 0.22, 1)"
    }
  );
  const tossRun = runId;
  runAnimations.add(animation);

  animation.finished
    .catch(() => {})
    .then(() => {
      runAnimations.delete(animation);
      if (tossRun !== runId) return;
      balloon.remove();

      const hit = aimedHit;

      if (hit) {
        handleSplash(point, hit);
      } else {
        handleDodge(point);
      }

      if (state.phase === "playing") {
        pickDadTarget();
      }

      state.inFlight -= 1;

      if (state.ammo <= 0 && state.phase === "playing") {
        dadLine.textContent = "Bucket's empty! Reload for more balloons.";
        announce("Out of balloons. Press Reload bucket.");
        updateControls();
      }
    });
}

function resetGame() {
  clearRunWork();
  state.aim = { x: 50, y: 55 };
  state.dad = { x: YARD_LEFT, y: YARD_Y };
  state.target = { x: YARD_LEFT, y: YARD_Y };
  state.levelIndex = 0;
  state.meter = 0;
  state.dadPoints = 0;
  state.ammo = BUCKET_SIZE;
  state.splashHits = 0;
  state.tosses = 0;
  state.inFlight = 0;
  state.goalSide = 1;
  state.yardLeg = 0;
  state.phase = "playing";
  state.evadeUntil = 0;
  state.aiBias = 0.5;
  state.crossingCooldown = false;
  state.lastMove = 0;
  state.lastFrame = 0;
  state.hideoutIndex = -1;
  state.peekUntil = 0;

  gopher.classList.remove("is-popping");
  stage.classList.remove("is-reloading");
  bucket.classList.remove("is-refilling");
  dad.classList.remove("is-victory-dance", "is-fleeing", "is-splashed", "is-meter-jump", "is-hiding", "is-peeking");
  renderMeter();
  renderDadPoints();
  renderAmmo();
  updateControls();
  applyLevel(true);
  renderAim();
  renderDad();
  pickDadTarget();
  announce("Game reset. Dad is crossing the yard again.");
}

function setAim(point) {
  state.aim = {
    x: clamp(point.x, 6, 94),
    y: clamp(point.y, 13, 84)
  };
  renderAim();
}

function moveAimBy(dx, dy) {
  setAim({
    x: state.aim.x + dx,
    y: state.aim.y + dy
  });
}

function checkCrossing() {
  if (state.phase !== "playing" || state.crossingCooldown) {
    return;
  }

  const end = goalX();
  if (Math.abs(state.dad.x - end) <= CROSS_THRESHOLD) {
    completeCrossing();
  }
}

stage.addEventListener("pointermove", (event) => {
  setAim(percentFromEvent(event));
});

stage.addEventListener("pointerdown", (event) => {
  if (event.target instanceof Element && event.target.closest("button")) {
    return;
  }

  event.preventDefault();
  stage.focus({ preventScroll: true });
  tossBalloon(percentFromEvent(event));
});

stage.addEventListener("keydown", (event) => {
  const step = event.shiftKey ? 8 : 4;

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveAimBy(-step, 0);
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    moveAimBy(step, 0);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveAimBy(0, -step);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    moveAimBy(0, step);
  } else if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    if (state.ammo <= 0 && state.phase === "playing") {
      reloadBucket();
    } else {
      tossBalloon();
    }
  }
});

tossButton.addEventListener("click", () => tossBalloon());
reloadButton.addEventListener("click", () => reloadBucket());
resetButton.addEventListener("click", resetGame);

function loop(time) {
  if (!state.lastMove) {
    state.lastMove = time;
  }
  const elapsedSeconds = Math.min(time - (state.lastFrame || time), MAX_FRAME_MS) / 1000;
  state.lastFrame = time;

  if (state.phase === "reloading") {
    window.requestAnimationFrame(loop);
    return;
  }

  if (state.phase === "playing") {
    if (time - state.lastMove > state.moveEvery) {
      pickDadTarget();
      state.lastMove = time;
    }

    const evading = performance.now() < state.evadeUntil;
    const goal = goalX();
    const wanderEase = 1 - Math.exp(-WANDER_RATE * elapsedSeconds);

    if (evading) {
      const evadeEase = 1 - Math.exp(-EVADE_RATE * elapsedSeconds);
      state.dad.x += (state.target.x - state.dad.x) * evadeEase;
      state.dad.y += (state.target.y - state.dad.y) * evadeEase;
    } else {
      const crossingRate = state.ammo <= 0 ? CROSS_RATE : CROSS_RATE * 1.2;
      const crossEase = 1 - Math.exp(-crossingRate * elapsedSeconds);
      state.dad.x += (goal - state.dad.x) * crossEase;
      state.dad.x += (state.target.x - state.dad.x) * (1 - Math.exp(-0.62 * elapsedSeconds));
      state.dad.y += (state.target.y - state.dad.y) * wanderEase;
    }
  } else {
    const ease = 1 - Math.exp(-(state.phase === "celebrate" ? 3.1 : 2.5) * elapsedSeconds);
    state.dad.x += (state.target.x - state.dad.x) * ease;
    state.dad.y += (state.target.y - state.dad.y) * ease;
  }

  renderDad();
  checkCrossing();

  window.requestAnimationFrame(loop);
}

buildMeterSteps();
renderMeter();
renderDadPoints();
renderAmmo();
updateControls();
applyLevel(false);
renderAim();
renderDad();
pickDadTarget();
window.requestAnimationFrame(loop);
