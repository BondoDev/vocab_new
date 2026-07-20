import type { TargetLanguageSlug, UiLanguageCode } from "../../data/seo/shared/slugs";
import { getAllSeoHubPaths, getSeoHubPath } from "../../data/seo/shared/hub";
import {
  getWordSeoHubLevelPath,
  getWordSeoHubSummaryPath,
  type WordSeoHubRoute,
} from "../../data/seo/wordPages/wordHubRoutes";
import type { SeoMetadata } from "../SeoContext";
import { buildHreflangAlternates, normalizeOrigin, sanitizeMetadataText } from "../shared/seoAlternates";
import { GENERIC_WORD_SEO_HUB_METADATA, SEO_HUB_METADATA, WORD_SEO_HUB_METADATA } from "./hubTemplates";

export function buildSeoHubMetadata({
  uiLang,
  pathname,
  siteOrigin,
}: {
  uiLang: UiLanguageCode;
  pathname: string;
  siteOrigin: string;
}): SeoMetadata {
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;
  const copy = SEO_HUB_METADATA[uiLang] ?? SEO_HUB_METADATA.en;

  return {
    title: sanitizeMetadataText(copy.title),
    description: sanitizeMetadataText(copy.description),
    canonical,
    alternates: buildHreflangAlternates(
      (lang) => `${origin}${getSeoHubPath(lang)}`,
      `${origin}${getAllSeoHubPaths()[0]}`,
    ),
  };
}

// ─── Word SEO page metadata ───────────────────────────────────────────────────

export function buildWordSeoHubMetadata({
  uiLang,
  route,
  languageName,
  pathname,
  siteOrigin,
}: {
  uiLang: UiLanguageCode;
  route: WordSeoHubRoute;
  languageName: string;
  pathname: string;
  siteOrigin: string;
}): SeoMetadata {
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;
  const isEnglishTarget = route.targetLanguage === "english";
  const englishCopy = WORD_SEO_HUB_METADATA[uiLang] ?? WORD_SEO_HUB_METADATA.en;
  const genericCopy = GENERIC_WORD_SEO_HUB_METADATA[uiLang] ?? GENERIC_WORD_SEO_HUB_METADATA.en;

  if (route.kind === "summary") {
    return {
      title: sanitizeMetadataText(
        isEnglishTarget ? englishCopy.summaryTitle : genericCopy.summaryTitle(languageName),
      ),
      description: sanitizeMetadataText(
        isEnglishTarget ? englishCopy.summaryDescription : genericCopy.summaryDescription(languageName),
      ),
      canonical,
      alternates: buildHreflangAlternates(
        (lang) => `${origin}${getWordSeoHubSummaryPath(lang, route.targetLanguage)}`,
        `${origin}${getWordSeoHubSummaryPath("en", route.targetLanguage)}`,
      ),
    };
  }

  const levelLabel = route.level.toUpperCase();
  return {
    title: sanitizeMetadataText(
      isEnglishTarget
        ? englishCopy.levelTitle(levelLabel, route.page)
        : genericCopy.levelTitle(languageName, levelLabel, route.page),
    ),
    description: sanitizeMetadataText(
      isEnglishTarget
        ? englishCopy.levelDescription(levelLabel, route.page)
        : genericCopy.levelDescription(languageName, levelLabel, route.page),
    ),
    canonical,
    alternates: buildHreflangAlternates(
      (lang) => `${origin}${getWordSeoHubLevelPath(lang, route.targetLanguage, route.level, route.page)}`,
      `${origin}${getWordSeoHubLevelPath("en", route.targetLanguage, route.level, route.page)}`,
    ),
  };
}
