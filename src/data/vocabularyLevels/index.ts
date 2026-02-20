import {
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
  SUPPORTED_TARGET_LANGUAGES,
  SUPPORTED_LEVELS,
} from "../seo/slugs";

export {
  SUPPORTED_LEVELS,
  type Level as CefrLevelCode,
  type TargetLanguageSlug,
  type UiLanguageCode,
};

export interface VocabularyLevelContent {
  title: string;
  metaTitle?: string;
  metaDescription?: string;
  intro: string;
  introParagraphs?: string[];
  levelDescription: string;
  ctaText: string;
  levelExplanation: {
    heading: string;
    paragraph: string;
    bullets: string[];
  };
  vocabularyScope: {
    heading: string;
    topics: string[];
    wordTypes: string[];
    groups?: Array<{
      heading: string;
      items: string[];
    }>;
  };
  wordCount: {
    heading: string;
    text: string;
    value: number;
  };
  sampleVocabulary: {
    heading: string;
    columns: {
      word: string;
      meaning: string;
    };
    rows: Array<{ word: string; meaning: string }>;
  };
  internalNavigation: {
    heading: string;
  };
  bottomCta?: {
    heading?: string;
    text?: string;
  };
}

interface VocabularyFile {
  targetLanguage: TargetLanguageSlug;
  targetLanguageDisplayName: string;
  levels: Partial<Record<Level, VocabularyLevelContent>>;
}

const vocabularyFileModules = import.meta.glob("./*/**/*.json", {
  eager: true,
}) as Record<string, { default: VocabularyFile }>;

export function isSupportedLevel(value: string): value is Level {
  return (SUPPORTED_LEVELS as readonly string[]).includes(value);
}

export function isSupportedTargetLanguage(
  value: string,
): value is TargetLanguageSlug {
  return (SUPPORTED_TARGET_LANGUAGES as readonly string[]).includes(value);
}

export function getVocabularyLevelContent(
  uiLanguage: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: Level,
): { file: VocabularyFile; levelContent: VocabularyLevelContent } | null {
  const key = `./${uiLanguage}/${targetLanguage}.json`;
  const loadedFile = vocabularyFileModules[key]?.default;

  if (!loadedFile) {
    return null;
  }

  const levelContent = loadedFile.levels[level];
  if (!levelContent) {
    return null;
  }

  return {
    file: loadedFile,
    levelContent,
  };
}
