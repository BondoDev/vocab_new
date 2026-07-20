import type { TargetLanguageSlug, UiLanguageCode } from "../shared/slugs";
import { wordToSlug, stripDiacriticsForComparison } from "./wordSlugs";
import { isValidBrowseWordLemma } from "../shared/browseWordValidation";
import { fixMojibake } from "../../../utils/fixMojibake";

export interface WordPageVocabEntry {
  concept_id: string;
  word_lemma: string;
  definiton: string;
  sentence: string;
  type: string;
  category: string;
  level: string;
}

export interface ResolvedWordPageData {
  wordEntry: WordPageVocabEntry | null;
  displayDefinition: string;
  displayWordLemma: string;
  displayWordType: string;
  displayCategory: string;
  relatedWords: WordPageVocabEntry[];
  discoveryWords: WordPageVocabEntry[];
  browseWords: WordPageVocabEntry[];
  otherMeanings: WordPageVocabEntry[];
}

export interface HydrationCurrentWordEntry {
  conceptId: string;
  wordLemma: string;
  definition: string;
  sentence: string;
  grammarType: string;
  category: string;
  level: string;
}

export interface HydrationWordLinkEntry {
  conceptId: string;
  wordLemma: string;
}

export interface HydrationOtherMeaningEntry {
  conceptId: string;
  wordLemma: string;
  definition: string;
  level: string;
  grammarType: string;
}

export interface HydrationWordPageData {
  wordEntry: HydrationCurrentWordEntry | null;
  displayDefinition: string;
  displayWordLemma: string;
  displayWordType: string;
  displayCategory: string;
  relatedWords: HydrationWordLinkEntry[];
  discoveryWords: HydrationWordLinkEntry[];
  browseWords: HydrationWordLinkEntry[];
  otherMeanings: HydrationOtherMeaningEntry[];
  browseWordsTotalCount: number;
  browsePage: number;
}

export interface CanonicalWordRecordMatch {
  entry: WordPageVocabEntry;
  slugMatches: boolean;
}

export const WORD_PAGE_BROWSE_WORDS_PER_PAGE = 54;
export const WORD_PAGE_DISCOVERY_LINK_COUNT = 12;

interface ResolveWordPageDataParams {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
  conceptId?: string | null;
  vocabulary: WordPageVocabEntry[];
  uiVocabulary?: WordPageVocabEntry[] | null;
}

const UI_LANG_TO_VOCAB: Record<UiLanguageCode, TargetLanguageSlug> = {
  en: "english",
  es: "spanish",
  fr: "french",
  de: "german",
  it: "italian",
  pt: "portuguese",
  ru: "russian",
};

function sanitizeWordPageEntry(entry: WordPageVocabEntry): WordPageVocabEntry {
  return {
    ...entry,
    word_lemma: fixMojibake(entry.word_lemma),
    definiton: fixMojibake(entry.definiton),
    sentence: fixMojibake(entry.sentence),
    type: fixMojibake(entry.type),
    category: fixMojibake(entry.category),
    level: fixMojibake(entry.level),
  };
}

