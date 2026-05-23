// Matter.js module aliases
const { Engine, Render, Runner, World, Bodies, Body, Events, Constraint, Composite, Vector } = Matter;

// Level definitions
const LEVELS = [
    {
        id: 0,
        name: "Level 1: Getting Started",
        background: "linear-gradient(to bottom, #4a5568 0%, #2d3748 50%, #1a202c 100%)",
        availableGoo: 50,
        goalCount: 5,
        pipePosition: { x: 1100, y: 650 },
        groundHeight: 50,
        initialStructure: [
            { x: 150, y: 700, anchored: true },
            { x: 250, y: 700, anchored: true },
            { x: 200, y: 620, anchored: false }
        ],
        platforms: []
    },
    {
        id: 1,
        name: "Level 2: The Gap",
        background: "linear-gradient(to bottom, #1e3a8a 0%, #1e40af 50%, #1e293b 100%)",
        availableGoo: 40,
        goalCount: 8,
        pipePosition: { x: 1100, y: 600 },
        groundHeight: 50,
        initialStructure: [
            { x: 100, y: 700, anchored: true },
            { x: 200, y: 700, anchored: true },
            { x: 150, y: 620, anchored: false }
        ],
        platforms: [
            { x: 600, y: 500, width: 200, height: 20 }
        ]
    },
    {
        id: 2,
        name: "Level 3: Sky High",
        background: "linear-gradient(to bottom, #7c3aed 0%, #a78bfa 30%, #4c1d95 100%)",
        availableGoo: 60,
        goalCount: 10,
        pipePosition: { x: 1050, y: 200 },
        groundHeight: 50,
        initialStructure: [
            { x: 150, y: 700, anchored: true },
            { x: 250, y: 700, anchored: true },
            { x: 350, y: 700, anchored: true },
            { x: 200, y: 620, anchored: false },
            { x: 300, y: 620, anchored: false }
        ],
        platforms: []
    },
    {
        id: 3,
        name: "Level 4: Obstacle Course",
        background: "linear-gradient(to bottom, #065f46 0%, #047857 50%, #064e3b 100%)",
        availableGoo: 45,
        goalCount: 6,
        pipePosition: { x: 1050, y: 650 },
        groundHeight: 50,
        initialStructure: [
            { x: 100, y: 700, anchored: true },
            { x: 180, y: 700, anchored: true }
        ],
        platforms: [
            { x: 400, y: 600, width: 150, height: 20 },
            { x: 650, y: 450, width: 150, height: 20 },
            { x: 850, y: 550, width: 150, height: 20 }
        ]
    },
    {
        id: 4,
        name: "Level 5: The Chasm",
        background: "linear-gradient(to bottom, #991b1b 0%, #dc2626 40%, #7f1d1d 100%)",
        availableGoo: 70,
        goalCount: 12,
        pipePosition: { x: 1100, y: 700 },
        groundHeight: 50,
        initialStructure: [
            { x: 100, y: 700, anchored: true },
            { x: 150, y: 700, anchored: true }
        ],
        platforms: [
            { x: 300, y: 650, width: 100, height: 20 },
            { x: 500, y: 600, width: 100, height: 20 },
            { x: 700, y: 550, width: 100, height: 20 },
            { x: 900, y: 650, width: 100, height: 20 }
        ]
    }
];

class GooGame {
    constructor() {
        this.svg = document.getElementById('game-svg');
        this.gooLayer = document.getElementById('goo-layer');
        this.connectionsLayer = document.getElementById('connections-layer');
        this.staticLayer = document.getElementById('static-layer');

        this.width = 1200;
        this.height = 800;

        // Level state
        this.currentLevelId = 0;
        this.currentLevel = LEVELS[0];

        // Game state
        this.gooBalls = [];
        this.connections = [];
        this.availableGoo = this.currentLevel.availableGoo;
        this.goalCount = this.currentLevel.goalCount;
        this.gooBallsInPipe = 0;
        this.platforms = [];

        // Interaction state
        this.selectedGoo = null;
        this.previewLine = null;
        this.previewLines = [];
        this.explodeMode = false;
        this.pickupMode = false;
        this.poopRainActive = false;
        this.poopInterval = null;
        this.poopBalls = [];
        this.goalReached = false;
        this.winAnimationActive = false;

        // Audio context for sounds
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        this.initPhysics();
        this.createLevel();
        this.setupEventListeners();
        this.startGameLoop();

        // Set initial level name
        document.getElementById('level-name').textContent = this.currentLevel.name;
        this.updateUI();
    }

