// Pure filtering for the corrective My Lists phase's word rows — the list
// detail table and the Add Words picker both operate on rows carrying an
// optional ListWordStatus ("notStudied"|"learning"|"known"|"mastered"), not
// the Vocabulary page's VocabularyCategory (always "learning"|"known"|
// "mastered", because Vocabulary page rows are only ever resolved FROM an
// existing progress row) — see listWordStatus.ts's own header for why
// "notStudied" is deliberately not folded into that shared type. This
// module mirrors vocabularyFiltering.ts's own filtering semantics
// (case-insensitive substring search over targetWord/translation;
// status-tab equality, "all" passes everything through) for this superset
// status type, rather than widening the Vocabulary page's own shared
// filter to a status its rows can never actually have.
//
// Loadable directly via `node --experimental-strip-types` for
// scripts/tests/vocabulary/test-my-lists-corrective-pure-logic.mjs.
import type { ListWordStatus } from "./listWordStatus";

export type ListWordStatusFilterId = "all" | ListWordStatus;

export interface FilterableListWordRow {
  status: ListWordStatus;
  targetWord: string;
  translation?: string | null;
}

export function filterListWordRowsByStatus<T extends FilterableListWordRow>(
  rows: readonly T[],
  statusFilter: ListWordStatusFilterId,
): T[] {
  if (statusFilter === "all") {
    return [...rows];
  }
  return rows.filter((row) => row.status === statusFilter);
}

// Case-insensitive, trims surrounding whitespace, matches either the
// target-language word or the translation, and never throws on a missing/
// null translation.
export function filterListWordRowsBySearch<T extends FilterableListWordRow>(
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
