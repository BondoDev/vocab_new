// Orchestrates the Vocabulary Growth chart's real data: combines the
// active-language user_word_progress rows — as of Phase 1 of the
// profile-section data optimization, passed in already-loaded from
// UserProfileDashboardPage's shared useProfileSharedProgressData rather
// than fetched here (see that hook's own header) — with review-event
// transitions (still fetched here), then feeds both into the
// already-existing pure reconstruction engine
// (src/data/learning/vocabularyGrowth.ts) — this file duplicates none of
// that logic, it only fetches/shapes the one remaining input that engine
// expects. Read-only; performs no Supabase writes.
import type { StoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { readVocabularyGrowthEvents, type UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import { computeVocabularyCounts } from "../../../../data/learning/vocabularyCategory";
import {
  computeVocabularyGrowthHistory,
  filterVocabularyGrowthByRange,
  applyCurrentDayOverride,
  resolveWordCreatedDateISO,
  type VocabularyGrowthDayCounts,
  type VocabularyGrowthWordInput,
  type VocabularyGrowthEventInput,
} from "../../../../data/learning/vocabularyGrowth";

export interface LoadVocabularyGrowthHistoryParams {
  session: StoredSupabaseSession;
  // Already-loaded active-language rows — see this file's own header.
  // Callers must not pass rows for a different language than
  // targetLanguage below; UserProfileDashboardPage's shared hook already
  // guarantees this (it resets the rows on a target-language change).
  progressRows: UserWordProgressFullRow[];
  // Milestones is language-specific (see loadMilestoneMetrics.ts); this
  // loader follows the identical contract — switching the active target
  // language must show that language's own vocabulary growth, never a
  // cross-language total.
  targetLanguage: string;
  // The authoritative current learning date (getCurrentLearningDate) —
  // the same server-derived "today" every other Progress-page loader
  // already uses. Both the reconstruction end-date and the current-day
  // override are anchored to this, not a client-computed local date.
  todayISO: string;
}

// Returns [] when the user has no learned vocabulary at all for this
// language — the caller renders the empty state in that case (never a
// one-point all-zero "chart"). Otherwise returns the *full* available
// history (every real day from the first learned word through todayISO);
// time-range filtering is a separate, cheap client-side step — see
// filterVocabularyGrowthByRange, re-exported below so callers don't need
// a second import to slice what this function already returned.
export async function loadVocabularyGrowthHistory({
  session,
  progressRows,
  targetLanguage,
  todayISO,
}: LoadVocabularyGrowthHistoryParams): Promise<VocabularyGrowthDayCounts[]> {
  const eventRows = await readVocabularyGrowthEvents(session, targetLanguage);

  const words: VocabularyGrowthWordInput[] = [];
  for (const row of progressRows) {
    const createdDateISO = resolveWordCreatedDateISO(row.firstStudiedStatDate, row.createdAt ?? "");
    // A row with no usable creation date at all (both first_studied_stat_date
    // and created_at missing/unparseable — should be unreachable given
    // created_at's NOT NULL constraint, but defensive regardless) is
    // dropped from history reconstruction rather than crashing the chart;
    // it still counts normally everywhere else (Vocabulary page,
    // Milestones) since those never call this loader.
    if (createdDateISO !== null) {
      words.push({ wordProgressId: row.id, createdDateISO });
    }
  }

  if (words.length === 0) {
    return [];
  }

  const events: VocabularyGrowthEventInput[] = eventRows.map((row) => ({
    wordProgressId: row.wordProgressId,
    previousState: row.previousState,
    newState: row.newState,
    eventDateISO: row.eventDateISO,
  }));

  const history = computeVocabularyGrowthHistory(words, events, todayISO);

  // Current-day accuracy requirement: the rightmost point must match the
  // real, authoritative user_word_progress.word_state snapshot — the same
  // computeVocabularyCounts the Vocabulary page's own summary cards use —
  // never rely on reconstruction alone for "now".
  const currentCounts = computeVocabularyCounts(progressRows);

  return applyCurrentDayOverride(history, todayISO, {
    learning: currentCounts.learning,
    known: currentCounts.known,
    mastered: currentCounts.mastered,
  });
}

export { filterVocabularyGrowthByRange };
export type { VocabularyGrowthDayCounts, VocabularyGrowthRange } from "../../../../data/learning/vocabularyGrowth";
