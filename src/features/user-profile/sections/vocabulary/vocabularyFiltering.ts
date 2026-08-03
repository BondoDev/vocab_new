// Pure, import-free (well, only a type-only import — erased at runtime, see
// vocabularyCategory.ts's own precedent) filtering logic for the Vocabulary
// page's tabs and search box. Filtering runs entirely over the already-
// loaded row set — no Supabase request is issued per tab click or keystroke.
//
// Loadable directly via `node --experimental-strip-types` for
// scripts/tests/learning/test-vocabulary-filtering.mjs.
import type { VocabularyCategory } from "../../../../data/learning/vocabularyCategory";

export type VocabularyTabId = "all" | "learning" | "known" | "mastered" | "favorites";

export interface FilterableVocabularyRow {
  category: VocabularyCategory;
  isFavorite: boolean;
  targetWord: string;
  // Optional because a resolved concept without a native-language entry
  // (shouldn't normally happen, since resolution requires both sides — see
  // resolveVocabularyWordData.ts) still shouldn't crash search if it does.
  translation?: string | null;
}

// "all" and "favorites" are not backend states, so they're handled as
// special cases rather than entries in the category map.
export function filterVocabularyRowsByTab<T extends FilterableVocabularyRow>(
  rows: readonly T[],
  tabId: VocabularyTabId,
): T[] {
  switch (tabId) {
    case "all":
      return [...rows];
    case "favorites":
      return rows.filter((row) => row.isFavorite);
    default:
      return rows.filter((row) => row.category === tabId);
  }
}

// Case-insensitive, trims surrounding whitespace, matches either the
// target-language word or the translation, and never throws on a missing/
// null translation.
export function filterVocabularyRowsBySearch<T extends FilterableVocabularyRow>(
  rows: readonly T[],
  searchValue: string,
): T[] {
  const normalizedQuery = searchValue.trim().toLowerCase();
  if (!normalizedQuery) {
    return [...rows];
  }

  return rows.filter((row) => {
    const word = row.targetWord.toLowerCase();
    const translation = (row.translation ?? "").toLowerCase();
    return word.includes(normalizedQuery) || translation.includes(normalizedQuery);
  });
}

export function countVocabularyRowsForTab<T extends FilterableVocabularyRow>(
  rows: readonly T[],
  tabId: VocabularyTabId,
): number {
  return filterVocabularyRowsByTab(rows, tabId).length;
}
