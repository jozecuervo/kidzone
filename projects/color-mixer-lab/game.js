const paints = [
  {
    id: "red",
    name: "Red",
    rgb: [217, 57, 46],
    text: "#ffffff"
  },
  {
    id: "yellow",
    name: "Yellow",
    rgb: [251, 211, 68],
    text: "#2b2200"
  },
  {
    id: "blue",
    name: "Blue",
    rgb: [37, 96, 180],
    text: "#ffffff"
  },
  {
    id: "white",
    name: "White",
    rgb: [255, 252, 239],
    text: "#1c2430"
  },
  {
    id: "brown",
    name: "Brown",
    rgb: [123, 74, 46],
    text: "#ffffff"
  }
];

const paintById = Object.fromEntries(paints.map((paint) => [paint.id, paint]));

const levels = [
  {
    name: "Light Gold",
    recipe: { yellow: 4, white: 2, brown: 1 }
  },
  {
    name: "Pumpkin Orange",
    recipe: { red: 2, yellow: 3, brown: 1 }
  },
  {
    name: "Dusty Rose",
    recipe: { red: 2, white: 4, brown: 1 }
  },
  {
    name: "River Stone",
    recipe: { yellow: 2, blue: 2, white: 3, brown: 1 }
  },
  {
    name: "Twilight Mauve",
    recipe: { red: 2, blue: 3, white: 3, brown: 1 }
  }
].map((level) => ({
  ...level,
  target: mixRecipe(level.recipe)
}));

const matchTolerance = 24;

const state = {
  levelIndex: 0,
  counts: emptyCounts(),
  history: [],
  locked: false
};

const elements = {
  levelNumber: document.querySelector("#level-number"),
  targetName: document.querySelector("#target-name"),
  targetSwatch: document.querySelector("#target-swatch"),
  mixName: document.querySelector("#mix-name"),
  mixSwatch: document.querySelector("#mix-swatch"),
  palette: document.querySelector("#palette"),
  dropTotal: document.querySelector("#drop-total"),
  dropRow: document.querySelector("#drop-row"),
  undoButton: document.querySelector("#undo-button"),
  resetButton: document.querySelector("#reset-button"),
  checkButton: document.querySelector("#check-button"),
  feedback: document.querySelector("#feedback"),
  completePanel: document.querySelector("#complete-panel"),
  playAgainButton: document.querySelector("#play-again-button")
};

function emptyCounts() {
  return Object.fromEntries(paints.map((paint) => [paint.id, 0]));
}

function mixRecipe(recipe) {
  const totals = [0, 0, 0];
  let count = 0;

  for (const [id, amount] of Object.entries(recipe)) {
    const paint = paintById?.[id] ?? paints.find((item) => item.id === id);

    if (!paint) {
      continue;
    }

    totals[0] += paint.rgb[0] * amount;
    totals[1] += paint.rgb[1] * amount;
    totals[2] += paint.rgb[2] * amount;
    count += amount;
  }

  if (count === 0) {
    return [255, 255, 255];
  }

  return totals.map((value) => Math.round(value / count));
}

function rgbToCss(rgb) {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function totalDrops() {
  return Object.values(state.counts).reduce((sum, count) => sum + count, 0);
}

function colorDistance(first, second) {
  return Math.hypot(
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2]
  );
}

function renderPalette() {
  elements.palette.innerHTML = "";

  paints.forEach((paint) => {
    const control = document.createElement("article");
    control.className = "paint-control";

    const name = document.createElement("div");
    name.className = "paint-name";

    const dot = document.createElement("span");
    dot.className = "paint-dot";
    dot.style.setProperty("--paint-color", rgbToCss(paint.rgb));

    const label = document.createElement("span");
    label.textContent = paint.name;

    name.append(dot, label);

    const count = document.createElement("div");
    count.className = "paint-count";
    count.id = `${paint.id}-count`;
    count.textContent = "0";

    const buttons = document.createElement("div");
    buttons.className = "paint-buttons";

    const remove = document.createElement("button");
    remove.className = "remove-button";
    remove.type = "button";
    remove.textContent = "-";
    remove.dataset.action = "remove";
    remove.dataset.paintId = paint.id;
    remove.setAttribute("aria-label", `Remove ${paint.name}`);
    remove.addEventListener("click", () => removePaint(paint.id));

    const add = document.createElement("button");
    add.className = "add-button";
    add.type = "button";
    add.textContent = "+";
    add.dataset.action = "add";
    add.dataset.paintId = paint.id;
    add.setAttribute("aria-label", `Add ${paint.name}`);
    add.style.setProperty("--paint-color", rgbToCss(paint.rgb));
    add.style.setProperty("--button-ink", paint.text);
    add.addEventListener("click", () => addPaint(paint.id));

    buttons.append(remove, add);
    control.append(name, count, buttons);
    elements.palette.append(control);
  });
}

function renderLevel() {
  const level = levels[state.levelIndex];
  elements.levelNumber.textContent = String(state.levelIndex + 1);
  elements.targetName.textContent = level.name;
  elements.targetSwatch.style.setProperty("--swatch-color", rgbToCss(level.target));
  elements.feedback.textContent = `Level ${state.levelIndex + 1} is ready.`;
  elements.feedback.className = "feedback";
  elements.completePanel.hidden = true;
  renderMix();
}

