const stage = document.querySelector("#catStage");
const brush = document.querySelector("#brush");
const startButton = document.querySelector("#startButton");
const nextButton = document.querySelector("#nextButton");
const soundButton = document.querySelector("#soundButton");
const helpButton = document.querySelector("#helpButton");
const introOverlay = document.querySelector("#introOverlay");
const roundOverlay = document.querySelector("#roundOverlay");
const roundEyebrow = document.querySelector("#roundEyebrow");
const roundTitle = document.querySelector("#roundTitle");
const roundMessage = document.querySelector("#roundMessage");
const roundNumber = document.querySelector("#roundNumber");
const moodBadge = document.querySelector("#moodBadge");
const moodText = document.querySelector("#moodText");
const strokeCount = document.querySelector("#strokeCount");
const strokeGoal = document.querySelector("#strokeGoal");
const chompCount = document.querySelector("#chompCount");
const furMeter = document.querySelector("#furMeter");
const furFill = document.querySelector("#furFill");
const liveStatus = document.querySelector("#liveStatus");

const rounds = [
  {
    goal: 9,
    calmRange: [2800, 3500],
    grace: 760,
    title: "Respectable fluff!",
    message: "Max is getting suspicious. His next warnings come a little sooner."
  },
  {
    goal: 10,
    calmRange: [2300, 3000],
    grace: 610,
    title: "Dangerously handsome!",
    message: "One last round. The tail tells the truth, even when Max does not."
  },
  {
    goal: 11,
    calmRange: [1900, 2500],
    grace: 500,
    title: "Maximum Max achieved!",
    message: "Glossy. Magnificent. Still absolutely not sorry."
  }
];

let roundIndex = 0;
let strokes = 0;
let chomps = 0;
let mood = "idle";
let gameActive = false;
let brushing = false;
let keyboardBrushing = false;
let moodTimer = 0;
let graceTimer = 0;
let brushTimer = 0;
let activePointerId = null;
const AudioContextClass = window.AudioContext || window.webkitAudioContext;
let audioContext = null;
let soundEnabled = true;
const purrAudio = document.querySelector("#catPurr");
const hissAudio = document.querySelector("#catHiss");

function ensureAudio() {
  if (!soundEnabled || !AudioContextClass) {
    return null;
  }

  audioContext ??= new AudioContextClass();

  if (audioContext.state === "suspended") {
    audioContext.resume();
  }

  return audioContext;
}

function playTone({ frequency, endFrequency = frequency, duration, type, volume, delay = 0 }) {
  const context = ensureAudio();

  if (!context) {
    return;
  }

  const startAt = context.currentTime + delay;
  const stopAt = startAt + duration;
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), stopAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + Math.min(0.018, duration / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(stopAt + 0.03);
}

function playNoise({ duration, volume, filterFrequency, delay = 0 }) {
  const context = ensureAudio();

  if (!context) {
    return;
  }

  const sampleCount = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
  const samples = buffer.getChannelData(0);

  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = Math.random() * 2 - 1;
  }

  const startAt = context.currentTime + delay;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(filterFrequency, startAt);
  filter.Q.setValueAtTime(0.8, startAt);
  gain.gain.setValueAtTime(volume, startAt);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(startAt);
}

function playBrushSound() {
  playNoise({ duration: 0.075, volume: 0.026, filterFrequency: 1450 });
  playTone({ frequency: 190, endFrequency: 155, duration: 0.07, type: "triangle", volume: 0.018 });
}

function playPurrSound() {
  if (!soundEnabled) {
    return;
  }

  purrAudio.pause();
  purrAudio.currentTime = 0;
  purrAudio.loop = true;
  purrAudio.volume = 0.42;
  purrAudio.play().catch(() => {
    // The synthesized cue still plays if a browser declines the audio file.
  });
}

function stopPurrSound() {
  purrAudio.pause();
  purrAudio.currentTime = 0;
}

function playHissSound() {
  if (!soundEnabled) {
    return;
  }

  stopPurrSound();
  hissAudio.pause();
  hissAudio.currentTime = 0;
  hissAudio.volume = 0.78;
  hissAudio.play().catch(() => {
    // The synthesized chomp still plays if a browser declines the audio file.
  });
}

function stopCatSounds() {
  stopPurrSound();
  hissAudio.pause();
  hissAudio.currentTime = 0;
}

function playWarningSound() {
  playTone({ frequency: 260, endFrequency: 210, duration: 0.1, type: "square", volume: 0.055 });
  playTone({ frequency: 190, endFrequency: 145, duration: 0.13, type: "square", volume: 0.05, delay: 0.11 });
}

