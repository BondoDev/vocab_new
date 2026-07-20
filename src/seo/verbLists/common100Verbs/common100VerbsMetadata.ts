import type { TargetLanguageSlug, UiLanguageCode } from "../../../data/seo/shared/slugs";
import { buildWordPath } from "../../../data/seo/wordPages/wordSlugs";
import { getFallbackVerbListCopy } from "../../../data/seo/verbLists/common100Verbs/common100VerbFallbackCopy";
import type { VerbListContent } from "../../../data/seo/verbLists/common100Verbs/common100VerbRouteHelpers";
import type { SeoMetadata } from "../../SeoContext";
import { buildHreflangAlternates, normalizeOrigin, sanitizeMetadataText } from "../../shared/seoAlternates";

export function buildVerbListSeoMetadata({
  uiLang,
  pathname,
  siteOrigin,
  targetLanguage,
  items,
  getAllPaths,
  getPath,
  getContent,
  canLinkItem,
  getWordLemma,
}: {
  uiLang: UiLanguageCode;
  pathname: string;
  siteOrigin: string;
  targetLanguage: TargetLanguageSlug;
  items: ReadonlyArray<{ id: string; verb: string }>;
  getAllPaths: () => string[];
  getPath: (uiLang: UiLanguageCode) => string;
  getContent: (uiLang: UiLanguageCode) => VerbListContent | null;
  canLinkItem: (id: string) => boolean;
  getWordLemma: (id: string) => string;
}): SeoMetadata {
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;
  const content = getContent(uiLang);
  const fallbackCopy = getFallbackVerbListCopy(uiLang, targetLanguage);
  const title = sanitizeMetadataText(content?.metaTitle ?? fallbackCopy.metaTitle);
  const description = sanitizeMetadataText(content?.metaDescription ?? fallbackCopy.metaDescription);
  const itemListName = sanitizeMetadataText(content?.title ?? fallbackCopy.pageTitle);
  const graph: object[] = [
    {
      "@type": "WebPage",
      "@id": `${canonical}#webpage`,
      url: canonical,
      name: title,
      description,
      inLanguage: uiLang,
      mainEntity: { "@id": `${canonical}#verb-list` },
      breadcrumb: { "@id": `${canonical}#breadcrumb` },
    },
    {
      "@type": "ItemList",
      "@id": `${canonical}#verb-list`,
      name: itemListName,
      numberOfItems: items.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: items.map((item, index) => {
        const wordLemma = getWordLemma(item.id) || item.verb;
        return {
          "@type": "ListItem",
          position: index + 1,
          name: sanitizeMetadataText(wordLemma),
          ...(canLinkItem(item.id)
            ? { url: `${origin}${buildWordPath(uiLang, targetLanguage, wordLemma, item.id)}` }
            : {}),
        };
      }),
    },
  ];

  if (content?.faq?.length) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${canonical}#faq`,
      mainEntity: content.faq.map((item) => ({
        "@type": "Question",
        name: sanitizeMetadataText(item.question),
        acceptedAnswer: {
          "@type": "Answer",
          text: sanitizeMetadataText(item.answer),
        },
      })),
    });
  }

  graph.push({
    "@type": "BreadcrumbList",
    "@id": `${canonical}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
      {
        "@type": "ListItem",
        position: 2,
        name: itemListName,
        item: canonical,
      },
    ],
  });

  return {
    title,
    description,
    canonical,
    alternates: buildHreflangAlternates(
      (lang) => `${origin}${getPath(lang)}`,
      `${origin}${getAllPaths()[0]}`,
    ),
    jsonLd: JSON.stringify({
      "@context": "https://schema.org",
      "@graph": graph,
    }),
  };
}