    initPhysics() {
        // Create Matter.js engine
        this.engine = Engine.create({
            gravity: { x: 0, y: 1 }
        });

        this.world = this.engine.world;

        // Create runner
        this.runner = Runner.create();
        Runner.run(this.runner, this.engine);
    }

    createLevel() {
        const level = this.currentLevel;

        // Set background
        this.svg.style.background = level.background;

        // Ground
        const groundHeight = level.groundHeight;
        const ground = Bodies.rectangle(
            this.width / 2,
            this.height - groundHeight / 2,
            this.width,
            groundHeight,
            { isStatic: true, label: 'ground' }
        );
        World.add(this.world, ground);

        // Draw ground in SVG
        const groundRect = this.createSVGElement('rect', {
            x: 0,
            y: this.height - groundHeight,
            width: this.width,
            height: groundHeight,
            class: 'ground'
        });
        this.staticLayer.appendChild(groundRect);

        // Create platforms
        level.platforms.forEach(platformConfig => {
            const platform = Bodies.rectangle(
                platformConfig.x,
                platformConfig.y,
                platformConfig.width,
                platformConfig.height,
                { isStatic: true, label: 'platform' }
            );
            World.add(this.world, platform);

            const platformRect = this.createSVGElement('rect', {
                x: platformConfig.x - platformConfig.width / 2,
                y: platformConfig.y - platformConfig.height / 2,
                width: platformConfig.width,
                height: platformConfig.height,
                fill: '#2d3748',
                stroke: '#4a5568',
                'stroke-width': 3,
                rx: 3
            });
            this.staticLayer.appendChild(platformRect);
            this.platforms.push({ body: platform, element: platformRect });
        });

        // Goal pipe
        this.pipeX = level.pipePosition.x;
        this.pipeY = level.pipePosition.y;
        this.pipeWidth = 80;
        this.pipeHeight = 100;

        // Pipe sensor (no collision)
        this.pipeSensor = Bodies.rectangle(
            this.pipeX,
            this.pipeY,
            this.pipeWidth,
            this.pipeHeight,
            {
                isStatic: true,
                isSensor: true,
                label: 'pipe',
                render: { fillStyle: '#48bb78' }
            }
        );
        World.add(this.world, this.pipeSensor);

        // Draw toilet emoji as goal
        const pipeGroup = this.createSVGElement('g', {});

        const toiletText = this.createSVGElement('text', {
            x: this.pipeX,
            y: this.pipeY,
            'text-anchor': 'middle',
            'dominant-baseline': 'middle',
            'font-size': '80',
        });
        toiletText.textContent = '🚽';

        pipeGroup.appendChild(toiletText);
        this.staticLayer.appendChild(pipeGroup);

        // Create initial structure (a few connected goo balls to start)
        this.createInitialStructure();
    }

    createInitialStructure() {
        const level = this.currentLevel;
        const createdBalls = [];

        // Create goo balls from level config
        level.initialStructure.forEach(config => {
            const goo = this.createGooBall(config.x, config.y, true, config.anchored);
            createdBalls.push(goo);
        });

        // Auto-connect nearby goo balls in initial structure
        for (let i = 0; i < createdBalls.length; i++) {
            for (let j = i + 1; j < createdBalls.length; j++) {
                const dx = createdBalls[i].body.position.x - createdBalls[j].body.position.x;
                const dy = createdBalls[i].body.position.y - createdBalls[j].body.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Connect if within range (120 pixels)
                if (distance < 120) {
                    this.createConnection(createdBalls[i], createdBalls[j]);
                }
            }
        }
    }

    createGooBall(x, y, isStructure = false, isAnchored = false) {
        const radius = 15;

        // Create physics body
        const body = Bodies.circle(x, y, radius, {
            restitution: 0.3,
            friction: 0.5,
            density: 0.001,
            label: 'goo'
        });

        if (isAnchored) {
            Body.setStatic(body, true);
        }

        World.add(this.world, body);

        // Create SVG element (poop emoji)
        const text = this.createSVGElement('text', {
            x: x,
            y: y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-size': '30',
            class: isStructure ? 'goo-ball placed' : 'goo-ball',
            'pointer-events': 'all'
        });
        text.textContent = '💩';

        const gooBall = {
            body,
            element: text,
            radius,
            connections: [],
            maxConnections: isAnchored ? 10 : 6, // Anchored goos can have more connections
            isStructure,
            isAnchored,
            inPipe: false
        };

        this.gooBalls.push(gooBall);
        this.gooLayer.appendChild(text);

        // Always add click listener for all goo balls
        text.style.cursor = 'pointer';
        text.addEventListener('click', (e) => this.onGooBallClick(gooBall, e));

        return gooBall;
    }

