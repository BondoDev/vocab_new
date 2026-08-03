// Maps user_word_progress's five internal backend states into the three
// user-facing Vocabulary categories (Learning / Known / Mastered), and
// computes the Vocabulary page's summary-card / tab counts from a set of
// progress rows. Deliberately import-free (like wordReviewSchedule.ts) so it
// stays loadable directly via `node --experimental-strip-types` for
// scripts/tests/learning/test-vocabulary-category.mjs.
//
// Favorites are independent of category: a favorited word still belongs to
// whichever of Learning/Known/Mastered its word_state maps to. Raw backend
// state names (seen/learning/familiar/strong/mastered) must never reach the
// UI directly — only this mapping's output does.
import type { WordState } from "./wordReviewSchedule";

export type VocabularyCategory = "learning" | "known" | "mastered";

const CATEGORY_BY_WORD_STATE: Record<WordState, VocabularyCategory> = {
  seen: "learning",
  learning: "learning",
  familiar: "known",
  strong: "known",
  mastered: "mastered",
};

export function mapWordStateToVocabularyCategory(wordState: WordState): VocabularyCategory {
  return CATEGORY_BY_WORD_STATE[wordState];
}

export interface VocabularyProgressRowLike {
  wordState: WordState;
  isFavorite: boolean;
}

export interface VocabularyCounts {
  learning: number;
  known: number;
  mastered: number;
  favorites: number;
  total: number;
}

// Counts are computed over every persisted progress row (not just the ones
// that successfully resolve to displayable vocabulary data) — an unresolved
// concept is still a real, saved piece of progress, so it must still count.
// See loadVocabularyProgress.ts for where resolution failures are logged and
// skipped from the *visible list* while still reaching this function.
export function computeVocabularyCounts(rows: readonly VocabularyProgressRowLike[]): VocabularyCounts {
  const counts: VocabularyCounts = { learning: 0, known: 0, mastered: 0, favorites: 0, total: 0 };

  for (const row of rows) {
    counts[mapWordStateToVocabularyCategory(row.wordState)] += 1;
    if (row.isFavorite) {
      counts.favorites += 1;
    }
    counts.total += 1;
  }

  return counts;
}
