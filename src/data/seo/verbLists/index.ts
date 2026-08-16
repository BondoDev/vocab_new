import {
  BASE_VERB_LIST_ITEMS,
  canLinkVerbListItem as canLinkCommonVerbListItem,
  getTargetVerbWordLemma,
  getVerbDefinition,
  getVerbListItems as getCommonVerbListItems,
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
  resolvePastVerbFormsRoute,
} from "./pastForms100Verbs/pastForms100VerbRegistry";
export {
  getAllConjugatedVerbFormsPaths,
  getConjugatedVerbFormsContent,
  getConjugatedVerbFormsPath,
  resolveConjugatedVerbFormsRoute,
} from "./conjugated100Verbs/conjugated100VerbRegistry";
// Imported from the table-config module directly, NOT from
// pastForms100VerbRegistry.ts — see that file's header comment. This module
// (verbLists/index.ts) is itself client/SSR-only and is never compiled by
// the Node-based sitemap generator, so importing the glob-backed table
// config here is safe.
export {
  getPastVerbFormsTableConfig,
  type PastVerbFormsTableConfig,
} from "./pastForms100Verbs/pastForms100VerbTableConfig";
export {
  getConjugatedVerbFormsTableConfig,
  type ConjugatedVerbFormsTableConfig,
} from "./conjugated100Verbs/conjugated100VerbTableConfig";

export const VERB_LIST_ITEMS = BASE_VERB_LIST_ITEMS;
export type SharedVerbListItem = VerbListItem;

export function getVerbListItems(targetLanguage: TargetLanguageSlug): VerbListItem[] {
  return getCommonVerbListItems(targetLanguage);
}

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
