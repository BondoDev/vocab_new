// Shared "does this row match the search text" predicate for the
// full-row table search boxes. Matches if the (trimmed, lowercased) search
// text appears as a substring in ANY of the given column values — the row
// number/index is deliberately never one of them, since matching against it
// would be meaningless noise for a text search.
export function rowMatchesSearch(normalizedSearch: string, columnValues: readonly (string | null | undefined)[]): boolean {
  if (!normalizedSearch) {
    return true;
  }

  return columnValues.some((value) => (value ?? "").toLowerCase().includes(normalizedSearch));
}
