import {
  BASE_VERB_LIST_ITEMS,
  canLinkVerbListItem,
  getTargetVerbWordLemma,
  getVerbDefinition,
  getVerbTranslation,
  type VerbListItem,
} from "../commonVerbList";
import type { TargetLanguageSlug, UiLanguageCode } from "../seo/slugs";

export {
  getAllEnglishVerbListPaths,
  getEnglishVerbListContent,
  getEnglishVerbListPath,
  resolveEnglishVerbListRoute,
  type EnglishVerbListContent,
  type EnglishVerbListFaqItem,
} from "./routes";

export type EnglishVerbListItem = VerbListItem;

const TARGET_LANGUAGE: TargetLanguageSlug = "english";

export const ENGLISH_VERB_LIST_ITEMS = BASE_VERB_LIST_ITEMS;

export function canLinkEnglishVerbListItem(id: string): boolean {
  return canLinkVerbListItem(TARGET_LANGUAGE, id);
}

export function getEnglishVerbDefinition(id: string, uiLang: UiLanguageCode): string {
  return getVerbDefinition(id, uiLang);
}

export function getEnglishVerbWordLemma(id: string): string {
  return getTargetVerbWordLemma(TARGET_LANGUAGE, id);
}

export function getEnglishVerbTranslation(id: string, uiLang: UiLanguageCode): string {
  return getVerbTranslation(id, uiLang);
}
