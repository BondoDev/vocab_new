import type { Level, TargetLanguageSlug, UiLanguageCode } from "../shared/slugs";
import { SUPPORTED_LEVELS, SUPPORTED_TARGET_LANGUAGES, SUPPORTED_UI_LANGUAGES, TARGET_NAME_SLUGS } from "../shared/slugs";
import { getSeoHubPath } from "../shared/hub";

export const WORD_HUB_PAGE_SIZE = 250;

// Existing, already-shipped English-target hub segments. Preserved verbatim so
// current URLs don't change when the hub is generalized to other target languages.
const ENGLISH_WORD_HUB_SEGMENT_BY_UI_LANG: Record<UiLanguageCode, string> = {
  en: "english-word-pages",
  es: "paginas-palabras-ingles",
  fr: "pages-mots-anglais",
  de: "englische-wortseiten",
  it: "pagine-parole-inglesi",
  pt: "paginas-palavras-ingles",
  ru: "stranicy-angliiskikh-slov",
};

// Simple, non-inflected segment builders for the other target languages.
const WORD_HUB_SEGMENT_BUILDER_BY_UI_LANG: Record<UiLanguageCode, (targetSlug: string) => string> = {
  en: (targetSlug) => `${targetSlug}-word-pages`,
  es: (targetSlug) => `paginas-palabras-${targetSlug}`,
  fr: (targetSlug) => `pages-mots-${targetSlug}`,
  de: (targetSlug) => `${targetSlug}e-wortseiten`,
  it: (targetSlug) => `pagine-parole-${targetSlug}`,
  pt: (targetSlug) => `paginas-palavras-${targetSlug}`,
  ru: (targetSlug) => `stranicy-slov-${targetSlug}`,
};

function getWordHubSegment(uiLang: UiLanguageCode, targetLanguage: TargetLanguageSlug): string {
  if (targetLanguage === "english") {
    return ENGLISH_WORD_HUB_SEGMENT_BY_UI_LANG[uiLang];
  }
  return WORD_HUB_SEGMENT_BUILDER_BY_UI_LANG[uiLang](TARGET_NAME_SLUGS[uiLang][targetLanguage]);
}

export interface WordSeoHubSummaryRoute {
  kind: "summary";
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
}

export interface WordSeoHubLevelRoute {
  kind: "level";
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: Level;
  page: number;
}

export type WordSeoHubRoute = WordSeoHubSummaryRoute | WordSeoHubLevelRoute;

export function getWordSeoHubSummaryPath(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): string {
  return `${getSeoHubPath(uiLang)}/${getWordHubSegment(uiLang, targetLanguage)}`;
}

export function getWordSeoHubLevelPath(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: Level,
  page = 1,
): string {
  const base = `${getWordSeoHubSummaryPath(uiLang, targetLanguage)}/${level}`;
  return page <= 1 ? base : `${base}/page/${page}`;
}

export function resolveWordSeoHubRoute(path: string): WordSeoHubRoute | null {
  const normalized = path.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";

  for (const uiLang of SUPPORTED_UI_LANGUAGES) {
    for (const targetLanguage of SUPPORTED_TARGET_LANGUAGES) {
      const summaryPath = getWordSeoHubSummaryPath(uiLang, targetLanguage);
      if (normalized === summaryPath) {
        return {
          kind: "summary",
          uiLang,
          targetLanguage,
        };
      }

      for (const level of SUPPORTED_LEVELS) {
        const levelPath = getWordSeoHubLevelPath(uiLang, targetLanguage, level);
        if (normalized === levelPath) {
          return {
            kind: "level",
            uiLang,
            targetLanguage,
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
          targetLanguage,
          level,
          page,
        };
      }
    }
  }

  return null;
}
