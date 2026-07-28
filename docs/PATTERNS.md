# Common Patterns in Kidzone Games

This guide documents patterns that work well across Kidzone projects. Use these as templates when building new games.

## Game State Management

Most games use a central game state object to track overall state:

```javascript
const game = {
  running: true,
  paused: false,
  score: 0,
  level: 1,
  // ... other game-level properties
};
```

Keep this object as the source of truth. Update it from input handlers and game loop, never directly mutate from event listeners unless necessary.

## Game Loop and Timing

Use a fixed timestep for physics and logic to ensure reproducibility:

```javascript
const STEP_MS = 1000 / 60; // 60 FPS

let lastTime = performance.now();

function gameLoop(currentTime) {
  const deltaTime = currentTime - lastTime;
  lastTime = currentTime;

  // Fixed steps to avoid frame-rate dependent behavior
  if (deltaTime >= STEP_MS) {
    update(STEP_MS);
    render();
    lastTime = currentTime;
  }

  requestAnimationFrame(gameLoop);
}
```

Pause animation frames when the document is hidden to save CPU:

```javascript
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(loopHandle);
  } else {
    requestAnimationFrame(gameLoop);
  }
});
```

## Input Handling

Separate input state from input processing. Track which inputs are pressed, then apply them in the update loop:

```javascript
const keys = {
  left: false,
  right: false,
  jump: false
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') keys.left = true;
  if (e.key === 'ArrowRight') keys.right = true;
  if (e.key === ' ') keys.jump = true;
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') keys.left = false;
  if (e.key === 'ArrowRight') keys.right = false;
  if (e.key === ' ') keys.jump = false;
});

// In update loop:
if (keys.left) player.moveLeft();
if (keys.right) player.moveRight();
if (keys.jump && player.canJump) player.jump();
```

For touch input, use data attributes on control elements:

```html
<button data-control="left" aria-label="Move left">←</button>
<button data-control="right" aria-label="Move right">→</button>
<button data-control="jump" aria-label="Jump">Jump</button>
```

```javascript
const touchControls = document.querySelectorAll('[data-control]');

touchControls.forEach(button => {
  button.addEventListener('pointerdown', (e) => {
    const control = e.target.dataset.control;
    keys[control] = true;
  });

  button.addEventListener('pointerup', (e) => {
    const control = e.target.dataset.control;
    keys[control] = false;
  });
});
```

## Entity Management

For games with multiple entities (enemies, collectibles, projectiles), store them in arrays:

```javascript
let enemies = [];
let collectibles = [];

function update(dt) {
  // Update and filter enemies (remove dead ones)
  enemies = enemies.filter(enemy => {
    enemy.update(dt);
    return enemy.health > 0;
  });

  // Update and filter collectibles (remove collected ones)
  collectibles = collectibles.filter(collectible => {
    return !collectible.collected;
  });

  // Check collisions
  enemies.forEach(enemy => {
    if (colliding(player, enemy)) {
      player.takeDamage(enemy.damage);
    }
  });
}

function render() {
  enemies.forEach(enemy => enemy.draw(ctx));
  collectibles.forEach(collectible => collectible.draw(ctx));
}
```

## Physics Simulation

Use velocity-based movement for smooth, frame-rate independent physics:

```javascript
const entity = {
  x: 100,
  y: 100,
  velX: 0,
  velY: 0,
  accelX: 0,
  accelY: 0.5, // gravity
  speed: 5
};

function update(dt) {
  // Apply acceleration
  entity.velX += entity.accelX * dt;
  entity.velY += entity.accelY * dt;

  // Cap velocities to prevent instability
  entity.velX = Math.max(-entity.maxSpeed, Math.min(entity.maxSpeed, entity.velX));
  entity.velY = Math.max(-entity.maxSpeed, Math.min(entity.maxSpeed, entity.velY));

  // Apply velocity
  entity.x += entity.velX * dt;
  entity.y += entity.velY * dt;
}
```

## Collision Detection

For simple axis-aligned bounding box (AABB) collisions:

```javascript
function colliding(a, b) {
  return a.x < b.x + b.width &&
         a.x + a.width > b.x &&
         a.y < b.y + b.height &&
         a.y + a.height > b.y;
}
```

For pixel-perfect collisions or complex shapes, consider building a collision grid or spatial index if performance becomes an issue.

## Reset and Cleanup

Games must support reset (e.g., "Play Again" button). Ensure all timers, event listeners, and animation frames are properly cleaned up:

```javascript
function reset() {
  // Cancel all animation frames
  if (gameLoopHandle) {
    cancelAnimationFrame(gameLoopHandle);
  }

  // Remove all listeners
  document.removeEventListener('keydown', handleKeyDown);
  document.removeEventListener('keyup', handleKeyUp);

  // Clear entities
  enemies = [];
  collectibles = [];

  // Reset state
  Object.assign(game, {
    running: true,
    paused: false,
    score: 0,
    level: 1
  });

  // Restart the loop
  gameLoopHandle = requestAnimationFrame(gameLoop);
}

resetButton.addEventListener('click', reset);
```

## Seedable Random Generation

For reproducible level generation and testing, use a seeded random function:

```javascript
let seed = game.seed || 1;

function seededRandom() {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
}

function generateLevel(levelNumber) {
  seed = levelNumber; // Reseed for reproducibility
  
  let obstacles = [];
  for (let i = 0; i < 5; i++) {
    obstacles.push({
      x: seededRandom() * 800,
      y: seededRandom() * 600
    });
  }
  
  return obstacles;
}
```

## Accessibility

Keep game state visible in the DOM for screen readers:

```html
<div aria-live="polite" aria-atomic="true">
  <p id="score">Score: <span id="score-value">0</span></p>
  <p id="level">Level: <span id="level-value">1</span></p>
  <p id="status">Status: <span id="status-value">Playing</span></p>
</div>
```

Update text content when state changes:

```javascript
function updateScore(newScore) {
  game.score = newScore;
  document.getElementById('score-value').textContent = game.score;
}
```

## Testing Canvas Games

Test the game logic separately from rendering:

```javascript
// game-logic.js - Pure logic, no DOM/canvas
export function colliding(a, b) {
  return a.x < b.x + b.width && /* ... */;
}

export function updatePlayer(player, keys, dt) {
  if (keys.left) player.velX = -player.speed;
  if (keys.right) player.velX = player.speed;
  player.x += player.velX * dt;
}
```

```javascript
// game-logic.test.mjs - Test the logic
import { colliding, updatePlayer } from './game-logic.js';

test('player moves left when left key pressed', () => {
  const player = { x: 100, velX: 0, speed: 5 };
  updatePlayer(player, { left: true, right: false }, 0.016);
  assert.equal(player.x, 99.92); // 100 + (-5 * 0.016)
});

test('collision detection works', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 };
  const b = { x: 5, y: 5, width: 10, height: 10 };
  assert.ok(colliding(a, b));
});
```

## Performance Considerations

- **Batch rendering**: Group draw calls to reduce state changes in canvas.
- **Object pooling**: Reuse entity objects instead of creating/deleting frequently.
- **Spatial partitioning**: For many entities, use a grid or quadtree to speed up collision checks.
- **Reduced motion**: Honor `prefers-reduced-motion` for animations.

```javascript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReducedMotion) {
  // Skip animations, provide instant feedback
} else {
  // Play animations
}
```
