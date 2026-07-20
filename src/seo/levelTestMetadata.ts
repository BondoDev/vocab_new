import type { TargetLanguageSlug, UiLanguageCode } from "../data/seo/shared/slugs";
import { getLevelTestContent, getLevelTestSeoPath } from "../data/seo/levelTests";
import type { SeoMetadata } from "./SeoContext";
import { buildHreflangAlternates, normalizeOrigin, sanitizeMetadataText } from "./shared/seoAlternates";

export function buildLevelTestSeoMetadata({
  uiLang,
  targetLanguage,
  pathname,
  siteOrigin,
}: {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  pathname: string;
  siteOrigin: string;
}): SeoMetadata | null {
  const content = getLevelTestContent(uiLang, targetLanguage);
  if (!content) {
    return null;
  }

  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;

  return {
    title: sanitizeMetadataText(content.metaTitle),
    description: sanitizeMetadataText(content.metaDescription),
    canonical,
    alternates: buildHreflangAlternates((lang) => {
      const localizedPath = getLevelTestSeoPath(lang, targetLanguage);
      const localizedContent = getLevelTestContent(lang, targetLanguage);
      return localizedPath && localizedContent ? `${origin}${localizedPath}` : null;
    }, `${origin}${getLevelTestSeoPath("en", targetLanguage) ?? pathname}`),
  };
}
