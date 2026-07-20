import type { TargetLanguageSlug, UiLanguageCode } from "../../data/seo/shared/slugs";
import { buildWordPath } from "../../data/seo/wordPages/wordSlugs";
import { sanitizeMetadataText } from "../shared/seoAlternates";
import type { FaqItem } from "./seoTemplates";

/**
 * Shared @graph assembly (WebPage + BreadcrumbList + FAQPage + optional ItemList) for
 * vocabulary-level pages. Used by both `buildVocabularySeoMetadata` and
 * `DevSeoCefrPlaceholderPage`, which currently serves the populated CEFR levels and
 * builds its own SeoMetadata via `seoMetadataOverride` rather than calling
 * `buildVocabularySeoMetadata` directly.
 */
export function buildVocabularyJsonLdGraph({
  uiLang,
  targetLanguage,
  canonical,
  origin,
  title,
  description,
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
  breadcrumbLabel: string;
  faqItems: ReadonlyArray<FaqItem>;
  browsePreviewWords?: ReadonlyArray<{ concept_id: string; word_lemma: string }>;
}): string {
  const sanitizedBreadcrumbLabel = sanitizeMetadataText(breadcrumbLabel);

  const faqNode = {
    "@type": "FAQPage",
    "@id": `${canonical}#faq`,
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  const breadcrumbNode = {
    "@type": "BreadcrumbList",
    "@id": `${canonical}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: sanitizedBreadcrumbLabel, item: canonical },
    ],
  };

  const hasItemList = browsePreviewWords && browsePreviewWords.length > 0;

  const webPageNode = {
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    inLanguage: uiLang,
    mainEntity: { "@id": hasItemList ? `${canonical}#word-list` : `${canonical}#faq` },
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

  graph.push(faqNode, breadcrumbNode);

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}