    createConnection(goo1, goo2) {
        // Check if connection already exists
        const exists = this.connections.some(conn =>
            (conn.goo1 === goo1 && conn.goo2 === goo2) ||
            (conn.goo1 === goo2 && conn.goo2 === goo1)
        );

        if (exists) return null;

        // Check if both goo balls have available connection slots
        if (goo1.connections.length >= goo1.maxConnections) return null;
        if (goo2.connections.length >= goo2.maxConnections) return null;

        // Create physics constraint
        const constraint = Constraint.create({
            bodyA: goo1.body,
            bodyB: goo2.body,
            stiffness: 0.4,
            damping: 0.1,
            length: Vector.magnitude(Vector.sub(goo1.body.position, goo2.body.position))
        });

        World.add(this.world, constraint);

        // Create SVG line
        const line = this.createSVGElement('line', {
            x1: goo1.body.position.x,
            y1: goo1.body.position.y,
            x2: goo2.body.position.x,
            y2: goo2.body.position.y,
            class: 'connection'
        });

        const connection = {
            goo1,
            goo2,
            constraint,
            element: line,
            originalLength: constraint.length
        };

        this.connections.push(connection);
        this.connectionsLayer.appendChild(line);

        goo1.connections.push(connection);
        goo2.connections.push(connection);

        return connection;
    }

    onGooBallClick(gooBall, event) {
        event.stopPropagation();

        // Explode mode - destroy the goo ball
        if (this.explodeMode) {
            this.explodeGooBall(gooBall);
            return;
        }

        // Pickup mode - pick up the goo ball
        if (this.pickupMode) {
            this.pickupGooBall(gooBall);
            return;
        }

        if (!this.selectedGoo) {
            // Select this goo
            this.selectedGoo = gooBall;
            gooBall.element.setAttribute('stroke', '#f6ad55');
            gooBall.element.setAttribute('stroke-width', '4');
        } else if (this.selectedGoo === gooBall) {
            // Deselect
            this.deselectGoo();
        } else {
            // Create connection between selected and clicked
            this.createConnection(this.selectedGoo, gooBall);
            this.deselectGoo();
        }
    }

    deselectGoo() {
        if (this.selectedGoo) {
            this.selectedGoo.element.setAttribute('stroke', '#2d3748');
            this.selectedGoo.element.setAttribute('stroke-width', '2');
            this.selectedGoo = null;
        }
    }

