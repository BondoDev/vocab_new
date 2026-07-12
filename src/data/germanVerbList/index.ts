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
  getAllGermanVerbListPaths,
  getGermanVerbListContent,
  getGermanVerbListPath,
  resolveGermanVerbListRoute,
  type GermanVerbListContent,
} from "./routes";

export type GermanVerbListItem = VerbListItem;

const TARGET_LANGUAGE: TargetLanguageSlug = "german";

export const GERMAN_VERB_LIST_ITEMS = BASE_VERB_LIST_ITEMS;

export function canLinkGermanVerbListItem(id: string): boolean {
  return canLinkVerbListItem(TARGET_LANGUAGE, id);
}

export function getGermanVerbDefinition(id: string, uiLang: UiLanguageCode): string {
  return getVerbDefinition(id, uiLang);
}

export function getGermanVerbWordLemma(id: string): string {
  return getTargetVerbWordLemma(TARGET_LANGUAGE, id);
}

export function getGermanVerbTranslation(id: string, uiLang: UiLanguageCode): string {
  return getVerbTranslation(id, uiLang);
}
