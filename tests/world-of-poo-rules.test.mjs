import assert from 'node:assert/strict';
import test from 'node:test';

import { hasReachedGoal } from '../projects/world-of-poo/game-rules.js';

test('the first goo ball does not win a multi-ball goal', () => {
    assert.equal(hasReachedGoal(1, 5), false);
});

test('the configured goal count wins exactly when reached', () => {
    assert.equal(hasReachedGoal(4, 5), false);
    assert.equal(hasReachedGoal(5, 5), true);
    assert.equal(hasReachedGoal(6, 5), true);
});

test('an invalid empty goal cannot trigger a win', () => {
    assert.equal(hasReachedGoal(0, 0), false);
});
