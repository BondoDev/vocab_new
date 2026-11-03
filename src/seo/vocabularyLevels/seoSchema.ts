import type { TargetLanguageSlug, UiLanguageCode } from "../../data/seo/shared/slugs";
import { buildWordPath } from "../../data/seo/wordPages/wordSlugs";
import { sanitizeMetadataText } from "../shared/seoAlternates";
import type { FaqItem } from "./seoTemplates";

/**
 * @graph assembly (WebPage + BreadcrumbList, plus FAQPage only when the page
 * shows editorial FAQ items, plus an optional ItemList) for vocabulary-level
 * pages. Called directly by `DevSeoCefrPlaceholderPage`, which builds
 * `SeoMetadata` from `seo-cefr-content.json` and passes it to
 * `VocabularyLevelPage` via `seoMetadataOverride` — the sole active
 * vocabulary-level metadata path.
 *
 * `faqItems` must be exactly the items the page renders (getVocabularyFaqItems
 * in seoFaq.ts): an empty list emits no FAQPage node at all.
 */
export function buildVocabularyJsonLdGraph({
  uiLang,
  targetLanguage,
  canonical,
  origin,
  title,
  description,
  breadcrumbHomeLabel,
  breadcrumbLabel,
  faqItems,
  browsePreviewWords,
}: {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  canonical: string;
  origin: string;
  title: string;
  description: string;
  breadcrumbHomeLabel: string;
  breadcrumbLabel: string;
  faqItems: ReadonlyArray<FaqItem>;
  browsePreviewWords?: ReadonlyArray<{ concept_id: string; word_lemma: string }>;
}): string {
  const sanitizedBreadcrumbLabel = sanitizeMetadataText(breadcrumbLabel);
  const hasFaq = faqItems.length > 0;

  const faqNode = hasFaq
    ? {
        "@type": "FAQPage",
        "@id": `${canonical}#faq`,
        mainEntity: faqItems.map((item) => ({
          "@type": "Question",
          name: item.question,
          acceptedAnswer: { "@type": "Answer", text: item.answer },
        })),
      }
    : null;

  const breadcrumbNode = {
    "@type": "BreadcrumbList",
    "@id": `${canonical}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: sanitizeMetadataText(breadcrumbHomeLabel), item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: sanitizedBreadcrumbLabel, item: canonical },
    ],
  };

  const hasItemList = browsePreviewWords && browsePreviewWords.length > 0;
  const mainEntityId = hasItemList ? `${canonical}#word-list` : hasFaq ? `${canonical}#faq` : null;

  const webPageNode = {
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    inLanguage: uiLang,
    ...(mainEntityId ? { mainEntity: { "@id": mainEntityId } } : {}),
    breadcrumb: { "@id": `${canonical}#breadcrumb` },
  };

  const graph: object[] = [webPageNode];

  if (hasItemList) {
    graph.push({
      "@type": "ItemList",
      "@id": `${canonical}#word-list`,
      name: sanitizedBreadcrumbLabel,
      numberOfItems: browsePreviewWords!.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: browsePreviewWords!.map((word, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: sanitizeMetadataText(word.word_lemma),
        url: `${origin}${buildWordPath(uiLang, targetLanguage, word.word_lemma, word.concept_id)}`,
      })),
    });
  }

  if (faqNode) {
    graph.push(faqNode);
  }
  graph.push(breadcrumbNode);

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}
