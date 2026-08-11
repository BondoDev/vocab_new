// Pure status resolution for a list word's OPTIONAL learning progress. A
// list word may have no user_word_progress row at all (the corrective My
// Lists phase's whole point — see supabase/README.md's "My Lists
// Corrective Phase" section) — "notStudied" is a first-class status here,
// not an error/fallback state. When a word DOES have progress, its status
// reuses the exact same three-category mapping the Vocabulary page already
// uses (mapWordStateToVocabularyCategory) — no second category system.
//
// Deliberately its own module (not an extension of vocabularyCategory.ts):
// VocabularyCategory ("learning"|"known"|"mastered") is used across the
// Vocabulary page and elsewhere for rows that always HAVE progress by
// construction (they're resolved FROM progress rows) — adding "notStudied"
// to that shared type would force every existing consumer to account for a
// state that can never actually occur there. ListWordStatus is a strict
// superset used only where "no progress yet" is a real, expected case.
//
// Import-free (like vocabularyCategory.ts) so it stays directly loadable
// via `node --experimental-strip-types` for its own test script.
import { mapWordStateToVocabularyCategory } from "../../../../data/learning/vocabularyCategory.ts";
import type { WordState } from "../../../../data/learning/wordReviewSchedule";

export type ListWordStatus = "notStudied" | "learning" | "known" | "mastered";

// wordState is undefined/null when no user_word_progress row exists for
// this concept (the common case for a freshly-added, never-studied list
// word) — resolves to "notStudied" rather than throwing or guessing.
export function resolveListWordStatus(wordState: WordState | null | undefined): ListWordStatus {
  if (!wordState) {
    return "notStudied";
  }
  return mapWordStateToVocabularyCategory(wordState);
}
