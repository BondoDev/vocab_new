// Pure aggregation for list cards/detail summaries: given membership rows
// (list_id, word_progress_id) and a lookup of word_progress_id -> word_state,
// computes per-list Learning/Known/Mastered/total counts using the existing
// three-category mapping (mapWordStateToVocabularyCategory) — no second
// category system, per the Phase 2A brief. Kept import-free of anything
// Supabase/React (only imports the shared pure category-mapping module) so
// it's independently testable — see
// scripts/tests/vocabulary/test-my-lists-card-metrics.mjs — and reusable
// wherever a list's counts are needed.
// Explicit .ts extension (matching e.g. milestoneStreak.ts's import of
// dailyStreak.ts) — this keeps the module directly loadable via
// `node --experimental-strip-types` for its own test script, which plain
// Node's ESM resolver requires for a relative TypeScript import (unlike
// Vite's bundler resolution, which accepts either form).
import { mapWordStateToVocabularyCategory } from "../../../../data/learning/vocabularyCategory.ts";
import type { WordState } from "../../../../data/learning/wordReviewSchedule";

export interface ListCardMetrics {
  total: number;
  learning: number;
  known: number;
  mastered: number;
}

const EMPTY_METRICS: ListCardMetrics = { total: 0, learning: 0, known: 0, mastered: 0 };

export interface ListMembershipLike {
  listId: string;
  wordProgressId: string;
}

// One pass over every membership row, looking up each row's current
// word_state via wordStateById. A membership whose word_progress_id isn't
// in the map (the shared progress rows haven't loaded yet, or — should it
// ever happen — the referenced progress row is gone) is skipped rather than
// counted toward any category, so a still-loading or stale state can never
// inflate a count above the real membership total.
export function computeListCardMetricsByListId(
  memberships: readonly ListMembershipLike[],
  wordStateById: ReadonlyMap<string, WordState>,
): Map<string, ListCardMetrics> {
  const metricsByListId = new Map<string, ListCardMetrics>();

  for (const membership of memberships) {
    const wordState = wordStateById.get(membership.wordProgressId);
    if (!wordState) continue;

    const existing = metricsByListId.get(membership.listId) ?? { ...EMPTY_METRICS };
    const category = mapWordStateToVocabularyCategory(wordState);
    existing[category] += 1;
    existing.total += 1;
    metricsByListId.set(membership.listId, existing);
  }

  return metricsByListId;
}

// Never throws/returns undefined for a list with no memberships yet (or
// none loaded) — callers always get a real, all-zero ListCardMetrics rather
// than needing their own fallback.
export function getListCardMetrics(
  metricsByListId: ReadonlyMap<string, ListCardMetrics>,
  listId: string,
): ListCardMetrics {
  return metricsByListId.get(listId) ?? EMPTY_METRICS;
}
