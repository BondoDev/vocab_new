// Orchestrates Phase 1's milestone data: combines the active-language
// user_word_progress rows — as of Phase 1 of the profile-section data
// optimization, passed in already-loaded from UserProfileDashboardPage's
// shared useProfileSharedProgressData rather than fetched here (see that
// hook's own header) — with readMilestoneDailyStats (still fetched here;
// user_daily_stats is not consolidated in this phase — see
// src/lib/newWordProgress.ts, the only module that knows about
// user_word_progress/user_daily_stats), then evaluates all four milestone
// tracks locally via the pure engine in src/data/learning/milestones.ts.
// Read-only; performs no Supabase writes and does not touch/create a
// milestones table. Never resolves vocabulary.json / concept data — only
// word_state is needed, not translations.
import type { StoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { readMilestoneDailyStats, type UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import { computeVocabularyCounts } from "../../../../data/learning/vocabularyCategory";
import { computeMilestoneStreak } from "../../../../data/learning/milestoneStreak";
import { evaluateAllMilestoneTracks, type MilestoneResults } from "../../../../data/learning/milestones";

export interface LoadMilestoneMetricsParams {
  session: StoredSupabaseSession;
  // Already-loaded active-language rows — see this file's own header.
  // Callers must not pass rows for a different language than
  // targetLanguage below; UserProfileDashboardPage's shared hook already
  // guarantees this (it resets the rows on a target-language change).
  progressRows: UserWordProgressFullRow[];
  // The active practice/target language — milestones are language-specific
  // (see the task brief's "Language Isolation" section): switching the
  // active target language must show that language's own progress, never a
  // cross-language total.
  targetLanguage: string;
  // The authoritative current learning date (see
  // src/lib/learningDate.ts's getCurrentLearningDate) — the same
  // server-derived "today" the Learning dashboard's Daily Streak/Today's
  // Progress cards use, not a client-computed local date.
  todayISO: string;
}

// readMilestoneDailyStats is scoped to the same user_id + target_language
// pair as progressRows above (enforced inside newWordProgress.ts itself),
// so the two branches can never mix data across languages or accounts.
export async function loadMilestoneMetrics({
  session,
  progressRows,
  targetLanguage,
  todayISO,
}: LoadMilestoneMetricsParams): Promise<MilestoneResults> {
  const dailyStats = await readMilestoneDailyStats(session, targetLanguage);

  // learnedWords = every persisted progress row regardless of state
  // (VocabularyCounts.total); masteredWords = only word_state "mastered"
  // rows (VocabularyCounts.mastered) — see the task brief's "What counts as
  // Learned/Mastered" sections. Favorites are deliberately not read here at
  // all (the Vocabulary track never derives from them).
  const counts = computeVocabularyCounts(progressRows);

  const totalReviews = dailyStats.reduce((sum, row) => sum + row.reviewsCompleted, 0);
  const currentStreakDays = computeMilestoneStreak(dailyStats, todayISO);

  return evaluateAllMilestoneTracks({
    learnedWords: counts.total,
    masteredWords: counts.mastered,
    totalReviews,
    currentStreakDays,
  });
}
