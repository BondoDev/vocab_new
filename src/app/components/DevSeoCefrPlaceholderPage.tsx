import { useMemo } from "react";
import sampleContent from "../../../guidelines/seo-cefr-content-sample.json";
import { VocabularyLevelPage } from "./VocabularyLevelPage";
import type { SeoMetadata } from "../../seo/SeoContext";
import type {
  TargetLanguageSlug,
  VocabularyLevelContent,
} from "../../data/vocabularyLevels";

function buildSeoMetadata(): SeoMetadata {
  return {
    title: sampleContent.seo.metaTitle,
    description: sampleContent.seo.metaDescription,
    canonical: sampleContent.seo.canonicalUrl,
    alternates: sampleContent.seo.alternates,
    jsonLd: JSON.stringify(sampleContent.seo.faqJsonLd),
  };
}

function buildLevelContent(): VocabularyLevelContent {
  return {
    title: `${sampleContent.route.targetLanguageDisplayName} ${sampleContent.route.level.toUpperCase()} Vocabulary Practice`,
    metaTitle: sampleContent.seo.metaTitle,
    metaDescription: sampleContent.seo.metaDescription,
    intro: sampleContent.content.introParagraphs[0] ?? "",
    introParagraphs: sampleContent.content.introParagraphs,
    levelDescription: sampleContent.route.level.toUpperCase(),
    ctaText: sampleContent.content.bottomCta.buttonLabel,
    levelExplanation: sampleContent.content.levelExplanation,
    vocabularyScope: {
      heading: sampleContent.content.vocabularyScope.heading,
      topics: [],
      wordTypes: [],
      groups: sampleContent.content.vocabularyScope.groups,
    },
    wordCount: {
      heading: sampleContent.content.wordCount.heading,
      text: sampleContent.content.wordCount.text,
      value: sampleContent.content.wordCount.value,
    },
    sampleVocabulary: sampleContent.content.sampleVocabulary,
    internalNavigation: {
      heading: sampleContent.content.internalNavigation.heading,
    },
    bottomCta: {
      heading: sampleContent.content.bottomCta.heading,
      text: sampleContent.content.bottomCta.text,
    },
  };
}

export function DevSeoCefrPlaceholderPage({
  onStartPractice,
}: {
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}) {
  const seoMetadata = useMemo(() => buildSeoMetadata(), []);
  const levelContent = useMemo(() => buildLevelContent(), []);

  return (
    <VocabularyLevelPage
      uiLang={sampleContent.route.uiLang}
      targetLanguage={sampleContent.route.targetLanguage}
      level={sampleContent.route.level}
      onStartPractice={onStartPractice}
      contentOverride={{
        file: {
          targetLanguage: sampleContent.route.targetLanguage,
          targetLanguageDisplayName: sampleContent.route.targetLanguageDisplayName,
        },
        levelContent,
      }}
      seoMetadataOverride={seoMetadata}
    />
  );
}
