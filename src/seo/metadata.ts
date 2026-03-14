import {
  SUPPORTED_UI_LANGUAGES,
  buildLocalizedVocabularyPath,
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../data/seo/slugs";
import { getAllSeoHubPaths, getSeoHubPath } from "../data/seo/hub";
import { getLevelTestContent, getLevelTestSeoPath } from "../data/levelTests";
import { getVocabularyLevelContent } from "../data/vocabularyLevels";
import type { SeoMetadata } from "./SeoContext";

const LEVEL_DISPLAY: Record<Level, string> = {
  a1: "A1",
  a2: "A2",
  b1: "B1",
  b2: "B2",
  c1: "C1",
  c2: "C2",
};

const WORDS_UNIT_BY_UI_LANG: Record<UiLanguageCode, string> = {
  en: "words",
  es: "palabras",
  de: "Wörter",
  fr: "mots",
  it: "parole",
  pt: "palavras",
  ru: "слов",
};

const SEO_HUB_METADATA: Record<
  UiLanguageCode,
  {
    title: string;
    description: string;
  }
> = {
  en: {
    title: "SEO Pages - Vocabulary Practice and Level Tests",
    description: "Browse all vocabulary practice pages and available language level tests in one place.",
  },
  es: {
    title: "Páginas SEO - Práctica de vocabulario y tests de nivel",
    description: "Consulta todas las páginas de práctica de vocabulario y los tests de nivel disponibles en un solo lugar.",
  },
  fr: {
    title: "Pages SEO - Pratique du vocabulaire et tests de niveau",
    description: "Consultez toutes les pages de pratique du vocabulaire et les tests de niveau disponibles au même endroit.",
  },
  de: {
    title: "SEO-Seiten - Wortschatz und Niveau-Tests",
    description: "Finden Sie alle Wortschatzseiten und verfügbaren Niveau-Tests an einem Ort.",
  },
  it: {
    title: "Pagine SEO - Pratica del vocabolario e test di livello",
    description: "Consulta tutte le pagine di pratica del vocabolario e i test di livello disponibili in un unico posto.",
  },
  pt: {
    title: "Páginas SEO - Prática de vocabulário e testes de nível",
    description: "Consulte todas as páginas de prática de vocabulário e os testes de nível disponíveis em um só lugar.",
  },
  ru: {
    title: "SEO-страницы - Практика словарного запаса и тесты уровня",
    description: "Здесь собраны все страницы для практики словарного запаса и доступные тесты уровня.",
  },
};

function normalizeOrigin(siteOrigin: string): string {
  return siteOrigin.endsWith("/") ? siteOrigin.slice(0, -1) : siteOrigin;
}

export function buildVocabularySeoMetadata({
  uiLang,
  targetLanguage,
  level,
  pathname,
  siteOrigin,
}: {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: Level;
  pathname: string;
  siteOrigin: string;
}): SeoMetadata | null {
  const contentBundle = getVocabularyLevelContent(uiLang, targetLanguage, level);
  if (!contentBundle) {
    return null;
  }

  const { file, levelContent } = contentBundle;
  const levelDisplay = LEVEL_DISPLAY[level];
  const wordsUnit = WORDS_UNIT_BY_UI_LANG[uiLang] ?? WORDS_UNIT_BY_UI_LANG.en;
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;

  return {
    title:
      levelContent.metaTitle ??
      `${file.targetLanguageDisplayName} ${levelDisplay} Vocabulary Practice - CEFR ${levelContent.levelDescription}`,
    description:
      levelContent.metaDescription ??
      `${levelContent.intro} ${levelContent.wordCount.text} ${levelContent.wordCount.value}+ ${wordsUnit}.`,
    canonical,
    alternates: [
      ...SUPPORTED_UI_LANGUAGES.flatMap((lang) => {
        const localizedPath = buildLocalizedVocabularyPath(lang, targetLanguage, level);

        if (!localizedPath) {
          return [];
        }

        return [
          {
            hreflang: lang,
            href: `${origin}${localizedPath}`,
          },
        ];
      }),
      {
        hreflang: "x-default",
        href: `${origin}${buildLocalizedVocabularyPath("en", targetLanguage, level) ?? "/"}`,
      },
    ],
  };
}

export function buildLevelTestSeoMetadata({
  uiLang,
  targetLanguage,
  pathname,
  siteOrigin,
}: {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  pathname: string;
  siteOrigin: string;
}): SeoMetadata | null {
  const content = getLevelTestContent(uiLang, targetLanguage);
  if (!content) {
    return null;
  }

  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;

  return {
    title: content.metaTitle,
    description: content.metaDescription,
    canonical,
    alternates: [
      ...SUPPORTED_UI_LANGUAGES.flatMap((lang) => {
        const localizedPath = getLevelTestSeoPath(lang, targetLanguage);
        const localizedContent = getLevelTestContent(lang, targetLanguage);

        if (!localizedPath || !localizedContent) {
          return [];
        }

        return [
          {
            hreflang: lang,
            href: `${origin}${localizedPath}`,
          },
        ];
      }),
      {
        hreflang: "x-default",
        href: `${origin}${getLevelTestSeoPath("en", targetLanguage) ?? pathname}`,
      },
    ],
  };
}

export function buildSeoHubMetadata({
  uiLang,
  pathname,
  siteOrigin,
}: {
  uiLang: UiLanguageCode;
  pathname: string;
  siteOrigin: string;
}): SeoMetadata {
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;
  const copy = SEO_HUB_METADATA[uiLang] ?? SEO_HUB_METADATA.en;

  return {
    title: copy.title,
    description: copy.description,
    canonical,
    alternates: [
      ...SUPPORTED_UI_LANGUAGES.map((lang) => ({
        hreflang: lang,
        href: `${origin}${getSeoHubPath(lang)}`,
      })),
      {
        hreflang: "x-default",
        href: `${origin}${getAllSeoHubPaths()[0]}`,
      },
    ],
  };
}
