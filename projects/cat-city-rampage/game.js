// Cat City Rampage - Two cats race to grab the yarn at the top

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusText = document.getElementById('statusText');
const resetButton = document.getElementById('resetButton');

// Game constants
const STEP_MS = 1000 / 60;
const GRAVITY = 0.6;
const MOVE_SPEED = 5;
const JUMP_FORCE = 15;
const DESTROY_RADIUS = 40;
const BRICK_SIZE = 20;
const PLAYER_SIZE = 30;
const YARN_Y = 40;

// Game state
const game = {
  running: true,
  won: null,
  score1: 0,
  score2: 0
};

// Player 1 (Red, WASD + Space)
const player1 = {
  x: 150,
  y: canvas.height - 100,
  vx: 0,
  vy: 0,
  width: PLAYER_SIZE,
  height: PLAYER_SIZE,
  speed: MOVE_SPEED,
  onGround: false,
  color: '#ff6b6b',
  number: 1,
  keys: { left: false, right: false, jump: false, destroy: false }
};

// Player 2 (Blue, Arrows + Enter)
const player2 = {
  x: canvas.width - 150,
  y: canvas.height - 100,
  vx: 0,
  vy: 0,
  width: PLAYER_SIZE,
  height: PLAYER_SIZE,
  speed: MOVE_SPEED,
  onGround: false,
  color: '#4ecdc4',
  number: 2,
  keys: { left: false, right: false, jump: false, destroy: false }
};

// Building bricks - grid of destructible blocks
let bricks = [];

function initBricks() {
  bricks = [];
  const cols = Math.floor(canvas.width / BRICK_SIZE);
  const rows = Math.floor(canvas.height / BRICK_SIZE);

  for (let row = 0; row < rows - 3; row++) {
    for (let col = 0; col < cols; col++) {
      bricks.push({
        x: col * BRICK_SIZE,
        y: row * BRICK_SIZE + 100,
        width: BRICK_SIZE,
        height: BRICK_SIZE,
        health: 1
      });
    }
  }
}

// Input handling
document.addEventListener('keydown', (e) => {
  // Player 1: WASD + Space
  if (e.key.toLowerCase() === 'w') player1.keys.jump = true;
  if (e.key.toLowerCase() === 'a') player1.keys.left = true;
  if (e.key.toLowerCase() === 'd') player1.keys.right = true;
  if (e.key === ' ') { player1.keys.destroy = true; e.preventDefault(); }

  // Player 2: Arrows + Enter
  if (e.key === 'ArrowUp') { player2.keys.jump = true; e.preventDefault(); }
  if (e.key === 'ArrowLeft') player2.keys.left = true;
  if (e.key === 'ArrowRight') player2.keys.right = true;
  if (e.key === 'Enter') { player2.keys.destroy = true; e.preventDefault(); }
});

document.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() === 'w') player1.keys.jump = false;
  if (e.key.toLowerCase() === 'a') player1.keys.left = false;
  if (e.key.toLowerCase() === 'd') player1.keys.right = false;
  if (e.key === ' ') { player1.keys.destroy = false; e.preventDefault(); }

  if (e.key === 'ArrowUp') { player2.keys.jump = false; e.preventDefault(); }
  if (e.key === 'ArrowLeft') player2.keys.left = false;
  if (e.key === 'ArrowRight') player2.keys.right = false;
  if (e.key === 'Enter') { player2.keys.destroy = false; e.preventDefault(); }
});

// Touch controls for mobile
let touchState = { active: false, startX: 0, currentX: 0, startTime: 0 };

canvas.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  touchState.active = true;
  touchState.startX = touch.clientX;
  touchState.currentX = touch.clientX;
  touchState.startTime = Date.now();
});

canvas.addEventListener('touchmove', (e) => {
  const touch = e.touches[0];
  touchState.currentX = touch.clientX;
});

canvas.addEventListener('touchend', (e) => {
  if (!touchState.active) return;

  const moveDistance = touchState.currentX - touchState.startX;
  const tapDuration = Date.now() - touchState.startTime;

  // Tap to destroy, drag to move
  if (Math.abs(moveDistance) < 20 && tapDuration < 200) {
    // Quick tap - destroy
    player1.keys.destroy = true;
    setTimeout(() => { player1.keys.destroy = false; }, 100);
  } else if (moveDistance < -30) {
    // Drag left
    player1.keys.left = true;
    setTimeout(() => { player1.keys.left = false; }, 100);
  } else if (moveDistance > 30) {
    // Drag right
    player1.keys.right = true;
    setTimeout(() => { player1.keys.right = false; }, 100);
  }

  touchState.active = false;
});

