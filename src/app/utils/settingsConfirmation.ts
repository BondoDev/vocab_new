// Pure typed-confirmation validators for Settings' two destructive actions
// (Reset language progress / Delete account) — no React, Node-testable
// directly (scripts/tests/account/test-settings-confirmation.mjs).
//
// A literal, locale-invariant word ("RESET"/"DELETE") rather than the
// target language's own translated name: this repo's UI language is one of
// seven, and asking a Russian- or Georgian-interface user to type a Latin
// German language name correctly (with its exact casing/diacritics) is a
// worse, more error-prone confirmation than one fixed English word shown
// verbatim in the dialog's own copy - the same "whichever integrates most
// cleanly and is least error-prone" choice this task's own brief calls out.
// Exact match (trimmed, case-sensitive) - no fuzzy/locale-folding
// comparison, so the displayed instruction ("Type RESET to confirm") is
// always literally true.
export const RESET_CONFIRMATION_WORD = "RESET";
export const DELETE_CONFIRMATION_WORD = "DELETE";

export function isResetConfirmationValid(input: string): boolean {
  return input.trim() === RESET_CONFIRMATION_WORD;
}

export function isDeleteConfirmationValid(input: string): boolean {
  return input.trim() === DELETE_CONFIRMATION_WORD;
}
