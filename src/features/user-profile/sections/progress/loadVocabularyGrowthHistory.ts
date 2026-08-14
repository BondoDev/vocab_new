// Orchestrates the Vocabulary Growth chart's real data: combines the
// active-language user_word_progress rows and the shared vocabulary-growth
// review-event transitions — as of Phase 1 of the profile-section data
// optimization, both passed in already-loaded from
// UserProfileDashboardPage's shared hooks (useProfileSharedProgressData for
// progressRows, useProfileSharedDailyStats for eventRows — see each hook's
// own header) rather than fetched here — then feeds both into the
// already-existing pure reconstruction engine
// (src/data/learning/vocabularyGrowth.ts) — this file duplicates none of
// that logic, it only shapes the two inputs that engine expects.
//
// Fetch-audit Phase 1 removed the last fetch this file used to own
// (readVocabularyGrowthEvents, previously called once per Progress-page
// mount — the exact same RPC call Dashboard's
// useDashboardVocabularyGrowthData made independently on its own mount;
// see the fetch audit's FETCH-002). This function is now a plain,
// synchronous, pure computation — no session, no network, no async —
// exactly like loadMilestoneMetrics.ts's own equivalent change in this
// phase.
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
import type { UserWordProgressFullRow, VocabularyGrowthEventRow } from "../../../../lib/newWordProgress";

export interface LoadVocabularyGrowthHistoryParams {
  // Already-loaded active-language rows — see this file's own header.
  // Callers must not pass rows for a different language than the shared
  // hooks' own active targetLanguage; UserProfileDashboardPage's shared
  // hooks already guarantee this (both reset their rows on a
  // target-language change).
  progressRows: UserWordProgressFullRow[];
  // Already-loaded vocabulary-growth review-event transitions for the
  // active target language — see this file's own header.
  // readVocabularyGrowthEvents itself (src/lib/newWordProgress.ts) remains
  // scoped by the same user_id + target_language pair as progressRows
  // above, so the two inputs can never mix data across languages or
  // accounts.
  eventRows: VocabularyGrowthEventRow[];
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
export function loadVocabularyGrowthHistory({
  progressRows,
  eventRows,
  todayISO,
}: LoadVocabularyGrowthHistoryParams): VocabularyGrowthDayCounts[] {
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
