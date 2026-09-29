// Cat City Rampage - Two cats race to grab the yarn at the top.

const canvas = document.getElementById("gameCanvas");
const ctx = canvas?.getContext("2d");
const statusText = document.getElementById("statusText");
const resetButton = document.getElementById("resetButton");
const touchButtons = document.querySelectorAll("[data-player][data-control]");

if (!canvas || !ctx || !statusText || !resetButton) {
  throw new Error("Cat City Rampage is missing required page elements.");
}

const STEP_MS = 1000 / 60;
const MAX_ACCUMULATED_MS = 120;
const GRAVITY = 1800;
const MOVE_SPEED = 250;
const JUMP_FORCE = 690;
const DESTROY_RADIUS = 48;
const BRICK_SIZE = 20;
const PLAYER_SIZE = 30;
const YARN_Y = 42;
const GROUND_HEIGHT = 22;
const GROUND_Y = canvas.height - GROUND_HEIGHT;

const game = {
  running: true,
  won: null,
  paused: document.hidden
};

function makePlayer(number, x, color) {
  return {
    x,
    y: GROUND_Y - PLAYER_SIZE,
    vx: 0,
    vy: 0,
    width: PLAYER_SIZE,
    height: PLAYER_SIZE,
    onGround: false,
    color,
    number,
    smashed: 0,
    keys: { left: false, right: false, jump: false, destroy: false },
    previousDestroy: false
  };
}

const player1 = makePlayer(1, 130, "#ff6b6b");
const player2 = makePlayer(2, canvas.width - 160, "#4ecdc4");
let bricks = [];
let animationFrame = null;
let lastTime = performance.now();
let accumulatedTime = 0;

function initBricks() {
  bricks = [];
  const rows = [520, 440, 360, 280, 200, 120];
  const gaps = [6, 27, 13, 23, 9, 18];

  for (let index = 0; index < rows.length; index += 1) {
    const y = rows[index];
    const gap = gaps[index];

    for (let col = 3; col < 37; col += 1) {
      if (col >= gap && col <= gap + 2) continue;
      bricks.push(makeBrick(col * BRICK_SIZE, y));

      if (index < rows.length - 1 && col % 7 === index % 3) {
        bricks.push(makeBrick(col * BRICK_SIZE, y - BRICK_SIZE));
      }
    }
  }
}

function makeBrick(x, y) {
  return {
    x,
    y,
    width: BRICK_SIZE,
    height: BRICK_SIZE
  };
}

function clearHeldInput() {
  [player1, player2].forEach((player) => {
    Object.keys(player.keys).forEach((key) => {
      player.keys[key] = false;
    });
    player.previousDestroy = false;
  });

  touchButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
}

function setControl(playerNumber, control, pressed) {
  const player = playerNumber === "1" ? player1 : player2;
  if (!player || !(control in player.keys)) return;
  player.keys[control] = pressed;
}

function handleKey(event, pressed) {
  const key = event.key.toLowerCase();
  let handled = true;

  if (key === "w") player1.keys.jump = pressed;
  else if (key === "a") player1.keys.left = pressed;
  else if (key === "d") player1.keys.right = pressed;
  else if (event.key === " ") player1.keys.destroy = pressed;
  else if (event.key === "ArrowUp") player2.keys.jump = pressed;
  else if (event.key === "ArrowLeft") player2.keys.left = pressed;
  else if (event.key === "ArrowRight") player2.keys.right = pressed;
  else if (event.key === "Enter") player2.keys.destroy = pressed;
  else handled = false;

  if (handled) event.preventDefault();
}

document.addEventListener("keydown", (event) => handleKey(event, true));
document.addEventListener("keyup", (event) => handleKey(event, false));

