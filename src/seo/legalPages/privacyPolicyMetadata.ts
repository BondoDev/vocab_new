import type { UiLanguageCode } from "../../data/seo/shared/slugs";
import type { LegalDocument } from "../../data/seo/legalPages/legalDocument";
import { getPrivacyPolicyPath } from "../../data/seo/legalPages/privacyPolicy/privacyPolicyRoutes";
import type { SeoMetadata } from "../SeoContext";
import { buildHreflangAlternates, normalizeOrigin, sanitizeMetadataText } from "../shared/seoAlternates";

// A document whose file is still status "placeholder" must never be offered
// for indexing: it is served "noindex, follow" (and kept out of the sitemap
// by scripts/generation/generate-sitemap.mjs, which reads the same field).
export const LEGAL_PLACEHOLDER_ROBOTS = "noindex, follow";

// Privacy Policy metadata. Canonical is always the route's own
// /{ui}/privacy path (one URL per language, no duplicates); hreflang lists
// every language's page with x-default on the English one.
export function buildPrivacyPolicyMetadata({
  uiLang,
  document,
  siteOrigin,
}: {
  uiLang: UiLanguageCode;
  document: LegalDocument;
  siteOrigin: string;
}): SeoMetadata {
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${getPrivacyPolicyPath(uiLang)}`;
  const title = sanitizeMetadataText(`${document.title} | FluentStellar`);
  const description = sanitizeMetadataText(document.description);

  return {
    title,
    description,
    canonical,
    ...(document.status === "published" ? {} : { robots: LEGAL_PLACEHOLDER_ROBOTS }),
    alternates: buildHreflangAlternates(
      (lang) => `${origin}${getPrivacyPolicyPath(lang)}`,
      `${origin}${getPrivacyPolicyPath("en")}`,
    ),
    jsonLd: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebPage",
      "@id": `${canonical}#webpage`,
      url: canonical,
      name: sanitizeMetadataText(document.title),
      description,
      inLanguage: uiLang,
      dateModified: document.lastUpdated,
    }),
  };
}
