class MathKnittingGame {
    constructor() {
        this.yarnCount = 5;
        this.problemsSolved = 0;
        this.currentProblem = null;
        this.currentAnswer = null;
        this.maxYarn = 20;
        this.stitchesPerRow = 10;
        this.acceptingAnswer = true;
        this.pendingTimeouts = new Set();

        this.elements = {
            yarnCount: document.getElementById('yarn-count'),
            problemsSolved: document.getElementById('problems-solved'),
            problemText: document.getElementById('problem-text'),
            answerInput: document.getElementById('answer-input'),
            submitBtn: document.getElementById('submit-btn'),
            feedback: document.getElementById('feedback'),
            knittingProject: document.getElementById('knitting-project'),
            gameOver: document.getElementById('game-over'),
            victory: document.getElementById('victory'),
            finalScore: document.getElementById('final-score'),
            victoryScore: document.getElementById('victory-score'),
            restartBtn: document.getElementById('restart-btn'),
            newProjectBtn: document.getElementById('new-project-btn'),
            yarnPath: document.getElementById('yarn-path')
        };

        this.init();
    }

    init() {
        this.generateProblem();
        this.updateDisplay();
        this.renderKnitting();
        this.updateYarnThread();

        this.elements.submitBtn.addEventListener('click', () => this.checkAnswer());
        this.elements.answerInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.checkAnswer();
            }
        });

        this.elements.restartBtn.addEventListener('click', () => this.restart());
        this.elements.newProjectBtn.addEventListener('click', () => this.restart());

        window.addEventListener('resize', () => this.updateYarnThread());
    }

    generateProblem() {
        const operations = ['+', '-', '*'];
        const operation = operations[Math.floor(Math.random() * operations.length)];

        let num1, num2;

        switch (operation) {
            case '+':
                num1 = Math.floor(Math.random() * 50) + 1;
                num2 = Math.floor(Math.random() * 50) + 1;
                this.currentAnswer = num1 + num2;
                break;
            case '-':
                num1 = Math.floor(Math.random() * 50) + 20;
                num2 = Math.floor(Math.random() * num1);
                this.currentAnswer = num1 - num2;
                break;
            case '*':
                num1 = Math.floor(Math.random() * 12) + 1;
                num2 = Math.floor(Math.random() * 12) + 1;
                this.currentAnswer = num1 * num2;
                break;
        }

        this.currentProblem = `${num1} ${operation} ${num2} = ?`;
        this.elements.problemText.textContent = this.currentProblem;
        this.acceptingAnswer = true;
        this.elements.answerInput.disabled = false;
        this.elements.submitBtn.disabled = false;
    }

    checkAnswer() {
        if (!this.acceptingAnswer) return;

        const rawAnswer = this.elements.answerInput.value.trim();
        const userAnswer = Number(rawAnswer);

        if (rawAnswer === '' || !Number.isFinite(userAnswer) || !Number.isInteger(userAnswer)) {
            this.showFeedback('Please enter a whole number!', false);
            return;
        }

        this.acceptingAnswer = false;
        this.elements.answerInput.disabled = true;
        this.elements.submitBtn.disabled = true;

        if (userAnswer === this.currentAnswer) {
            this.yarnCount++;
            this.problemsSolved++;
            this.showFeedback('Correct! Yarn added!', true);
            this.renderKnitting();
            this.updateDisplay();

            if (this.yarnCount >= this.maxYarn) {
                this.showVictory();
                return;
            }

            this.schedule(() => {
                this.generateProblem();
                this.clearInput();
            }, 1000);
        } else {
            this.yarnCount--;
            this.showFeedback(`Wrong! The answer was ${this.currentAnswer}. Yarn removed!`, false);
            this.renderKnitting();
            this.updateDisplay();

            if (this.yarnCount <= 0) {
                this.showGameOver();
                return;
            }

            this.schedule(() => {
                this.acceptingAnswer = true;
                this.elements.answerInput.disabled = false;
                this.elements.submitBtn.disabled = false;
                this.clearInput();
            }, 1500);
        }
    }

    schedule(callback, delay) {
        const timeout = setTimeout(() => {
            this.pendingTimeouts.delete(timeout);
            callback();
        }, delay);
        this.pendingTimeouts.add(timeout);
        return timeout;
    }

    cancelPendingWork() {
        this.pendingTimeouts.forEach((timeout) => clearTimeout(timeout));
        this.pendingTimeouts.clear();
    }

    showFeedback(message, isCorrect) {
        this.elements.feedback.textContent = message;
        this.elements.feedback.className = 'feedback ' + (isCorrect ? 'correct' : 'incorrect');

        this.schedule(() => {
            if (this.yarnCount > 0 && this.yarnCount < this.maxYarn) {
                this.elements.feedback.textContent = '';
                this.elements.feedback.className = 'feedback';
            }
        }, 1500);
    }

    clearInput() {
        this.elements.answerInput.value = '';
        this.elements.answerInput.focus();
    }

    updateDisplay() {
        this.elements.yarnCount.textContent = this.yarnCount;
        this.elements.problemsSolved.textContent = this.problemsSolved;
    }

    renderKnitting() {
        this.elements.knittingProject.innerHTML = '';

        if (this.yarnCount === 0) {
            this.elements.knittingProject.classList.add('empty');
            return;
        } else {
            this.elements.knittingProject.classList.remove('empty');
        }

        const stitchesPerRow = 4;
        const totalStitches = this.yarnCount;
        const rows = Math.ceil(totalStitches / stitchesPerRow);

        for (let i = 0; i < rows; i++) {
            const row = document.createElement('div');
            row.className = 'yarn-row';

            const stitchesInThisRow = Math.min(stitchesPerRow, totalStitches - (i * stitchesPerRow));

            for (let j = 0; j < stitchesInThisRow; j++) {
                const stitch = document.createElement('div');
                stitch.className = 'yarn-stitch';
                row.appendChild(stitch);
            }

            this.elements.knittingProject.appendChild(row);
        }

        this.updateYarnThread();
    }

    updateYarnThread() {
        const yarnSpool = document.querySelector('.yarn-spool');
        const knittingShape = document.querySelector('.knitting-shape');

        if (!yarnSpool || !knittingShape) return;

        const spoolRect = yarnSpool.getBoundingClientRect();
        const shapeRect = knittingShape.getBoundingClientRect();
        const knittingArea = document.querySelector('.knitting-area');
        const areaRect = knittingArea.getBoundingClientRect();

        const startX = spoolRect.right - areaRect.left;
        const startY = spoolRect.top + spoolRect.height / 2 - areaRect.top;
        const endX = shapeRect.left - areaRect.left;
        const endY = shapeRect.top + 20 - areaRect.top;

        const midX = (startX + endX) / 2;
        const midY = startY - 30;

        const path = `M ${startX} ${startY} Q ${midX} ${midY}, ${endX} ${endY}`;
        this.elements.yarnPath.setAttribute('d', path);
    }

    showGameOver() {
        this.cancelPendingWork();
        this.acceptingAnswer = false;
        this.elements.finalScore.textContent = this.problemsSolved;
        this.elements.gameOver.style.display = 'block';
        this.elements.answerInput.disabled = true;
        this.elements.submitBtn.disabled = true;
        this.elements.restartBtn.focus();
    }

    showVictory() {
        this.cancelPendingWork();
        this.acceptingAnswer = false;
        this.elements.victoryScore.textContent = this.problemsSolved;
        this.elements.victory.style.display = 'block';
        this.elements.answerInput.disabled = true;
        this.elements.submitBtn.disabled = true;
        this.elements.newProjectBtn.focus();
        this.createConfetti();
    }

    createConfetti() {
        const colors = ['#ff6b6b', '#51cf66', '#ffd43b', '#667eea', '#ee5a6f', '#4dabf7'];
        const confettiCount = 80;

        for (let i = 0; i < confettiCount; i++) {
            this.schedule(() => {
                const confetti = document.createElement('div');
                confetti.className = 'confetti';
                confetti.style.left = Math.random() * 100 + '%';
                confetti.style.top = '-20px';

                const color = colors[Math.floor(Math.random() * colors.length)];
                confetti.style.setProperty('--confetti-color', color);

                const beforeStyle = document.createElement('style');
                beforeStyle.dataset.mathKnittingConfetti = '';
                beforeStyle.textContent = `
                    .confetti:nth-of-type(${i})::before {
                        background: ${color};
                        animation-delay: ${Math.random() * 0.5}s;
                        animation-duration: ${2 + Math.random() * 2}s;
                    }
                `;
                document.head.appendChild(beforeStyle);

                document.body.appendChild(confetti);

                this.schedule(() => {
                    confetti.remove();
                    beforeStyle.remove();
                }, 5000);
            }, i * 30);
        }
    }

    restart() {
        this.cancelPendingWork();
        this.yarnCount = 5;
        this.problemsSolved = 0;
        this.acceptingAnswer = true;
        this.elements.gameOver.style.display = 'none';
        this.elements.victory.style.display = 'none';
        this.elements.answerInput.disabled = false;
        this.elements.submitBtn.disabled = false;
        this.elements.feedback.textContent = '';
        this.elements.feedback.className = 'feedback';

        document.querySelectorAll('.confetti').forEach(c => c.remove());
        document.querySelectorAll('style[data-math-knitting-confetti]').forEach(style => style.remove());

        this.generateProblem();
        this.updateDisplay();
        this.renderKnitting();
        this.updateYarnThread();
        this.clearInput();
    }
}

const game = new MathKnittingGame();
