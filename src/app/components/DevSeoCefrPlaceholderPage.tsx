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

const PREVIEW_HERO_SUFFIX_LANGUAGE_NAMES: Record<
  UiLanguageCode,
  Record<TargetLanguageSlug, string>
> = {
  en: {
    english: "English",
    german: "German",
    spanish: "Spanish",
    french: "French",
    italian: "Italian",
    portuguese: "Portuguese",
    russian: "Russian",
  },
  es: {
    english: "inglés",
    german: "alemán",
    spanish: "español",
    french: "francés",
    italian: "italiano",
    portuguese: "portugués",
    russian: "ruso",
  },
  de: {
    english: "Englisch",
    german: "Deutsch",
    spanish: "Spanisch",
    french: "Französisch",
    italian: "Italienisch",
    portuguese: "Portugiesisch",
    russian: "Russisch",
  },
  fr: {
    english: "anglais",
    german: "allemand",
    spanish: "espagnol",
    french: "français",
    italian: "italien",
    portuguese: "portugais",
    russian: "russe",
  },
  it: {
    english: "inglese",
    german: "tedesco",
    spanish: "spagnolo",
    french: "francese",
    italian: "italiano",
    portuguese: "portoghese",
    russian: "russo",
  },
  pt: {
    english: "inglês",
    german: "alemão",
    spanish: "espanhol",
    french: "francês",
    italian: "italiano",
    portuguese: "português",
    russian: "russo",
  },
  ru: {
    english: "английскому",
    german: "немецкому",
    spanish: "испанскому",
    french: "французскому",
    italian: "итальянскому",
    portuguese: "португальскому",
    russian: "русскому",
  },
};

const PREVIEW_BROWSE_LANGUAGE_NAMES: Record<
  UiLanguageCode,
  Record<TargetLanguageSlug, string>
> = {
  en: {
    english: "English",
    german: "German",
    spanish: "Spanish",
    french: "French",
    italian: "Italian",
    portuguese: "Portuguese",
    russian: "Russian",
  },
  es: {
    english: "inglés",
    german: "alemán",
    spanish: "español",
    french: "francés",
    italian: "italiano",
    portuguese: "portugués",
    russian: "ruso",
  },
  de: {
    english: "Englisch",
    german: "Deutsch",
    spanish: "Spanisch",
    french: "Französisch",
    italian: "Italienisch",
    portuguese: "Portugiesisch",
    russian: "Russisch",
  },
  fr: {
    english: "anglais",
    german: "allemand",
    spanish: "espagnol",
    french: "français",
    italian: "italien",
    portuguese: "portugais",
    russian: "russe",
  },
  it: {
    english: "inglese",
    german: "tedesco",
    spanish: "spagnolo",
    french: "francese",
    italian: "italiano",
    portuguese: "portoghese",
    russian: "russo",
  },
  pt: {
    english: "inglês",
    german: "alemão",
    spanish: "espanhol",
    french: "francês",
    italian: "italiano",
    portuguese: "português",
    russian: "russo",
  },
  ru: {
    english: "английского",
    german: "немецкого",
    spanish: "испанского",
    french: "французского",
    italian: "итальянского",
    portuguese: "португальского",
    russian: "русского",
  },
};

const PREVIEW_FAQ_LANGUAGE_NAMES: Record<
  UiLanguageCode,
  Record<TargetLanguageSlug, string>
