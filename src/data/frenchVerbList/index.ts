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
  getAllFrenchVerbListPaths,
  getFrenchVerbListContent,
  getFrenchVerbListPath,
  resolveFrenchVerbListRoute,
  type FrenchVerbListContent,
  type FrenchVerbListFaqItem,
} from "./routes";

export type FrenchVerbListItem = VerbListItem;

const TARGET_LANGUAGE: TargetLanguageSlug = "french";

export const FRENCH_VERB_LIST_ITEMS = BASE_VERB_LIST_ITEMS;

export function canLinkFrenchVerbListItem(id: string): boolean {
  return canLinkVerbListItem(TARGET_LANGUAGE, id);
}

export function getFrenchVerbDefinition(id: string, uiLang: UiLanguageCode): string {
  return getVerbDefinition(id, uiLang);
}

export function getFrenchVerbWordLemma(id: string): string {
  return getTargetVerbWordLemma(TARGET_LANGUAGE, id);
}

export function getFrenchVerbTranslation(id: string, uiLang: UiLanguageCode): string {
  return getVerbTranslation(id, uiLang);
}