    setupEventListeners() {
        this.svg.addEventListener('click', (e) => this.onSVGClick(e));
        this.svg.addEventListener('mousemove', (e) => this.onMouseMove(e));

        document.getElementById('reset-btn').addEventListener('click', () => this.reset());
        document.getElementById('explode-btn').addEventListener('click', () => this.toggleExplodeMode());
        document.getElementById('pickup-btn').addEventListener('click', () => this.togglePickupMode());
        document.getElementById('poop-btn').addEventListener('click', () => this.togglePoopRain());

        // Level selector buttons
        document.querySelectorAll('.level-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const levelId = parseInt(e.target.dataset.level);
                this.loadLevel(levelId);
            });
        });

        // Set initial active level button
        this.updateLevelButtons();

        // Collision detection for pipe
        Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => {
                if (pair.bodyA.label === 'pipe' || pair.bodyB.label === 'pipe') {
                    const gooBody = pair.bodyA.label === 'goo' ? pair.bodyA :
                                   (pair.bodyB.label === 'goo' ? pair.bodyB : null);

                    if (gooBody) {
                        const gooBall = this.gooBalls.find(g => g.body === gooBody);
                        if (gooBall && !gooBall.inPipe && !this.goalReached) {
                            gooBall.inPipe = true;
                            this.gooBallsInPipe++;

                            // First goo ball reaches goal - trigger win animation!
                            if (!this.goalReached) {
                                this.goalReached = true;
                                this.playGoalSound();
                                this.startWinAnimation();
                            }
                        }
                    }
                }
            });
        });
    }

    toggleExplodeMode() {
        this.explodeMode = !this.explodeMode;
        const btn = document.getElementById('explode-btn');

        if (this.explodeMode) {
            // Turn off pickup mode if it's on
            if (this.pickupMode) {
                this.togglePickupMode();
            }

            btn.classList.add('active');
            btn.textContent = '💥 Click to Explode!';
            this.svg.classList.add('explode-mode');
            this.deselectGoo();

            // Clear preview lines when entering explode mode
            this.previewLines.forEach(line => line.remove());
            this.previewLines = [];
        } else {
            btn.classList.remove('active');
            btn.textContent = '💣 Explode Mode';
            this.svg.classList.remove('explode-mode');
        }
    }

    togglePickupMode() {
        this.pickupMode = !this.pickupMode;
        const btn = document.getElementById('pickup-btn');

        if (this.pickupMode) {
            // Turn off explode mode if it's on
            if (this.explodeMode) {
                this.toggleExplodeMode();
            }

            btn.classList.add('active');
            btn.textContent = '✋ Click to Pick Up!';
            this.svg.classList.add('pickup-mode');
            this.deselectGoo();

            // Clear preview lines when entering pickup mode
            this.previewLines.forEach(line => line.remove());
            this.previewLines = [];
        } else {
            btn.classList.remove('active');
            btn.textContent = '✋ Pick Up Mode';
            this.svg.classList.remove('pickup-mode');
        }
    }

    togglePoopRain() {
        this.poopRainActive = !this.poopRainActive;
        const btn = document.getElementById('poop-btn');

        if (this.poopRainActive) {
            btn.classList.add('active');
            btn.textContent = '💩 RAINING!';
            this.startPoopRain();
        } else {
            btn.classList.remove('active');
            btn.textContent = '💩 Poop Rain';
            this.stopPoopRain();
        }
    }

    playGoalSound() {
        const ctx = this.audioContext;
        const now = ctx.currentTime;

        // Create a celebration sound with rising notes
        const notes = [262, 330, 392, 523, 659]; // C, E, G, C5, E5

        notes.forEach((freq, i) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.frequency.value = freq;
            oscillator.type = 'sine';

            const startTime = now + (i * 0.15);
            const endTime = startTime + 0.3;

            gainNode.gain.setValueAtTime(0.3, startTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, endTime);

            oscillator.start(startTime);
            oscillator.stop(endTime);
        });

        // Add some sparkle sounds
        for (let i = 0; i < 10; i++) {
            setTimeout(() => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.frequency.value = 800 + Math.random() * 1200;
                osc.type = 'sine';

                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

                osc.start();
                osc.stop(ctx.currentTime + 0.1);
            }, i * 100);
        }
    }

    startWinAnimation() {
        this.winAnimationActive = true;

        // Update UI to show winning
        document.getElementById('goal-counter').innerHTML = '<span style="color: #48bb78; font-size: 24px;">💩 FLUSHING! 💩</span>';

        // Disable interaction during animation
        if (this.explodeMode) this.toggleExplodeMode();
        if (this.pickupMode) this.togglePickupMode();

        // Remove all connections to free the goo balls
        setTimeout(() => {
            this.connections.forEach(conn => {
                World.remove(this.world, conn.constraint);
                conn.element.remove();
            });
            this.connections = [];
        }, 500);

        // Start flush animation for each goo ball
        this.gooBalls.forEach((goo, index) => {
            if (goo.isAnchored) return;
            this.flushGooBall(goo, index);
        });

        // Show win message after all balls flush away
        setTimeout(() => {
            alert('🚽 FLUSHED! All poop made it to the toilet! 🚽');
        }, 4000);
    }

    flushGooBall(goo, index) {
        const startTime = Date.now();
        const duration = 3000; // 3 seconds for flush animation
        const targetX = this.pipeX;
        const targetY = this.pipeY;

        let angle = 0;
        let radius = 0;

        const animate = () => {
            if (!this.winAnimationActive || !goo.element) return;

            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Spiral inward: radius decreases as we progress
            const currentX = goo.body.position.x;
            const currentY = goo.body.position.y;
            const distToTarget = Math.sqrt((targetX - currentX) ** 2 + (targetY - currentY) ** 2);

            // Spin faster as we get closer
            angle += 0.15 + (1 - progress) * 0.1;

            // Spiral force: circular motion while moving toward center
            const spiralRadius = distToTarget * (1 - progress * 0.7);
            const forceX = Math.cos(angle) * 0.0005 + (targetX - currentX) * 0.001;
            const forceY = Math.sin(angle) * 0.0005 + (targetY - currentY) * 0.001;

            Body.applyForce(goo.body, goo.body.position, { x: forceX, y: forceY });

            // Rotate the poop emoji
            const rotation = angle * 180 / Math.PI;
            goo.element.setAttribute('transform', `rotate(${rotation} ${currentX} ${currentY})`);

            // Fade out and shrink as it gets closer
            const scale = 1 - progress * 0.8;
            const opacity = 1 - progress;
            goo.element.style.opacity = opacity;
            goo.element.style.fontSize = `${30 * scale}px`;

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Remove the goo ball when animation completes
                goo.element.remove();
                World.remove(this.world, goo.body);
            }
        };

        // Start animation with slight delay based on index
        setTimeout(() => {
            requestAnimationFrame(animate);
        }, index * 50);
    }

    startPoopRain() {
        // Spawn poop every 300ms
        this.poopInterval = setInterval(() => {
            this.spawnPoop();
        }, 300);
    }

    stopPoopRain() {
        if (this.poopInterval) {
            clearInterval(this.poopInterval);
            this.poopInterval = null;
        }
    }

    spawnPoop() {
        const x = Math.random() * this.width;
        const y = -30;
        const radius = 20;

        // Create physics body
        const body = Bodies.circle(x, y, radius, {
            restitution: 0.6,
            friction: 0.3,
            density: 0.002,
            label: 'poop'
        });

        World.add(this.world, body);

        // Create SVG text element for poop emoji
        const poopText = this.createSVGElement('text', {
            x: x,
            y: y,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-size': '32',
            class: 'poop-emoji',
            style: 'pointer-events: none; user-select: none;'
        });
        poopText.textContent = '💩';

        const poop = {
            body,
            element: poopText,
            radius,
            hasExploded: false
        };

        this.poopBalls.push(poop);
        this.gooLayer.appendChild(poopText);

        // Listen for collisions
        Events.on(this.engine, 'collisionStart', (event) => {
            event.pairs.forEach(pair => {
                if ((pair.bodyA === body || pair.bodyB === body) && !poop.hasExploded) {
                    const otherBody = pair.bodyA === body ? pair.bodyB : pair.bodyA;
                    // Explode on contact with ground or platforms
                    if (otherBody.label === 'ground' || otherBody.label === 'platform') {
                        poop.hasExploded = true;
                        setTimeout(() => this.explodePoop(poop), 50);
                    }
                }
            });
        });
    }

    explodePoop(poop) {
        if (!poop.body || !poop.element) return;

        // Create explosion
        this.createPoopExplosion(poop.body.position.x, poop.body.position.y);

        // Remove physics body and element
        World.remove(this.world, poop.body);
        poop.element.remove();

        // Remove from array
        const index = this.poopBalls.indexOf(poop);
        if (index > -1) {
            this.poopBalls.splice(index, 1);
        }
    }

    createPoopExplosion(x, y) {
        const particleCount = 15;
        const emojis = ['💩', '💨', '💥', '✨'];

        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const distance = 40 + Math.random() * 30;
            const endX = x + Math.cos(angle) * distance;
            const endY = y + Math.sin(angle) * distance;

            const particle = this.createSVGElement('text', {
                x: x,
                y: y,
                'text-anchor': 'middle',
                'dominant-baseline': 'central',
                'font-size': Math.random() > 0.5 ? '20' : '16',
                style: 'pointer-events: none;'
            });
            particle.textContent = emojis[Math.floor(Math.random() * emojis.length)];

            this.gooLayer.appendChild(particle);

            // Animate particle
            particle.style.transition = 'all 0.8s ease-out';
            setTimeout(() => {
                particle.setAttribute('x', endX);
                particle.setAttribute('y', endY);
                particle.style.opacity = '0';
                particle.style.fontSize = '8px';
            }, 10);

            // Remove after animation
            setTimeout(() => particle.remove(), 850);
        }
    }

    explodeGooBall(gooBall) {
        // Don't explode anchored goo balls
        if (gooBall.isAnchored) {
            return;
        }

        // Create explosion particles
        this.createExplosionEffect(gooBall.body.position.x, gooBall.body.position.y);

        // Remove all connections
        const connectionsToRemove = [...gooBall.connections];
        connectionsToRemove.forEach(conn => {
            // Remove from the other goo ball's connections
            const otherGoo = conn.goo1 === gooBall ? conn.goo2 : conn.goo1;
            otherGoo.connections = otherGoo.connections.filter(c => c !== conn);

            // Remove from world and DOM
            World.remove(this.world, conn.constraint);
            conn.element.remove();

            // Remove from connections array
            const index = this.connections.indexOf(conn);
            if (index > -1) {
                this.connections.splice(index, 1);
            }
        });

        // Remove goo ball
        World.remove(this.world, gooBall.body);
        gooBall.element.remove();

        // Remove from gooBalls array
        const index = this.gooBalls.indexOf(gooBall);
        if (index > -1) {
            this.gooBalls.splice(index, 1);
        }

        // If it was in the pipe, decrement counter
        if (gooBall.inPipe) {
            this.gooBallsInPipe--;
            this.updateUI();
        }
    }

    pickupGooBall(gooBall) {
        // Don't pick up anchored goo balls
        if (gooBall.isAnchored) {
            return;
        }

        // Remove all connections
        const connectionsToRemove = [...gooBall.connections];
        connectionsToRemove.forEach(conn => {
            // Remove from the other goo ball's connections
            const otherGoo = conn.goo1 === gooBall ? conn.goo2 : conn.goo1;
            otherGoo.connections = otherGoo.connections.filter(c => c !== conn);

            // Remove from world and DOM
            World.remove(this.world, conn.constraint);
            conn.element.remove();

            // Remove from connections array
            const index = this.connections.indexOf(conn);
            if (index > -1) {
                this.connections.splice(index, 1);
            }
        });

        // Remove goo ball
        World.remove(this.world, gooBall.body);
        gooBall.element.remove();

        // Remove from gooBalls array
        const index = this.gooBalls.indexOf(gooBall);
        if (index > -1) {
            this.gooBalls.splice(index, 1);
        }

        // If it was in the pipe, decrement counter
        if (gooBall.inPipe) {
            this.gooBallsInPipe--;
        }

        // Return goo ball to available pool
        this.availableGoo++;
        this.updateUI();
    }

    createExplosionEffect(x, y) {
        const particleCount = 12;
        const colors = ['#f56565', '#fc8181', '#feb2b2', '#ed8936', '#f6ad55'];

        for (let i = 0; i < particleCount; i++) {
            const angle = (Math.PI * 2 * i) / particleCount;
            const distance = 30 + Math.random() * 20;
            const endX = x + Math.cos(angle) * distance;
            const endY = y + Math.sin(angle) * distance;

            const particle = this.createSVGElement('circle', {
                cx: x,
                cy: y,
                r: 3 + Math.random() * 3,
                fill: colors[Math.floor(Math.random() * colors.length)],
                class: 'particle'
            });

            this.gooLayer.appendChild(particle);

            // Animate particle
            particle.style.transition = 'all 0.6s ease-out';
            setTimeout(() => {
                particle.setAttribute('cx', endX);
                particle.setAttribute('cy', endY);
                particle.style.opacity = '0';
            }, 10);

            // Remove after animation
            setTimeout(() => particle.remove(), 650);
        }
    }

    onSVGClick(event) {
        // Don't place balls in explode or pickup mode or during win animation
        if (this.explodeMode || this.pickupMode || this.winAnimationActive) return;

        if (this.availableGoo <= 0) return;

        const rect = this.svg.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        // Check if clicking on existing structure
        const clickedGoo = this.gooBalls.find(goo => {
            const dx = goo.body.position.x - x;
            const dy = goo.body.position.y - y;
            return Math.sqrt(dx * dx + dy * dy) < goo.radius;
        });

        if (clickedGoo) return;

        // Check placement constraint: must be within radius of at least 2 goo balls with available connection slots
        const maxConnectionDistance = 150;

        const nearbyGoosWithSlots = this.gooBalls.filter(goo => {
            const dx = goo.body.position.x - x;
            const dy = goo.body.position.y - y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            return distance < maxConnectionDistance && goo.connections.length < goo.maxConnections;
        });

        if (nearbyGoosWithSlots.length < 2) {
            // Not enough nearby goo balls with available slots, placement not allowed
            return;
        }

        // Place new goo ball
        const newGoo = this.createGooBall(x, y, true, false);
        this.availableGoo--;

        // Find nearby goo balls with available connection slots, sorted by distance
        const nearbyGoos = this.gooBalls
            .filter(goo => goo !== newGoo && goo.isStructure)
            .map(goo => {
                const dx = goo.body.position.x - x;
                const dy = goo.body.position.y - y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                return { goo, distance };
            })
            .filter(item => item.distance < maxConnectionDistance)
            .filter(item => item.goo.connections.length < item.goo.maxConnections)
            .sort((a, b) => a.distance - b.distance);

        // Create connections to nearby goo balls (up to the new goo's max connections)
        for (const item of nearbyGoos) {
            if (newGoo.connections.length >= newGoo.maxConnections) break;
            this.createConnection(newGoo, item.goo);
        }

        this.updateUI();
    }

    onMouseMove(event) {
        const rect = this.svg.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;

        if (this.selectedGoo) {
            // Show preview line when goo is selected
            if (!this.previewLine) {
                this.previewLine = this.createSVGElement('line', {
                    class: 'connection',
                    style: 'stroke: #f6ad55; stroke-dasharray: 5,5;'
                });
                this.connectionsLayer.appendChild(this.previewLine);
            }

            this.previewLine.setAttribute('x1', this.selectedGoo.body.position.x);
            this.previewLine.setAttribute('y1', this.selectedGoo.body.position.y);
            this.previewLine.setAttribute('x2', x);
            this.previewLine.setAttribute('y2', y);
            this.previewLine.style.display = 'block';
        } else if (this.previewLine) {
            this.previewLine.style.display = 'none';
        }

        // Show connection preview lines when hovering (and goo available, not in explode or pickup mode)
        if (this.availableGoo > 0 && !this.selectedGoo && !this.explodeMode && !this.pickupMode) {
            // Clear old preview lines
            this.previewLines.forEach(line => line.remove());
            this.previewLines = [];

            const maxConnectionDistance = 150;
            const newGooMaxConnections = 6; // Default max connections for new goo balls

            // Find all goo balls within connection distance that have available slots
            const goosToConnect = this.gooBalls
                .filter(goo => goo.isStructure)
                .filter(goo => goo.connections.length < goo.maxConnections)
                .map(goo => {
                    const dx = goo.body.position.x - x;
                    const dy = goo.body.position.y - y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    return { goo, distance };
                })
                .filter(item => item.distance < maxConnectionDistance)
                .sort((a, b) => a.distance - b.distance)
                .slice(0, newGooMaxConnections);

            // Only show preview lines if placement would be valid (at least 2 goo balls with slots in range)
            if (goosToConnect.length >= 2) {
                // Create dashed lines to all nodes that will be connected
                goosToConnect.forEach(item => {
                    const previewLine = this.createSVGElement('line', {
                        x1: x,
                        y1: y,
                        x2: item.goo.body.position.x,
                        y2: item.goo.body.position.y,
                        stroke: '#48bb78',
                        'stroke-width': 2,
                        'stroke-dasharray': '5,5',
                        'pointer-events': 'none',
                        opacity: 0.7
                    });
                    this.connectionsLayer.insertBefore(previewLine, this.connectionsLayer.firstChild);
                    this.previewLines.push(previewLine);
                });
            }
        } else {
            // Clear preview lines when not hovering or no goo available
            this.previewLines.forEach(line => line.remove());
            this.previewLines = [];
        }
    }

    updateUI() {
        document.getElementById('goo-count').textContent = this.availableGoo;
        document.getElementById('goal-count').textContent = Math.max(0, this.goalCount - this.gooBallsInPipe);
    }

    startGameLoop() {
        const update = () => {
            // Update SVG elements to match physics bodies
            this.gooBalls.forEach(goo => {
                goo.element.setAttribute('x', goo.body.position.x);
                goo.element.setAttribute('y', goo.body.position.y);

                // Check for breaking stress
                goo.connections.forEach(conn => {
                    const currentLength = Vector.magnitude(Vector.sub(
                        conn.goo1.body.position,
                        conn.goo2.body.position
                    ));
                    const stress = currentLength / conn.originalLength;

                    if (stress > 2.5) {
                        conn.element.classList.add('stressed');
                    } else {
                        conn.element.classList.remove('stressed');
                    }
                });
            });

            // Update connection lines
            this.connections.forEach(conn => {
                conn.element.setAttribute('x1', conn.goo1.body.position.x);
                conn.element.setAttribute('y1', conn.goo1.body.position.y);
                conn.element.setAttribute('x2', conn.goo2.body.position.x);
                conn.element.setAttribute('y2', conn.goo2.body.position.y);
            });

            // Update poop positions
            this.poopBalls.forEach(poop => {
                if (poop.body && poop.element) {
                    poop.element.setAttribute('x', poop.body.position.x);
                    poop.element.setAttribute('y', poop.body.position.y);

                    // Remove poop that falls off screen
                    if (poop.body.position.y > this.height + 50) {
                        World.remove(this.world, poop.body);
                        poop.element.remove();
                        const index = this.poopBalls.indexOf(poop);
                        if (index > -1) {
                            this.poopBalls.splice(index, 1);
                        }
                    }
                }
            });

            requestAnimationFrame(update);
        };

        update();
    }

    reset() {
        // Clear everything
        this.gooBalls.forEach(goo => {
            World.remove(this.world, goo.body);
            goo.element.remove();
        });

        this.connections.forEach(conn => {
            World.remove(this.world, conn.constraint);
            conn.element.remove();
        });

        if (this.previewLine) {
            this.previewLine.remove();
            this.previewLine = null;
        }

        this.previewLines.forEach(line => line.remove());
        this.previewLines = [];

        // Clear poop balls
        this.poopBalls.forEach(poop => {
            if (poop.body) {
                World.remove(this.world, poop.body);
            }
            if (poop.element) {
                poop.element.remove();
            }
        });
        this.poopBalls = [];

        // Clear platforms
        this.platforms.forEach(platform => {
            if (platform.body) {
                World.remove(this.world, platform.body);
            }
            if (platform.element) {
                platform.element.remove();
            }
        });
        this.platforms = [];

        // Clear static layer (ground, pipe, platforms)
        while (this.staticLayer.firstChild) {
            this.staticLayer.removeChild(this.staticLayer.firstChild);
        }

        this.gooBalls = [];
        this.connections = [];
        this.availableGoo = this.currentLevel.availableGoo;
        this.goalCount = this.currentLevel.goalCount;
        this.gooBallsInPipe = 0;
        this.selectedGoo = null;
        this.goalReached = false;
        this.winAnimationActive = false;

        // Reset explode and pickup mode
        if (this.explodeMode) {
            this.toggleExplodeMode();
        }
        if (this.pickupMode) {
            this.togglePickupMode();
        }
        if (this.poopRainActive) {
            this.togglePoopRain();
        }

        // Recreate level
        this.createLevel();
        this.updateUI();
    }

    loadLevel(levelId) {
        if (levelId < 0 || levelId >= LEVELS.length) return;

        // Stop any active modes
        if (this.poopRainActive) {
            this.togglePoopRain();
        }
        if (this.explodeMode) {
            this.toggleExplodeMode();
        }
        if (this.pickupMode) {
            this.togglePickupMode();
        }

        // Clear current level
        this.gooBalls.forEach(goo => {
            World.remove(this.world, goo.body);
            goo.element.remove();
        });
        this.connections.forEach(conn => {
            World.remove(this.world, conn.constraint);
            conn.element.remove();
        });
        this.platforms.forEach(platform => {
            if (platform.body) {
                World.remove(this.world, platform.body);
            }
            if (platform.element) {
                platform.element.remove();
            }
        });
        this.poopBalls.forEach(poop => {
            if (poop.body) {
                World.remove(this.world, poop.body);
            }
            if (poop.element) {
                poop.element.remove();
            }
        });

        if (this.previewLine) {
            this.previewLine.remove();
            this.previewLine = null;
        }
        this.previewLines.forEach(line => line.remove());

        // Clear static layer
        while (this.staticLayer.firstChild) {
            this.staticLayer.removeChild(this.staticLayer.firstChild);
        }

        // Reset arrays
        this.gooBalls = [];
        this.connections = [];
        this.platforms = [];
        this.poopBalls = [];
        this.previewLines = [];
        this.selectedGoo = null;
        this.goalReached = false;
        this.winAnimationActive = false;

        // Load new level
        this.currentLevelId = levelId;
        this.currentLevel = LEVELS[levelId];
        this.availableGoo = this.currentLevel.availableGoo;
        this.goalCount = this.currentLevel.goalCount;
        this.gooBallsInPipe = 0;

        // Update UI
        document.getElementById('level-name').textContent = this.currentLevel.name;
        this.updateLevelButtons();

        // Create new level
        this.createLevel();
        this.updateUI();
    }

    updateLevelButtons() {
        document.querySelectorAll('.level-btn').forEach(btn => {
            const levelId = parseInt(btn.dataset.level);
            if (levelId === this.currentLevelId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    createSVGElement(type, attributes) {
        const element = document.createElementNS('http://www.w3.org/2000/svg', type);
        for (const [key, value] of Object.entries(attributes)) {
            element.setAttribute(key, value);
        }
        return element;
    }
}

// Start the game when page loads
window.addEventListener('DOMContentLoaded', () => {
    new GooGame();
});
