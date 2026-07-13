import russianVerbListContentJson from "../seo/page-content/verb-lists/common_100_verblists_text.json";
import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "../seo/slugs";
import {
  buildVerbListContentLookup,
  type VerbListContent,
  type VerbListFaqItem,
  type VerbListContentEntry,
} from "../verbListRouteHelpers";

export type RussianVerbListFaqItem = VerbListFaqItem;
export type RussianVerbListContent = VerbListContent;

const RUSSIAN_VERB_LIST_PATHS: Record<UiLanguageCode, string> = {
  en: "/en/100-most-common-russian-verbs",
  es: "/es/100-verbos-rusos-mas-comunes",
  de: "/de/100-haeufigste-russische-verben",
  fr: "/fr/100-verbes-russes-les-plus-courants",
  it: "/it/100-verbi-russi-piu-comuni",
  pt: "/pt/100-verbos-russos-mais-comuns",
  ru: "/ru/100-samykh-chastykh-russkikh-glagolov",
};

const RUSSIAN_VERB_LIST_CONTENT = buildVerbListContentLookup(
  russianVerbListContentJson as Record<string, VerbListContent> | VerbListContentEntry[],
  ["ru", "russian"],
);

export function getRussianVerbListPath(uiLang: UiLanguageCode): string {
  return RUSSIAN_VERB_LIST_PATHS[uiLang];
}

export function resolveRussianVerbListRoute(path: string): UiLanguageCode | null {
  const entry = Object.entries(RUSSIAN_VERB_LIST_PATHS).find(([, routePath]) => routePath === path);
  return (entry?.[0] as UiLanguageCode | undefined) ?? null;
}

export function getAllRussianVerbListPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map((uiLang) => RUSSIAN_VERB_LIST_PATHS[uiLang]);
}

export function getRussianVerbListContent(uiLang: UiLanguageCode): RussianVerbListContent | null {
  return RUSSIAN_VERB_LIST_CONTENT[uiLang] ?? RUSSIAN_VERB_LIST_CONTENT.en ?? null;
}
