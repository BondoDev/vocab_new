import italianVerbListContentJson from "../seo/page-content/verb-lists/common_100_verblists_text.json";
import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "../seo/slugs";
import {
  buildVerbListContentLookup,
  type VerbListContent,
  type VerbListFaqItem,
  type VerbListContentEntry,
} from "../verbListRouteHelpers";

export type ItalianVerbListFaqItem = VerbListFaqItem;
export type ItalianVerbListContent = VerbListContent;

const ITALIAN_VERB_LIST_PATHS: Record<UiLanguageCode, string> = {
  en: "/en/100-most-common-italian-verbs",
  es: "/es/100-verbos-italianos-mas-comunes",
  de: "/de/100-haeufigste-italienische-verben",
  fr: "/fr/100-verbes-italiens-les-plus-courants",
  it: "/it/100-verbi-italiani-piu-comuni",
  pt: "/pt/100-verbos-italianos-mais-comuns",
  ru: "/ru/100-samykh-chastykh-italianskikh-glagolov",
};

const ITALIAN_VERB_LIST_CONTENT = buildVerbListContentLookup(
  italianVerbListContentJson as Record<string, VerbListContent> | VerbListContentEntry[],
  ["it", "italian"],
);

export function getItalianVerbListPath(uiLang: UiLanguageCode): string {
  return ITALIAN_VERB_LIST_PATHS[uiLang];
}

export function resolveItalianVerbListRoute(path: string): UiLanguageCode | null {
  const entry = Object.entries(ITALIAN_VERB_LIST_PATHS).find(([, routePath]) => routePath === path);
  return (entry?.[0] as UiLanguageCode | undefined) ?? null;
}

export function getAllItalianVerbListPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map((uiLang) => ITALIAN_VERB_LIST_PATHS[uiLang]);
}

export function getItalianVerbListContent(uiLang: UiLanguageCode): ItalianVerbListContent | null {
  return ITALIAN_VERB_LIST_CONTENT[uiLang] ?? ITALIAN_VERB_LIST_CONTENT.en ?? null;
}