function renderMix() {
  const drops = totalDrops();
  elements.dropTotal.textContent = String(drops);
  elements.dropRow.innerHTML = "";

  paints.forEach((paint) => {
    const countElement = document.querySelector(`#${paint.id}-count`);
    countElement.textContent = String(state.counts[paint.id]);
  });

  if (drops === 0) {
    elements.mixName.textContent = "Empty cup";
    elements.mixSwatch.classList.add("empty");
    elements.mixSwatch.style.removeProperty("--swatch-color");

    const empty = document.createElement("span");
    empty.className = "drop-empty";
    empty.textContent = "No drops yet";
    elements.dropRow.append(empty);
  } else {
    const mixed = mixRecipe(state.counts);
    elements.mixName.textContent = "Mixed paint";
    elements.mixSwatch.classList.remove("empty");
    elements.mixSwatch.style.setProperty("--swatch-color", rgbToCss(mixed));

    state.history.forEach((id) => {
      const chip = document.createElement("span");
      chip.className = "drop-chip";
      chip.style.setProperty("--paint-color", rgbToCss(paintById[id].rgb));
      chip.setAttribute("aria-label", paintById[id].name);
      elements.dropRow.append(chip);
    });
  }

  elements.undoButton.disabled = state.locked || state.history.length === 0;
  elements.resetButton.disabled = state.locked || drops === 0;
  elements.checkButton.disabled = state.locked;

  elements.palette.querySelectorAll("button").forEach((button) => {
    const isEmptyRemove =
      button.dataset.action === "remove" &&
      state.counts[button.dataset.paintId] === 0;

    button.disabled = state.locked || isEmptyRemove;
  });
}

function addPaint(id) {
  if (state.locked) {
    return;
  }

  state.counts[id] += 1;
  state.history.push(id);
  elements.feedback.textContent = `${paintById[id].name} added.`;
  elements.feedback.className = "feedback";
  renderMix();
}

function removePaint(id) {
  if (state.locked || state.counts[id] === 0) {
    return;
  }

  state.counts[id] -= 1;
  const lastIndex = state.history.lastIndexOf(id);

  if (lastIndex >= 0) {
    state.history.splice(lastIndex, 1);
  }

  elements.feedback.textContent = `${paintById[id].name} removed.`;
  elements.feedback.className = "feedback";
  renderMix();
}

function undoDrop() {
  if (state.locked || state.history.length === 0) {
    return;
  }

  const id = state.history.pop();
  state.counts[id] -= 1;
  elements.feedback.textContent = `${paintById[id].name} undone.`;
  elements.feedback.className = "feedback";
  renderMix();
}

function resetMix(message = `Level ${state.levelIndex + 1} is ready.`) {
  state.counts = emptyCounts();
  state.history = [];
  elements.feedback.textContent = message;
  elements.feedback.className = "feedback";
  renderMix();
}

function checkMix() {
  if (state.locked) {
    return;
  }

  if (totalDrops() === 0) {
    elements.feedback.textContent = "Add at least one color first.";
    elements.feedback.className = "feedback retry";
    return;
  }

  const level = levels[state.levelIndex];
  const mixed = mixRecipe(state.counts);
  const distance = colorDistance(mixed, level.target);

  if (distance <= matchTolerance) {
    handleCorrect();
  } else {
    handleRetry(level.target, mixed);
  }
}

function handleCorrect() {
  state.locked = true;
  elements.feedback.textContent = "Great match. Moving to the next level.";
  elements.feedback.className = "feedback correct";
  renderMix();

  window.setTimeout(() => {
    if (state.levelIndex === levels.length - 1) {
      finishGame();
      return;
    }

    state.levelIndex += 1;
    state.locked = false;
    state.counts = emptyCounts();
    state.history = [];
    renderLevel();
  }, 950);
}

function handleRetry(target, mixed) {
  state.locked = true;
  const hint = colorHint(target, mixed);
  elements.feedback.textContent = `Not quite. Try this level again${hint}`;
  elements.feedback.className = "feedback retry";
  renderMix();

  window.setTimeout(() => {
    state.locked = false;
    resetMix(`Level ${state.levelIndex + 1} is ready.`);
  }, 1400);
}

function colorHint(target, mixed) {
  const brightness = (rgb) => rgb[0] + rgb[1] + rgb[2];
  const brightDiff = brightness(target) - brightness(mixed);

  if (Math.abs(brightDiff) > 70) {
    return brightDiff > 0 ? ". The target is lighter." : ". The target is darker.";
  }

  const redDiff = target[0] - mixed[0];
  const blueDiff = target[2] - mixed[2];

  if (Math.abs(redDiff) > 35 && Math.abs(blueDiff) > 35) {
    return redDiff > blueDiff ? ". The target is warmer." : ". The target is cooler.";
  }

  return ".";
}

function finishGame() {
  state.locked = true;
  elements.completePanel.hidden = false;
  elements.feedback.textContent = "Lab complete.";
  elements.feedback.className = "feedback correct";
  renderMix();
  elements.completePanel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function playAgain() {
  state.levelIndex = 0;
  state.locked = false;
  state.counts = emptyCounts();
  state.history = [];
  renderLevel();
}

renderPalette();
renderLevel();

elements.undoButton.addEventListener("click", undoDrop);
elements.resetButton.addEventListener("click", () => resetMix());
elements.checkButton.addEventListener("click", checkMix);
elements.playAgainButton.addEventListener("click", playAgain);
