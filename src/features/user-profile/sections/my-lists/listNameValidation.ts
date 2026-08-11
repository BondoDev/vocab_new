// Pure validation for the Create List dialog's name field — kept separate
// from CreateListDialog.tsx so it's independently testable (see
// scripts/tests/vocabulary/test-my-lists-validation.mjs) without mounting
// any React component, matching vocabularyFavoriteState.ts's precedent for
// this feature area.
//
// Deliberately conservative: trims leading/trailing whitespace, rejects an
// empty or whitespace-only result, and enforces the 80-character maximum
// the migration's create_user_vocabulary_list RPC and table CHECK
// constraint both also enforce server-side (see that migration's own
// header for why the limit is checked in three independent places). This
// module never truncates a too-long name to fit — it only reports whether
// the trimmed name is acceptable as-is.
export const LIST_NAME_MAX_LENGTH = 80;

export type ListNameValidationResult =
  | { ok: true; name: string }
  | { ok: false; reason: "empty" | "tooLong" };

export function validateListName(rawName: string): ListNameValidationResult {
  const trimmed = rawName.trim();

  if (trimmed.length === 0) {
    return { ok: false, reason: "empty" };
  }

  if (trimmed.length > LIST_NAME_MAX_LENGTH) {
    return { ok: false, reason: "tooLong" };
  }

  return { ok: true, name: trimmed };
}

// Phase 2A — the same case-/whitespace-insensitive normalization the
// database's unique index and the create/rename RPCs both use
// (lower(btrim(name))), mirrored here only for the frontend's optional
// fast-feedback duplicate check against already-loaded lists (see
// MyListsSection). Database uniqueness remains authoritative regardless —
// this never replaces the server-side check, it only lets the common
// non-racing case show the duplicate-name error without a round trip.
export function normalizeListNameForComparison(name: string): string {
  return name.trim().toLowerCase();
}
