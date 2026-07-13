// Cheeseworld - A cheese-collecting platformer

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const levelDisplay = document.getElementById('level');
const powerUpDisplay = document.getElementById('powerUpDisplay');
const touchControls = document.querySelectorAll('[data-control]');

// Game state
const game = {
    score: 0,
    level: 1,
    gravity: 0.5,
    running: true,
    seed: 1,
    damageCooldown: 0
};

const STEP_MS = 1000 / 60;
const POWER_UP_MS = 5000;
const DAMAGE_COOLDOWN_MS = 1000;
const FLATTENED_MS = 1000;
const SPAWN = { x: 100, y: 435 };

// Mouse player
const mouse = {
    x: 100,
    y: 300,
    width: 30,
    height: 25,
    velX: 0,
    velY: 0,
    speed: 5,
    jumpForce: 14,
    onGround: false,
    direction: 1, // 1 = right, -1 = left
    powerUp: null,
    powerUpTimer: 0
};

// Input handling
const keys = {
    left: false,
    right: false,
    jump: false
};

// Platforms
let platforms = [];

// Cheese collectibles
let cheeses = [];

// Enemies
let enemies = [];

function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function levelSeed(levelNum) {
    return (game.seed + Math.imul(levelNum, 2654435761)) >>> 0;
}

// Initialize level
function initLevel(levelNum) {
    platforms = [];
    cheeses = [];
    enemies = [];

    // Ground
    platforms.push({ x: 0, y: 460, width: 800, height: 40 });

    const random = seededRandom(levelSeed(levelNum));

    // Build a connected staircase. Each platform overlaps the horizontal jump
    // range of the previous platform and rises by no more than 70 pixels.
    const numPlatforms = 5 + levelNum;
    let previous = platforms[0];
    for (let i = 0; i < numPlatforms; i++) {
        const width = 110 + random() * 60;
        const direction = i % 2 === 0 ? 1 : -1;
        const anchor = direction > 0 ? previous.x + previous.width - 35 : previous.x - width + 35;
        const x = Math.max(12, Math.min(canvas.width - width - 12, anchor + (random() - 0.5) * 50));
        const y = Math.max(120, previous.y - (45 + random() * 25));
        const platform = { x, y, width, height: 20, reachableFrom: platforms.length - 1 };
        platforms.push(platform);
        previous = platform;
    }

    // Sort platforms by height so we can verify reachability
    platforms.sort((a, b) => b.y - a.y);

    // Add cheese on platforms
    platforms.forEach((plat, index) => {
        if (index === 0) {
            // Add multiple cheeses on ground
            for (let i = 0; i < 3; i++) {
                cheeses.push({
                    x: 150 + i * 200 + random() * 100,
                    y: plat.y - 30,
                    width: 25,
                    height: 20,
                    collected: false
                });
            }
        } else {
            // Add cheese on each platform
            cheeses.push({
                x: plat.x + plat.width / 2 - 12,
                y: plat.y - 30,
                width: 25,
                height: 20,
                collected: false
            });
        }
    });

    // Add enemies
    // Cat on ground
    enemies.push({
        type: 'cat',
        x: 500,
        y: 420,
        baseY: 420,
        width: 50,
        height: 40,
        originalHeight: 40,
        speed: 1,
        direction: -1,
        patrolMin: 300,
        patrolMax: 700,
        frameTime: 0,
        flattened: false,
        flattenTimer: 0,
        velY: 0,
        jumping: false
    });

    // Add grumpy old man on a platform (if we have enough platforms)
    if (platforms.length > 2) {
        const plat = platforms[Math.floor(platforms.length / 2)];
        if (plat.width >= 100) {
            enemies.push({
                type: 'oldman',
                x: plat.x + 20,
                y: plat.y - 55,
                baseY: plat.y - 55,
                width: 35,
                height: 55,
                originalHeight: 55,
                speed: 1.5,
                direction: 1,
                patrolMin: plat.x,
                patrolMax: plat.x + plat.width - 35,
                frameTime: 0,
                swingAngle: 0,
                flattened: false,
                flattenTimer: 0,
                velY: 0,
                jumping: false,
                agitated: false,
                platformY: plat.y
            });
        }
    }

    // Add more enemies based on level
    for (let i = 0; i < Math.min(levelNum - 1, 3); i++) {
        const platIndex = 2 + i % (platforms.length - 2);
        const plat = platforms[platIndex];
        if (plat && plat.width >= 80) {
            const enemyType = i % 2 === 0 ? 'cat' : 'oldman';
            const height = enemyType === 'cat' ? 40 : 55;
            enemies.push({
                type: enemyType,
                x: plat.x + 10,
                y: plat.y - height,
                baseY: plat.y - height,
                width: enemyType === 'cat' ? 50 : 35,
                height: height,
                originalHeight: height,
                speed: enemyType === 'cat' ? 1 : 1.5,
                direction: 1,
                patrolMin: plat.x,
                patrolMax: plat.x + plat.width - (enemyType === 'cat' ? 50 : 35),
                frameTime: 0,
                swingAngle: 0,
                flattened: false,
                flattenTimer: 0,
                velY: 0,
                jumping: false,
                agitated: false,
                platformY: plat.y
            });
        }
    }

    // Reset mouse position
    mouse.x = SPAWN.x;
    mouse.y = SPAWN.y;
    mouse.velX = 0;
    mouse.velY = 0;
    mouse.powerUp = null;
    mouse.powerUpTimer = 0;
    mouse.speed = 5;
    game.damageCooldown = 0;
    powerUpDisplay.style.display = 'none';
}

