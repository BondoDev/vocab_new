// Deliberately import-free at runtime (only a type-only import, fully erased
// by both tsc and Node's native TypeScript stripping): scripts/
// test-practice-route-sync.mjs loads this file directly via
// --experimental-strip-types, which cannot resolve this project's
// extensionless relative imports — see pageRouting.ts, which is why that
// file's own exports aren't directly importable from a plain script.
import type { PageKey } from "./pageRouting";

// The language-less legacy practice route (ROUTES.practice, no language
// segment) resolves to the same "practice" PageKey as a canonical pair
// route, but parsePracticeRoute returns null for it. Without hasPracticeRoute
// in this decision, the state->URL effect would treat that alias as a page
// needing canonicalization and compete with the stored-language auto-redirect
// effect over the same navigation.
export function shouldCanonicalizePracticeRoute(
  resolvedPage: PageKey,
  hasPracticeRoute: boolean,
  yourLanguage: string,
  practiceLanguage: string,
): boolean {
  return (
    resolvedPage === "practice" &&
    hasPracticeRoute &&
    yourLanguage !== "" &&
    practiceLanguage !== ""
  );
}
