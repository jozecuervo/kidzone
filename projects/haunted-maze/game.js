const DIRECTIONS = [
  { name: "north", dr: -1, dc: 0, label: "north" },
  { name: "east", dr: 0, dc: 1, label: "east" },
  { name: "south", dr: 1, dc: 0, label: "south" },
  { name: "west", dr: 0, dc: -1, label: "west" },
];

const MONSTERS = [
  {
    type: "vampire",
    emoji: "🧛",
    title: "Vampire swoop!",
    message: "A cape swishes out of the dark. Try another path.",
  },
  {
    type: "witch",
    emoji: "🧙‍♀️",
    title: "Witch cackle!",
    message: "A broom zooms past with a cackle. Keep exploring.",
  },
  {
    type: "werewolf",
    emoji: "🐺",
    title: "Werewolf leap!",
    message: "A moonlit werewolf jumps out, then waves you onward.",
  },
  {
    type: "zombie",
    emoji: "🧟",
    title: "Zombie shuffle!",
    message: "A goofy zombie stumbles into view. Pick a new way.",
  },
];

const LEVELS = [
  {
    theme: "Pumpkin Gate Path",
    decorClass: "theme-pumpkins",
    rows: [
      "#######",
      "#S....#",
      "#.###.#",
      "#.K.D.#",
      "#.###.#",
      "#.G..E#",
      "#######",
    ],
  },
  {
    theme: "Moonlit Graveyard",
    decorClass: "theme-graveyard",
    rows: [
      "#########",
      "#S......#",
      "#.#####.#",
      "#.#D..#.#",
      "#.#.#K#.#",
      "#.G.#...#",
      "###.#.###",
      "#...#..E#",
      "#########",
    ],
  },
  {
    theme: "Witch Garden",
    decorClass: "theme-garden",
    rows: [
      "###########",
      "#S........#",
      "#.#######.#",
      "#.#.....#.#",
      "#.#.###.#.#",
      "#.#.#.#.#.#",
      "#...#D#...#",
      "###.#.#.###",
      "#...#G#.K.#",
      "#.###.###.#",
      "#.....E...#",
      "###########",
    ],
  },
  {
    theme: "Haunted Forest",
    decorClass: "theme-forest",
    rows: [
      "#############",
      "#S....#.....#",
      "###.#.#.###.#",
      "#...#.#...#.#",
      "#.###.###.#.#",
      "#...#.D...#.#",
      "#.#.#######.#",
      "#.#.......#.#",
      "#.#######.#K#",
      "#..G....#...#",
      "#######.###.#",
      "#..........E#",
      "#############",
    ],
  },
  {
    theme: "Vampire Castle Gate",
    decorClass: "theme-castle",
    rows: [
      "###############",
      "#S..#.#.......#",
      "###.#.#.#####.#",
      "#...#...#.....#",
      "#.#######.###.#",
      "#...#.....#.#.#",
      "###.#.#####.#.#",
      "#D#...#.....#.#",
      "#.#####.###.#.#",
      "#.G.#.#...#...#",
      "#.#.#.###.#####",
      "#.#...#...#...#",
      "#.###.#.###.#.#",
      "#.#...#.#...#.#",
      "#.#####.#.###.#",
      "#.........#K.E#",
      "###############",
    ],
  },
];

const GUIDE_LABELS = {
  forward: "go forward",
  left: "turn left",
  right: "turn right",
  back: "go back",
};

const VIEW_SIZE = 7;
const VIEW_RADIUS = Math.floor(VIEW_SIZE / 2);
const FOOTPRINT_REVEAL_DISTANCE = 16;
const LIGHT_STEP = 7;
const REWARD_IMAGES = {
  gold: {
    src: "./assets/pirate-booty.svg",
    alt: "A treasure chest full of pirate gold.",
  },
  key: {
    src: "./assets/hidden-key.svg",
    alt: "A glowing hidden key.",
  },
};

