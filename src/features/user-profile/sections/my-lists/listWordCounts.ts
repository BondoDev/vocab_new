// Pure per-list word-count aggregation for list cards/detail headers.
// Replaces the corrective My Lists phase's predecessor, listCardMetrics.ts
// (computeListCardMetricsByListId/getListCardMetrics), which derived
// Learning/Known/Mastered aggregate counts keyed by
// word_progress_id -> word_state. That aggregation no longer makes sense:
// membership is concept-based (word_id), independent of
// user_word_progress, so a list may be mostly (or entirely) unstudied — see
// supabase/README.md's "My Lists Corrective Phase" section. A list card now
// shows only a real total word count, computed directly from membership
// rows; it never resolves or requires word_state at all.
//
// Kept import-free (matching listCardMetrics.ts's own precedent) so it
// stays independently testable — see
// scripts/tests/vocabulary/test-my-lists-corrective-pure-logic.mjs.
export interface ListMembershipLike {
  listId: string;
}

// One pass over every membership row — a membership always counts as
// exactly one list word, regardless of whether it has any learning
// progress.
export function computeListWordCountsByListId(memberships: readonly ListMembershipLike[]): Map<string, number> {
  const countsByListId = new Map<string, number>();
  for (const membership of memberships) {
    countsByListId.set(membership.listId, (countsByListId.get(membership.listId) ?? 0) + 1);
  }
  return countsByListId;
}

// Never throws/returns undefined for a list with no memberships yet (or
// none loaded) — callers always get a real 0 rather than needing their own
// fallback.
export function getListWordCount(countsByListId: ReadonlyMap<string, number>, listId: string): number {
  return countsByListId.get(listId) ?? 0;
}
