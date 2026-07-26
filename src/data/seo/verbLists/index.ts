import {
  BASE_VERB_LIST_ITEMS,
  canLinkVerbListItem as canLinkCommonVerbListItem,
  getTargetVerbWordLemma,
  getVerbDefinition,
  getVerbTranslation,
  type VerbListItem,
} from "./common100Verbs/common100VerbList";
import { type TargetLanguageSlug, type UiLanguageCode } from "../shared/slugs";
import {
  getAllVerbListPaths,
  getVerbListConfig,
  getVerbListContent,
  getVerbListPath,
  getVerbListSpeechLang,
  getVerbListTitle,
  resolveVerbListRoute,
} from "./common100Verbs/common100VerbRegistry";

export {
  getAllVerbListPaths,
  getVerbListConfig,
  getVerbListContent,
  getVerbListPath,
  getVerbListSpeechLang,
  getVerbListTitle,
  resolveVerbListRoute,
} from "./common100Verbs/common100VerbRegistry";

// "Past Forms of the 100 Most Common {Target Language} Verbs" — a sibling
// verb-list subtype (see docs/architecture.md). Re-exported from this same
// umbrella barrel so routing/SSR/sitemap consumers keep importing from one
// place rather than reaching into a specific subtype folder.
export {
  getAllPastVerbFormsPaths,
  getPastVerbFormsContent,
  getPastVerbFormsPath,
  getPastVerbFormsTableConfig,
  resolvePastVerbFormsRoute,
} from "./pastForms100Verbs/pastForms100VerbRegistry";

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