function updatePlayer(player, dt) {
  // Movement
  if (player.keys.left) player.vx = -player.speed;
  else if (player.keys.right) player.vx = player.speed;
  else player.vx *= 0.9;

  // Jumping
  if (player.keys.jump && player.onGround) {
    player.vy = -JUMP_FORCE;
    player.onGround = false;
  }

  // Apply gravity
  player.vy += GRAVITY;
  player.vy = Math.min(player.vy, 20); // Terminal velocity

  // Apply velocity
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Boundaries
  player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));

  // Collision with bricks
  player.onGround = false;
  bricks.forEach((brick) => {
    if (colliding(player, brick)) {
      // Landing on top
      if (player.vy > 0 && player.y + player.height - player.vy * dt <= brick.y + 5) {
        player.y = brick.y - player.height;
        player.vy = 0;
        player.onGround = true;
      }
      // Hitting bottom
      else if (player.vy < 0 && player.y - player.vy * dt >= brick.y + brick.height - 5) {
        player.y = brick.y + brick.height;
        player.vy = 0;
      }
      // Side collisions
      else if (player.vx > 0) {
        player.x = brick.x - player.width;
      } else if (player.vx < 0) {
        player.x = brick.x + brick.width;
      }
    }
  });

  // Fall off bottom
  if (player.y > canvas.height) {
    player.y = canvas.height - 100;
    player.vy = 0;
    player.onGround = true;
  }

  // Destroy bricks
  if (player.keys.destroy) {
    bricks = bricks.filter((brick) => {
      const dx = brick.x + brick.width / 2 - (player.x + player.width / 2);
      const dy = brick.y + brick.height / 2 - (player.y + player.height / 2);
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist > DESTROY_RADIUS;
    });
  }

  // Check if reached yarn at top
  if (player.y < YARN_Y) {
    return true;
  }
  return false;
}

function colliding(rect1, rect2) {
  return rect1.x < rect2.x + rect2.width &&
         rect1.x + rect1.width > rect2.x &&
         rect1.y < rect2.y + rect2.height &&
         rect1.y + rect1.height > rect2.y;
}

function update(dt) {
  if (!game.running) return;

  const p1Won = updatePlayer(player1, dt);
  const p2Won = updatePlayer(player2, dt);

  if (p1Won && !game.won) {
    game.won = 1;
    game.running = false;
    statusText.textContent = '🎉 Player 1 (Red) Grabbed the Yarn!';
  } else if (p2Won && !game.won) {
    game.won = 2;
    game.running = false;
    statusText.textContent = '🎉 Player 2 (Blue) Grabbed the Yarn!';
  }
}

function render() {
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw bricks
  bricks.forEach((brick) => {
    ctx.fillStyle = '#a89968';
    ctx.fillRect(brick.x, brick.y, brick.width, brick.height);
    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 1;
    ctx.strokeRect(brick.x, brick.y, brick.width, brick.height);
  });

  // Draw yarn at top
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath();
  ctx.arc(canvas.width / 2, YARN_Y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff8800';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw players
  drawPlayer(player1);
  drawPlayer(player2);

  // Draw ground
  ctx.fillStyle = '#8b7355';
  ctx.fillRect(0, canvas.height - 20, canvas.width, 20);
}

function drawPlayer(player) {
  // Body
  ctx.fillStyle = player.color;
  ctx.fillRect(player.x, player.y, player.width, player.height);

  // Eyes
  ctx.fillStyle = 'white';
  ctx.fillRect(player.x + 8, player.y + 8, 8, 8);
  ctx.fillRect(player.x + 14, player.y + 8, 8, 8);

  // Pupils
  ctx.fillStyle = 'black';
  ctx.fillRect(player.x + 10, player.y + 10, 4, 4);
  ctx.fillRect(player.x + 16, player.y + 10, 4, 4);

  // Border
  ctx.strokeStyle = '#1a1a2e';
  ctx.lineWidth = 2;
  ctx.strokeRect(player.x, player.y, player.width, player.height);
}

function reset() {
  game.running = true;
  game.won = null;
  player1.x = 150;
  player1.y = canvas.height - 100;
  player1.vx = 0;
  player1.vy = 0;
  player1.onGround = false;
  player2.x = canvas.width - 150;
  player2.y = canvas.height - 100;
  player2.vx = 0;
  player2.vy = 0;
  player2.onGround = false;
  initBricks();
  statusText.textContent = 'Player 1 or 2 reaches the yarn first to win!';
}

resetButton.addEventListener('click', reset);

// Game loop
let lastTime = performance.now();
function gameLoop(currentTime) {
  const deltaTime = currentTime - lastTime;
  lastTime = currentTime;

  if (deltaTime >= STEP_MS) {
    update(STEP_MS / 1000);
  }

  render();
  requestAnimationFrame(gameLoop);
}

// Handle visibility
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Pause if needed
  } else {
    lastTime = performance.now();
  }
});

// Start game
initBricks();
requestAnimationFrame(gameLoop);
