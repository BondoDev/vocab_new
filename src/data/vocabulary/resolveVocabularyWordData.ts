import type { ResolvedConceptWordData } from "../learning/newWordStudyQueue";

// Mirrors the concept_id-keyed cross-language lookup VocabularyPractice.tsx
// already performs inline for the ordinary practice flow (translation comes
// from the native-language vocabulary.json entry sharing the same
// concept_id, not from a "translation" field — none exists in the source
// data). Kept as its own module so Study New Words can reuse the same
// resolution semantics without importing a practice-session React component.
interface RawVocabularyEntry {
  concept_id?: unknown;
  word_lemma?: unknown;
  definiton?: unknown;
  definition?: unknown;
  type?: unknown;
  level?: unknown;
  sentence?: unknown;
}

function isUsableLemma(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim() !== "-";
}

function indexByConceptId(entries: unknown[]): Map<string, RawVocabularyEntry> {
  const index = new Map<string, RawVocabularyEntry>();
  for (const raw of entries) {
    const entry = raw as RawVocabularyEntry;
    const conceptId = typeof entry?.concept_id === "string" ? entry.concept_id : null;
    if (!conceptId || !isUsableLemma(entry.word_lemma)) {
      continue;
    }
    // First occurrence wins, matching parseArrangedVocabulary's dedupe rule.
    if (!index.has(conceptId)) {
      index.set(conceptId, entry);
    }
  }
  return index;
}

// Enumerates every concept id a given language's vocabulary.json entries
// could resolve (same usable-lemma/first-occurrence-wins rule
// indexByConceptId applies internally), in source-file order. Exists for
// callers that need "every concept this language's vocabulary.json knows
// about" (e.g. My Lists' Add Words picker, which must offer the FULL
// vocabulary set for a target language, not just concepts with existing
// user_word_progress rows — see loadFullVocabulary.ts) without introducing
// a second vocabulary-listing source: this reuses indexByConceptId's own
// index, just returning its keys in insertion order instead of the values.
export function listResolvableConceptIds(entries: unknown[]): string[] {
  return [...indexByConceptId(entries).keys()];
}

// Same shape VocabularyPractice.tsx already reads from inflected.json: a
// concept_id plus one or more "word_inflected..." keys whose naming varies
// by language file (e.g. "word_inflected1" for English, "word_inflected-1"/
// "word_inflected-2" for German — the second used for a separable prefix).
function indexInflectedFormsByConceptId(entries: unknown[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const raw of entries) {
    const entry = raw as Record<string, unknown>;
    const conceptId = typeof entry?.concept_id === "string" ? entry.concept_id : null;
    if (!conceptId || index.has(conceptId)) {
      continue;
    }
    const forms = Object.entries(entry)
      .filter(([key, value]) => /inflected/i.test(key) && typeof value === "string" && value.trim())
      .map(([, value]) => (value as string).trim());
    if (forms.length > 0) {
      index.set(conceptId, forms);
    }
  }
  return index;
}

// A concept resolves only when both the target-language and native-language
// vocabulary.json files have a usable entry for it — matching
// VocabularyPractice.tsx's existing behavior, where a concept id missing on
// either side is unusable for practice.
//
// `targetInflectedEntries` is optional (defaults to none) so existing
// callers that don't need the example sentence's highlighted-word forms
// (e.g. Review Words) don't have to load or pass inflected.json.
export function buildVocabularyConceptResolver(
  targetLanguageEntries: unknown[],
  nativeLanguageEntries: unknown[],
  targetInflectedEntries: unknown[] = [],
): (conceptId: string) => ResolvedConceptWordData | null {
  const targetByConceptId = indexByConceptId(targetLanguageEntries);
  const nativeByConceptId = indexByConceptId(nativeLanguageEntries);
  const inflectedFormsByConceptId = indexInflectedFormsByConceptId(targetInflectedEntries);

  return (conceptId: string): ResolvedConceptWordData | null => {
    const targetEntry = targetByConceptId.get(conceptId);
    const nativeEntry = nativeByConceptId.get(conceptId);
    if (!targetEntry || !nativeEntry) {
      return null;
    }

    // Definition is read from the native-language entry (same concept_id),
    // not the target-language one: a learner who doesn't know the target
    // language yet can't read a definition written in it. This mirrors how
    // `translation` is already sourced from nativeEntry — the definition
    // must follow the same rule for the same reason.
    const definition =
      typeof nativeEntry.definition === "string"
        ? nativeEntry.definition
        : typeof nativeEntry.definiton === "string"
          ? nativeEntry.definiton
          : undefined;

    const exampleSentence =
      typeof targetEntry.sentence === "string" && targetEntry.sentence.trim()
        ? targetEntry.sentence
        : undefined;

    // The native-language entry's own `sentence` field is that same
    // concept's example sentence written in the native language — not a
    // generated translation — matching how `translation`/`definition`
    // already read the parallel nativeEntry field for the same concept_id.
    const exampleSentenceTranslation =
      exampleSentence && typeof nativeEntry.sentence === "string" && nativeEntry.sentence.trim()
        ? nativeEntry.sentence
        : undefined;

    const exampleSentenceInflectedForms =
      exampleSentence ? inflectedFormsByConceptId.get(conceptId) : undefined;

    return {
      targetWord: targetEntry.word_lemma as string,
      translation: nativeEntry.word_lemma as string,
      definition,
      grammarType: typeof targetEntry.type === "string" ? targetEntry.type : undefined,
      level: typeof targetEntry.level === "string" ? targetEntry.level : undefined,
      exampleSentence,
      exampleSentenceTranslation,
      exampleSentenceInflectedForms,
    };
  };
}
