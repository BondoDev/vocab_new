import { useMemo } from "react";
import sampleContent from "../../../guidelines/seo-cefr-content-sample.json";
import { VocabularyLevelPage } from "./VocabularyLevelPage";
import type { SeoMetadata } from "../../seo/SeoContext";
import type {
  CefrLevelCode,
  TargetLanguageSlug,
  VocabularyLevelContent,
  UiLanguageCode,
} from "../../data/vocabularyLevels";
import { buildLocalizedVocabularyPath } from "../../data/seo/slugs";
import { buildVocabularyFaqSection } from "../../seo/metadata";

type PreviewTargetLanguage = TargetLanguageSlug | UiLanguageCode;

export type SeoCefrContentItem = {
  uiLanguage: UiLanguageCode;
  targetLanguage: PreviewTargetLanguage;
  targetLanguageDisplayName: string;
  level: CefrLevelCode;
  content: VocabularyLevelContent;
};

const previewItems = sampleContent as SeoCefrContentItem[];
const defaultPreviewItem = previewItems[0];

const TARGET_LANGUAGE_CODE_TO_SLUG: Record<UiLanguageCode, TargetLanguageSlug> = {
  en: "english",
  es: "spanish",
  de: "german",
  fr: "french",
  it: "italian",
  pt: "portuguese",
  ru: "russian",
};

function normalizeTargetLanguage(targetLanguage: PreviewTargetLanguage): TargetLanguageSlug {
  return TARGET_LANGUAGE_CODE_TO_SLUG[targetLanguage as UiLanguageCode] ?? targetLanguage;
}

export const DEV_CEFR_PREVIEW_PATH =
  `/test${buildLocalizedVocabularyPath(
    defaultPreviewItem?.uiLanguage ?? "en",
    normalizeTargetLanguage(defaultPreviewItem?.targetLanguage ?? "english"),
    defaultPreviewItem?.level ?? "b1",
  ) ?? "/en/english-b1-vocabulary-practice"}`;

export function findSeoCefrPreviewItem(params: {
  uiLanguage: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: CefrLevelCode;
}): SeoCefrContentItem | null {
  return (
    previewItems.find(
      (item) =>
        item.uiLanguage === params.uiLanguage &&
        normalizeTargetLanguage(item.targetLanguage) === params.targetLanguage &&
        item.level === params.level,
    ) ?? null
  );
}

function buildPreviewPath(item: SeoCefrContentItem): string {
  return (
    `/test${buildLocalizedVocabularyPath(
      item.uiLanguage,
      normalizeTargetLanguage(item.targetLanguage),
      item.level,
    ) ?? "/en/english-b1-vocabulary-practice"}`
  );
}

function buildSeoMetadata(item: SeoCefrContentItem, previewPath: string): SeoMetadata {
  const wordsUnitByUiLang = {
    en: "words",
    es: "palabras",
    de: "Worter",
    fr: "mots",
    it: "parole",
    pt: "palavras",
    ru: "slov",
  } as const;
  const wordsUnit = wordsUnitByUiLang[item.uiLanguage] ?? wordsUnitByUiLang.en;
  const faqSection = buildVocabularyFaqSection(
    item.uiLanguage,
    item.targetLanguageDisplayName,
    item.level.toUpperCase(),
    item.content,
    wordsUnit,
  );

  return {
    title: item.content.metaTitle ?? item.content.title,
    description: item.content.metaDescription ?? "",
    canonical: `https://www.fluentstellar.com${previewPath}`,
    alternates: [
      {
        hreflang: item.uiLanguage,
        href: `https://www.fluentstellar.com${previewPath}`,
      },
      {
        hreflang: "x-default",
        href: `https://www.fluentstellar.com${previewPath}`,
      },
    ],
    jsonLd: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqSection.items.map((faqItem) => ({
        "@type": "Question",
        name: faqItem.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faqItem.answer,
        },
      })),
    }),
  };
}

export function DevSeoCefrPlaceholderPage({
  item,
  onStartPractice,
}: {
  item: SeoCefrContentItem;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}) {
  const previewPath = useMemo(() => buildPreviewPath(item), [item]);
  const seoMetadata = useMemo(() => buildSeoMetadata(item, previewPath), [item, previewPath]);
  const normalizedTargetLanguage = useMemo(
    () => normalizeTargetLanguage(item.targetLanguage),
    [item.targetLanguage],
  );

  return (
    <VocabularyLevelPage
      uiLang={item.uiLanguage}
      targetLanguage={normalizedTargetLanguage}
      level={item.level}
      onStartPractice={onStartPractice}
      contentOverride={{
        file: {
          targetLanguage: normalizedTargetLanguage,
          targetLanguageDisplayName: item.targetLanguageDisplayName,
        },
        levelContent: item.content,
      }}
      seoMetadataOverride={seoMetadata}
    />
  );
}
