const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const scoreLabel = document.querySelector("[data-score]");
const resetButton = document.querySelector("[data-reset]");
const keys = new Set();
const boardInset = 32;

// Change these values first when you want to make the starter game your own.
const comet = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  radius: 28,
  speed: 5
};
const spark = {
  x: 0,
  y: 0,
  radius: 18
};
let score = 0;

function keepInsideBoard() {
  comet.x = Math.max(
    boardInset + comet.radius,
    Math.min(canvas.width - boardInset - comet.radius, comet.x)
  );
  comet.y = Math.max(
    boardInset + comet.radius,
    Math.min(canvas.height - boardInset - comet.radius, comet.y)
  );
}

function activeKeys(...names) {
  return names.some((name) => keys.has(name));
}

function moveComet() {
  if (activeKeys("ArrowLeft", "a")) {
    comet.x -= comet.speed;
  }

  if (activeKeys("ArrowRight", "d")) {
    comet.x += comet.speed;
  }

  if (activeKeys("ArrowUp", "w")) {
    comet.y -= comet.speed;
  }

  if (activeKeys("ArrowDown", "s")) {
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
  context.fillRect(boardInset, boardInset, canvas.width - 64, canvas.height - 64);

  context.strokeStyle = "#14263a";
  context.lineWidth = 4;
  context.strokeRect(boardInset, boardInset, canvas.width - 64, canvas.height - 64);
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

function placeSpark() {
  const sparkPadding = boardInset + spark.radius + 18;

  do {
    spark.x = sparkPadding + Math.random() * (canvas.width - sparkPadding * 2);
    spark.y = sparkPadding + Math.random() * (canvas.height - sparkPadding * 2);
  } while (touchingSpark());
}

function drawSpark() {
  context.fillStyle = "#8fdb9a";
  context.strokeStyle = "#14263a";
  context.lineWidth = 4;
  drawStar(spark.x, spark.y, 6, spark.radius, spark.radius / 2.4);
  context.fill();
  context.stroke();
}

function touchingSpark() {
  return (
    Math.hypot(comet.x - spark.x, comet.y - spark.y) <
    comet.radius + spark.radius
  );
}

function updateScore() {
  scoreLabel.textContent = score === 1 ? "1 spark" : `${score} sparks`;
}

function collectSpark() {
  if (!touchingSpark()) {
    return;
  }

  score += 1;
  updateScore();
  placeSpark();
}

function resetGame() {
  comet.x = canvas.width / 2;
  comet.y = canvas.height / 2;
  score = 0;
  placeSpark();
  updateScore();
}

function frame() {
  moveComet();
  collectSpark();
  drawBoard();
  drawSpark();
  drawComet();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if (event.key.startsWith("Arrow") || ["w", "a", "s", "d"].includes(key)) {
    event.preventDefault();
    keys.add(event.key.startsWith("Arrow") ? event.key : key);
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.startsWith("Arrow") ? event.key : event.key.toLowerCase());
});

resetButton.addEventListener("click", resetGame);

resetGame();
frame();