// Draw the mouse character
function drawMouse() {
    ctx.save();
    if (game.damageCooldown > 0 && Math.floor(game.damageCooldown / 100) % 2 === 0) {
        ctx.globalAlpha = 0.45;
    }
    ctx.translate(mouse.x + mouse.width / 2, mouse.y + mouse.height / 2);
    ctx.scale(mouse.direction, 1);
    ctx.translate(-mouse.width / 2, -mouse.height / 2);

    // Power-up glow effect
    if (mouse.powerUp) {
        ctx.shadowColor = '#ffff00';
        ctx.shadowBlur = 15;
        // Draw speed lines
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.6)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(-10 - i * 8, 5 + i * 6);
            ctx.lineTo(-20 - i * 8, 5 + i * 6);
            ctx.stroke();
        }
    }

    // Body (gray oval)
    ctx.fillStyle = '#808080';
    ctx.beginPath();
    ctx.ellipse(mouse.width / 2, mouse.height / 2, mouse.width / 2, mouse.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears
    ctx.fillStyle = '#606060';
    ctx.beginPath();
    ctx.arc(5, 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mouse.width - 5, 2, 8, 0, Math.PI * 2);
    ctx.fill();

    // Inner ears
    ctx.fillStyle = '#ffb6c1';
    ctx.beginPath();
    ctx.arc(5, 2, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(mouse.width - 5, 2, 5, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(mouse.width - 8, mouse.height / 2 - 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Eye shine
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(mouse.width - 7, mouse.height / 2 - 3, 1, 0, Math.PI * 2);
    ctx.fill();

    // Nose
    ctx.fillStyle = '#ffb6c1';
    ctx.beginPath();
    ctx.arc(mouse.width + 2, mouse.height / 2 + 2, 4, 0, Math.PI * 2);
    ctx.fill();

    // Whiskers
    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 1;
    for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(mouse.width - 2, mouse.height / 2 + 2);
        ctx.lineTo(mouse.width + 15, mouse.height / 2 + i * 4);
        ctx.stroke();
    }

    // Tail
    ctx.strokeStyle = '#ffb6c1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, mouse.height / 2);
    ctx.quadraticCurveTo(-15, mouse.height / 2 - 10, -10, mouse.height / 2 + 10);
    ctx.stroke();

    ctx.restore();
}

// Draw cheese
function drawCheese(cheese) {
    if (cheese.collected) return;

    // Cheese wedge
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.moveTo(cheese.x, cheese.y + cheese.height);
    ctx.lineTo(cheese.x + cheese.width / 2, cheese.y);
    ctx.lineTo(cheese.x + cheese.width, cheese.y + cheese.height);
    ctx.closePath();
    ctx.fill();

    // Cheese outline
    ctx.strokeStyle = '#daa520';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Holes in cheese
    ctx.fillStyle = '#ffed8a';
    ctx.beginPath();
    ctx.arc(cheese.x + cheese.width / 2, cheese.y + cheese.height / 2 + 3, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cheese.x + cheese.width / 2 - 6, cheese.y + cheese.height - 5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cheese.x + cheese.width / 2 + 5, cheese.y + cheese.height - 4, 2.5, 0, Math.PI * 2);
    ctx.fill();
}

// Draw cat enemy
function drawCat(enemy) {
    ctx.save();
    ctx.translate(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);

    // Squish effect if flattened
    if (enemy.flattened) {
        ctx.scale(enemy.direction * 1.5, 0.25);
    } else {
        ctx.scale(enemy.direction, 1);
    }
    ctx.translate(-enemy.width / 2, -enemy.height / 2);

    // Body (orange oval)
    ctx.fillStyle = '#ff8c00';
    ctx.beginPath();
    ctx.ellipse(enemy.width / 2, enemy.height / 2 + 5, enemy.width / 2 - 5, enemy.height / 2 - 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Stripes
    ctx.strokeStyle = '#cc6600';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(15 + i * 10, enemy.height / 2 - 5);
        ctx.lineTo(15 + i * 10, enemy.height / 2 + 15);
        ctx.stroke();
    }

    // Head
    ctx.fillStyle = '#ff8c00';
    ctx.beginPath();
    ctx.arc(enemy.width - 10, enemy.height / 2 - 5, 15, 0, Math.PI * 2);
    ctx.fill();

    // Ears (triangles)
    ctx.fillStyle = '#ff8c00';
    ctx.beginPath();
    ctx.moveTo(enemy.width - 20, enemy.height / 2 - 18);
    ctx.lineTo(enemy.width - 15, enemy.height / 2 - 8);
    ctx.lineTo(enemy.width - 25, enemy.height / 2 - 10);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(enemy.width - 2, enemy.height / 2 - 18);
    ctx.lineTo(enemy.width + 3, enemy.height / 2 - 8);
    ctx.lineTo(enemy.width - 7, enemy.height / 2 - 10);
    ctx.closePath();
    ctx.fill();

    // Inner ears
    ctx.fillStyle = '#ffb6c1';
    ctx.beginPath();
    ctx.moveTo(enemy.width - 18, enemy.height / 2 - 15);
    ctx.lineTo(enemy.width - 15, enemy.height / 2 - 9);
    ctx.lineTo(enemy.width - 22, enemy.height / 2 - 11);
    ctx.closePath();
    ctx.fill();

    // Eyes (menacing)
    ctx.fillStyle = '#ffff00';
    ctx.beginPath();
    ctx.ellipse(enemy.width - 14, enemy.height / 2 - 7, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(enemy.width - 4, enemy.height / 2 - 7, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pupils (slits)
    ctx.fillStyle = '#000';
    ctx.fillRect(enemy.width - 15, enemy.height / 2 - 11, 2, 8);
    ctx.fillRect(enemy.width - 5, enemy.height / 2 - 11, 2, 8);

    // Nose
    ctx.fillStyle = '#ff69b4';
    ctx.beginPath();
    ctx.moveTo(enemy.width + 3, enemy.height / 2 - 3);
    ctx.lineTo(enemy.width, enemy.height / 2);
    ctx.lineTo(enemy.width + 6, enemy.height / 2);
    ctx.closePath();
    ctx.fill();

    // Mouth (evil grin)
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(enemy.width - 2, enemy.height / 2 + 2);
    ctx.quadraticCurveTo(enemy.width + 5, enemy.height / 2 + 6, enemy.width + 8, enemy.height / 2 + 2);
    ctx.stroke();

    // Tail
    ctx.strokeStyle = '#ff8c00';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(5, enemy.height / 2);
    const tailWave = Math.sin(enemy.frameTime * 0.1) * 10;
    ctx.quadraticCurveTo(-10, enemy.height / 2 - 20 + tailWave, -5, enemy.height / 2 - 30);
    ctx.stroke();

    // Legs
    ctx.fillStyle = '#ff8c00';
    ctx.fillRect(10, enemy.height - 10, 8, 10);
    ctx.fillRect(30, enemy.height - 10, 8, 10);

    ctx.restore();
}

// Draw grumpy old man
function drawOldMan(enemy) {
    ctx.save();
    ctx.translate(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);

    // Squish effect if flattened
    if (enemy.flattened) {
        ctx.scale(enemy.direction * 1.5, 0.25);
    } else {
        ctx.scale(enemy.direction, 1);
    }
    ctx.translate(-enemy.width / 2, -enemy.height / 2);

    // Determine face color based on agitation
    const faceColor = enemy.agitated ? '#ff6b6b' : '#deb887';
    const shakeOffset = enemy.agitated ? Math.sin(enemy.frameTime * 0.5) * 2 : 0;

    // Legs
    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(8, enemy.height - 20, 8, 20);
    ctx.fillRect(20, enemy.height - 20, 8, 20);

    // Body (hunched torso)
    ctx.fillStyle = '#8b4513';
    ctx.beginPath();
    ctx.moveTo(5, enemy.height - 20);
    ctx.lineTo(30, enemy.height - 20);
    ctx.lineTo(28, enemy.height - 45);
    ctx.lineTo(8, enemy.height - 45);
    ctx.closePath();
    ctx.fill();

    // Cardigan
    ctx.strokeStyle = '#6b3510';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(17, enemy.height - 45);
    ctx.lineTo(17, enemy.height - 20);
    ctx.stroke();

    // Head
    ctx.fillStyle = faceColor;
    ctx.beginPath();
    ctx.arc(18 + shakeOffset, enemy.height - 50, 10, 0, Math.PI * 2);
    ctx.fill();

    // Grumpy eyebrows (angrier when agitated)
    ctx.strokeStyle = '#696969';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(12, enemy.height - 54);
    ctx.lineTo(16, enemy.height - 52);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(20, enemy.height - 52);
    ctx.lineTo(24, enemy.height - 54);
    ctx.stroke();

    // Angry eyes
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(14, enemy.height - 51, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(22, enemy.height - 51, 2, 0, Math.PI * 2);
    ctx.fill();

    // Glasses
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(11, enemy.height - 53, 7, 5);
    ctx.strokeRect(19, enemy.height - 53, 7, 5);
    ctx.beginPath();
    ctx.moveTo(18, enemy.height - 51);
    ctx.lineTo(19, enemy.height - 51);
    ctx.stroke();

    // Frown
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(14, enemy.height - 44);
    ctx.quadraticCurveTo(18, enemy.height - 46, 22, enemy.height - 44);
    ctx.stroke();

    // Balding hair
    ctx.fillStyle = '#c0c0c0';
    ctx.beginPath();
    ctx.arc(10, enemy.height - 55, 4, Math.PI, Math.PI * 1.7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(26, enemy.height - 55, 4, Math.PI * 1.3, Math.PI * 2);
    ctx.fill();

    // Arm holding newspaper
    ctx.fillStyle = '#deb887';
    ctx.save();
    ctx.translate(28, enemy.height - 38);
    ctx.rotate(enemy.swingAngle);

    // Upper arm
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(-3, 0, 8, 15);

    // Hand
    ctx.fillStyle = '#deb887';
    ctx.beginPath();
    ctx.arc(1, 17, 5, 0, Math.PI * 2);
    ctx.fill();

    // Newspaper
    ctx.fillStyle = '#f5f5dc';
    ctx.fillRect(-8, 15, 20, 25);
    ctx.fillStyle = '#d3d3d3';
    ctx.fillRect(-6, 18, 16, 2);
    ctx.fillRect(-6, 22, 16, 2);
    ctx.fillRect(-6, 26, 16, 2);
    ctx.fillRect(-6, 30, 10, 2);

    // "NEWS" text
    ctx.fillStyle = '#333';
    ctx.font = 'bold 6px Arial';
    ctx.fillText('NEWS', -5, 38);

    ctx.restore();

    ctx.restore();
}

// Draw platforms
function drawPlatforms() {
    platforms.forEach((plat, index) => {
        if (index === 0) {
            // Ground - darker cheese color
            ctx.fillStyle = '#c9a030';
            ctx.fillRect(plat.x, plat.y, plat.width, plat.height);

            // Ground pattern
            ctx.fillStyle = '#b8912a';
            for (let i = 0; i < plat.width; i += 40) {
                ctx.beginPath();
                ctx.arc(i + 20, plat.y + 20, 8, 0, Math.PI * 2);
                ctx.fill();
            }
        } else {
            // Floating platforms - cheese colored
            ctx.fillStyle = '#ffd700';
            ctx.fillRect(plat.x, plat.y, plat.width, plat.height);

            // Platform holes
            ctx.fillStyle = '#ffed8a';
            ctx.beginPath();
            ctx.arc(plat.x + plat.width / 4, plat.y + plat.height / 2, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(plat.x + plat.width * 3 / 4, plat.y + plat.height / 2, 3, 0, Math.PI * 2);
            ctx.fill();

            // Platform outline
            ctx.strokeStyle = '#daa520';
            ctx.lineWidth = 2;
            ctx.strokeRect(plat.x, plat.y, plat.width, plat.height);
        }
    });
}

// Draw background
function drawBackground() {
    // Fridge interior - cool white/blue gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#e8f4f8');
    gradient.addColorStop(0.5, '#d0e8f0');
    gradient.addColorStop(1, '#b8d8e8');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Fridge back wall texture (subtle)
    ctx.fillStyle = 'rgba(200, 220, 230, 0.5)';
    for (let y = 0; y < canvas.height; y += 60) {
        ctx.fillRect(0, y, canvas.width, 2);
    }

    // Fridge light glow from top
    const lightGradient = ctx.createRadialGradient(400, -50, 10, 400, 100, 300);
    lightGradient.addColorStop(0, 'rgba(255, 255, 240, 0.4)');
    lightGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = lightGradient;
    ctx.fillRect(0, 0, canvas.width, 250);

    // Left wall shadow
    const leftShadow = ctx.createLinearGradient(0, 0, 80, 0);
    leftShadow.addColorStop(0, 'rgba(100, 130, 150, 0.3)');
    leftShadow.addColorStop(1, 'rgba(100, 130, 150, 0)');
    ctx.fillStyle = leftShadow;
    ctx.fillRect(0, 0, 80, canvas.height);

    // Right wall shadow
    const rightShadow = ctx.createLinearGradient(canvas.width, 0, canvas.width - 80, 0);
    rightShadow.addColorStop(0, 'rgba(100, 130, 150, 0.3)');
    rightShadow.addColorStop(1, 'rgba(100, 130, 150, 0)');
    ctx.fillStyle = rightShadow;
    ctx.fillRect(canvas.width - 80, 0, 80, canvas.height);

    // Fridge door seal on edges
    ctx.fillStyle = '#708090';
    ctx.fillRect(0, 0, 8, canvas.height);
    ctx.fillRect(canvas.width - 8, 0, 8, canvas.height);
    ctx.fillRect(0, 0, canvas.width, 6);

    // Some background fridge items (decorative)
    // Milk carton in back
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.fillRect(650, 320, 30, 50);
    ctx.fillStyle = 'rgba(100, 150, 200, 0.3)';
    ctx.fillRect(650, 320, 30, 15);

    // Jar in back
    ctx.fillStyle = 'rgba(200, 100, 100, 0.25)';
    ctx.beginPath();
    ctx.arc(720, 360, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(220, 220, 220, 0.3)';
    ctx.fillRect(705, 335, 30, 8);

    // Butter dish in back
    ctx.fillStyle = 'rgba(255, 230, 150, 0.35)';
    ctx.fillRect(50, 350, 45, 25);
    ctx.fillStyle = 'rgba(240, 240, 240, 0.4)';
    ctx.fillRect(48, 345, 50, 8);

    // Condiment bottles
    ctx.fillStyle = 'rgba(200, 50, 50, 0.25)';
    ctx.fillRect(100, 330, 15, 40);
    ctx.fillStyle = 'rgba(230, 200, 50, 0.25)';
    ctx.fillRect(120, 335, 15, 35);
}

// Collision detection
function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

// Update game state
function update(stepMs = STEP_MS) {
    // Horizontal movement
    if (keys.left) {
        mouse.velX = -mouse.speed;
        mouse.direction = -1;
    } else if (keys.right) {
        mouse.velX = mouse.speed;
        mouse.direction = 1;
    } else {
        mouse.velX = 0;
    }

    // Jumping
    if (keys.jump && mouse.onGround) {
        mouse.velY = -mouse.jumpForce;
        mouse.onGround = false;
    }

    // Apply gravity
    mouse.velY += game.gravity;

    // Move mouse
    mouse.x += mouse.velX;
    mouse.y += mouse.velY;

    // Screen boundaries
    if (mouse.x < 0) mouse.x = 0;
    if (mouse.x + mouse.width > canvas.width) mouse.x = canvas.width - mouse.width;

    // Platform collision
    mouse.onGround = false;
    platforms.forEach(plat => {
        if (checkCollision(mouse, plat)) {
            // Check if landing on top
            if (mouse.velY > 0 && mouse.y + mouse.height - mouse.velY <= plat.y + 5) {
                mouse.y = plat.y - mouse.height;
                mouse.velY = 0;
                mouse.onGround = true;
            }
            // Check if hitting from below
            else if (mouse.velY < 0 && mouse.y - mouse.velY >= plat.y + plat.height - 5) {
                mouse.y = plat.y + plat.height;
                mouse.velY = 0;
            }
            // Side collision
            else if (mouse.velX > 0) {
                mouse.x = plat.x - mouse.width;
            } else if (mouse.velX < 0) {
                mouse.x = plat.x + plat.width;
            }
        }
    });

    // Cheese collection
    cheeses.forEach(cheese => {
        if (!cheese.collected && checkCollision(mouse, cheese)) {
            cheese.collected = true;
            game.score += 10;
            scoreDisplay.textContent = game.score;
        }
    });

    // Check if all cheese collected
    if (cheeses.every(c => c.collected)) {
        game.level++;
        levelDisplay.textContent = game.level;
        initLevel(game.level);
    }

    // Update power-up timer
    if (mouse.powerUp) {
        mouse.powerUpTimer -= stepMs;
        powerUpDisplay.style.display = 'inline';
        // Blink when about to expire
        if (mouse.powerUpTimer < 1000) {
            powerUpDisplay.style.opacity = Math.sin(mouse.powerUpTimer * 0.018) > 0 ? 1 : 0.3;
        }
        if (mouse.powerUpTimer <= 0) {
            mouse.powerUp = null;
            mouse.speed = 5;
            powerUpDisplay.style.display = 'none';
            powerUpDisplay.style.opacity = 1;
        }
    }

    // Update enemies
    game.damageCooldown = Math.max(0, game.damageCooldown - stepMs);
    for (const enemy of enemies) {
        // Skip if flattened and timer expired
        if (enemy.flattened) {
            enemy.flattenTimer -= stepMs;
            if (enemy.flattenTimer <= 0) {
                // Remove flattened enemy by marking for removal
                enemy.removed = true;
            }
            continue;
        }

        // Old man agitation - check distance to mouse
        if (enemy.type === 'oldman') {
            const dx = Math.abs((enemy.x + enemy.width / 2) - (mouse.x + mouse.width / 2));
            const dy = Math.abs((enemy.y + enemy.height / 2) - (mouse.y + mouse.height / 2));
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 150) {
                enemy.agitated = true;
                // Start jumping if on ground and not already jumping
                if (!enemy.jumping && enemy.y >= enemy.baseY) {
                    enemy.velY = -8;
                    enemy.jumping = true;
                }
            } else {
                enemy.agitated = false;
            }

            // Apply gravity to jumping old man
            if (enemy.jumping) {
                enemy.velY += game.gravity;
                enemy.y += enemy.velY;

                // Land back on platform
                if (enemy.y >= enemy.baseY) {
                    enemy.y = enemy.baseY;
                    enemy.velY = 0;
                    enemy.jumping = false;
                }
            }

            // Faster newspaper swing when agitated
            if (enemy.agitated) {
                enemy.swingAngle = Math.sin(enemy.frameTime * 0.4) * 0.8;
            } else {
                enemy.swingAngle = Math.sin(enemy.frameTime * 0.15) * 0.5;
            }
        }

        // Move enemy
        enemy.x += enemy.speed * enemy.direction;
        enemy.frameTime++;

        // Patrol bounds
        if (enemy.x <= enemy.patrolMin) {
            enemy.x = enemy.patrolMin;
            enemy.direction = 1;
        } else if (enemy.x >= enemy.patrolMax) {
            enemy.x = enemy.patrolMax;
            enemy.direction = -1;
        }

        // Check collision with mouse
        if (checkCollision(mouse, enemy)) {
            // Check if mouse is stomping from above
            const mouseBottom = mouse.y + mouse.height;
            const enemyTop = enemy.y;
            const stompingFromAbove = mouse.velY > 0 && mouseBottom - mouse.velY <= enemyTop + 10;

            if (stompingFromAbove) {
                // Stomp the enemy!
                enemy.flattened = true;
                enemy.flattenTimer = FLATTENED_MS;
                enemy.height = enemy.originalHeight * 0.25; // Squish!
                enemy.y = enemy.baseY + enemy.originalHeight - enemy.height;

                // Bounce mouse up
                mouse.velY = -10;

                // Give power-up
                mouse.powerUp = 'speed';
                mouse.powerUpTimer = POWER_UP_MS;
                mouse.speed = 8;

                // Bonus points
                game.score += 25;
                scoreDisplay.textContent = game.score;
            } else if (!mouse.powerUp && game.damageCooldown <= 0) {
                // Mouse gets hit - lose some cheese and respawn
                game.score = Math.max(0, game.score - 5);
                scoreDisplay.textContent = game.score;
                mouse.x = SPAWN.x;
                mouse.y = SPAWN.y;
                mouse.velX = 0;
                mouse.velY = 0;
                game.damageCooldown = DAMAGE_COOLDOWN_MS;
                break;
            }
        }
    }

    // Remove flattened enemies
    enemies = enemies.filter(e => !e.removed);

    // Fall off screen - reset position
    if (mouse.y > canvas.height) {
        mouse.x = SPAWN.x;
        mouse.y = SPAWN.y;
        mouse.velY = 0;
        mouse.powerUp = null;
        mouse.powerUpTimer = 0;
        mouse.speed = 5;
        powerUpDisplay.style.display = 'none';
    }
}

// Render game
function render() {
    drawBackground();
    drawPlatforms();
    cheeses.forEach(drawCheese);

    // Draw enemies
    enemies.forEach(enemy => {
        if (enemy.type === 'cat') {
            drawCat(enemy);
        } else if (enemy.type === 'oldman') {
            drawOldMan(enemy);
        }
    });

    drawMouse();
}

// Game loop
let previousTime = performance.now();
let accumulator = 0;
function advanceFrame(elapsedMs) {
    accumulator += Math.min(100, elapsedMs);
    while (accumulator >= STEP_MS) {
        update(STEP_MS);
        accumulator -= STEP_MS;
    }
}
function gameLoop(now) {
    if (game.running) advanceFrame(now - previousTime);
    previousTime = now;
    render();
    requestAnimationFrame(gameLoop);
}

// Event listeners
function setControl(control, isPressed) {
    switch(control) {
        case 'left':
            keys.left = isPressed;
            break;
        case 'right':
            keys.right = isPressed;
            break;
        case 'jump':
            keys.jump = isPressed;
            break;
    }
}

function controlFromKey(key) {
    switch(key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
            return 'left';
        case 'ArrowRight':
        case 'd':
        case 'D':
            return 'right';
        case 'ArrowUp':
        case 'w':
        case 'W':
        case ' ':
            return 'jump';
        default:
            return null;
    }
}

function shouldHandleGameplayKey(event) {
    return !event.metaKey && !event.ctrlKey && !event.altKey &&
        !event.target.closest('button, input, select, textarea, a[href]');
}

function releaseAllControls() {
    keys.left = false;
    keys.right = false;
    keys.jump = false;

    touchControls.forEach(button => {
        button.classList.remove('is-pressed');
    });
}

document.addEventListener('keydown', (e) => {
    const control = controlFromKey(e.key);

    if (!control || !shouldHandleGameplayKey(e)) {
        return;
    }

    setControl(control, true);

    e.preventDefault();
});

document.addEventListener('keyup', (e) => {
    const control = controlFromKey(e.key);

    if (!control || !shouldHandleGameplayKey(e)) {
        return;
    }

    setControl(control, false);

    e.preventDefault();
});

touchControls.forEach(button => {
    const control = button.dataset.control;

    button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        button.classList.add('is-pressed');
        setControl(control, true);
    });

    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(eventName, (e) => {
            e.preventDefault();
            button.classList.remove('is-pressed');
            setControl(control, false);
        });
    }
});

window.addEventListener('blur', releaseAllControls);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAllControls();
});

window.__cheeseworldTest = {
    initLevel,
    step(milliseconds) {
        const count = Math.round(milliseconds / STEP_MS);
        for (let i = 0; i < count; i++) update(STEP_MS);
    },
    runFrameDeltas(deltas) {
        accumulator = 0;
        deltas.forEach(advanceFrame);
    },
    setSeed(seed) {
        game.seed = seed >>> 0;
    },
    state() {
        return {
            game: { ...game },
            mouse: { ...mouse },
            platforms: platforms.map(platform => ({ ...platform })),
            enemies: enemies.map(enemy => ({ ...enemy })),
            keys: { ...keys }
        };
    },
    arrangeDamageTest() {
        game.running = false;
        game.score = 20;
        game.damageCooldown = 0;
        mouse.powerUp = null;
        mouse.x = 200;
        mouse.y = 435;
        mouse.velX = 0;
        mouse.velY = 0;
        cheeses = [{ x: 700, y: 100, width: 25, height: 20, collected: false }];
        enemies = [0, 1].map(() => ({
            type: 'cat', x: 200, y: 400, baseY: 400, width: 50, height: 40,
            originalHeight: 40, speed: 0, direction: 1, patrolMin: 200,
            patrolMax: 200, frameTime: 0, flattened: false, flattenTimer: 0,
            velY: 0, jumping: false
        }));
        scoreDisplay.textContent = game.score;
    }
};

// Start game
initLevel(1);
requestAnimationFrame(gameLoop);
