// Phase 1 of the milestone system: a pure, centralized milestone
// definition source plus the evaluation engine that turns a handful of
// already-computed metrics into per-track progress. Deliberately
// import-free (like dailyStreak.ts/vocabularyCategory.ts) so it stays
// loadable directly via `node --experimental-strip-types` for
// scripts/tests/learning/test-milestones.mjs, and so no translated label
// ever leaks into this module — every user-facing string lives in the
// interface JSON files, looked up by a milestone's stable `id` (see
// userProfile.progressSection.milestones.<id> in each locale file).
//
// Four independent tracks, each with its own ascending, hand-authored list
// of numeric targets. A track never invents an additional target once its
// highest configured milestone is reached — see evaluateMilestoneTrack's
// own comment for what happens instead (isTrackComplete).
//
// This module only evaluates milestones from metrics the caller already
// computed (see loadMilestoneMetrics.ts for where those metrics come from
// — user_word_progress/user_daily_stats reads, never fetched here). It has
// no notion of persistence, unlock history, or notifications: Phase 1 is
// fully computed on every load, nothing is written back to Supabase, and
// nothing here decides whether to show a popup (there isn't one yet — see
// this feature's README/task brief for the Phase 2 recommendation).

export type MilestoneTrackId = "vocabulary" | "mastery" | "reviews" | "consistency";

export const MILESTONE_TRACK_IDS: readonly MilestoneTrackId[] = [
  "vocabulary",
  "mastery",
  "reviews",
  "consistency",
];

export interface MilestoneDefinition {
  // Stable, never-reused identifier — also the exact suffix used to look up
  // this milestone's translated title:
  // t(`userProfile.progressSection.milestones.${id}`).
  id: string;
  track: MilestoneTrackId;
  // Numeric configuration only — never a translated string. Formatted at
  // render time (see MilestoneCard.tsx) with Number.toLocaleString.
  target: number;
}

// Vocabulary: every user_word_progress row (all five backend states) counts
// as one learned word — see loadMilestoneMetrics.ts / vocabularyCategory.ts
// for where learnedWords is actually computed (VocabularyCounts.total).
const VOCABULARY_MILESTONES: readonly MilestoneDefinition[] = [
  { id: "learned-1", track: "vocabulary", target: 1 },
  { id: "learned-10", track: "vocabulary", target: 10 },
  { id: "learned-25", track: "vocabulary", target: 25 },
  { id: "learned-50", track: "vocabulary", target: 50 },
  { id: "learned-100", track: "vocabulary", target: 100 },
  { id: "learned-250", track: "vocabulary", target: 250 },
  { id: "learned-500", track: "vocabulary", target: 500 },
  { id: "learned-1000", track: "vocabulary", target: 1000 },
  { id: "learned-2500", track: "vocabulary", target: 2500 },
  { id: "learned-5000", track: "vocabulary", target: 5000 },
  { id: "learned-10000", track: "vocabulary", target: 10000 },
];

// Mastery: only user_word_progress rows with word_state = "mastered".
const MASTERY_MILESTONES: readonly MilestoneDefinition[] = [
  { id: "mastered-1", track: "mastery", target: 1 },
  { id: "mastered-10", track: "mastery", target: 10 },
  { id: "mastered-25", track: "mastery", target: 25 },
  { id: "mastered-50", track: "mastery", target: 50 },
  { id: "mastered-100", track: "mastery", target: 100 },
  { id: "mastered-250", track: "mastery", target: 250 },
  { id: "mastered-500", track: "mastery", target: 500 },
  { id: "mastered-1000", track: "mastery", target: 1000 },
];

// Reviews: the sum of user_daily_stats.reviews_completed — the same total
// the existing review-persistence system already maintains (one increment
// per individually reviewed word). Never Study New Words, group
// reinforcement, or Custom Practice.
const REVIEW_MILESTONES: readonly MilestoneDefinition[] = [
  { id: "reviews-1", track: "reviews", target: 1 },
  { id: "reviews-100", track: "reviews", target: 100 },
  { id: "reviews-500", track: "reviews", target: 500 },
  { id: "reviews-1000", track: "reviews", target: 1000 },
  { id: "reviews-5000", track: "reviews", target: 5000 },
  { id: "reviews-10000", track: "reviews", target: 10000 },
];

// Consistency: consecutive-day count from milestoneStreak.ts's
// computeMilestoneStreak (any day with new_words_completed > 0 OR
// reviews_completed > 0 — deliberately not the Daily Streak card's
// goal-based definition; see that module's own header).
const CONSISTENCY_MILESTONES: readonly MilestoneDefinition[] = [
  { id: "streak-3", track: "consistency", target: 3 },
  { id: "streak-7", track: "consistency", target: 7 },
  { id: "streak-14", track: "consistency", target: 14 },
  { id: "streak-30", track: "consistency", target: 30 },
  { id: "streak-50", track: "consistency", target: 50 },
  { id: "streak-100", track: "consistency", target: 100 },
  { id: "streak-365", track: "consistency", target: 365 },
];

