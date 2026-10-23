import type { UiLanguageCode } from "../../data/seo/shared/slugs";
import { getAllSeoHubPaths, getSeoHubPath } from "../../data/seo/shared/hub";
import {
  getWordSeoHubLevelPath,
  getWordSeoHubSummaryPath,
  type WordSeoHubRoute,
} from "../../data/seo/wordPages/wordHubRoutes";
import type { SeoMetadata } from "../SeoContext";
import { buildHreflangAlternates, normalizeOrigin, sanitizeMetadataText } from "../shared/seoAlternates";
import { GENERIC_WORD_SEO_HUB_METADATA, SEO_HUB_METADATA } from "./hubTemplates";

// Learning Resources directory. Canonical is always the route's own path;
// x-default is the English-UI directory (getAllSeoHubPaths()[0]).
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
  const title = sanitizeMetadataText(copy.title);
  const description = sanitizeMetadataText(copy.description);

  return {
    title,
    description,
    canonical,
    alternates: buildHreflangAlternates(
      (lang) => `${origin}${getSeoHubPath(lang)}`,
      `${origin}${getAllSeoHubPaths()[0]}`,
    ),
    jsonLd: JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "CollectionPage",
          "@id": `${canonical}#webpage`,
          url: canonical,
          name: title,
          description,
          inLanguage: uiLang,
          breadcrumb: { "@id": `${canonical}#breadcrumb` },
        },
        {
          "@type": "BreadcrumbList",
          "@id": `${canonical}#breadcrumb`,
          itemListElement: [
            { "@type": "ListItem", position: 1, name: sanitizeMetadataText(copy.homeLabel), item: `${origin}/` },
            { "@type": "ListItem", position: 2, name: sanitizeMetadataText(copy.pageName), item: canonical },
          ],
        },
      ],
    }),
  };
}

// ─── Word index (alphabetical word list) metadata ─────────────────────────────

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
  const copy = GENERIC_WORD_SEO_HUB_METADATA[uiLang] ?? GENERIC_WORD_SEO_HUB_METADATA.en;

  if (route.kind === "summary") {
    return {
      title: sanitizeMetadataText(copy.summaryTitle(languageName)),
      description: sanitizeMetadataText(copy.summaryDescription(languageName)),
      canonical,
      alternates: buildHreflangAlternates(
        (lang) => `${origin}${getWordSeoHubSummaryPath(lang, route.targetLanguage)}`,
        `${origin}${getWordSeoHubSummaryPath("en", route.targetLanguage)}`,
      ),
    };
  }

  const levelLabel = route.level.toUpperCase();
  return {
    title: sanitizeMetadataText(copy.levelTitle(languageName, levelLabel, route.page)),
    description: sanitizeMetadataText(copy.levelDescription(languageName, levelLabel, route.page)),
    canonical,
    alternates: buildHreflangAlternates(
      (lang) => `${origin}${getWordSeoHubLevelPath(lang, route.targetLanguage, route.level, route.page)}`,
      `${origin}${getWordSeoHubLevelPath("en", route.targetLanguage, route.level, route.page)}`,
    ),
  };
}
