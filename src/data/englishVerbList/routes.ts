import englishVerbListContentJson from "../seo/page-content/verb-lists/common_100_verblists_text.json";
import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "../seo/slugs";

export interface EnglishVerbListFaqItem {
  question: string;
  answer: string;
}

export interface EnglishVerbListContent {
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
  faq: EnglishVerbListFaqItem[];
}

interface EnglishVerbListContentEntry extends EnglishVerbListContent {
  targetLanguage: string;
  uiLanguage: UiLanguageCode;
}

const ENGLISH_VERB_LIST_PATHS: Record<UiLanguageCode, string> = {
  en: "/en/100-most-common-english-verbs",
  es: "/es/100-verbos-ingles-mas-comunes",
  de: "/de/100-haeufigste-englische-verben",
  fr: "/fr/100-verbes-anglais-les-plus-courants",
  it: "/it/100-verbi-inglesi-piu-comuni",
  pt: "/pt/100-verbos-ingleses-mais-comuns",
  ru: "/ru/100-samykh-chastykh-angliiskikh-glagolov",
};

const ENGLISH_VERB_LIST_CONTENT = (() => {
  const rawContent = englishVerbListContentJson as
    | Record<string, EnglishVerbListContent>
    | EnglishVerbListContentEntry[];

  if (Array.isArray(rawContent)) {
    return rawContent.reduce(
      (acc, entry) => {
        if (entry.targetLanguage !== "en") {
          return acc;
        }

        acc[entry.uiLanguage] = entry;
        return acc;
      },
      {} as Partial<Record<UiLanguageCode, EnglishVerbListContent>>,
    );
  }

  return rawContent as Partial<Record<UiLanguageCode, EnglishVerbListContent>>;
})();

export function getEnglishVerbListPath(uiLang: UiLanguageCode): string {
  return ENGLISH_VERB_LIST_PATHS[uiLang];
}

export function resolveEnglishVerbListRoute(path: string): UiLanguageCode | null {
  const entry = Object.entries(ENGLISH_VERB_LIST_PATHS).find(([, routePath]) => routePath === path);
  return (entry?.[0] as UiLanguageCode | undefined) ?? null;
}

export function getAllEnglishVerbListPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map((uiLang) => ENGLISH_VERB_LIST_PATHS[uiLang]);
}

export function getEnglishVerbListContent(uiLang: UiLanguageCode): EnglishVerbListContent {
  return ENGLISH_VERB_LIST_CONTENT[uiLang] ?? ENGLISH_VERB_LIST_CONTENT.en!;
}
