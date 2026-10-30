import {
  isNounListComplete,
  type NounList,
  type NounListContentEntry,
} from "../../../../data/seo/listPages/nounLists";
import type { UiLanguageCode } from "../../../../data/seo/shared/slugs";
import type { SeoMetadata } from "../../../SeoContext";
import {
  buildHreflangAlternates,
  normalizeOrigin,
  sanitizeMetadataText,
} from "../../../shared/seoAlternates";
import {
  NOUN_LIST_PRELAUNCH_ROBOTS,
  LAUNCHED_NOUN_LISTS,
} from "./common100NounsLaunchStatus";

export function isNounListIndexable(list: NounList): boolean {
  return LAUNCHED_NOUN_LISTS.has(list.id) && isNounListComplete(list);
}

// Self-referencing canonical. hreflang alternates come only from getPath,
// which returns null for UI languages without an authored content record, so
// untranslated variants are never advertised. x-default points at the
// English-UI page of the same list when it exists, else at this page.
export function buildNounListSeoMetadata({
  uiLang,
  siteOrigin,
  content,
  list,
  getPath,
}: {
  uiLang: UiLanguageCode;
  siteOrigin: string;
  content: NounListContentEntry;
  list: NounList;
  getPath: (uiLang: UiLanguageCode) => string | null;
}): SeoMetadata {
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}/${uiLang}/${content.urlSlug}`;
  const title = sanitizeMetadataText(content.metadata.metaTitle);
  const description = sanitizeMetadataText(content.metadata.metaDescription);
  const englishPath = getPath("en");

  // Plain WebPage + BreadcrumbList, matching the other list-page families;
  // no ItemList/rich-result markup.
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
        {
          "@type": "ListItem",
          position: 2,
          name: sanitizeMetadataText(content.hero.heading),
          item: canonical,
        },
      ],
    },
  ];

  return {
    title,
    description,
    canonical,
    robots: isNounListIndexable(list) ? undefined : NOUN_LIST_PRELAUNCH_ROBOTS,
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
