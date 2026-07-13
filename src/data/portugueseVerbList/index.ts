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
  getAllPortugueseVerbListPaths,
  getPortugueseVerbListContent,
  getPortugueseVerbListPath,
  resolvePortugueseVerbListRoute,
  type PortugueseVerbListContent,
  type PortugueseVerbListFaqItem,
} from "./routes";

export type PortugueseVerbListItem = VerbListItem;

const TARGET_LANGUAGE: TargetLanguageSlug = "portuguese";

export const PORTUGUESE_VERB_LIST_ITEMS = BASE_VERB_LIST_ITEMS;

export function canLinkPortugueseVerbListItem(id: string): boolean {
  return canLinkVerbListItem(TARGET_LANGUAGE, id);
}

export function getPortugueseVerbDefinition(id: string, uiLang: UiLanguageCode): string {
  return getVerbDefinition(id, uiLang);
}

export function getPortugueseVerbWordLemma(id: string): string {
  return getTargetVerbWordLemma(TARGET_LANGUAGE, id);
}

export function getPortugueseVerbTranslation(id: string, uiLang: UiLanguageCode): string {
  return getVerbTranslation(id, uiLang);
}
