import { useMemo } from "react";
import { VocabularyLevelPage } from "./VocabularyLevelPage";
import type { SeoMetadata } from "../../seo/SeoContext";
import type {
  TargetLanguageSlug,
  UiLanguageCode,
} from "../../data/vocabularyLevels";
import { buildLocalizedVocabularyPath } from "../../data/seo/slugs";
import { buildVocabularyFaqSection } from "../../seo/metadata";
import {
  DEV_CEFR_PREVIEW_PATH,
  findSeoCefrPreviewItem,
  getSeoCefrPreviewItems,
  normalizeTargetLanguage,
  type SeoCefrContentItem,
} from "./devSeoCefrPreviewData";
import { getLevelBrowsePreviewData } from "../../data/seo/levelBrowseWords";

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

function buildItemPath(item: SeoCefrContentItem, pathPrefix: string): string {
  return (
    `${pathPrefix}${buildLocalizedVocabularyPath(
      item.uiLanguage,
      normalizeTargetLanguage(item.targetLanguage),
      item.level,
    ) ?? "/en/english-b1-vocabulary-practice"}`
  );
}

function buildSeoMetadata(item: SeoCefrContentItem, pathPrefix: string): SeoMetadata {
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
  const canonicalPath = buildItemPath(item, pathPrefix);
  const alternateItems = getSeoCefrPreviewItems().filter(
    (candidate) =>
      normalizeTargetLanguage(candidate.targetLanguage) === normalizedTargetLanguage &&
      candidate.level === item.level,
  );
  const xDefaultItem =
    alternateItems.find((candidate) => candidate.uiLanguage === "en") ?? item;

  return {
    title: item.content.metaTitle ?? item.content.title,
    description: item.content.metaDescription ?? "",
    canonical: `https://www.fluentstellar.com${canonicalPath}`,
    alternates: [
      ...alternateItems.map((candidate) => ({
        hreflang: candidate.uiLanguage,
        href: `https://www.fluentstellar.com${buildItemPath(candidate, pathPrefix)}`,
      })),
      {
        hreflang: "x-default",
        href: `https://www.fluentstellar.com${buildItemPath(xDefaultItem, pathPrefix)}`,
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
  routeParams,
  onStartPractice,
  pathPrefix = "/test",
}: {
  item?: SeoCefrContentItem | null;
  routeParams?: {
    uiLanguage: UiLanguageCode;
    targetLanguage: TargetLanguageSlug;
    level: CefrLevelCode;
  } | null;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
  pathPrefix?: string;
}) {
  const resolvedItem = useMemo(() => {
    if (item) {
      return item;
    }
    if (!routeParams) {
      return null;
    }
    return findSeoCefrPreviewItem(routeParams);
  }, [item, routeParams]);

  if (!resolvedItem) {
    return <div className="p-6 text-sm text-muted-foreground">Invalid preview page. Try {DEV_CEFR_PREVIEW_PATH}</div>;
  }

  const seoMetadata = useMemo(
    () => buildSeoMetadata(resolvedItem, pathPrefix),
    [resolvedItem, pathPrefix],
  );
  const normalizedTargetLanguage = useMemo(
    () => normalizeTargetLanguage(resolvedItem.targetLanguage),
    [resolvedItem.targetLanguage],
  );
  const browseLanguageNameOverride = useMemo(
    () =>
      PREVIEW_BROWSE_LANGUAGE_NAMES[resolvedItem.uiLanguage]?.[normalizedTargetLanguage] ??
      resolvedItem.targetLanguageDisplayName,
    [resolvedItem.targetLanguageDisplayName, resolvedItem.uiLanguage, normalizedTargetLanguage],
  );
  const faqLanguageNameOverride = useMemo(
    () =>
      PREVIEW_FAQ_LANGUAGE_NAMES[resolvedItem.uiLanguage]?.[normalizedTargetLanguage] ??
      resolvedItem.targetLanguageDisplayName,
    [resolvedItem.targetLanguageDisplayName, resolvedItem.uiLanguage, normalizedTargetLanguage],
  );
  const heroTitle = useMemo(() => buildPreviewHeroTitle(resolvedItem), [resolvedItem]);
  const initialBrowsePreview = useMemo(
    () => getLevelBrowsePreviewData(normalizedTargetLanguage, resolvedItem.level),
    [normalizedTargetLanguage, resolvedItem.level],
  );

  return (
    <VocabularyLevelPage
      uiLang={resolvedItem.uiLanguage}
      targetLanguage={normalizedTargetLanguage}
      level={resolvedItem.level}
      onStartPractice={onStartPractice}
      heroTitleOverride={heroTitle}
      browseLanguageNameOverride={browseLanguageNameOverride}
      faqLanguageNameOverride={faqLanguageNameOverride}
      initialBrowsePreview={initialBrowsePreview}
      contentOverride={{
        file: {
          targetLanguage: normalizedTargetLanguage,
          targetLanguageDisplayName: resolvedItem.targetLanguageDisplayName,
        },
        levelContent: resolvedItem.content,
      }}
      seoMetadataOverride={seoMetadata}
    />
  );
}