const ui = {
  levelNumber: document.getElementById("level-number"),
  levelTheme: document.getElementById("level-theme"),
  statusLine: document.getElementById("status-line"),
  hintLine: document.getElementById("hint-line"),
  mazeView: document.getElementById("maze-view"),
  mazeGrid: document.getElementById("maze-grid"),
  footprints: document.getElementById("footprints"),
  keyStatus: document.getElementById("key-status"),
  goldStatus: document.getElementById("gold-status"),
  searchLight: document.getElementById("search-light"),
  scareOverlay: document.getElementById("scare-overlay"),
  scareEmoji: document.getElementById("scare-emoji"),
  scareTitle: document.getElementById("scare-title"),
  scareMessage: document.getElementById("scare-message"),
  scareDismiss: document.getElementById("scare-dismiss"),
  rewardOverlay: document.getElementById("reward-overlay"),
  rewardPicture: document.getElementById("reward-picture"),
  rewardTitle: document.getElementById("reward-title"),
  rewardMessage: document.getElementById("reward-message"),
  rewardDismiss: document.getElementById("reward-dismiss"),
  winOverlay: document.getElementById("win-overlay"),
  winMessage: document.getElementById("win-message"),
  nextLevelBtn: document.getElementById("next-level-btn"),
  completeOverlay: document.getElementById("complete-overlay"),
  playAgainBtn: document.getElementById("play-again-btn"),
};

const state = {
  levelIndex: 0,
  grid: [],
  solutionPath: [],
  position: { r: 0, c: 0 },
  darkSpots: [],
  goldSpots: [],
  hasKey: false,
  goldCoins: 0,
  facing: 1,
  light: { x: 50, y: 64 },
  blocked: false,
};

function parseMaze(rows) {
  const grid = rows.map((row) => [...row]);
  let start = null;
  let exit = null;
  const darkSpots = [];
  const goldSpots = [];

  for (let r = 0; r < grid.length; r += 1) {
    for (let c = 0; c < grid[r].length; c += 1) {
      const cell = grid[r][c];
      if (cell === "S") {
        start = { r, c };
        grid[r][c] = ".";
      } else if (cell === "E") {
        exit = { r, c };
        grid[r][c] = ".";
      } else if (cell === "K") {
        darkSpots.push({ r, c, type: "key" });
        grid[r][c] = ".";
      } else if (cell === "D") {
        darkSpots.push({ r, c, type: "monster" });
        grid[r][c] = ".";
      } else if (cell === "G") {
        goldSpots.push({ r, c });
        grid[r][c] = ".";
      }
    }
  }

  return { grid, start, exit, darkSpots, goldSpots };
}

function isOpen(grid, r, c) {
  return grid[r]?.[c] === ".";
}

function cellKey(r, c) {
  return `${r},${c}`;
}

function findPath(grid, start, exit) {
  const queue = [{ ...start, path: [start] }];
  const visited = new Set([cellKey(start.r, start.c)]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.r === exit.r && current.c === exit.c) {
      return current.path;
    }

    for (const direction of DIRECTIONS) {
      const nr = current.r + direction.dr;
      const nc = current.c + direction.dc;
      const key = cellKey(nr, nc);

      if (!isOpen(grid, nr, nc) || visited.has(key)) {
        continue;
      }

      visited.add(key);
      queue.push({
        r: nr,
        c: nc,
        path: [...current.path, { r: nr, c: nc }],
      });
    }
  }

  return [];
}

function nextPathStep() {
  const route = findPath(state.grid, state.position, state.exit);

  if (route.length < 2) {
    return null;
  }

  return route[1];
}

function directionIndexBetween(from, to) {
  for (let i = 0; i < DIRECTIONS.length; i += 1) {
    const direction = DIRECTIONS[i];
    if (from.r + direction.dr === to.r && from.c + direction.dc === to.c) {
      return i;
    }
  }

  return null;
}

function darkSpotAt(position) {
  return state.darkSpots.find((spot) =>
    !spot.resolved &&
    spot.r === position.r &&
    spot.c === position.c
  ) ?? null;
}

