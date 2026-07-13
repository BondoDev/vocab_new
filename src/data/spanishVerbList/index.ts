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
  getAllSpanishVerbListPaths,
  getSpanishVerbListContent,
  getSpanishVerbListPath,
  resolveSpanishVerbListRoute,
  type SpanishVerbListContent,
  type SpanishVerbListFaqItem,
} from "./routes";

export type SpanishVerbListItem = VerbListItem;

const TARGET_LANGUAGE: TargetLanguageSlug = "spanish";

export const SPANISH_VERB_LIST_ITEMS = BASE_VERB_LIST_ITEMS;

export function canLinkSpanishVerbListItem(id: string): boolean {
  return canLinkVerbListItem(TARGET_LANGUAGE, id);
}

export function getSpanishVerbDefinition(id: string, uiLang: UiLanguageCode): string {
  return getVerbDefinition(id, uiLang);
}

export function getSpanishVerbWordLemma(id: string): string {
  return getTargetVerbWordLemma(TARGET_LANGUAGE, id);
}

export function getSpanishVerbTranslation(id: string, uiLang: UiLanguageCode): string {
  return getVerbTranslation(id, uiLang);
}
