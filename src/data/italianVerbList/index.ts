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
  getAllItalianVerbListPaths,
  getItalianVerbListContent,
  getItalianVerbListPath,
  resolveItalianVerbListRoute,
  type ItalianVerbListContent,
  type ItalianVerbListFaqItem,
} from "./routes";

export type ItalianVerbListItem = VerbListItem;

const TARGET_LANGUAGE: TargetLanguageSlug = "italian";

export const ITALIAN_VERB_LIST_ITEMS = BASE_VERB_LIST_ITEMS;

export function canLinkItalianVerbListItem(id: string): boolean {
  return canLinkVerbListItem(TARGET_LANGUAGE, id);
}

export function getItalianVerbDefinition(id: string, uiLang: UiLanguageCode): string {
  return getVerbDefinition(id, uiLang);
}

export function getItalianVerbWordLemma(id: string): string {
  return getTargetVerbWordLemma(TARGET_LANGUAGE, id);
}

export function getItalianVerbTranslation(id: string, uiLang: UiLanguageCode): string {
  return getVerbTranslation(id, uiLang);
}
