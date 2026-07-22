// Deliberately import-free: scripts/tests/practice/test-practice-route-sync.mjs loads this
// file directly via Node's native TypeScript stripping, which cannot resolve
// this project's extensionless relative imports (see pageRouting.ts). Keeping
// this file dependency-free is what lets the regression test exercise the
// real production policy instead of a re-implementation of it.
export function shouldRestoreStoredLanguagePreference(
  hasInitialCanonicalPracticeRoute: boolean,
): boolean {
  return !hasInitialCanonicalPracticeRoute;
}
