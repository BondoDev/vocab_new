// Orchestrates Phase 1's milestone data: combines the active-language
// user_word_progress rows and the shared user_daily_stats rows — as of
// Phase 1 of the profile-section data optimization, both passed in
// already-loaded from UserProfileDashboardPage's shared hooks
// (useProfileSharedProgressData for progressRows,
// useProfileSharedDailyStats for dailyStatsRows — see each hook's own
// header) rather than fetched here — then evaluates all four milestone
// tracks locally via the pure engine in src/data/learning/milestones.ts.
//
// Fetch-audit Phase 1 removed the last fetch this file used to own
// (readMilestoneDailyStats, previously called once per Progress-page mount
// — the exact same call Dashboard's useDashboardSupportingData made
// independently on its own mount; see the fetch audit's FETCH-001). This
// function is now a plain, synchronous, pure computation — no session, no
// network, no async — exactly like loadVocabularyGrowthHistory.ts's own
// equivalent change in this phase. Read-only in spirit: performs no
// Supabase writes and does not touch/create a milestones table. Never
// resolves vocabulary.json / concept data — only word_state is needed, not
// translations.
import type { MilestoneDailyStatRow, UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import { computeVocabularyCounts } from "../../../../data/learning/vocabularyCategory";
import { computeMilestoneStreak } from "../../../../data/learning/milestoneStreak";
import { evaluateAllMilestoneTracks, type MilestoneResults } from "../../../../data/learning/milestones";

export interface LoadMilestoneMetricsParams {
  // Already-loaded active-language rows — see this file's own header.
  // Callers must not pass rows for a different language than the shared
  // hooks' own active targetLanguage; UserProfileDashboardPage's shared
  // hooks already guarantee this (both reset their rows on a
  // target-language change).
  progressRows: UserWordProgressFullRow[];
  // Already-loaded, unbounded user_daily_stats rows for the active target
  // language — see this file's own header. readMilestoneDailyStats itself
  // (src/lib/newWordProgress.ts) remains scoped by the same user_id +
  // target_language pair as progressRows above, so the two inputs can
  // never mix data across languages or accounts.
  dailyStatsRows: MilestoneDailyStatRow[];
  // The authoritative current learning date (see
  // src/lib/learningDate.ts's getCurrentLearningDate) — the same
  // server-derived "today" the Learning dashboard's Daily Streak/Today's
  // Progress cards use, not a client-computed local date.
  todayISO: string;
}

export function loadMilestoneMetrics({
  progressRows,
  dailyStatsRows,
  todayISO,
}: LoadMilestoneMetricsParams): MilestoneResults {
  // learnedWords = every persisted progress row regardless of state
  // (VocabularyCounts.total); masteredWords = only word_state "mastered"
  // rows (VocabularyCounts.mastered) — see the task brief's "What counts as
  // Learned/Mastered" sections. Favorites are deliberately not read here at
  // all (the Vocabulary track never derives from them).
  const counts = computeVocabularyCounts(progressRows);

  const currentStreakDays = computeMilestoneStreak(dailyStatsRows, todayISO);

  return evaluateAllMilestoneTracks({
    learnedWords: counts.total,
    masteredWords: counts.mastered,
    knownWords: counts.known,
    currentStreakDays,
  });
}