function goldSpotAt(position) {
  return state.goldSpots.find((spot) =>
    !spot.collected &&
    spot.r === position.r &&
    spot.c === position.c
  ) ?? null;
}

function monsterForType(type) {
  return MONSTERS.find((monster) => monster.type === type) ?? MONSTERS[0];
}

function applyMove(target) {
  const expectedStep = nextPathStep();
  const onPath = expectedStep && target.r === expectedStep.r && target.c === expectedStep.c;
  const directionIndex = directionIndexBetween(state.position, target);

  state.position = target;
  if (directionIndex !== null) {
    state.facing = directionIndex;
  }

  if (target.r === state.exit.r && target.c === state.exit.c) {
    ui.hintLine.classList.add("hidden");
    clearHintPulse();

    if (state.hasKey) {
      finishLevel();
      return;
    }

    updateSceneView();
    showLockedDoorMessage();
    return;
  }

  const darkSpot = darkSpotAt(target);
  if (darkSpot) {
    triggerDarkSpot(darkSpot);
    return;
  }

  if (onPath) {
    ui.hintLine.classList.add("hidden");
    clearHintPulse();
    updateScene("The footprints lead on. Search the next part.");
  } else {
    updateScene("You stepped away from the footprints. Explore dark areas for the key, collect glowing gold, or follow the clues back to the door.");
  }

  updateSceneView();
}

function showScare(monsterType) {
  const monster = monsterForType(monsterType);
  state.blocked = true;
  ui.scareOverlay.dataset.monster = monster.type;
  ui.scareEmoji.textContent = monster.emoji;
  ui.scareTitle.textContent = monster.title;
  ui.scareMessage.textContent = monster.message;
  ui.scareOverlay.classList.remove("hidden");
  ui.scareDismiss.focus();
}

function triggerDarkSpot(spot) {
  spot.resolved = true;
  ui.hintLine.classList.add("hidden");
  clearHintPulse();
  updateSceneView();

  if (spot.type === "key") {
    updateScene("You found the key in the dark!");
    collectKey();
    return;
  }

  showScare(spot.monsterType);
}

function showReward({ rewardType, title, message }) {
  const image = REWARD_IMAGES[rewardType];

  state.blocked = true;
  ui.rewardOverlay.dataset.reward = rewardType;
  ui.rewardPicture.src = image.src;
  ui.rewardPicture.alt = image.alt;
  ui.rewardTitle.textContent = title;
  ui.rewardMessage.textContent = message;
  ui.rewardOverlay.classList.remove("hidden");
  ui.rewardDismiss.focus();
}

function dismissReward() {
  state.blocked = false;
  ui.rewardOverlay.classList.add("hidden");
  updateSceneView();
}

function dismissScare() {
  state.blocked = false;
  ui.scareOverlay.classList.add("hidden");
  updateScene(`That was just a dark-area surprise. ${availablePathText()}`);
  updateSceneView();
}

function showHint() {
  const guide = guideStep();
  if (!guide && !(atExitDoor() && !state.hasKey)) {
    return;
  }

  ui.hintLine.textContent = atExitDoor() && !state.hasKey
    ? "Hint: walk back into the maze and search the dark areas for the key."
    : "Hint: sweep the light across the maze to find footprints.";
  ui.hintLine.classList.remove("hidden");

  clearHintPulse();
  ui.mazeView.classList.add("light-hint");
}

function clearHintPulse() {
  ui.mazeView.classList.remove("light-hint");
}

function updateScene(message) {
  ui.statusLine.textContent = message;
}

function atExitDoor() {
  return state.position.r === state.exit.r && state.position.c === state.exit.c;
}

function showLockedDoorMessage() {
  updateScene("The footprints end at a locked door. Backtrack and find the key on your own.");
  ui.hintLine.textContent = "Dark areas may hide the key or spooky surprises. Glowing gold coins are bonus treasure.";
  ui.hintLine.classList.remove("hidden");
  ui.mazeView.focus();
}

