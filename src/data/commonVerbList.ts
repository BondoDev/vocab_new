import verbListJson from "./lists/list_of_100_most_used_verb.json";
import { getUiVocabularyLanguage } from "./seo/wordPageData";
import type { TargetLanguageSlug, UiLanguageCode } from "./seo/slugs";

export interface VerbListItem {
  id: string;
  verb: string;
}

type VerbListJsonItem =
  | VerbListItem
  | {
      concept_id: string;
      [verbColumn: string]: string;
    };

interface CompactVocabularyItem {
  definition: string;
  wordLemma: string;
}

function isVerbListItem(value: unknown): value is VerbListItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.verb === "string";
}

function normalizeVerbListItems(items: VerbListJsonItem[]): VerbListItem[] {
  const normalized: VerbListItem[] = [];

  for (const item of items) {
    if (isVerbListItem(item)) {
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

export const BASE_VERB_LIST_ITEMS = normalizeVerbListItems(verbListJson as VerbListJsonItem[]);

const vocabularyModules = import.meta.glob("./englishVerbList/lookup/*.json", {
  eager: true,
}) as Record<
  string,
  { default: { targetLanguage: TargetLanguageSlug; byId: Record<string, CompactVocabularyItem> } }
>;

const vocabularyByLanguageAndId: Record<TargetLanguageSlug, Map<string, CompactVocabularyItem>> = {
  english: new Map(Object.entries(vocabularyModules["./englishVerbList/lookup/english.json"]?.default.byId ?? {})),
  french: new Map(Object.entries(vocabularyModules["./englishVerbList/lookup/french.json"]?.default.byId ?? {})),
  german: new Map(Object.entries(vocabularyModules["./englishVerbList/lookup/german.json"]?.default.byId ?? {})),
  italian: new Map(Object.entries(vocabularyModules["./englishVerbList/lookup/italian.json"]?.default.byId ?? {})),
  portuguese: new Map(Object.entries(vocabularyModules["./englishVerbList/lookup/portuguese.json"]?.default.byId ?? {})),
  russian: new Map(Object.entries(vocabularyModules["./englishVerbList/lookup/russian.json"]?.default.byId ?? {})),
  spanish: new Map(Object.entries(vocabularyModules["./englishVerbList/lookup/spanish.json"]?.default.byId ?? {})),
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

export function canLinkVerbListItem(targetLanguage: TargetLanguageSlug, id: string): boolean {
  const normalizedId = String(id).trim();
  return Boolean(vocabularyByLanguageAndId[targetLanguage].get(normalizedId)?.wordLemma);
}

export function getVerbDefinition(id: string, uiLang: UiLanguageCode): string {
  return getVocabularyEntryForUiLanguage(id, uiLang)?.definition ?? "";
}

export function getVerbTranslation(id: string, uiLang: UiLanguageCode): string {
  return getVocabularyEntryForUiLanguage(id, uiLang)?.wordLemma ?? "";
}

export function getTargetVerbWordLemma(targetLanguage: TargetLanguageSlug, id: string): string {
  const normalizedId = String(id).trim();
  return vocabularyByLanguageAndId[targetLanguage].get(normalizedId)?.wordLemma ?? "";
}
