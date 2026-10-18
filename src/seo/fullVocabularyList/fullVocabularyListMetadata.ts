import type { FullVocabularyListContentEntry } from "../../data/seo/fullVocabularyList";
import type { UiLanguageCode } from "../../data/seo/shared/slugs";
import type { SeoMetadata } from "../SeoContext";
import { buildHreflangAlternates, normalizeOrigin, sanitizeMetadataText } from "../shared/seoAlternates";
import {
  FULL_VOCABULARY_LIST_LAUNCHED,
  FULL_VOCABULARY_LIST_PRELAUNCH_ROBOTS,
} from "./fullVocabularyListLaunchStatus";

// hreflang alternates come only from getPath, which returns null for any UI
// language without an authored content record — so untranslated variants are
// never advertised. x-default points at the English-UI variant of the same
// target language when it exists, else at this page itself.
export function buildFullVocabularyListSeoMetadata({
  uiLang,
  siteOrigin,
  content,
  getPath,
}: {
  uiLang: UiLanguageCode;
  siteOrigin: string;
  content: FullVocabularyListContentEntry;
  getPath: (uiLang: UiLanguageCode) => string | null;
}): SeoMetadata {
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}/${uiLang}/${content.urlSlug}`;
  const title = sanitizeMetadataText(content.metadata.metaTitle);
  const description = sanitizeMetadataText(content.metadata.metaDescription);
  const englishPath = getPath("en");

  const graph: object[] = [
    {
      "@type": "WebPage",
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
        {
          "@type": "ListItem",
          position: 1,
          name: sanitizeMetadataText(content.metadata.breadcrumbHomeLabel),
          item: `${origin}/`,
        },
        { "@type": "ListItem", position: 2, name: sanitizeMetadataText(content.hero.heading), item: canonical },
      ],
    },
  ];

  return {
    title,
    description,
    canonical,
    robots: FULL_VOCABULARY_LIST_LAUNCHED ? undefined : FULL_VOCABULARY_LIST_PRELAUNCH_ROBOTS,
    alternates: buildHreflangAlternates(
      (lang) => {
        const path = getPath(lang);
        return path ? `${origin}${path}` : null;
      },
      englishPath ? `${origin}${englishPath}` : canonical,
    ),
    jsonLd: JSON.stringify({
      "@context": "https://schema.org",
      "@graph": graph,
    }),
  };
}
