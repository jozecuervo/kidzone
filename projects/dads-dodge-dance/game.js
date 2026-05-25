const stage = document.querySelector("#stage");
const dad = document.querySelector("#dad");
const reticle = document.querySelector("#reticle");
const scoreNode = document.querySelector("#score");
const dadLine = document.querySelector("#dad-line");
const danceName = document.querySelector("#dance-name");
const danceList = document.querySelector("#dance-list");
const tossButton = document.querySelector("#toss-button");
const resetButton = document.querySelector("#reset-button");
const srStatus = document.querySelector("#sr-status");

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const TOSS_DURATION = reduceMotion ? 90 : 280;
const MAX_BALLOONS = 4;

const dances = [
  {
    id: "shuffle",
    label: "Side shuffle",
    unlockAt: 0,
    line: "Side shuffle is warmed up."
  },
  {
    id: "sprinkler",
    label: "Sprinkler step",
    unlockAt: 1,
    line: "Dad found the sprinkler step!"
  },
  {
    id: "moon",
    label: "Moon slide",
    unlockAt: 3,
    line: "The moon slide is ready!"
  },
  {
    id: "spin",
    label: "Star spin",
    unlockAt: 5,
    line: "Star spin time!"
  }
];

const danceSpots = [
  { x: 25, y: 57 },
  { x: 38, y: 49 },
  { x: 51, y: 54 },
  { x: 64, y: 48 },
  { x: 76, y: 56 }
];

const splashLines = [
  "Cool splash. Dad cheers!",
  "Good toss. Dad does a happy hop!",
  "Splashy dance move unlocked!",
  "Dad says that one was chilly!",
  "Backyard splash practice is working!"
];

const dodgeLines = [
  "Nice toss. Dad danced away!",
  "So close. Dad wiggled past it!",
  "Good practice toss!",
  "Dad ducked into another dance step."
];

const state = {
  aim: { x: 50, y: 55 },
  dad: { x: 50, y: 52 },
  target: { x: 50, y: 52 },
  score: 0,
  tosses: 0,
  danceIndex: 0,
  inFlight: 0,
  lastMove: 0,
  moveEvery: 1700
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
}

function unlockedDanceCount() {
  return dances.filter((dance) => state.score >= dance.unlockAt).length;
}

function currentUnlockedDanceIndex() {
  return Math.max(0, unlockedDanceCount() - 1);
}

function setDance(index, announce = false) {
  state.danceIndex = clamp(index, 0, dances.length - 1);
  const dance = dances[state.danceIndex];
  dad.dataset.dance = dance.id;
  danceName.textContent = dance.label;

  if (announce) {
    dadLine.textContent = dance.line;
  }

  renderDanceList();
}

function pulseDanceUnlock(index) {
  const item = danceList.querySelector(`[data-dance-id="${dances[index].id}"]`);
  if (!item) {
    return;
  }

  item.classList.add("is-unlocked-flash");
  window.setTimeout(() => item.classList.remove("is-unlocked-flash"), 1400);
}

function nextUnlockedDanceIndex() {
  const readyCount = unlockedDanceCount();
  if (readyCount <= 1) {
    return 0;
  }

  return (state.danceIndex + 1) % readyCount;
}

function renderDanceList() {
  const readyCount = unlockedDanceCount();
  danceList.innerHTML = dances
    .map((dance, index) => {
      const isReady = index < readyCount;
      const isCurrent = index === state.danceIndex;
      const classes = [
        isReady ? "is-ready" : "",
        isCurrent ? "is-current" : ""
      ].filter(Boolean).join(" ");
      let status = `${dance.unlockAt} splashes`;
      if (isReady && isCurrent) {
        status = "dancing";
      } else if (isReady) {
        status = "unlocked";
      }

      return `<li class="${classes}" data-dance-id="${dance.id}"><span>${dance.label}</span><span class="status">${status}</span></li>`;
    })
    .join("");
}

function setAim(point) {
  state.aim = {
    x: clamp(point.x, 6, 94),
    y: clamp(point.y, 13, 84)
  };
  renderAim();
}

function pickDadTarget() {
  const currentIndex = danceSpots.findIndex(
    (spot) => Math.abs(spot.x - state.target.x) < 1 && Math.abs(spot.y - state.target.y) < 1
  );
  let nextIndex = Math.floor(Math.random() * danceSpots.length);

  if (nextIndex === currentIndex) {
    nextIndex = (nextIndex + 2) % danceSpots.length;
  }

  state.target = danceSpots[nextIndex];
  state.moveEvery = 1450 + Math.random() * 900;
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
  state.score += 1;
  scoreNode.textContent = String(state.score);
  dad.classList.add("is-splashed");
  window.setTimeout(() => dad.classList.remove("is-splashed"), 620);

  const previousDance = state.danceIndex;
  const newDance = currentUnlockedDanceIndex();

  if (newDance > previousDance) {
    setDance(newDance, true);
    pulseDanceUnlock(newDance);
    showFloat("New dance!", state.dad.x, Math.max(16, state.dad.y - 28));
  } else {
    setDance(nextUnlockedDanceIndex());
    dadLine.textContent = splashLines[state.score % splashLines.length];
    showFloat("+1 splash", state.dad.x, Math.max(18, state.dad.y - 24));
  }

  makeSplash(point.x, point.y);
  announce(`${state.score} splashes. ${dadLine.textContent}`);
}

function handleDodge(point) {
  dadLine.textContent = dodgeLines[state.tosses % dodgeLines.length];
  makeSplash(point.x, point.y);
  showFloat("dance dodge", point.x, point.y);
  announce(dadLine.textContent);
}

function tossBalloon(point = state.aim) {
  if (state.inFlight >= MAX_BALLOONS) {
    return;
  }

  state.inFlight += 1;
  state.tosses += 1;
  setAim(point);

  const balloon = document.createElement("div");
  balloon.className = "balloon";
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

      pickDadTarget();
      state.inFlight -= 1;
    });
}

function resetGame() {
  state.aim = { x: 50, y: 55 };
  state.dad = { x: 50, y: 52 };
  state.target = { x: 50, y: 52 };
  state.score = 0;
  state.tosses = 0;
  state.inFlight = 0;
  scoreNode.textContent = "0";
  dadLine.textContent = "I'm ready for splash practice!";
  setDance(0);
  renderAim();
  renderDad();
  announce("Game reset. Dad is ready for splash practice.");
}

function moveAimBy(dx, dy) {
  setAim({
    x: state.aim.x + dx,
    y: state.aim.y + dy
  });
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
    tossBalloon();
  }
});

tossButton.addEventListener("click", () => tossBalloon());
resetButton.addEventListener("click", resetGame);

function loop(time) {
  if (!state.lastMove) {
    state.lastMove = time;
  }

  if (time - state.lastMove > state.moveEvery) {
    pickDadTarget();
    state.lastMove = time;
  }

  const ease = reduceMotion ? 0.035 : 0.022;
  state.dad.x += (state.target.x - state.dad.x) * ease;
  state.dad.y += (state.target.y - state.dad.y) * ease;
  renderDad();

  window.requestAnimationFrame(loop);
}

renderAim();
renderDad();
setDance(0);
pickDadTarget();
window.requestAnimationFrame(loop);
