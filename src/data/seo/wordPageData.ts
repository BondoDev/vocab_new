import type { TargetLanguageSlug, UiLanguageCode } from "./slugs";
import { wordToSlug } from "./wordSlugs";
import { isValidBrowseWordLemma } from "./browseWordValidation";

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
  browseWords: WordPageVocabEntry[];
  otherMeanings: WordPageVocabEntry[];
}

export interface HydrationWordPageData extends ResolvedWordPageData {
  browseWordsTotalCount?: number;
  browseWordsPartial?: boolean;
}

export const WORD_PAGE_BROWSE_WORDS_PER_PAGE = 54;

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
    browseWords: [],
    otherMeanings: [],
  };
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
  const entry =
    (conceptId
      ? vocabulary.find((word) => String(word.concept_id) === conceptId)
      : undefined) ??
    vocabulary.find(
      (word) =>
        typeof word.word_lemma === "string" &&
        wordToSlug(word.word_lemma) === wordSlug,
    );

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
      displayDefinition = uiEntry.definiton || displayDefinition;
      displayWordLemma = uiEntry.word_lemma || displayWordLemma;
      displayWordType = uiEntry.type || displayWordType;
      displayCategory = uiEntry.category || displayCategory;
    }
  }

  const currentNormalizedLemma = normalizeLemma(entry.word_lemma);
  const otherMeanings = vocabulary
    .filter(
      (word) =>
        word.concept_id !== entry.concept_id &&
        normalizeLemma(word.word_lemma) === currentNormalizedLemma,
    )
    .map((word) => (uiByConceptId?.get(word.concept_id) ?? word));

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
      relatedWords.push(word);
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
      browseWords.push(word);
    }
  }

  return {
    wordEntry: entry,
    displayDefinition,
    displayWordLemma,
    displayWordType,
    displayCategory,
    relatedWords,
    browseWords,
    otherMeanings,
  };
}

export function buildHydrationWordPageData(
  data: ResolvedWordPageData | null,
): HydrationWordPageData | null {
  if (!data) {
    return null;
  }

  const totalCount = data.browseWords.length;
  const initialBrowseWords = data.browseWords.slice(0, WORD_PAGE_BROWSE_WORDS_PER_PAGE);

  return {
    ...data,
    browseWords: initialBrowseWords,
    browseWordsTotalCount: totalCount,
    browseWordsPartial: totalCount > initialBrowseWords.length,
  };
}
