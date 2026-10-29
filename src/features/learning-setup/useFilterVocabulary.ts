import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Vocabulary metadata for the practice language, shared by the Custom
// Practice setup page and the detailed filters page so both apply the same
// "no matching words" guard to filter changes.

export const DEFAULT_WORD_TYPES: string[] = [
  "preposition",
  "noun",
  "verb",
  "adjective",
  "adverb",
  "determiner",
  "conjunction",
  "pronoun",
  "exclamation",
  "expression",
];

type FilterCount = {
  type: string;
  level: string;
  category: string;
  count: number;
};
type VocabularyMetadata = {
  wordTypes: string[];
  counts: FilterCount[];
};

async function loadVocabularyMetadata(
  practiceLanguage: string,
): Promise<VocabularyMetadata | null> {
  switch (practiceLanguage) {
    case "en":
      return (await import("../../data/vocabularyMetadata/english.json"))
        .default as VocabularyMetadata;
    case "es":
      return (await import("../../data/vocabularyMetadata/spanish.json"))
        .default as VocabularyMetadata;
    case "fr":
      return (await import("../../data/vocabularyMetadata/french.json"))
        .default as VocabularyMetadata;
    case "de":
      return (await import("../../data/vocabularyMetadata/german.json"))
        .default as VocabularyMetadata;
    case "it":
      return (await import("../../data/vocabularyMetadata/italian.json"))
        .default as VocabularyMetadata;
    case "pt":
      return (await import("../../data/vocabularyMetadata/portuguese.json"))
        .default as VocabularyMetadata;
    case "ru":
      return (await import("../../data/vocabularyMetadata/russian.json"))
        .default as VocabularyMetadata;
    default:
      return null;
  }
}

export type FilteredWordCount = (
  levels: string[],
  categories: string[],
  wordTypes: string[],
) => number;

/**
 * Loads the practice language's filter metadata and returns:
 * - `wordTypes`: every word type, the common ones first in a fixed order;
 * - `getFilteredWordCount`: words matching a filter combination, where an
 *   empty list means "no restriction" for that dimension. Until metadata is
 *   loaded (or with no practice language) it returns 1, so nothing is
 *   blocked on missing data.
 */
export function useFilterVocabulary(practiceLanguage: string) {
  const [allWordTypes, setAllWordTypes] =
    useState<string[]>(DEFAULT_WORD_TYPES);
  const [filterCounts, setFilterCounts] = useState<FilterCount[]>([]);
  const [isReady, setIsReady] = useState(false);
  const countCacheRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    countCacheRef.current.clear();
  }, [filterCounts]);

  useEffect(() => {
    let isMounted = true;
    setIsReady(false);

    const load = async () => {
      try {
        const metadata = await loadVocabularyMetadata(practiceLanguage);
        if (!metadata) {
          if (isMounted) setAllWordTypes(DEFAULT_WORD_TYPES);
          return;
        }

        if (!isMounted) return;
        setAllWordTypes(
          metadata.wordTypes.length > 0
            ? [...metadata.wordTypes]
            : [...DEFAULT_WORD_TYPES],
        );
        setFilterCounts(Array.isArray(metadata.counts) ? metadata.counts : []);
        setIsReady(true);
      } catch {
        if (isMounted) {
          setAllWordTypes(DEFAULT_WORD_TYPES);
          setFilterCounts([]);
          setIsReady(true);
        }
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, [practiceLanguage]);

  const wordTypes = useMemo(() => {
    const prioritySet = new Set(DEFAULT_WORD_TYPES);
    const normalized = Array.from(new Set(allWordTypes))
      .map((type) => type?.trim())
      .filter((type): type is string => Boolean(type));
    const prioritized = DEFAULT_WORD_TYPES.filter((type) =>
      normalized.includes(type),
    );
    const rest = normalized
      .filter((type) => !prioritySet.has(type))
      .sort((a, b) => a.localeCompare(b));
    return [...prioritized, ...rest];
  }, [allWordTypes]);

  const getFilteredWordCount = useCallback<FilteredWordCount>(
    (levels, categories, types) => {
      if (!isReady) {
        return 1;
      }
      const key = [
        [...levels].sort().join("|"),
        [...categories].sort().join("|"),
        [...types].sort().join("|"),
      ].join("::");
      const cached = countCacheRef.current.get(key);
      if (typeof cached === "number") {
        return cached;
      }
      const count = filterCounts.reduce((total, word) => {
        if (levels.length > 0 && !levels.includes(word.level)) return total;
        if (categories.length > 0 && !categories.includes(word.category)) {
          return total;
        }
        if (types.length > 0 && !types.includes(word.type)) return total;
        return total + word.count;
      }, 0);
      countCacheRef.current.set(key, count);
      return count;
    },
    [filterCounts, isReady],
  );

  return { wordTypes, getFilteredWordCount };
}
