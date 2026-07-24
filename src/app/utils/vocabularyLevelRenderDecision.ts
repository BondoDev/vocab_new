// A registered vocabulary-level route with no matching seo-cefr-content.json
// entry is a data-invariant violation — test:vocabulary-level-coverage
// guards that every registered UI-language/target-language/level
// combination has exactly one entry, so this should be unreachable in
// practice. It is not the same failure as an unrecognized URL (no
// ParsedVocabularyRoute at all) and must not silently render the legacy
// VocabularyLevelPage fallback pipeline; both cases render the existing Not
// Found page, but with a distinguishable message so the two failure modes
// stay auditable.
//
// Deliberately takes booleans rather than the route/content objects
// themselves: this keeps the module free of any import (including type-only
// imports) that would pull in `import.meta.env`/`import.meta.glob`-using
// modules, so it can be compiled and unit-tested directly with the
// repository's plain CommonJS TypeScript-compile helper.
export type VocabularyLevelRenderDecision =
  | { kind: "not-found"; message: string }
  | { kind: "content" };

export function resolveVocabularyLevelRenderDecision(
  hasValidRoute: boolean,
  hasCanonicalContent: boolean,
): VocabularyLevelRenderDecision {
  if (!hasValidRoute) {
    return { kind: "not-found", message: "Invalid vocabulary practice page." };
  }
  if (!hasCanonicalContent) {
    return { kind: "not-found", message: "Vocabulary content unavailable." };
  }
  return { kind: "content" };
}
