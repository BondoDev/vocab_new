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

type EnglishVerbListJsonItem =
  | EnglishVerbListItem
  | {
      concept_id: string;
      [verbColumn: string]: string;
    };

interface CompactVocabularyItem {
  definition: string;
  wordLemma: string;
}

function isEnglishVerbListItem(value: unknown): value is EnglishVerbListItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.verb === "string";
}

function normalizeEnglishVerbListItems(items: EnglishVerbListJsonItem[]): EnglishVerbListItem[] {
  const normalized: EnglishVerbListItem[] = [];

  for (const item of items) {
    if (isEnglishVerbListItem(item)) {
      normalized.push({
        id: item.id.trim(),
        verb: item.verb.trim(),
      });
      continue;
    }

    if (!item || typeof item !== "object" || typeof item.concept_id !== "string") {
      continue;
    }

    const verbEntry = Object.entries(item).find(
      ([key, value]) => key !== "concept_id" && typeof value === "string",
    );

    if (!verbEntry) {
      continue;
    }

    const [verbKey, verbValue] = verbEntry;
    const normalizedVerb =
      verbKey.trim().toLowerCase() === "verb" ? verbValue.trim() : verbKey.trim();

    normalized.push({
      id: item.concept_id.trim(),
      verb: normalizedVerb,
    });
  }

  return normalized.filter((item) => item.id.length > 0 && item.verb.length > 0);
}

export const ENGLISH_VERB_LIST_ITEMS = normalizeEnglishVerbListItems(
  englishVerbListJson as EnglishVerbListJsonItem[],
);
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
  const normalizedId = String(id).trim();
  return (
    vocabularyByLanguageAndId[vocabularyLanguage].get(normalizedId) ??
    vocabularyByLanguageAndId.english.get(normalizedId) ??
    null
  );
}

export function canLinkEnglishVerbListItem(id: string): boolean {
  const normalizedId = String(id).trim();
  return Boolean(vocabularyByLanguageAndId.english.get(normalizedId)?.wordLemma);
}

export function getEnglishVerbDefinition(id: string, uiLang: UiLanguageCode): string {
  return getVocabularyEntryForUiLanguage(id, uiLang)?.definition ?? "";
}

export function getEnglishVerbWordLemma(id: string): string {
  const normalizedId = String(id).trim();
  return vocabularyByLanguageAndId.english.get(normalizedId)?.wordLemma ?? "";
}

export function getEnglishVerbTranslation(id: string, uiLang: UiLanguageCode): string {
  return getVocabularyEntryForUiLanguage(id, uiLang)?.wordLemma ?? "";
}