export const MILESTONES_BY_TRACK: Readonly<Record<MilestoneTrackId, readonly MilestoneDefinition[]>> = {
  vocabulary: VOCABULARY_MILESTONES,
  mastery: MASTERY_MILESTONES,
  reviews: REVIEW_MILESTONES,
  consistency: CONSISTENCY_MILESTONES,
};

export interface MilestoneTrackResult {
  track: MilestoneTrackId;
  // Clamped to >= 0 (see evaluateMilestoneTrack) — the raw metric value,
  // never reset between milestones (cumulative progress).
  currentValue: number;
  // The target currently being progressed toward: nextMilestone's target
  // while the track isn't complete, otherwise the highest configured
  // milestone's target (so a completed track's progress bar still reads as
  // a full, meaningful ratio rather than a division by zero).
  target: number;
  // The most recently achieved milestone (currentValue >= its target), or
  // null if none has been reached yet. Kept even once nextMilestone moves
  // past it — MilestoneCard uses this for the persistent small "reached"
  // line described in the task brief, not a one-time notification.
  previousMilestone: MilestoneDefinition | null;
  // The active target to display, or null once every configured milestone
  // in this track has been reached (see isTrackComplete).
  nextMilestone: MilestoneDefinition | null;
  // currentValue / target, clamped to [0, 1].
  progress: number;
  progressPercentage: number;
  // True once currentValue has reached or passed the highest configured
  // milestone in this track. The task brief is explicit that no further
  // milestones are invented automatically once this is true — a future
  // milestone must be added to the arrays above.
  isTrackComplete: boolean;
  // Every milestone id in this track whose target has been reached, in
  // ascending order.
  completedMilestoneIds: readonly string[];
}

// Pure per-track evaluation. Milestone arrays above are already ascending
// by target, so a single linear scan finds both the completed set and the
// next active target without sorting.
export function evaluateMilestoneTrack(track: MilestoneTrackId, currentValue: number): MilestoneTrackResult {
  const milestones = MILESTONES_BY_TRACK[track];
  const safeCurrentValue = Number.isFinite(currentValue) && currentValue > 0 ? currentValue : 0;

  const completedMilestoneIds: string[] = [];
  let previousMilestone: MilestoneDefinition | null = null;
  let nextMilestone: MilestoneDefinition | null = null;

  for (const milestone of milestones) {
    if (safeCurrentValue >= milestone.target) {
      completedMilestoneIds.push(milestone.id);
      previousMilestone = milestone;
    } else if (nextMilestone === null) {
      nextMilestone = milestone;
    }
  }

  const isTrackComplete = nextMilestone === null;
  // previousMilestone is guaranteed non-null whenever isTrackComplete is
  // true (every milestone array is non-empty), so this fallback only ever
  // matters for the impossible case of an empty track definition.
  const target = nextMilestone?.target ?? previousMilestone?.target ?? milestones[0]?.target ?? 0;
  const progress = target > 0 ? Math.min(1, Math.max(0, safeCurrentValue / target)) : 0;

  return {
    track,
    currentValue: safeCurrentValue,
    target,
    previousMilestone,
    nextMilestone,
    progress,
    progressPercentage: Math.round(progress * 100),
    isTrackComplete,
    completedMilestoneIds,
  };
}

export interface MilestoneMetrics {
  // Every user_word_progress row for the active user/target language (all
  // five backend states) — see vocabularyCategory.ts's VocabularyCounts.total.
  learnedWords: number;
  // user_word_progress rows with word_state = "mastered" — VocabularyCounts.mastered.
  masteredWords: number;
  // Sum of user_daily_stats.reviews_completed for the active user/target language.
  totalReviews: number;
  // milestoneStreak.ts's computeMilestoneStreak result for the active user/target language.
  currentStreakDays: number;
}

export type MilestoneResults = Readonly<Record<MilestoneTrackId, MilestoneTrackResult>>;

// Evaluates all four tracks from one metrics snapshot. Tracks stay fully
// independent — reaching a milestone in one never affects another, and
// several tracks completing a milestone "at the same time" (i.e. from the
// same metrics snapshot) is not combined into a single synthetic result;
// each entry in the returned record is exactly evaluateMilestoneTrack's own
// output for that track.
export function evaluateAllMilestoneTracks(metrics: MilestoneMetrics): MilestoneResults {
  return {
    vocabulary: evaluateMilestoneTrack("vocabulary", metrics.learnedWords),
    mastery: evaluateMilestoneTrack("mastery", metrics.masteredWords),
    reviews: evaluateMilestoneTrack("reviews", metrics.totalReviews),
    consistency: evaluateMilestoneTrack("consistency", metrics.currentStreakDays),
  };
}
