export const MATCH_TOLERANCE = 18;
export const MAX_VISIBLE_DROPS = 12;
export const MAX_TOTAL_DROPS = 60;

export function canAddDrop(total, limit = MAX_TOTAL_DROPS) {
  return total < limit;
}

export function colorDistance(first, second) {
  return Math.hypot(
    first[0] - second[0],
    first[1] - second[1],
    first[2] - second[2]
  );
}

export function isColorMatch(first, second, tolerance = MATCH_TOLERANCE) {
  return colorDistance(first, second) <= tolerance;
}

export function closenessLabel(distance, tolerance = MATCH_TOLERANCE) {
  if (distance <= tolerance) return "Match";
  if (distance <= 45) return "Very close";
  if (distance <= 90) return "Getting closer";
  return "Far apart";
}

export function visibleDropHistory(history, limit = MAX_VISIBLE_DROPS) {
  const hiddenCount = Math.max(0, history.length - limit);
  return {
    hiddenCount,
    visible: history.slice(hiddenCount)
  };
}
