import englishVerbListJson from "../lists/list_of_100_most_used_verb.json";
import { getUiVocabularyLanguage } from "../seo/wordPageData";
import type { TargetLanguageSlug, UiLanguageCode } from "../seo/slugs";

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

interface CompactVocabularyItem {
  definition: string;
  wordLemma: string;
}

export const ENGLISH_VERB_LIST_ITEMS = englishVerbListJson as EnglishVerbListItem[];
const vocabularyModules = import.meta.glob("./lookup/*.json", {
  eager: true,
}) as Record<
  string,
  { default: { targetLanguage: TargetLanguageSlug; byId: Record<string, CompactVocabularyItem> } }
>;

const vocabularyByLanguageAndId: Record<TargetLanguageSlug, Map<string, CompactVocabularyItem>> = {
  english: new Map(Object.entries(vocabularyModules["./lookup/english.json"]?.default.byId ?? {})),
  french: new Map(Object.entries(vocabularyModules["./lookup/french.json"]?.default.byId ?? {})),
  german: new Map(Object.entries(vocabularyModules["./lookup/german.json"]?.default.byId ?? {})),
  italian: new Map(Object.entries(vocabularyModules["./lookup/italian.json"]?.default.byId ?? {})),
  portuguese: new Map(Object.entries(vocabularyModules["./lookup/portuguese.json"]?.default.byId ?? {})),
  russian: new Map(Object.entries(vocabularyModules["./lookup/russian.json"]?.default.byId ?? {})),
  spanish: new Map(Object.entries(vocabularyModules["./lookup/spanish.json"]?.default.byId ?? {})),
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
