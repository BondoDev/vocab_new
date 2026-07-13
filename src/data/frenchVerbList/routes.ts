import frenchVerbListContentJson from "../seo/page-content/verb-lists/common_100_verblists_text.json";
import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "../seo/slugs";
import {
  buildVerbListContentLookup,
  type VerbListContent,
  type VerbListFaqItem,
  type VerbListContentEntry,
} from "../verbListRouteHelpers";

export type FrenchVerbListFaqItem = VerbListFaqItem;
export type FrenchVerbListContent = VerbListContent;

const FRENCH_VERB_LIST_PATHS: Record<UiLanguageCode, string> = {
  en: "/en/100-most-common-french-verbs",
  es: "/es/100-verbos-franceses-mas-comunes",
  de: "/de/100-haeufigste-franzoesische-verben",
  fr: "/fr/100-verbes-francais-les-plus-courants",
  it: "/it/100-verbi-francesi-piu-comuni",
  pt: "/pt/100-verbos-franceses-mais-comuns",
  ru: "/ru/100-samykh-chastykh-frantsuzskikh-glagolov",
};

const FRENCH_VERB_LIST_CONTENT = buildVerbListContentLookup(
  frenchVerbListContentJson as Record<string, VerbListContent> | VerbListContentEntry[],
  ["fr", "french"],
);

export function getFrenchVerbListPath(uiLang: UiLanguageCode): string {
  return FRENCH_VERB_LIST_PATHS[uiLang];
}

export function resolveFrenchVerbListRoute(path: string): UiLanguageCode | null {
  const entry = Object.entries(FRENCH_VERB_LIST_PATHS).find(([, routePath]) => routePath === path);
  return (entry?.[0] as UiLanguageCode | undefined) ?? null;
}

export function getAllFrenchVerbListPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map((uiLang) => FRENCH_VERB_LIST_PATHS[uiLang]);
}

export function getFrenchVerbListContent(uiLang: UiLanguageCode): FrenchVerbListContent | null {
  return FRENCH_VERB_LIST_CONTENT[uiLang] ?? FRENCH_VERB_LIST_CONTENT.en ?? null;
}
