import test from "node:test";
import assert from "node:assert/strict";
import {
  MATCH_TOLERANCE,
  closenessLabel,
  colorDistance,
  isColorMatch,
  visibleDropHistory
} from "./logic.js";

test("color distance is stable and symmetric", () => {
  assert.equal(colorDistance([10, 20, 30], [10, 20, 30]), 0);
  assert.equal(
    colorDistance([10, 20, 30], [20, 40, 50]),
    colorDistance([20, 40, 50], [10, 20, 30])
  );
});

test("matching includes the documented tolerance boundary", () => {
  assert.equal(isColorMatch([0, 0, 0], [MATCH_TOLERANCE, 0, 0]), true);
  assert.equal(isColorMatch([0, 0, 0], [MATCH_TOLERANCE + 1, 0, 0]), false);
});

test("closeness labels do not rely on color names", () => {
  assert.equal(closenessLabel(0), "Match");
  assert.equal(closenessLabel(30), "Very close");
  assert.equal(closenessLabel(70), "Getting closer");
  assert.equal(closenessLabel(120), "Far apart");
});

test("visible history stays bounded and summarizes older drops", () => {
  const history = Array.from({ length: 40 }, (_, index) => `paint-${index}`);
  const result = visibleDropHistory(history, 12);

  assert.equal(result.hiddenCount, 28);
  assert.equal(result.visible.length, 12);
  assert.equal(result.visible[0], "paint-28");
  assert.equal(result.visible.at(-1), "paint-39");
});
