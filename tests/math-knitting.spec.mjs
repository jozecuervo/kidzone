import { expect, test } from '@playwright/test';

const projectPath = '/projects/math-knitting/';

function answerFor(problem) {
  const match = problem.match(/(\d+) ([+*-]) (\d+)/);
  if (!match) throw new Error(`Could not read math problem: ${problem}`);

  const left = Number(match[1]);
  const right = Number(match[3]);
  if (match[2] === '+') return left + right;
  if (match[2] === '-') return left - right;
  return left * right;
}

async function currentAnswer(page) {
  return answerFor(await page.locator('#problem-text').innerText());
}

test.beforeEach(async ({ page }) => {
  await page.goto(projectPath);
});

test('locks a question before duplicate keyboard and pointer submissions', async ({ page }) => {
  const answer = await currentAnswer(page);
  await page.locator('#answer-input').fill(String(answer));

  await page.locator('#answer-input').press('Enter');
  await page.locator('#submit-btn').click({ force: true });

  await expect(page.locator('#yarn-count')).toHaveText('6');
  await expect(page.locator('#problems-solved')).toHaveText('1');
  await expect(page.locator('#answer-input')).toBeDisabled();
  await expect(page.locator('#submit-btn')).toBeDisabled();
});

test('restart cancels delayed work from the previous question', async ({ page }) => {
  await page.locator('#answer-input').fill(String(await currentAnswer(page)));
  await page.locator('#submit-btn').click();

  await page.locator('#restart-btn').evaluate((button) => button.click());
  const restartedProblem = await page.locator('#problem-text').innerText();
  await page.locator('#answer-input').fill('123');
  await page.waitForTimeout(1700);

  await expect(page.locator('#yarn-count')).toHaveText('5');
  await expect(page.locator('#problems-solved')).toHaveText('0');
  await expect(page.locator('#problem-text')).toHaveText(restartedProblem);
  await expect(page.locator('#answer-input')).toHaveValue('123');
  await expect(page.locator('#feedback')).toBeEmpty();
});

test('shows the exact final yarn and score on the winning answer', async ({ page }) => {
  test.setTimeout(30_000);

  for (let solved = 1; solved <= 15; solved += 1) {
    await page.locator('#answer-input').fill(String(await currentAnswer(page)));
    await page.locator('#submit-btn').click();
    await expect(page.locator('#yarn-count')).toHaveText(String(5 + solved));
    await expect(page.locator('#problems-solved')).toHaveText(String(solved));

    if (solved < 15) {
      await expect(page.locator('#answer-input')).toBeEnabled({ timeout: 2000 });
    }
  }

  await expect(page.locator('#victory')).toBeVisible();
  await expect(page.locator('#victory-score')).toHaveText('15');
  await expect(page.locator('#new-project-btn')).toBeFocused();
  await expect(page.locator('#knitting-project .yarn-stitch')).toHaveCount(20);
});

test('rejects fractional input without changing game state', async ({ page }) => {
  await page.locator('#answer-input').fill('3.5');
  await page.locator('#submit-btn').click();

  await expect(page.locator('#feedback')).toHaveText('Please enter a whole number!');
  await expect(page.locator('#yarn-count')).toHaveText('5');
  await expect(page.locator('#problems-solved')).toHaveText('0');
  await expect(page.locator('#answer-input')).toBeEnabled();
  await expect(page.locator('#submit-btn')).toBeEnabled();
});

test.describe('mobile layout', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('keeps the game controls visible and playable', async ({ page }) => {
    await page.goto(projectPath);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.locator('#answer-input')).toBeInViewport();
    await expect(page.locator('#submit-btn')).toBeInViewport();

    await page.locator('#answer-input').fill(String(await currentAnswer(page)));
    await page.locator('#submit-btn').click();
    await expect(page.locator('#problems-solved')).toHaveText('1');
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('keeps the yarn still and skips celebration confetti', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(projectPath);

    await expect(page.locator('#yarn-path animate')).toHaveCount(0);
    await page.evaluate(() => game.showVictory());
    await page.waitForTimeout(100);

    await expect(page.locator('.confetti')).toHaveCount(0);
    await expect(page.locator('#new-project-btn')).toBeFocused();
  });
});
