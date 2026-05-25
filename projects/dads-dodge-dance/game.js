const stage = document.querySelector("#stage");
const dad = document.querySelector("#dad");
const dadChore = document.querySelector("#dad-chore");
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
const TOSS_DURATION = reduceMotion ? 90 : 280;
const MAX_BALLOONS = 4;
const BUCKET_SIZE = 35;
const METER_STEPS = 6;
const RELOAD_MS = 1200;

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
    fleeLine: "I'm going inside before I melt!"
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
    fleeLine: "Too wet to grill anyway!"
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

const state = {
  aim: { x: 50, y: 55 },
  dad: { x: YARD_LEFT, y: YARD_Y },
  target: { x: YARD_LEFT, y: YARD_Y },
  levelIndex: 0,
  meter: 0,
  dadPoints: 0,
  ammo: BUCKET_SIZE,
  tosses: 0,
  inFlight: 0,
  goalSide: 1,
  yardLeg: 0,
  phase: "playing",
  evadeUntil: 0,
  lastMove: 0,
  moveEvery: 1500,
  crossingCooldown: false,
  aiBias: 0.5
};

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

function renderAmmo() {
  ammoCount.textContent = String(state.ammo);
  bucket.dataset.level = String(Math.ceil(state.ammo / 12));
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
  dadChore.className = `dad-chore chore-${level.id}`;
  stage.dataset.time = level.timeOfDay || "bright";

  if (announce) {
    dadLine.textContent = level.startLine;
    meterCaption.textContent = `Soak Dad before he crosses the yard too many times.`;
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

  window.setTimeout(() => {
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

function showFloat(text, x, y) {
  const note = document.createElement("div");
  note.className = "float-note";
  note.textContent = text;
  note.style.left = `${x}%`;
  note.style.top = `${y}%`;
  stage.append(note);
  window.setTimeout(() => note.remove(), 1000);
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
  window.setTimeout(() => splash.remove(), 760);
}

function randomSpot() {
  return dodgeSpots[Math.floor(Math.random() * dodgeSpots.length)];
}

function pickEvasiveTarget() {
  const retreat = 10 + Math.random() * 14;
  const lateral = dodgeSpots[Math.floor(Math.random() * dodgeSpots.length)];
  state.target = {
    x: clamp(state.dad.x - state.goalSide * retreat, YARD_LEFT, YARD_RIGHT),
    y: lateral.y
  };
  state.moveEvery = 780 + Math.random() * 520;
  state.aiBias = Math.max(0.35, state.aiBias - 0.08);
}

function pickForwardTarget() {
  const spot = randomSpot();
  const forwardPush = 5 + Math.random() * 16 + state.yardLeg * 8;
  const forwardX = state.dad.x + state.goalSide * forwardPush;
  const blendedX = forwardX * 0.72 + spot.x * 0.28;

  state.target = {
    x: clamp(blendedX, YARD_LEFT, YARD_RIGHT),
    y: spot.y * 0.35 + YARD_Y * 0.65
  };
  state.moveEvery = 1200 + Math.random() * 900;
  state.aiBias = Math.min(0.85, state.aiBias + 0.04);
}

function pickDadTarget(options = {}) {
  if (state.phase !== "playing") {
    return;
  }

  const forceEvade = options.evasive || performance.now() < state.evadeUntil;
  const forceForward = options.towardGoal;

  if (forceEvade) {
    pickEvasiveTarget();
    return;
  }

  const forwardChance = forceForward
    ? 0.92
    : 0.42 + state.yardLeg * 0.35 + state.aiBias * 0.2;

  if (Math.random() < forwardChance) {
    pickForwardTarget();
  } else {
    pickEvasiveTarget();
    state.evadeUntil = performance.now() + 500;
  }
}

function triggerEvade(duration = 1100) {
  state.evadeUntil = performance.now() + duration;
  pickDadTarget({ evasive: true });
}

function meterJump() {
  dad.classList.remove("is-splashed");
  void dad.offsetWidth;
  dad.classList.add("is-meter-jump");
  window.setTimeout(() => dad.classList.remove("is-meter-jump"), 520);
}

function addMeter(amount = 1) {
  const previous = state.meter;
  state.meter = clamp(state.meter + amount, 0, METER_STEPS);
  renderMeter();

  if (state.meter > previous) {
    meterJump();
  }

  if (state.meter >= METER_STEPS) {
    window.setTimeout(() => beginVictory(), 420);
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
  window.setTimeout(() => {
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

  pickDadTarget({ towardGoal: true });
}

function isSplash(point) {
  const stageRect = stage.getBoundingClientRect();
  const dadRect = dad.getBoundingClientRect();
  const dadCenter = {
    x: dadRect.left + dadRect.width / 2 - stageRect.left,
    y: dadRect.top + dadRect.height / 2 - stageRect.top
  };
  const target = {
    x: (point.x / 100) * stageRect.width,
    y: (point.y / 100) * stageRect.height
  };
  const distance = Math.hypot(target.x - dadCenter.x, target.y - dadCenter.y);
  const radius = Math.max(72, Math.min(stageRect.width, stageRect.height) * 0.21);

  return distance <= radius;
}

function handleSplash(point) {
  const level = currentLevel();
  addMeter(1);
  dad.classList.add("is-splashed");
  window.setTimeout(() => dad.classList.remove("is-splashed"), 520);

  triggerEvade(850);
  dadLine.textContent = level.splashLine || splashLines[state.tosses % splashLines.length];
  makeSplash(point.x, point.y);
  showFloat("+1 splash", state.dad.x, Math.max(16, state.dad.y - 26));
  announce(`Splash meter ${state.meter} of ${METER_STEPS}. ${dadLine.textContent}`);
}

function handleDodge(point) {
  dadLine.textContent = dodgeLines[state.tosses % dodgeLines.length];
  makeSplash(point.x, point.y);
  showFloat("dodge", point.x, point.y);
  triggerEvade(1300);
  announce(dadLine.textContent);
}

function beginVictory() {
  if (state.phase !== "playing") {
    return;
  }

  state.phase = "celebrate";
  const level = currentLevel();
  dadLine.textContent = level.winLine;
  dad.classList.add("is-victory-dance");
  announce(level.winLine);

  window.setTimeout(() => {
    dad.classList.remove("is-victory-dance");
    dad.classList.add("is-fleeing");
    dadLine.textContent = level.fleeLine;
    state.target = { x: 108, y: YARD_Y - 6 };
    state.moveEvery = 400;

    window.setTimeout(() => advanceLevel(), reduceMotion ? 700 : 1400);
  }, reduceMotion ? 500 : 1100);
}

function advanceLevel() {
  dad.classList.remove("is-fleeing");
  state.levelIndex = (state.levelIndex + 1) % levels.length;
  state.meter = 0;
  state.dadPoints = 0;
  state.ammo = BUCKET_SIZE;
  state.goalSide = 1;
  state.yardLeg = 0;
  state.phase = "playing";
  state.evadeUntil = 0;
  state.aiBias = 0.5;
  state.dad = { x: YARD_LEFT, y: YARD_Y };
  state.target = { x: YARD_LEFT, y: YARD_Y };

  renderMeter();
  renderDadPoints();
  renderAmmo();
  updateControls();
  applyLevel(true);
  renderDad();
  pickDadTarget({ towardGoal: true });
  announce(`Level ${state.levelIndex + 1}: ${currentLevel().label}.`);
}

function tossBalloon(point = state.aim) {
  if (state.inFlight >= MAX_BALLOONS || state.phase !== "playing" || state.ammo <= 0) {
    if (state.ammo <= 0 && state.phase === "playing") {
      updateControls();
      announce("Bucket empty. Reload to get 35 more balloons.");
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

  const animation = balloon.animate(
    [
      {
        left: "50%",
        top: "86%",
        transform: "translate(-50%, -50%) scale(0.82)"
      },
      {
        left: `${point.x}%`,
        top: `${point.y}%`,
        transform: "translate(-50%, -50%) scale(1.08)"
      }
    ],
    {
      duration: TOSS_DURATION,
      easing: "cubic-bezier(0.18, 0.75, 0.2, 1)"
    }
  );

  animation.finished
    .catch(() => {})
    .then(() => {
      balloon.remove();

      if (isSplash(point)) {
        handleSplash(point);
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
  state.aim = { x: 50, y: 55 };
  state.dad = { x: YARD_LEFT, y: YARD_Y };
  state.target = { x: YARD_LEFT, y: YARD_Y };
  state.levelIndex = 0;
  state.meter = 0;
  state.dadPoints = 0;
  state.ammo = BUCKET_SIZE;
  state.tosses = 0;
  state.inFlight = 0;
  state.goalSide = 1;
  state.yardLeg = 0;
  state.phase = "playing";
  state.evadeUntil = 0;
  state.aiBias = 0.5;
  state.crossingCooldown = false;
  state.lastMove = 0;

  dad.classList.remove("is-victory-dance", "is-fleeing", "is-splashed", "is-meter-jump");
  renderMeter();
  renderDadPoints();
  renderAmmo();
  updateControls();
  applyLevel(true);
  renderAim();
  renderDad();
  pickDadTarget({ towardGoal: true });
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

  if (state.phase === "playing" && time - state.lastMove > state.moveEvery) {
    pickDadTarget();
    state.lastMove = time;
  }

  if (state.phase === "reloading") {
    window.requestAnimationFrame(loop);
    return;
  }

  const ease = state.phase === "celebrate"
    ? 0.05
    : reduceMotion
      ? 0.04
      : performance.now() < state.evadeUntil
        ? 0.038
        : 0.024;

  state.dad.x += (state.target.x - state.dad.x) * ease;
  state.dad.y += (state.target.y - state.dad.y) * ease;
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
pickDadTarget({ towardGoal: true });
window.requestAnimationFrame(loop);
