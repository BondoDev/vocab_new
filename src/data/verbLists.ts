import type { TargetLanguageSlug, UiLanguageCode } from "./seo/slugs";
import { getFallbackVerbListCopy } from "./verbListFallbackCopy";
import { getEnglishVerbListContent, getEnglishVerbListPath, getAllEnglishVerbListPaths, resolveEnglishVerbListRoute } from "./englishVerbList";
import { getFrenchVerbListContent, getFrenchVerbListPath, getAllFrenchVerbListPaths, resolveFrenchVerbListRoute } from "./frenchVerbList";
import { getGermanVerbListContent, getGermanVerbListPath, getAllGermanVerbListPaths, resolveGermanVerbListRoute } from "./germanVerbList";
import { getItalianVerbListContent, getItalianVerbListPath, getAllItalianVerbListPaths, resolveItalianVerbListRoute } from "./italianVerbList";
import { getPortugueseVerbListContent, getPortugueseVerbListPath, getAllPortugueseVerbListPaths, resolvePortugueseVerbListRoute } from "./portugueseVerbList";
import { getRussianVerbListContent, getRussianVerbListPath, getAllRussianVerbListPaths, resolveRussianVerbListRoute } from "./russianVerbList";
import { getSpanishVerbListContent, getSpanishVerbListPath, getAllSpanishVerbListPaths, resolveSpanishVerbListRoute } from "./spanishVerbList";

const VERB_LIST_CONFIG = {
  english: {
    getPath: getEnglishVerbListPath,
    getAllPaths: getAllEnglishVerbListPaths,
    resolve: resolveEnglishVerbListRoute,
    getContent: getEnglishVerbListContent,
  },
  french: {
    getPath: getFrenchVerbListPath,
    getAllPaths: getAllFrenchVerbListPaths,
    resolve: resolveFrenchVerbListRoute,
    getContent: getFrenchVerbListContent,
  },
  german: {
    getPath: getGermanVerbListPath,
    getAllPaths: getAllGermanVerbListPaths,
    resolve: resolveGermanVerbListRoute,
    getContent: getGermanVerbListContent,
  },
  italian: {
    getPath: getItalianVerbListPath,
    getAllPaths: getAllItalianVerbListPaths,
    resolve: resolveItalianVerbListRoute,
    getContent: getItalianVerbListContent,
  },
  portuguese: {
    getPath: getPortugueseVerbListPath,
    getAllPaths: getAllPortugueseVerbListPaths,
    resolve: resolvePortugueseVerbListRoute,
    getContent: getPortugueseVerbListContent,
  },
  russian: {
    getPath: getRussianVerbListPath,
    getAllPaths: getAllRussianVerbListPaths,
    resolve: resolveRussianVerbListRoute,
    getContent: getRussianVerbListContent,
  },
  spanish: {
    getPath: getSpanishVerbListPath,
    getAllPaths: getAllSpanishVerbListPaths,
    resolve: resolveSpanishVerbListRoute,
    getContent: getSpanishVerbListContent,
  },
} as const satisfies Record<
  TargetLanguageSlug,
  {
    getPath: (uiLang: UiLanguageCode) => string;
    getAllPaths: () => string[];
    resolve: (path: string) => UiLanguageCode | null;
    getContent: (uiLang: UiLanguageCode) => { title: string } | null;
  }
>;

export function getVerbListPath(targetLanguage: TargetLanguageSlug, uiLang: UiLanguageCode): string {
  return VERB_LIST_CONFIG[targetLanguage].getPath(uiLang);
}

export function getAllVerbListPaths(): string[] {
  return Object.values(VERB_LIST_CONFIG).flatMap((config) => config.getAllPaths());
}

export function resolveVerbListRoute(
  path: string,
): { uiLang: UiLanguageCode; targetLanguage: TargetLanguageSlug } | null {
  for (const [targetLanguage, config] of Object.entries(VERB_LIST_CONFIG) as Array<
    [TargetLanguageSlug, (typeof VERB_LIST_CONFIG)[TargetLanguageSlug]]
  >) {
    const uiLang = config.resolve(path);
    if (uiLang) {
      return { uiLang, targetLanguage };
    }
  }

  return null;
}

export function getVerbListTitle(
  targetLanguage: TargetLanguageSlug,
  uiLang: UiLanguageCode,
): string {
  return (
    VERB_LIST_CONFIG[targetLanguage].getContent(uiLang)?.title ??
    getFallbackVerbListCopy(uiLang, targetLanguage).pageTitle
  );
}
