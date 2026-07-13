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
  getAllRussianVerbListPaths,
  getRussianVerbListContent,
  getRussianVerbListPath,
  resolveRussianVerbListRoute,
  type RussianVerbListContent,
  type RussianVerbListFaqItem,
} from "./routes";

export type RussianVerbListItem = VerbListItem;

const TARGET_LANGUAGE: TargetLanguageSlug = "russian";

export const RUSSIAN_VERB_LIST_ITEMS = BASE_VERB_LIST_ITEMS;

export function canLinkRussianVerbListItem(id: string): boolean {
  return canLinkVerbListItem(TARGET_LANGUAGE, id);
}

export function getRussianVerbDefinition(id: string, uiLang: UiLanguageCode): string {
  return getVerbDefinition(id, uiLang);
}

export function getRussianVerbWordLemma(id: string): string {
  return getTargetVerbWordLemma(TARGET_LANGUAGE, id);
}

export function getRussianVerbTranslation(id: string, uiLang: UiLanguageCode): string {
  return getVerbTranslation(id, uiLang);
}