function updateKeyStatus() {
  ui.keyStatus.textContent = state.hasKey ? "Key: found" : "Key: hidden";
  ui.keyStatus.dataset.hasKey = String(state.hasKey);
  ui.mazeView.dataset.hasKey = String(state.hasKey);
}

function updateGoldStatus() {
  ui.goldStatus.textContent = `Pirate gold: ${state.goldCoins}`;
}

function directionIsOpen(directionIndex) {
  const direction = DIRECTIONS[directionIndex];
  return isOpen(
    state.grid,
    state.position.r + direction.dr,
    state.position.c + direction.dc
  );
}

function relativeDirection(offset) {
  return (state.facing + offset + DIRECTIONS.length) % DIRECTIONS.length;
}

function formatList(items) {
  if (items.length === 0) {
    return "No open paths.";
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }

  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

function openPathLabels() {
  return [
    { label: "forward", directionIndex: state.facing },
    { label: "left", directionIndex: relativeDirection(-1) },
    { label: "right", directionIndex: relativeDirection(1) },
    { label: "back", directionIndex: relativeDirection(2) },
  ]
    .filter((entry) => directionIsOpen(entry.directionIndex))
    .map((entry) => entry.label);
}

function availablePathText() {
  return `Open paths: ${formatList(openPathLabels())}.`;
}

function guideActionForDirection(directionIndex) {
  if (directionIndex === state.facing) {
    return "forward";
  }

  if (directionIndex === relativeDirection(-1)) {
    return "left";
  }

  if (directionIndex === relativeDirection(1)) {
    return "right";
  }

  return "back";
}

function guideStep() {
  const nextStep = nextPathStep();
  if (!nextStep) {
    return null;
  }

  const directionIndex = directionIndexBetween(state.position, nextStep);
  if (directionIndex === null) {
    return null;
  }

  const action = guideActionForDirection(directionIndex);
  return { action, directionIndex };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setLightPosition(x, y) {
  state.light = {
    x: clamp(x, 6, 94),
    y: clamp(y, 10, 90),
  };

  ui.mazeView.style.setProperty("--light-x", `${state.light.x}%`);
  ui.mazeView.style.setProperty("--light-y", `${state.light.y}%`);
  updateFootprintReveal();
}

function moveLightBy(dx, dy) {
  setLightPosition(state.light.x + dx, state.light.y + dy);
}

function isFootprintsFound() {
  return ui.mazeView.dataset.footprintsFound === "true";
}

function viewPointFromClient(clientX, clientY) {
  const rect = ui.mazeView.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * 100,
    y: ((clientY - rect.top) / rect.height) * 100,
  };
}

function sweepLightToPoint(clientX, clientY) {
  const wasFound = isFootprintsFound();
  const point = viewPointFromClient(clientX, clientY);

  setLightPosition(point.x, point.y);

  if (!wasFound && isFootprintsFound()) {
    updateScene("Footprints found. Click an open path to keep walking.");
  }
}

function visibleCellFromPoint(point) {
  const cellSize = 100 / VIEW_SIZE;
  return {
    row: clamp(Math.floor(point.y / cellSize), 0, VIEW_SIZE - 1),
    col: clamp(Math.floor(point.x / cellSize), 0, VIEW_SIZE - 1),
  };
}

function movementTargetFromClient(clientX, clientY) {
  const point = viewPointFromClient(clientX, clientY);
  const cell = visibleCellFromPoint(point);
  const rowDelta = cell.row - VIEW_RADIUS;
  const colDelta = cell.col - VIEW_RADIUS;

  if (rowDelta === 0 && colDelta === 0) {
    return null;
  }

  const useRow = Math.abs(rowDelta) >= Math.abs(colDelta);
  const step = {
    r: state.position.r + (useRow ? Math.sign(rowDelta) : 0),
    c: state.position.c + (useRow ? 0 : Math.sign(colDelta)),
  };

  if (!isOpen(state.grid, step.r, step.c)) {
    updateScene("A wall blocks that way. Click an open path beside you.");
    return null;
  }

  return step;
}

function clickedGold(clientX, clientY) {
  const point = viewPointFromClient(clientX, clientY);
  const cell = visibleCellFromPoint(point);
  const position = {
    r: state.position.r + cell.row - VIEW_RADIUS,
    c: state.position.c + cell.col - VIEW_RADIUS,
  };

  return goldSpotAt(position);
}

function visibleCellPosition(rowOffset, colOffset) {
  return {
    x: ((colOffset + 0.5) / VIEW_SIZE) * 100,
    y: ((rowOffset + 0.5) / VIEW_SIZE) * 100,
  };
}

function footprintTargetForGuide(guide) {
  if (!guide) {
    return null;
  }

  const direction = DIRECTIONS[guide.directionIndex];
  const rowOffset = VIEW_RADIUS + direction.dr;
  const colOffset = VIEW_RADIUS + direction.dc;
  const position = visibleCellPosition(rowOffset, colOffset);
  const rotations = {
    north: 180,
    east: -90,
    south: 0,
    west: 90,
  };

  return {
    ...position,
    rotation: rotations[direction.name],
  };
}

function updateFootprintReveal(guide = guideStep()) {
  const target = footprintTargetForGuide(guide);

  if (!guide || state.grid.length === 0) {
    ui.mazeView.dataset.footprintsFound = "false";
    return;
  }

  ui.mazeView.style.setProperty("--footprints-x", `${target.x}%`);
  ui.mazeView.style.setProperty("--footprints-y", `${target.y}%`);
  ui.mazeView.style.setProperty("--footprints-rotate", `${target.rotation}deg`);

  const distance = Math.hypot(state.light.x - target.x, state.light.y - target.y);
  ui.mazeView.dataset.footprintsFound = String(distance <= FOOTPRINT_REVEAL_DISTANCE);
}

function collectKey() {
  state.hasKey = true;
  ui.hintLine.classList.add("hidden");
  clearHintPulse();
  updateKeyStatus();

  if (atExitDoor()) {
    updateScene("The key clicks in the lock. The door opens!");
    finishLevel();
    return;
  }

  updateScene("You found the hidden key. Follow the footprints to the locked door.");
  updateSceneView();
  showReward({
    rewardType: "key",
    title: "Hidden key found!",
    message: "You found the hidden key. Now the locked door can open.",
  });
}

function collectGold(spot) {
  spot.collected = true;
  state.goldCoins += 1;
  updateGoldStatus();
  ui.hintLine.classList.add("hidden");
  clearHintPulse();
  updateScene("You found a pirate's booty with pirate gold!");
  updateSceneView();
  showReward({
    rewardType: "gold",
    title: "Pirate booty!",
    message: "You found a pirate's booty with pirate gold!",
  });
}

function advanceAlongFootprints() {
  if (state.blocked) {
    return;
  }

  if (atExitDoor() && !state.hasKey) {
    showLockedDoorMessage();
    return;
  }

  if (!isFootprintsFound()) {
    updateScene("Find the footprints first, then click them to move.");
    showHint();
    return;
  }

  const target = nextPathStep();
  if (!target) {
    return;
  }

  applyMove(target);
}

function decorationForCell(r, c, isWall, isExit, isCenter) {
  if (
    isCenter ||
    isExit ||
    darkSpotAt({ r, c }) ||
    goldSpotAt({ r, c })
  ) {
    return "";
  }

  const seed = Math.abs((r + 7) * 31 + (c + 11) * 17 + state.levelIndex * 13);

  if (isWall) {
    const wallDecor = ["", "", "", "web", "eyes", "crack"];
    return wallDecor[seed % wallDecor.length];
  }

  const pathDecor = ["", "", "", "leaf", "pumpkin", "stone", "bone"];
  return pathDecor[seed % pathDecor.length];
}

function renderMazeWindow() {
  const fragment = document.createDocumentFragment();
  const level = LEVELS[state.levelIndex];

  ui.mazeGrid.replaceChildren();
  ui.mazeView.dataset.theme = level.decorClass.replace("theme-", "");

  for (let vr = 0; vr < VIEW_SIZE; vr += 1) {
    for (let vc = 0; vc < VIEW_SIZE; vc += 1) {
      const r = state.position.r + vr - VIEW_RADIUS;
      const c = state.position.c + vc - VIEW_RADIUS;
      const inBounds = state.grid[r]?.[c] !== undefined;
      const isWall = !inBounds || !isOpen(state.grid, r, c);
      const isCenter = vr === VIEW_RADIUS && vc === VIEW_RADIUS;
      const isExit = inBounds && r === state.exit.r && c === state.exit.c;
      const isDarkCell = inBounds && darkSpotAt({ r, c });
      const isGoldCell = inBounds && goldSpotAt({ r, c });
      const cell = document.createElement("div");

      cell.className = `maze-cell ${isWall ? "maze-wall" : "maze-path"}`;
      cell.dataset.row = String(vr);
      cell.dataset.col = String(vc);

      const decor = decorationForCell(r, c, isWall, isExit, isCenter);
      if (decor) {
        cell.dataset.decor = decor;
      }

      if (isExit) {
        cell.classList.add("maze-exit");
      }

      if (isDarkCell) {
        cell.classList.add("maze-dark-cell");
      }

      if (isGoldCell) {
        cell.classList.add("maze-gold-cell");
      }

      if (isCenter) {
        cell.classList.add("maze-player-cell");
        cell.dataset.facing = DIRECTIONS[state.facing].name;
        cell.append(document.createElement("span"));
      }

      fragment.append(cell);
    }
  }

  ui.mazeGrid.append(fragment);
}

function updateGuideClues(guide) {
  if (!guide) {
    ui.mazeView.dataset.guideAction = "none";
    updateFootprintReveal(null);
    return;
  }

  ui.mazeView.dataset.guideAction = guide.action;
  updateFootprintReveal(guide);
}

function updateSceneView() {
  const guide = guideStep();
  const frontOpen = directionIsOpen(state.facing);
  const leftOpen = directionIsOpen(relativeDirection(-1));
  const rightOpen = directionIsOpen(relativeDirection(1));
  const backOpen = directionIsOpen(relativeDirection(2));

  ui.mazeView.dataset.frontOpen = String(frontOpen);
  ui.mazeView.dataset.leftOpen = String(leftOpen);
  ui.mazeView.dataset.rightOpen = String(rightOpen);
  ui.mazeView.dataset.backOpen = String(backOpen);
  ui.mazeView.dataset.facing = DIRECTIONS[state.facing].label;
  renderMazeWindow();
  updateGuideClues(guide);
  ui.mazeView.setAttribute(
    "aria-label",
    `Framed view of the nearby maze. Facing ${DIRECTIONS[state.facing].label}. Click an open path to walk. Searchlight footprints lead to the door: ${guide ? GUIDE_LABELS[guide.action] : "look around"}. ${state.hasKey ? "Key found." : "Dark areas may hide the key or a spooky friend. Glowing gold coins can be collected."} Arrow keys can sweep the light. Press Enter when footprints are found to follow them. ${availablePathText()}`
  );
}

function finishLevel() {
  state.blocked = true;
  const isLastLevel = state.levelIndex >= LEVELS.length - 1;

  if (isLastLevel) {
    ui.completeOverlay.classList.remove("hidden");
    ui.playAgainBtn.focus();
    return;
  }

  ui.winMessage.textContent = `You finished level ${state.levelIndex + 1}!`;
  ui.winOverlay.classList.remove("hidden");
  ui.nextLevelBtn.focus();
}

function loadLevel(index) {
  const level = LEVELS[index];
  const { grid, start, exit, darkSpots, goldSpots } = parseMaze(level.rows);
  const solutionPath = findPath(grid, start, exit);

  if (solutionPath.length === 0) {
    throw new Error(`Maze level "${level.theme}" has no route from start to exit.`);
  }

  if (!darkSpots.some((spot) => spot.type === "key")) {
    throw new Error(`Maze level "${level.theme}" is missing a hidden key.`);
  }

  if (goldSpots.length === 0) {
    throw new Error(`Maze level "${level.theme}" is missing pirate gold.`);
  }

  state.levelIndex = index;
  state.grid = grid;
  state.exit = exit;
  state.darkSpots = darkSpots.map((spot) => ({
    ...spot,
    resolved: false,
    monsterType: spot.type === "monster"
      ? MONSTERS[index % MONSTERS.length].type
      : null,
  }));
  state.goldSpots = goldSpots.map((spot) => ({
    ...spot,
    collected: false,
  }));
  state.hasKey = false;
  if (index === 0) {
    state.goldCoins = 0;
  }
  state.solutionPath = solutionPath;
  state.position = { ...start };
  state.facing = 1;
  state.light = { x: 50, y: 64 };
  state.blocked = false;

  ui.levelNumber.textContent = String(index + 1);
  ui.levelTheme.textContent = level.theme;
  ui.hintLine.classList.add("hidden");
  ui.scareOverlay.classList.add("hidden");
  ui.rewardOverlay.classList.add("hidden");
  ui.winOverlay.classList.add("hidden");
  ui.completeOverlay.classList.add("hidden");
  clearHintPulse();
  updateKeyStatus();
  updateGoldStatus();
  setLightPosition(state.light.x, state.light.y);
  updateSceneView();
  updateScene("Click open paths to walk. Search dark areas for the key or a spooky surprise, and collect glowing gold coins.");
}

function nextLevel() {
  loadLevel(state.levelIndex + 1);
}

function restartGame() {
  loadLevel(0);
}

ui.mazeView.addEventListener("pointerdown", (event) => {
  if (state.blocked) {
    return;
  }

  event.preventDefault();
  ui.mazeView.setPointerCapture?.(event.pointerId);
  sweepLightToPoint(event.clientX, event.clientY);

  const goldSpot = clickedGold(event.clientX, event.clientY);
  if (goldSpot) {
    collectGold(goldSpot);
    return;
  }

  const target = movementTargetFromClient(event.clientX, event.clientY);
  if (target) {
    applyMove(target);
  }
});

ui.mazeView.addEventListener("pointermove", (event) => {
  if (state.blocked) {
    return;
  }

  if (event.pointerType !== "mouse" && event.buttons === 0) {
    return;
  }

  sweepLightToPoint(event.clientX, event.clientY);
});

ui.mazeView.addEventListener("keydown", (event) => {
  if (state.blocked) {
    return;
  }

  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    advanceAlongFootprints();
    return;
  }

  const lightKeys = {
    ArrowUp: [0, -LIGHT_STEP],
    ArrowDown: [0, LIGHT_STEP],
    ArrowLeft: [-LIGHT_STEP, 0],
    ArrowRight: [LIGHT_STEP, 0],
  };
  const movement = lightKeys[event.key];

  if (!movement) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  moveLightBy(movement[0], movement[1]);

  if (isFootprintsFound()) {
    updateScene("Footprints found. Press Enter or click them to move.");
  }
});

ui.scareDismiss.addEventListener("click", dismissScare);
ui.rewardDismiss.addEventListener("click", dismissReward);
ui.nextLevelBtn.addEventListener("click", nextLevel);
ui.playAgainBtn.addEventListener("click", restartGame);

window.addEventListener("keydown", (event) => {
  if (state.blocked && ui.scareOverlay.classList.contains("hidden") === false) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      dismissScare();
    }
    return;
  }

  if (state.blocked && ui.rewardOverlay.classList.contains("hidden") === false) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      dismissReward();
    }
  }
});

loadLevel(0);
