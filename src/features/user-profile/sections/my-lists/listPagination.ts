// Simple, always-in-range page-window helper shared by the list-detail
// table and the Add Words picker (both need client-side pagination over an
// already-loaded, potentially thousands-of-rows-large vocabulary set — see
// supabase/README.md's "My Lists Corrective Phase" section on why the
// picker now resolves the full vocabulary set, not just studied words).
// Extracted into its own module (unlike the private single-file helpers
// this codebase usually duplicates per-file — e.g. VocabularyTable.tsx's
// own precedent) because both callers live in the same feature folder and
// need byte-identical behavior; a third private copy here would just be
// silent drift waiting to happen between two sibling components.
export function getPageWindow(page: number, totalPages: number, windowSize = 3): number[] {
  if (totalPages <= windowSize) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  let end = start + windowSize - 1;
  if (end > totalPages) {
    end = totalPages;
    start = end - windowSize + 1;
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
