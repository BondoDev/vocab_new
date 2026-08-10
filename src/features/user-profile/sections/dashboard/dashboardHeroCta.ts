// Pure decision logic for the Dashboard hero card's right-side CTA — kept
// free of React/the app's t() lookup so the branching can be unit tested
// directly (see scripts/tests/learning/test-dashboard-hero-cta.mjs) without
// rendering a component. Consumes only already-computed values (never reads
// user_daily_stats/user_word_progress itself) — DashboardHeroCard.tsx is
// responsible for sourcing completed/goal from the same
// computeTodayProgressDisplay (src/data/learning/todayProgressDisplay.ts)
// the Learning page's Today's Progress card already uses, so this module
// never recomputes its own version of that clamping/validity logic.
export type DashboardHeroCtaKind = "continueLearning" | "reviewWords" | "startLearning";

export interface DashboardHeroCtaResult {
  kind: DashboardHeroCtaKind;
  // Real remaining-words count for the "continueLearning" case. null in two
  // situations: (1) today's progress couldn't be read reliably (see
  // isTodayDataTrusted below) — the caller must render the CTA without a
  // specific count/message rather than fabricate one; (2) the kind isn't
  // "continueLearning" at all, where a remaining count has no meaning.
  remaining: number | null;
}

// completed/goal are real, unclamped values (goal - completed can't be
// negative once a caller-side "completed < goal" check already gated this,
// but Math.max keeps this safe on its own too — see test #3 in
// test-dashboard-hero-cta.mjs, which calls this directly with an
// over-completed pair).
export function computeRemainingWords(goal: number, completed: number): number {
  return Math.max(goal - completed, 0);
}

export interface ResolveDashboardHeroCtaInput {
  // False when the hero's own today's-progress/streak read failed (see
  // useDashboardHeroData's "error" status) — the goal-vs-completed
  // comparison below is only trusted when this is true. A merely-loading
  // state is handled separately by the component (skeleton, no CTA
  // decision needed yet); this flag is specifically about "read finished,
  // but it failed," matching the Phase brief's "render a neutral CTA based
  // on available profile state" error-behavior requirement.
  isTodayDataTrusted: boolean;
  completed: number;
  goal: number;
  hasInvalidGoal: boolean;
  // True unless we positively know (wordProgressStatus === "ready" and the
  // rows array is empty) that the user has never completed a single word —
  // defaults to true (assume "has progress") whenever that shared read
  // hasn't resolved yet, so an ordinary loading window never wrongly shows
  // "Start Learning" to an existing user. See Case 3 in the Phase brief:
  // this is a narrow, positively-confirmed condition, not a guess.
  hasAnyWordProgress: boolean;
}

export function resolveDashboardHeroCta({
  isTodayDataTrusted,
  completed,
  goal,
  hasInvalidGoal,
  hasAnyWordProgress,
}: ResolveDashboardHeroCtaInput): DashboardHeroCtaResult {
  if (!isTodayDataTrusted) {
    // Neutral fallback per the Phase brief's Error Behavior section: never
    // fabricate a completed/remaining count from unreliable data. Still
    // makes a real decision (not a dead end) from the one thing that stays
    // trustworthy even when today's stats fail to load — whether the user
    // has ever completed any word at all.
    return hasAnyWordProgress
      ? { kind: "continueLearning", remaining: null }
      : { kind: "startLearning", remaining: null };
  }

  // Case 1 — daily new-word goal is not finished (covers a brand-new user
  // with completed === 0 too, as long as the goal itself is valid).
  if (!hasInvalidGoal && completed < goal) {
    return { kind: "continueLearning", remaining: computeRemainingWords(goal, completed) };
  }

  // Case 3 — goal is met (or unusable) AND the user has no learned
  // vocabulary at all: Review Words would be nonsensical with nothing to
  // review, so prefer Start Learning instead.
  if (!hasAnyWordProgress) {
    return { kind: "startLearning", remaining: null };
  }

  // Case 2 — goal is met and the user has vocabulary to reinforce.
  return { kind: "reviewWords", remaining: null };
}
