import englishVerbListJson from "../lists/list_of_100_most_used_verb.json";
import englishVocabularyJson from "../vocabulary/english/vocabulary.json";
import frenchVocabularyJson from "../vocabulary/french/vocabulary.json";
import germanVocabularyJson from "../vocabulary/german/vocabulary.json";
import italianVocabularyJson from "../vocabulary/italian/vocabulary.json";
import portugueseVocabularyJson from "../vocabulary/portuguese/vocabulary.json";
import russianVocabularyJson from "../vocabulary/russian/vocabulary.json";
import spanishVocabularyJson from "../vocabulary/spanish/vocabulary.json";
import { getUiVocabularyLanguage } from "../seo/wordPageData";
import type { TargetLanguageSlug, UiLanguageCode } from "../seo/slugs";
import { fixMojibake } from "../../utils/fixMojibake";

export {
  getAllEnglishVerbListPaths,
  getEnglishVerbListContent,
  getEnglishVerbListPath,
  resolveEnglishVerbListRoute,
  type EnglishVerbListContent,
  type EnglishVerbListFaqItem,
} from "./routes";

export interface EnglishVerbListItem {
  id: string;
  verb: string;
}

interface EnglishVocabularyItem {
  concept_id?: string | null;
  definiton?: string | null;
  word_lemma?: string | null;
}

export const ENGLISH_VERB_LIST_ITEMS = englishVerbListJson as EnglishVerbListItem[];
const VOCABULARY_BY_LANGUAGE: Record<TargetLanguageSlug, EnglishVocabularyItem[]> = {
  english: englishVocabularyJson as EnglishVocabularyItem[],
  french: frenchVocabularyJson as EnglishVocabularyItem[],
  german: germanVocabularyJson as EnglishVocabularyItem[],
  italian: italianVocabularyJson as EnglishVocabularyItem[],
  portuguese: portugueseVocabularyJson as EnglishVocabularyItem[],
  russian: russianVocabularyJson as EnglishVocabularyItem[],
  spanish: spanishVocabularyJson as EnglishVocabularyItem[],
};

function normalizeVocabularyItem(item: EnglishVocabularyItem) {
  return {
    definition: fixMojibake(String(item.definiton ?? "").trim()),
    wordLemma: fixMojibake(String(item.word_lemma ?? "").trim()),
  };
}

function createVocabularyById(items: EnglishVocabularyItem[]) {
  return new Map(
    items
      .map((item) => [String(item.concept_id ?? "").trim(), normalizeVocabularyItem(item)] as const)
      .filter(([conceptId]) => conceptId.length > 0),
  );
}

const vocabularyByLanguageAndId: Record<TargetLanguageSlug, Map<string, ReturnType<typeof normalizeVocabularyItem>>> = {
  english: createVocabularyById(VOCABULARY_BY_LANGUAGE.english),
  french: createVocabularyById(VOCABULARY_BY_LANGUAGE.french),
  german: createVocabularyById(VOCABULARY_BY_LANGUAGE.german),
  italian: createVocabularyById(VOCABULARY_BY_LANGUAGE.italian),
  portuguese: createVocabularyById(VOCABULARY_BY_LANGUAGE.portuguese),
  russian: createVocabularyById(VOCABULARY_BY_LANGUAGE.russian),
  spanish: createVocabularyById(VOCABULARY_BY_LANGUAGE.spanish),
};

function getVocabularyEntryForUiLanguage(id: string, uiLang: UiLanguageCode) {
  const vocabularyLanguage = getUiVocabularyLanguage(uiLang);
  return (
    vocabularyByLanguageAndId[vocabularyLanguage].get(String(id).trim()) ??
    vocabularyByLanguageAndId.english.get(String(id).trim()) ??
    null
  );
}

export function canLinkEnglishVerbListItem(id: string): boolean {
  return Boolean(vocabularyByLanguageAndId.english.get(String(id).trim())?.wordLemma);
}

export function getEnglishVerbDefinition(id: string, uiLang: UiLanguageCode): string {
  return getVocabularyEntryForUiLanguage(id, uiLang)?.definition ?? "";
}

export function getEnglishVerbWordLemma(id: string): string {
  return vocabularyByLanguageAndId.english.get(String(id).trim())?.wordLemma ?? "";
}

export function getEnglishVerbTranslation(id: string, uiLang: UiLanguageCode): string {
  return getVocabularyEntryForUiLanguage(id, uiLang)?.wordLemma ?? "";
}
