import {
  SUPPORTED_UI_LANGUAGES,
  buildLocalizedVocabularyPath,
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../data/seo/slugs";
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
