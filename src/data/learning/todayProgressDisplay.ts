// Pure normalization for the Learning page's Today's Progress card: how many
// new words were completed today vs. the daily goal, safely turned into a
// clamped 0..1 ring/bar-fill ratio. Import-free (like wordReviewSchedule.ts)
// so it stays loadable directly via `node --experimental-strip-types` for
// scripts/tests/learning/test-today-progress-display.mjs.
export interface TodayProgressDisplay {
  // Real completed count — never clamped. A learner who exceeds their goal
  // (e.g. raised it mid-day after already finishing the old one) must still
  // see their true count, only the visual indicator clamps.
  completed: number;
  goal: number;
  // Clamped to [0, 1] for rendering the ring/bar fill. 0 when the goal is
  // missing/invalid (<= 0) rather than dividing by zero.
  progressRatio: number;
  // True when the caller should log development context because the goal
  // was missing or non-positive — computeTodayProgressDisplay itself stays
  // side-effect-free (no console calls), so the caller decides how/whether
  // to log.
  hasInvalidGoal: boolean;
}

export function computeTodayProgressDisplay(completed: number, goal: number): TodayProgressDisplay {
  const safeCompleted = Number.isFinite(completed) && completed > 0 ? completed : 0;
  const isGoalValid = Number.isFinite(goal) && goal > 0;
  const safeGoal = isGoalValid ? goal : 0;
  const progressRatio = safeGoal > 0 ? Math.min(safeCompleted / safeGoal, 1) : 0;

  return {
    completed: safeCompleted,
    goal: safeGoal,
    progressRatio,
    hasInvalidGoal: !isGoalValid,
  };
}
