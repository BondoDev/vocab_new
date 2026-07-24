import {
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
  SUPPORTED_LEVELS,
} from "../shared/slugs";

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
