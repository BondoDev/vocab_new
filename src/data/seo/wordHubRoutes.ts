import type { Level, UiLanguageCode } from "./slugs";
import { SUPPORTED_LEVELS, SUPPORTED_UI_LANGUAGES } from "./slugs";
import { getSeoHubPath } from "./hub";

export const WORD_HUB_TARGET_LANGUAGE = "english" as const;
export const WORD_HUB_PAGE_SIZE = 250;

const WORD_HUB_SEGMENT_BY_UI_LANG: Record<UiLanguageCode, string> = {
  en: "english-word-pages",
  es: "paginas-palabras-ingles",
  fr: "pages-mots-anglais",
  de: "englische-wortseiten",
  it: "pagine-parole-inglesi",
  pt: "paginas-palavras-ingles",
  ru: "stranicy-angliiskikh-slov",
};

export interface WordSeoHubSummaryRoute {
  kind: "summary";
  uiLang: UiLanguageCode;
}

export interface WordSeoHubLevelRoute {
  kind: "level";
  uiLang: UiLanguageCode;
  level: Level;
  page: number;
}

export type WordSeoHubRoute = WordSeoHubSummaryRoute | WordSeoHubLevelRoute;

export function getWordSeoHubSummaryPath(uiLang: UiLanguageCode): string {
  return `${getSeoHubPath(uiLang)}/${WORD_HUB_SEGMENT_BY_UI_LANG[uiLang]}`;
}

export function getWordSeoHubLevelPath(
  uiLang: UiLanguageCode,
  level: Level,
  page = 1,
): string {
  const base = `${getWordSeoHubSummaryPath(uiLang)}/${level}`;
  return page <= 1 ? base : `${base}/page/${page}`;
}

export function resolveWordSeoHubRoute(path: string): WordSeoHubRoute | null {
  const normalized = path.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";

  for (const uiLang of SUPPORTED_UI_LANGUAGES) {
    const summaryPath = getWordSeoHubSummaryPath(uiLang);
    if (normalized === summaryPath) {
      return {
        kind: "summary",
        uiLang,
      };
    }

    for (const level of SUPPORTED_LEVELS) {
      const levelPath = getWordSeoHubLevelPath(uiLang, level);
      if (normalized === levelPath) {
        return {
          kind: "level",
          uiLang,
          level,
          page: 1,
        };
      }

      const pagedMatch = normalized.match(
        new RegExp(`^${levelPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/page/(\\d+)$`),
      );
      if (!pagedMatch) {
        continue;
      }

      const page = Number.parseInt(pagedMatch[1], 10);
      if (!Number.isFinite(page) || page < 2) {
        return null;
      }

      return {
        kind: "level",
        uiLang,
        level,
        page,
      };
    }
  }

  return null;
}