> = {
  en: {
    english: "English",
    german: "German",
    spanish: "Spanish",
    french: "French",
    italian: "Italian",
    portuguese: "Portuguese",
    russian: "Russian",
  },
  es: {
    english: "inglés",
    german: "alemán",
    spanish: "español",
    french: "francés",
    italian: "italiano",
    portuguese: "portugués",
    russian: "ruso",
  },
  de: {
    english: "englischen",
    german: "deutschen",
    spanish: "spanischen",
    french: "französischen",
    italian: "italienischen",
    portuguese: "portugiesischen",
    russian: "russischen",
  },
  fr: {
    english: "anglais",
    german: "allemand",
    spanish: "espagnol",
    french: "français",
    italian: "italien",
    portuguese: "portugais",
    russian: "russe",
  },
  it: {
    english: "inglese",
    german: "tedesco",
    spanish: "spagnolo",
    french: "francese",
    italian: "italiano",
    portuguese: "portoghese",
    russian: "russo",
  },
  pt: {
    english: "inglês",
    german: "alemão",
    spanish: "espanhol",
    french: "francês",
    italian: "italiano",
    portuguese: "português",
    russian: "russo",
  },
  ru: {
    english: "английского",
    german: "немецкого",
    spanish: "испанского",
    french: "французского",
    italian: "итальянского",
    portuguese: "португальского",
    russian: "русского",
  },
};

const PREVIEW_HERO_SUFFIX_TEMPLATES: Record<
  UiLanguageCode,
  (args: { words: number; language: string }) => string
> = {
  en: ({ words, language }) => `Mastering ${words} ${language} words`,
  es: ({ words, language }) => `domina ${words} palabras de ${language}`,
  de: ({ words, language }) => `${words} ${language} Wörter meistern`,
  fr: ({ words, language }) => `maîtrisez ${words} mots de ${language}`,
  it: ({ words, language }) => `padroneggia ${words} parole di ${language}`,
  pt: ({ words, language }) => `domine ${words} palavras de ${language}`,
  ru: ({ words, language }) => `освойте ${words} слов по ${language}`,
};

function normalizeTargetLanguage(targetLanguage: PreviewTargetLanguage): TargetLanguageSlug {
  return TARGET_LANGUAGE_CODE_TO_SLUG[targetLanguage as UiLanguageCode] ?? targetLanguage;
}

function buildPreviewHeroTitle(item: SeoCefrContentItem): string {
  const normalizedTargetLanguage = normalizeTargetLanguage(item.targetLanguage);
  const words = item.content.wordCount.value;
  const suffixLanguage =
    PREVIEW_HERO_SUFFIX_LANGUAGE_NAMES[item.uiLanguage]?.[normalizedTargetLanguage] ??
    item.targetLanguageDisplayName;
  const suffixTemplate =
    PREVIEW_HERO_SUFFIX_TEMPLATES[item.uiLanguage] ?? PREVIEW_HERO_SUFFIX_TEMPLATES.en;
  const suffix = suffixTemplate({ words, language: suffixLanguage });

  return item.content.title.includes(String(words))
    ? item.content.title
    : `${item.content.title} - ${suffix}`;
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
  const normalizedTargetLanguage = normalizeTargetLanguage(item.targetLanguage);
  const faqLanguageName =
    PREVIEW_FAQ_LANGUAGE_NAMES[item.uiLanguage]?.[normalizedTargetLanguage] ??
    item.targetLanguageDisplayName;
  const faqSection = buildVocabularyFaqSection(
    item.uiLanguage,
    faqLanguageName,
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
  const heroTitleOverride = useMemo(() => buildPreviewHeroTitle(item), [item]);
  const browseLanguageNameOverride = useMemo(
    () =>
      PREVIEW_BROWSE_LANGUAGE_NAMES[item.uiLanguage]?.[normalizedTargetLanguage] ??
      item.targetLanguageDisplayName,
    [item.targetLanguageDisplayName, item.uiLanguage, normalizedTargetLanguage],
  );
  const faqLanguageNameOverride = useMemo(
    () =>
      PREVIEW_FAQ_LANGUAGE_NAMES[item.uiLanguage]?.[normalizedTargetLanguage] ??
      item.targetLanguageDisplayName,
    [item.targetLanguageDisplayName, item.uiLanguage, normalizedTargetLanguage],
  );

  return (
    <VocabularyLevelPage
      uiLang={item.uiLanguage}
      targetLanguage={normalizedTargetLanguage}
      level={item.level}
      onStartPractice={onStartPractice}
      heroTitleOverride={heroTitleOverride}
      browseLanguageNameOverride={browseLanguageNameOverride}
      faqLanguageNameOverride={faqLanguageNameOverride}
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