touchButtons.forEach((button) => {
  const press = (event) => {
    event.preventDefault();
    setControl(button.dataset.player, button.dataset.control, true);
    button.setAttribute("aria-pressed", "true");
    // Pointer capture keeps the control held if the finger slides off the
    // button; it is a best-effort enhancement, not a requirement for the
    // control itself, so a capture failure must not block setControl above.
    try {
      button.setPointerCapture?.(event.pointerId);
    } catch {
      // Ignored: some pointer sessions (including synthetic PointerEvents)
      // have no OS-level "active pointer" to capture.
    }
  };

  const release = (event) => {
    event.preventDefault();
    setControl(button.dataset.player, button.dataset.control, false);
    button.setAttribute("aria-pressed", "false");
    try {
      button.releasePointerCapture?.(event.pointerId);
    } catch {
      // Ignored: nothing to release if capture was never established.
    }
  };

  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", () => {
    button.setAttribute("aria-pressed", "false");
    setControl(button.dataset.player, button.dataset.control, false);
  });
});

function updatePlayer(player, dt) {
  if (player.keys.destroy && !player.previousDestroy) {
    smashBricks(player);
  }
  player.previousDestroy = player.keys.destroy;

  if (player.keys.left && !player.keys.right) player.vx = -MOVE_SPEED;
  else if (player.keys.right && !player.keys.left) player.vx = MOVE_SPEED;
  else player.vx = approach(player.vx, 0, MOVE_SPEED * 5 * dt);

  if (player.keys.jump && player.onGround) {
    player.vy = -JUMP_FORCE;
    player.onGround = false;
  }

  player.vy = Math.min(player.vy + GRAVITY * dt, 900);
  moveHorizontally(player, dt);
  moveVertically(player, dt);

  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));

  if (player.y > canvas.height + 80) {
    placePlayerAtStart(player);
  }

  return player.y <= YARN_Y;
}

function moveHorizontally(player, dt) {
  player.x += player.vx * dt;

  for (const brick of bricks) {
    if (!colliding(player, brick)) continue;

    if (player.vx > 0) player.x = brick.x - player.width;
    else if (player.vx < 0) player.x = brick.x + brick.width;
    player.vx = 0;
  }
}

function moveVertically(player, dt) {
  player.y += player.vy * dt;
  player.onGround = false;

  for (const brick of bricks) {
    if (!colliding(player, brick)) continue;

    if (player.vy > 0) {
      player.y = brick.y - player.height;
      player.onGround = true;
    } else if (player.vy < 0) {
      player.y = brick.y + brick.height;
    }
    player.vy = 0;
  }

  if (player.y + player.height >= GROUND_Y) {
    player.y = GROUND_Y - player.height;
    player.vy = 0;
    player.onGround = true;
  }
}

function smashBricks(player) {
  let removed = 0;
  const centerX = player.x + player.width / 2;
  const centerY = player.y + player.height / 2;

  bricks = bricks.filter((brick) => {
    const dx = brick.x + brick.width / 2 - centerX;
    const dy = brick.y + brick.height / 2 - centerY;
    const shouldRemove = Math.hypot(dx, dy) <= DESTROY_RADIUS;

    if (shouldRemove) removed += 1;
    return !shouldRemove;
  });

  player.smashed += removed;
  updateStatus();
}

function approach(value, target, amount) {
  if (value < target) return Math.min(target, value + amount);
  if (value > target) return Math.max(target, value - amount);
  return target;
}

function colliding(rect1, rect2) {
  return rect1.x < rect2.x + rect2.width &&
         rect1.x + rect1.width > rect2.x &&
         rect1.y < rect2.y + rect2.height &&
         rect1.y + rect1.height > rect2.y;
}

function update(dt) {
  if (!game.running || game.paused) return;

  const p1Won = updatePlayer(player1, dt);
  const p2Won = updatePlayer(player2, dt);

  if (p1Won && !game.won) finishGame(player1);
  else if (p2Won && !game.won) finishGame(player2);
}

function finishGame(player) {
  game.won = player.number;
  game.running = false;
  clearHeldInput();
  statusText.textContent = `Player ${player.number} grabbed the yarn!`;
  resetButton.focus();
}

