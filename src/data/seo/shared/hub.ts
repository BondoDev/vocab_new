import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "./slugs";

const SEO_HUB_PATHS: Record<UiLanguageCode, string> = {
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

export function resolveSeoHubRoute(path: string): UiLanguageCode | null {
  const entry = Object.entries(SEO_HUB_PATHS).find(([, routePath]) => routePath === path);
  return (entry?.[0] as UiLanguageCode | undefined) ?? null;
}

export function getAllSeoHubPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map((uiLang) => SEO_HUB_PATHS[uiLang]);
}