function playChompSound() {
  playHissSound();
  playNoise({ duration: 0.22, volume: 0.13, filterFrequency: 520 });
  playTone({ frequency: 125, endFrequency: 48, duration: 0.28, type: "sawtooth", volume: 0.12 });
  playTone({ frequency: 70, endFrequency: 42, duration: 0.2, type: "triangle", volume: 0.1, delay: 0.08 });
}

function playRoundSound() {
  [392, 523.25, 659.25].forEach((frequency, index) => {
    playTone({
      frequency,
      endFrequency: frequency * 1.03,
      duration: 0.22,
      type: "triangle",
      volume: 0.055,
      delay: index * 0.11
    });
  });
}

function randomBetween([minimum, maximum]) {
  return minimum + Math.random() * (maximum - minimum);
}

function clearMoodTimers() {
  window.clearTimeout(moodTimer);
  window.clearTimeout(graceTimer);
}

function setLiveStatus(message) {
  liveStatus.textContent = message;
}

function setMood(nextMood, announcement) {
  mood = nextMood;
  stage.dataset.mood = nextMood;
  moodBadge.dataset.mood = nextMood;

  const moodCopy = {
    idle: "Max is sizing you up",
    calm: "Calm — brush now",
    warning: "Warning — let go!",
    chomp: "Chomp! Give him a second"
  };

  moodText.textContent = moodCopy[nextMood];

  if (announcement) {
    setLiveStatus(announcement);
  }
}

function updateProgress() {
  const goal = rounds[roundIndex].goal;
  const percentage = Math.min(100, (strokes / goal) * 100);

  roundNumber.textContent = String(roundIndex + 1);
  strokeCount.textContent = String(strokes);
  strokeGoal.textContent = String(goal);
  chompCount.textContent = String(chomps);
  furFill.style.width = `${percentage}%`;
  furMeter.setAttribute("aria-valuemax", String(goal));
  furMeter.setAttribute("aria-valuenow", String(strokes));
}

function endBrushing() {
  if (!brushing) {
    return;
  }

  brushing = false;
  keyboardBrushing = false;
  activePointerId = null;
  window.clearInterval(brushTimer);
  stopPurrSound();
  brush.classList.remove("is-brushing", "keyboard-active");
}

function scheduleWarning() {
  window.clearTimeout(moodTimer);
  moodTimer = window.setTimeout(beginWarning, randomBetween(rounds[roundIndex].calmRange));
}

function becomeCalm(message = "Max is calm again. Brush gently.") {
  if (!gameActive) {
    return;
  }

  clearMoodTimers();
  setMood("calm", message);
  scheduleWarning();
}

function beginWarning() {
  if (!gameActive || mood !== "calm") {
    return;
  }

  stopPurrSound();
  setMood("warning", "Tail twitch! Stop brushing and give Max space.");
  playWarningSound();

  if (brushing) {
    graceTimer = window.setTimeout(() => {
      if (brushing && mood === "warning") {
        chomp();
      }
    }, rounds[roundIndex].grace);
  }

  moodTimer = window.setTimeout(() => {
    if (mood === "warning") {
      becomeCalm();
    }
  }, 1750);
}

function chomp() {
  if (!gameActive || mood === "chomp") {
    return;
  }

  clearMoodTimers();
  endBrushing();
  chomps += 1;
  updateProgress();
  setMood("chomp", "Chomp! Max bit the brush. Your brushing progress is safe.");
  playChompSound();

  moodTimer = window.setTimeout(() => {
    becomeCalm("The brush survived. Max is calm again.");
  }, 2800);
}

function completeRound() {
  gameActive = false;
  clearMoodTimers();
  endBrushing();
  setMood("idle", "Round complete.");
  playRoundSound();

  const round = rounds[roundIndex];
  const isFinalRound = roundIndex === rounds.length - 1;
  roundEyebrow.textContent = isFinalRound ? "Grooming complete" : `Round ${roundIndex + 1} complete`;
  roundTitle.textContent = round.title;
  roundMessage.textContent = round.message;
  nextButton.textContent = isFinalRound ? "Brush him again" : "Next round";
  roundOverlay.hidden = false;
  nextButton.focus();
}

function addStroke() {
  if (!gameActive || !brushing || mood !== "calm") {
    return;
  }

  strokes += 1;
  updateProgress();
  playBrushSound();
  setLiveStatus(`${strokes} careful ${strokes === 1 ? "brush" : "brushes"}. Max is still calm.`);

  if (strokes >= rounds[roundIndex].goal) {
    completeRound();
  }
}

