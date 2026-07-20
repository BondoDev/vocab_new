import { buildLocalizedVocabularyPath } from "../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import {
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../data/seo/shared/slugs";
import { buildWordPath } from "../data/seo/wordPages/wordSlugs";
import type { SeoMetadata } from "./SeoContext";
import { buildHreflangAlternates, sanitizeMetadataText } from "./shared/seoAlternates";
import { WORD_META_DESC, WORD_META_TITLE } from "./wordTemplates";

export interface WordSeoMetadataParams {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  targetLanguageDisplayName: string;
  wordLemma: string;
  conceptId: string;
  definition: string;
  wordType: string;
  cefrLevel: string;
  pathname: string;
  siteOrigin: string;
  browsePage?: number;
}

export function buildWordSeoMetadata(params: WordSeoMetadataParams): SeoMetadata {
  const {
    uiLang,
    targetLanguage,
    targetLanguageDisplayName,
    wordLemma,
    conceptId,
    definition,
    wordType,
    cefrLevel,
    pathname,
    siteOrigin,
    browsePage = 1,
  } = params;
  const origin = siteOrigin.replace(/\/$/, "");
  const baseTitle = (WORD_META_TITLE[uiLang] ?? WORD_META_TITLE.en)(
    targetLanguageDisplayName,
    wordLemma,
  );
  const titleSuffix = browsePage > 1 ? ` - Browse Page ${browsePage}` : "";
  const title = sanitizeMetadataText(`${baseTitle} (${cefrLevel} ${wordType})${titleSuffix}`);
  const baseDescription = (WORD_META_DESC[uiLang] ?? WORD_META_DESC.en)(
    targetLanguageDisplayName,
    wordLemma,
  );
  const trimmedDefinition = definition.trim().replace(/\s+/g, " ");
  const descriptionPrefix = trimmedDefinition
    ? `${trimmedDefinition} `
    : "";
  const paginatedDescriptionPrefix =
    browsePage > 1 ? `Browse page ${browsePage} of more ${cefrLevel} ${targetLanguageDisplayName} words. ` : "";
  const description = sanitizeMetadataText(
    `${paginatedDescriptionPrefix}${descriptionPrefix}${baseDescription}`.trim(),
  );
  const alternates = buildHreflangAlternates(
    (lang) => `${origin}${buildWordPath(lang, targetLanguage, wordLemma, conceptId)}`,
    `${origin}${buildWordPath("en", targetLanguage, wordLemma, conceptId)}`,
  );

  const canonical = `${origin}${pathname}`;

  // Vocabulary-level page for this word's CEFR level — used as breadcrumb parent
  const vocabLevel = cefrLevel.toLowerCase() as Level;
  const vocabLevelPath = buildLocalizedVocabularyPath(uiLang, targetLanguage, vocabLevel);
  const vocabLevelUrl = vocabLevelPath ? `${origin}${vocabLevelPath}` : null;
  const vocabLevelLabel = sanitizeMetadataText(
    `${targetLanguageDisplayName} ${cefrLevel} Vocabulary`,
  );

  const breadcrumbItems: object[] = [
    { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
  ];
  if (vocabLevelUrl) {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 2,
      name: vocabLevelLabel,
      item: vocabLevelUrl,
    });
  }
  breadcrumbItems.push({
    "@type": "ListItem",
    position: vocabLevelUrl ? 3 : 2,
    name: sanitizeMetadataText(wordLemma),
    item: canonical,
  });

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        inLanguage: uiLang,
        mainEntity: { "@id": `${canonical}#term` },
        breadcrumb: { "@id": `${canonical}#breadcrumb` },
      },
      {
        "@type": "DefinedTerm",
        "@id": `${canonical}#term`,
        name: sanitizeMetadataText(wordLemma),
        description,
        url: canonical,
        inDefinedTermSet: {
          "@type": "DefinedTermSet",
          name: sanitizeMetadataText(`${targetLanguageDisplayName} ${cefrLevel} Vocabulary`),
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: breadcrumbItems,
      },
    ],
  });

  return {
    title,
    description,
    canonical: `${origin}${pathname}`,
    alternates,
    jsonLd,
    ...(browsePage > 1 ? { robots: "noindex, follow" } : {}),
  };
}
