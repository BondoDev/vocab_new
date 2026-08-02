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

// A concept resolves only when both the target-language and native-language
// vocabulary.json files have a usable entry for it — matching
// VocabularyPractice.tsx's existing behavior, where a concept id missing on
// either side is unusable for practice.
export function buildVocabularyConceptResolver(
  targetLanguageEntries: unknown[],
  nativeLanguageEntries: unknown[],
): (conceptId: string) => ResolvedConceptWordData | null {
  const targetByConceptId = indexByConceptId(targetLanguageEntries);
  const nativeByConceptId = indexByConceptId(nativeLanguageEntries);

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

    return {
      targetWord: targetEntry.word_lemma as string,
      translation: nativeEntry.word_lemma as string,
      definition,
      grammarType: typeof targetEntry.type === "string" ? targetEntry.type : undefined,
      level: typeof targetEntry.level === "string" ? targetEntry.level : undefined,
      exampleSentence:
        typeof targetEntry.sentence === "string" && targetEntry.sentence.trim()
          ? targetEntry.sentence
          : undefined,
    };
  };
}
