// Pure local-state helpers for the Favorites toggle: applying an optimistic
// update to the resolved row list, keeping the favorites count in sync with
// it, and guarding against a duplicate in-flight request for the same row.
// None of this touches Supabase — see updateWordProgressFavorite in
// lib/newWordProgress.ts for the actual write, and VocabularySection.tsx for
// how these are composed around it (optimistic update -> write -> revert on
// failure).
export interface FavoriteToggleableRow {
  id: string;
  isFavorite: boolean;
}

// Flips exactly one row's isFavorite by id; every other row is returned
// unchanged (same reference), so this is safe to call on every toggle
// without disturbing unrelated rows' identity.
export function applyFavoriteToggle<T extends FavoriteToggleableRow>(
  rows: readonly T[],
  rowId: string,
  nextIsFavorite: boolean,
): T[] {
  return rows.map((row) => (row.id === rowId ? { ...row, isFavorite: nextIsFavorite } : row));
}

// Keeps the Favorites summary-card/tab count in lockstep with whatever
// applyFavoriteToggle just did to the row list, without re-deriving it from
// every row (unresolved rows aren't in that list — see
// loadVocabularyProgress.ts — so re-deriving from it would under-count).
// A same-to-same toggle (shouldn't happen, but defensive) is a no-op.
export function adjustFavoritesCount(
  favoritesCount: number,
  wasFavorite: boolean,
  nextIsFavorite: boolean,
): number {
  if (wasFavorite === nextIsFavorite) {
    return favoritesCount;
  }
  return Math.max(0, favoritesCount + (nextIsFavorite ? 1 : -1));
}

// Guards against a rapid double-click/duplicate submission issuing two
// concurrent writes for the same row — the caller tracks in-flight row ids
// in a Set and consults this before starting a new toggle.
export function canStartFavoriteToggle(inFlightRowIds: ReadonlySet<string>, rowId: string): boolean {
  return !inFlightRowIds.has(rowId);
}