function normalizeLemma(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function createEmptyResolvedWordPageData(): ResolvedWordPageData {
  return {
    wordEntry: null,
    displayDefinition: "",
    displayWordLemma: "",
    displayWordType: "",
    displayCategory: "",
    relatedWords: [],
    discoveryWords: [],
    browseWords: [],
    otherMeanings: [],
  };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x || 1;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function buildDiscoveryWords(
  entry: WordPageVocabEntry,
  browseWords: WordPageVocabEntry[],
): WordPageVocabEntry[] {
  const candidates = browseWords.filter((word) => word.concept_id !== entry.concept_id);
  if (candidates.length <= WORD_PAGE_DISCOVERY_LINK_COUNT) {
    return candidates;
  }

  const seed = hashString(entry.concept_id);
  const startIndex = seed % candidates.length;
  let step = (seed % Math.max(candidates.length - 1, 1)) + 1;
  while (gcd(step, candidates.length) !== 1) {
    step += 1;
  }

  const selected: WordPageVocabEntry[] = [];
  let index = startIndex;
  while (selected.length < WORD_PAGE_DISCOVERY_LINK_COUNT) {
    selected.push(candidates[index]);
    index = (index + step) % candidates.length;
  }

  return selected;
}

export function findWordEntriesBySlug(
  vocabulary: WordPageVocabEntry[],
  wordSlug: string,
): WordPageVocabEntry[] {
  return vocabulary.filter(
    (word) =>
      typeof word.word_lemma === "string" &&
      wordToSlug(fixMojibake(word.word_lemma)) === wordSlug,
  );
}

export function findCanonicalWordRecord(
  vocabulary: WordPageVocabEntry[],
  wordSlug: string,
  conceptId: string,
): CanonicalWordRecordMatch | null {
  const entry = vocabulary.find((word) => String(word.concept_id) === conceptId);
  if (!entry) {
    return null;
  }

  return {
    entry: sanitizeWordPageEntry(entry),
    slugMatches: wordToSlug(fixMojibake(entry.word_lemma)) === wordSlug,
  };
}

// Recovery path for links built while wordToSlug briefly stripped accents
// (2026-06-22 to this revert): if the exact accented slug doesn't match but
// the accent-insensitive form does, the word still exists under a different
// URL. Callers should redirect there instead of treating it as missing.
export function findWordEntryIgnoringAccents(
  vocabulary: WordPageVocabEntry[],
  wordSlug: string,
  conceptId: string,
): WordPageVocabEntry | null {
  const entry = vocabulary.find((word) => String(word.concept_id) === conceptId);
  if (!entry) {
    return null;
  }

  const entrySlug = wordToSlug(fixMojibake(entry.word_lemma));
  if (
    entrySlug !== wordSlug &&
    stripDiacriticsForComparison(entrySlug) === stripDiacriticsForComparison(wordSlug)
  ) {
    return sanitizeWordPageEntry(entry);
  }

  return null;
}

export function getUiVocabularyLanguage(uiLang: UiLanguageCode): TargetLanguageSlug {
  return UI_LANG_TO_VOCAB[uiLang];
}

export function buildResolvedWordPageData({
  uiLang,
  targetLanguage,
  wordSlug,
  conceptId,
  vocabulary,
  uiVocabulary,
}: ResolveWordPageDataParams): ResolvedWordPageData {
  if (!conceptId) {
    return createEmptyResolvedWordPageData();
  }

  const canonicalRecord = findCanonicalWordRecord(vocabulary, wordSlug, conceptId);
  const entry = canonicalRecord?.slugMatches ? canonicalRecord.entry : null;

  if (!entry) {
    return createEmptyResolvedWordPageData();
  }

  let displayDefinition = entry.definiton;
  let displayWordLemma = entry.word_lemma;
  let displayWordType = entry.type;
  let displayCategory = entry.category;
  let uiByConceptId: Map<string, WordPageVocabEntry> | null = null;

  if (getUiVocabularyLanguage(uiLang) !== targetLanguage && uiVocabulary?.length) {
    uiByConceptId = new Map(uiVocabulary.map((word) => [word.concept_id, word]));
    const uiEntry = uiByConceptId.get(entry.concept_id);
    if (uiEntry) {
      const sanitizedUiEntry = sanitizeWordPageEntry(uiEntry);
      displayDefinition = sanitizedUiEntry.definiton || displayDefinition;
      displayWordLemma = sanitizedUiEntry.word_lemma || displayWordLemma;
      displayWordType = sanitizedUiEntry.type || displayWordType;
      displayCategory = sanitizedUiEntry.category || displayCategory;
    }
  }

  const currentNormalizedLemma = normalizeLemma(entry.word_lemma);
  const otherMeanings = vocabulary
    .filter(
      (word) =>
        word.concept_id !== entry.concept_id &&
        normalizeLemma(fixMojibake(word.word_lemma)) === currentNormalizedLemma,
    )
    .map((word) => sanitizeWordPageEntry(uiByConceptId?.get(word.concept_id) ?? word));

  const seen = new Set<string>([entry.concept_id]);
  const relatedWords: WordPageVocabEntry[] = [];
  for (const word of vocabulary) {
    if (!isValidBrowseWordLemma(word.word_lemma)) {
      continue;
    }
    if (
      word.category === entry.category &&
      word.level === entry.level &&
      !seen.has(word.concept_id)
    ) {
      seen.add(word.concept_id);
      relatedWords.push(sanitizeWordPageEntry(word));
      if (relatedWords.length >= 20) break;
    }
  }

  const browseSeen = new Set<string>();
  const browseWords: WordPageVocabEntry[] = [];
  for (const word of vocabulary) {
    if (
      word.level === entry.level &&
      isValidBrowseWordLemma(word.word_lemma) &&
      !browseSeen.has(word.concept_id)
    ) {
      browseSeen.add(word.concept_id);
      browseWords.push(sanitizeWordPageEntry(word));
    }
  }
  const discoveryWords = buildDiscoveryWords(entry, browseWords);

  return {
    wordEntry: entry,
    displayDefinition,
    displayWordLemma,
    displayWordType,
    displayCategory,
    relatedWords,
    discoveryWords,
    browseWords,
    otherMeanings,
  };
}

export function buildHydrationWordPageData(
  data: ResolvedWordPageData | null,
  browsePage = 1,
): HydrationWordPageData | null {
  if (!data) {
    return null;
  }

  const totalCount = data.browseWords.length;
  const safeBrowsePage = Number.isFinite(browsePage) && browsePage > 0 ? Math.floor(browsePage) : 1;
  const startIndex = (safeBrowsePage - 1) * WORD_PAGE_BROWSE_WORDS_PER_PAGE;
  const initialBrowseWords = data.browseWords.slice(
    startIndex,
    startIndex + WORD_PAGE_BROWSE_WORDS_PER_PAGE,
  );

  return {
    wordEntry: data.wordEntry
      ? {
          conceptId: data.wordEntry.concept_id,
          wordLemma: data.wordEntry.word_lemma,
          definition: data.wordEntry.definiton,
          sentence: data.wordEntry.sentence,
          grammarType: data.wordEntry.type,
          category: data.wordEntry.category,
          level: data.wordEntry.level,
        }
      : null,
    displayDefinition: data.displayDefinition,
    displayWordLemma: data.displayWordLemma,
    displayWordType: data.displayWordType,
    displayCategory: data.displayCategory,
    relatedWords: data.relatedWords.map((word) => ({
      conceptId: word.concept_id,
      wordLemma: word.word_lemma,
    })),
    discoveryWords: data.discoveryWords.map((word) => ({
      conceptId: word.concept_id,
      wordLemma: word.word_lemma,
    })),
    browseWords: initialBrowseWords.map((word) => ({
      conceptId: word.concept_id,
      wordLemma: word.word_lemma,
    })),
    otherMeanings: data.otherMeanings.map((word) => ({
      conceptId: word.concept_id,
      wordLemma: word.word_lemma,
      definition: word.definiton,
      level: word.level,
      grammarType: word.type,
    })),
    browseWordsTotalCount: totalCount,
    browsePage: safeBrowsePage,
  };
}
