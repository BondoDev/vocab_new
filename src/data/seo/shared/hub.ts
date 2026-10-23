import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "./slugs";

// Public "Learning Resources" directory — one page per UI language at the
// same, unlocalized slug. Internal identifiers keep their historical
// "SeoHub" names; only the public path and copy changed.
const SEO_HUB_PATHS: Record<UiLanguageCode, string> = {
  en: "/en/learning-resources",
  es: "/es/learning-resources",
  fr: "/fr/learning-resources",
  de: "/de/learning-resources",
  it: "/it/learning-resources",
  pt: "/pt/learning-resources",
  ru: "/ru/learning-resources",
};

// Retired directory paths. The directory root at each of these now 301s to
// SEO_HUB_PATHS via public/_redirects, but the word-index hub pages beneath
// them (getWordSeoHubSummaryPath and friends) intentionally keep living
// under these legacy prefixes: moving ~2,200 thin index pages would mint an
// equal number of new URLs plus redirects, which is a separate consolidation
// decision. Do not route new pages under these prefixes.
const LEGACY_SEO_HUB_PATHS: Record<UiLanguageCode, string> = {
  en: "/en/seo-pages",
  es: "/es/paginas-seo",
  fr: "/fr/pages-seo",
  de: "/de/seo-seiten",
  it: "/it/pagine-seo",
  pt: "/pt/paginas-seo",
  ru: "/ru/seo-stranicy",
};

export function getSeoHubPath(uiLang: UiLanguageCode): string {
  return SEO_HUB_PATHS[uiLang];
}

export function getLegacySeoHubPath(uiLang: UiLanguageCode): string {
  return LEGACY_SEO_HUB_PATHS[uiLang];
}

export function resolveSeoHubRoute(path: string): UiLanguageCode | null {
  const entry = Object.entries(SEO_HUB_PATHS).find(([, routePath]) => routePath === path);
  return (entry?.[0] as UiLanguageCode | undefined) ?? null;
}

export function getAllSeoHubPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map((uiLang) => SEO_HUB_PATHS[uiLang]);
}

export function getAllLegacySeoHubPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map((uiLang) => LEGACY_SEO_HUB_PATHS[uiLang]);
}