function startBrushing({ keyboard = false } = {}) {
  if (!gameActive || brushing) {
    return;
  }

  if (mood === "warning") {
    chomp();
    return;
  }

  if (mood !== "calm") {
    return;
  }

  brushing = true;
  keyboardBrushing = keyboard;
  brush.classList.add("is-brushing");
  playPurrSound();

  if (keyboard) {
    brush.classList.add("keyboard-active");
    brush.style.left = "54%";
    brush.style.top = "64%";
  }

  window.setTimeout(addStroke, 220);
  brushTimer = window.setInterval(addStroke, 430);
  setLiveStatus("Brushing… keep watching Max's tail.");
}

function startRound() {
  strokes = 0;
  gameActive = true;
  introOverlay.hidden = true;
  roundOverlay.hidden = true;
  updateProgress();
  becomeCalm(`Round ${roundIndex + 1}. Max is calm. Start brushing.`);
  stage.focus();
}

function advanceRound() {
  if (roundIndex === rounds.length - 1) {
    roundIndex = 0;
    chomps = 0;
  } else {
    roundIndex += 1;
  }

  startRound();
}

function updateBrushPosition(event) {
  const bounds = stage.getBoundingClientRect();
  const x = Math.max(16, Math.min(bounds.width - 16, event.clientX - bounds.left));
  const y = Math.max(20, Math.min(bounds.height - 18, event.clientY - bounds.top));

  brush.style.left = `${x}px`;
  brush.style.top = `${y}px`;
}

stage.addEventListener("pointerenter", (event) => {
  if (event.pointerType !== "touch") {
    stage.classList.add("has-pointer");
    updateBrushPosition(event);
  }
});

stage.addEventListener("pointerleave", () => {
  if (!brushing) {
    stage.classList.remove("has-pointer");
  }
});

stage.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "touch" || brushing) {
    updateBrushPosition(event);
  }
});

stage.addEventListener("pointerdown", (event) => {
  if (event.target.closest("button")) {
    return;
  }

  event.preventDefault();
  activePointerId = event.pointerId;
  stage.setPointerCapture?.(event.pointerId);
  stage.classList.add("has-pointer");
  updateBrushPosition(event);
  startBrushing();
});

function releasePointer(event) {
  if (activePointerId !== null && event.pointerId !== undefined && event.pointerId !== activePointerId) {
    return;
  }

  const stoppedDuringWarning = brushing && mood === "warning";
  endBrushing();

  if (stoppedDuringWarning) {
    window.clearTimeout(graceTimer);
    setLiveStatus("Nice stop! You read Max's warning. Wait until he is calm again.");
  }

  if (event?.pointerType === "touch") {
    stage.classList.remove("has-pointer");
  }
}

stage.addEventListener("pointerup", releasePointer);
stage.addEventListener("pointercancel", releasePointer);
window.addEventListener("pointerup", releasePointer);

stage.addEventListener("keydown", (event) => {
  if ((event.code === "Space" || event.code === "Enter") && !event.repeat) {
    event.preventDefault();
    startBrushing({ keyboard: true });
  }
});

stage.addEventListener("keyup", (event) => {
  if (event.code !== "Space" && event.code !== "Enter") {
    return;
  }

  event.preventDefault();
  const stoppedDuringWarning = keyboardBrushing && mood === "warning";
  endBrushing();

  if (stoppedDuringWarning) {
    window.clearTimeout(graceTimer);
    setLiveStatus("Nice stop! You read Max's warning. Wait until he is calm again.");
  }
});

stage.addEventListener("blur", endBrushing);

startButton.addEventListener("click", () => {
  ensureAudio();
  startRound();
});

nextButton.addEventListener("click", () => {
  ensureAudio();
  advanceRound();
});

soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  soundButton.setAttribute("aria-label", soundEnabled ? "Turn sound off" : "Turn sound on");
  soundButton.title = soundEnabled ? "Turn sound off" : "Turn sound on";
  soundButton.textContent = soundEnabled ? "♪" : "×";

  if (soundEnabled) {
    ensureAudio();
    playTone({ frequency: 440, endFrequency: 660, duration: 0.16, type: "triangle", volume: 0.045 });

    if (brushing && mood === "calm") {
      playPurrSound();
    }
  } else {
    stopCatSounds();

    if (audioContext?.state === "running") {
      audioContext.suspend();
    }
  }
});

helpButton.addEventListener("click", () => {
  clearMoodTimers();
  endBrushing();
  gameActive = false;
  setMood("idle", "Instructions opened. Press “I am ready” when you want to continue.");
  introOverlay.hidden = false;
  startButton.textContent = "Restart round";
  startButton.focus();
});

updateProgress();

if (!AudioContextClass) {
  soundEnabled = false;
  soundButton.disabled = true;
  soundButton.textContent = "—";
  soundButton.setAttribute("aria-pressed", "false");
  soundButton.setAttribute("aria-label", "Sound is not supported in this browser");
  soundButton.title = "Sound is not supported in this browser";
}
