import portugueseVerbListContentJson from "../seo/page-content/verb-lists/common_100_verblists_text.json";
import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "../seo/slugs";
import {
  buildVerbListContentLookup,
  type VerbListContent,
  type VerbListFaqItem,
  type VerbListContentEntry,
} from "../verbListRouteHelpers";

export type PortugueseVerbListFaqItem = VerbListFaqItem;
export type PortugueseVerbListContent = VerbListContent;

const PORTUGUESE_VERB_LIST_PATHS: Record<UiLanguageCode, string> = {
  en: "/en/100-most-common-portuguese-verbs",
  es: "/es/100-verbos-portugueses-mas-comunes",
  de: "/de/100-haeufigste-portugiesische-verben",
  fr: "/fr/100-verbes-portugais-les-plus-courants",
  it: "/it/100-verbi-portoghesi-piu-comuni",
  pt: "/pt/100-verbos-portugueses-mais-comuns",
  ru: "/ru/100-samykh-chastykh-portugalskikh-glagolov",
};

const PORTUGUESE_VERB_LIST_CONTENT = buildVerbListContentLookup(
  portugueseVerbListContentJson as Record<string, VerbListContent> | VerbListContentEntry[],
  ["pt", "portuguese"],
);

export function getPortugueseVerbListPath(uiLang: UiLanguageCode): string {
  return PORTUGUESE_VERB_LIST_PATHS[uiLang];
}

export function resolvePortugueseVerbListRoute(path: string): UiLanguageCode | null {
  const entry = Object.entries(PORTUGUESE_VERB_LIST_PATHS).find(([, routePath]) => routePath === path);
  return (entry?.[0] as UiLanguageCode | undefined) ?? null;
}

export function getAllPortugueseVerbListPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map((uiLang) => PORTUGUESE_VERB_LIST_PATHS[uiLang]);
}

export function getPortugueseVerbListContent(uiLang: UiLanguageCode): PortugueseVerbListContent | null {
  return PORTUGUESE_VERB_LIST_CONTENT[uiLang] ?? PORTUGUESE_VERB_LIST_CONTENT.en ?? null;
}
