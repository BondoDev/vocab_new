// Pure local search/sort over already-loaded lists. Search operates on
// loaded list names only (no server round-trip); sort never re-fetches
// anything — both per the Phase 2A brief's "Search operates on loaded list
// names locally" requirement. Kept import-free so it's independently
// testable — see scripts/tests/vocabulary/test-my-lists-search-sort.mjs.
export type ListSortMode = "recentlyUpdated" | "nameAsc" | "nameDesc";

export interface SearchableSortableList {
  name: string;
  updatedAt: string;
}

// Case-insensitive substring match, trimmed — an empty/whitespace-only
// query returns every list (a fresh copy, never the original array
// reference) rather than filtering everything out.
export function filterListsBySearchQuery<T extends SearchableSortableList>(
  lists: readonly T[],
  query: string,
): T[] {
  const trimmedQuery = query.trim().toLowerCase();
  if (!trimmedQuery) {
    return [...lists];
  }
  return lists.filter((list) => list.name.toLowerCase().includes(trimmedQuery));
}

// Always returns a new array (never mutates the input) so callers can hold
// onto their own already-loaded list array safely.
export function sortLists<T extends SearchableSortableList>(lists: readonly T[], mode: ListSortMode): T[] {
  const sorted = [...lists];
  switch (mode) {
    case "nameAsc":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "nameDesc":
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "recentlyUpdated":
    default:
      sorted.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      break;
  }
  return sorted;
}
