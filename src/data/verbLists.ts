import {
  BASE_VERB_LIST_ITEMS,
  canLinkVerbListItem as canLinkCommonVerbListItem,
  getTargetVerbWordLemma,
  getVerbDefinition,
  getVerbTranslation,
  type VerbListItem,
} from "./commonVerbList";
import { type TargetLanguageSlug, type UiLanguageCode } from "./seo/slugs";
import {
  getAllVerbListPaths,
  getVerbListConfig,
  getVerbListContent,
  getVerbListPath,
  getVerbListSpeechLang,
  getVerbListTitle,
  resolveVerbListRoute,
} from "./verbListRegistry";

export {
  getAllVerbListPaths,
  getVerbListConfig,
  getVerbListContent,
  getVerbListPath,
  getVerbListSpeechLang,
  getVerbListTitle,
  resolveVerbListRoute,
} from "./verbListRegistry";

export const VERB_LIST_ITEMS = BASE_VERB_LIST_ITEMS;
export type SharedVerbListItem = VerbListItem;

export function canLinkVerbListItem(targetLanguage: TargetLanguageSlug, id: string): boolean {
  return canLinkCommonVerbListItem(targetLanguage, id);
}

export function getVerbListDefinition(id: string, uiLang: UiLanguageCode): string {
  return getVerbDefinition(id, uiLang);
}

export function getVerbListTranslation(id: string, uiLang: UiLanguageCode): string {
  return getVerbTranslation(id, uiLang);
}

export function getVerbListWordLemma(targetLanguage: TargetLanguageSlug, id: string): string {
  return getTargetVerbWordLemma(targetLanguage, id);
}
