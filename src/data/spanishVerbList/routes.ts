import spanishVerbListContentJson from "../seo/page-content/verb-lists/common_100_verblists_text.json";
import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "../seo/slugs";
import {
  buildVerbListContentLookup,
  type VerbListContent,
  type VerbListFaqItem,
  type VerbListContentEntry,
} from "../verbListRouteHelpers";

export type SpanishVerbListFaqItem = VerbListFaqItem;
export type SpanishVerbListContent = VerbListContent;

const SPANISH_VERB_LIST_PATHS: Record<UiLanguageCode, string> = {
  en: "/en/100-most-common-spanish-verbs",
  es: "/es/100-verbos-espanoles-mas-comunes",
  de: "/de/100-haeufigste-spanische-verben",
  fr: "/fr/100-verbes-espagnols-les-plus-courants",
  it: "/it/100-verbi-spagnoli-piu-comuni",
  pt: "/pt/100-verbos-espanhois-mais-comuns",
  ru: "/ru/100-samykh-chastykh-ispanskikh-glagolov",
};

const SPANISH_VERB_LIST_CONTENT = buildVerbListContentLookup(
  spanishVerbListContentJson as Record<string, VerbListContent> | VerbListContentEntry[],
  ["es", "spanish"],
);

export function getSpanishVerbListPath(uiLang: UiLanguageCode): string {
  return SPANISH_VERB_LIST_PATHS[uiLang];
}

export function resolveSpanishVerbListRoute(path: string): UiLanguageCode | null {
  const entry = Object.entries(SPANISH_VERB_LIST_PATHS).find(([, routePath]) => routePath === path);
  return (entry?.[0] as UiLanguageCode | undefined) ?? null;
}

export function getAllSpanishVerbListPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map((uiLang) => SPANISH_VERB_LIST_PATHS[uiLang]);
}

export function getSpanishVerbListContent(uiLang: UiLanguageCode): SpanishVerbListContent | null {
  return SPANISH_VERB_LIST_CONTENT[uiLang] ?? SPANISH_VERB_LIST_CONTENT.en ?? null;
}
