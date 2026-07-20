import type { UiLanguageCode } from "../../shared/slugs";

export interface VerbListFaqItem {
  question: string;
  answer: string;
}

export interface VerbListContent {
  title: string;
  metaTitle: string;
  metaDescription: string;
  heroSubtitle: string;
  introParagraphs: string[];
  stats: {
    verbs: string;
    language: string;
    level: string;
    practice: string;
  };
  sections: {
    statsHeading: string;
    verbListHeading: string;
    learningTipsHeading: string;
    relatedLinksHeading: string;
    faqHeading: string;
  };
  buttons: {
    startPractice: string;
    takeLevelTest: string;
  };
  filters: {
    searchPlaceholder: string;
    cefrLabel: string;
    allLevels: string;
  };
  table: {
    number: string;
    verb: string;
    definition: string;
    wordPage: string;
    noResults: string;
  };
  learningTips: string[];
  relatedLinks: {
    levelTest: string;
    englishA1: string;
    englishA2: string;
    englishB1: string;
    seoHub: string;
  };
  faq: VerbListFaqItem[];
}

export interface VerbListContentEntry extends VerbListContent {
  targetLanguage: string;
  uiLanguage: UiLanguageCode;
}

export function buildVerbListContentLookup(
  rawContent: Record<string, VerbListContent> | VerbListContentEntry[],
  targetAliases: readonly string[],
): Partial<Record<UiLanguageCode, VerbListContent>> {
  if (Array.isArray(rawContent)) {
    const normalizedAliases = new Set(targetAliases.map((value) => value.toLowerCase()));
    return rawContent.reduce(
      (acc, entry) => {
        if (!normalizedAliases.has(entry.targetLanguage.toLowerCase())) {
          return acc;
        }

        acc[entry.uiLanguage] = entry;
        return acc;
      },
      {} as Partial<Record<UiLanguageCode, VerbListContent>>,
    );
  }

  return rawContent as Partial<Record<UiLanguageCode, VerbListContent>>;
}
