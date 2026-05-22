const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const keys = new Set();

// Change these values first when you want to make the starter game your own.
const comet = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 28,
  speed: 5
};

function keepInsideBoard() {
  comet.x = Math.max(comet.radius, Math.min(canvas.width - comet.radius, comet.x));
  comet.y = Math.max(comet.radius, Math.min(canvas.height - comet.radius, comet.y));
}

function moveComet() {
  if (keys.has("ArrowLeft")) {
    comet.x -= comet.speed;
  }

  if (keys.has("ArrowRight")) {
    comet.x += comet.speed;
  }

  if (keys.has("ArrowUp")) {
    comet.y -= comet.speed;
  }

  if (keys.has("ArrowDown")) {
    comet.y += comet.speed;
  }

  keepInsideBoard();
}

function drawStar(x, y, points, outerRadius, innerRadius) {
  context.beginPath();

  for (let point = 0; point < points * 2; point += 1) {
    const angle = (Math.PI / points) * point - Math.PI / 2;
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const nextX = x + Math.cos(angle) * radius;
    const nextY = y + Math.sin(angle) * radius;

    if (point === 0) {
      context.moveTo(nextX, nextY);
    } else {
      context.lineTo(nextX, nextY);
    }
  }

  context.closePath();
}

function drawBoard() {
  context.clearRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#b5e7ff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#fff1bd";
  context.fillRect(32, 32, canvas.width - 64, canvas.height - 64);

  context.strokeStyle = "#14263a";
  context.lineWidth = 4;
  context.strokeRect(32, 32, canvas.width - 64, canvas.height - 64);
}

function drawComet() {
  context.fillStyle = "#f26a5d";
  context.beginPath();
  context.moveTo(comet.x - 76, comet.y + 8);
  context.lineTo(comet.x - 18, comet.y - 18);
  context.lineTo(comet.x - 24, comet.y + 25);
  context.closePath();
  context.fill();

  context.fillStyle = "#ffd35f";
  context.strokeStyle = "#14263a";
  context.lineWidth = 4;
  drawStar(comet.x, comet.y, 5, comet.radius, comet.radius / 2.2);
  context.fill();
  context.stroke();
}

function frame() {
  moveComet();
  drawBoard();
  drawComet();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (event.key.startsWith("Arrow")) {
    event.preventDefault();
    keys.add(event.key);
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});

frame();