function updateStatus() {
  if (game.won) return;
  statusText.textContent = `Red smashed ${player1.smashed}. Blue smashed ${player2.smashed}. First cat to the yarn wins!`;
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSkyline();
  drawBricks();
  drawYarn();
  drawPlayer(player1);
  drawPlayer(player2);
  drawGround();
}

function drawSkyline() {
  ctx.fillStyle = "#fef5e7";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#87ceeb";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
  ctx.fillRect(0, 70, canvas.width, 40);
}

function drawBricks() {
  bricks.forEach((brick) => {
    ctx.fillStyle = "#a89968";
    ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
    ctx.strokeStyle = "#8b7355";
    ctx.lineWidth = 1;
    ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
  });
}

function drawYarn() {
  ctx.fillStyle = "#ffcc00";
  ctx.beginPath();
  ctx.arc(canvas.width / 2, YARN_Y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ff8800";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2 - 12, YARN_Y);
  ctx.quadraticCurveTo(canvas.width / 2, YARN_Y - 18, canvas.width / 2 + 12, YARN_Y);
  ctx.stroke();
}

function drawPlayer(player) {
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);

  ctx.fillStyle = player.color;
  ctx.beginPath();
  ctx.moveTo(player.x + 4, player.y + 2);
  ctx.lineTo(player.x + 10, player.y - 8);
  ctx.lineTo(player.x + 15, player.y + 2);
  ctx.lineTo(player.x + 20, player.y - 8);
  ctx.lineTo(player.x + 26, player.y + 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "white";
  ctx.fillRect(player.x + 7, player.y + 8, 7, 7);
  ctx.fillRect(player.x + 17, player.y + 8, 7, 7);

  ctx.fillStyle = "black";
  ctx.fillRect(player.x + 9, player.y + 10, 3, 3);
  ctx.fillRect(player.x + 19, player.y + 10, 3, 3);

  ctx.strokeStyle = "#1a1a2e";
  ctx.lineWidth = 2;
  ctx.strokeRect(player.x, player.y, player.width, player.height);
}

function drawGround() {
  ctx.fillStyle = "#8b7355";
  ctx.fillRect(0, GROUND_Y, canvas.width, GROUND_HEIGHT);
}

function placePlayerAtStart(player) {
  player.x = player.number === 1 ? 130 : canvas.width - 160;
  player.y = GROUND_Y - player.height;
  player.vx = 0;
  player.vy = 0;
  player.onGround = true;
  player.previousDestroy = false;
}

function reset() {
  game.running = true;
  game.won = null;
  game.paused = document.hidden;
  player1.smashed = 0;
  player2.smashed = 0;
  clearHeldInput();
  placePlayerAtStart(player1);
  placePlayerAtStart(player2);
  initBricks();
  statusText.textContent = "Player 1 or 2 reaches the yarn first to win!";
  lastTime = performance.now();
  accumulatedTime = 0;
  render();
}

function gameLoop(currentTime) {
  animationFrame = null;

  if (!game.paused) {
    const frameDelta = Math.min(currentTime - lastTime, MAX_ACCUMULATED_MS);
    lastTime = currentTime;
    accumulatedTime += frameDelta;

    while (accumulatedTime >= STEP_MS) {
      update(STEP_MS / 1000);
      accumulatedTime -= STEP_MS;
    }

    render();
  }

  animationFrame = requestAnimationFrame(gameLoop);
}

function stopLoop() {
  if (animationFrame !== null) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
}

function startLoop() {
  stopLoop();
  lastTime = performance.now();
  animationFrame = requestAnimationFrame(gameLoop);
}

window.addEventListener("blur", clearHeldInput);

document.addEventListener("visibilitychange", () => {
  game.paused = document.hidden;
  clearHeldInput();

  if (document.hidden) {
    stopLoop();
  } else {
    startLoop();
  }
});

resetButton.addEventListener("click", reset);

window.__catCityRampage = {
  game,
  players: [player1, player2],
  get bricks() {
    return bricks;
  },
  reset,
  update,
  clearHeldInput
};

reset();
startLoop();
