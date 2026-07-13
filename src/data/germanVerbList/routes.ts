import germanVerbListContentJson from "../seo/page-content/verb-lists/common_100_verblists_text.json";
import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "../seo/slugs";

export interface GermanVerbListFaqItem {
  question: string;
  answer: string;
}

export interface GermanVerbListContent {
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
  faq: GermanVerbListFaqItem[];
}

interface GermanVerbListContentEntry extends GermanVerbListContent {
  targetLanguage: string;
  uiLanguage: UiLanguageCode;
}

const GERMAN_VERB_LIST_PATHS: Record<UiLanguageCode, string> = {
  en: "/en/100-most-common-german-verbs",
  es: "/es/100-verbos-alemanes-mas-comunes",
  de: "/de/100-haeufigste-deutsche-verben",
  fr: "/fr/100-verbes-allemands-les-plus-courants",
  it: "/it/100-verbi-tedeschi-piu-comuni",
  pt: "/pt/100-verbos-alemaes-mais-comuns",
  ru: "/ru/100-samykh-chastykh-nemetskikh-glagolov",
};

function isGermanTargetLanguage(value: string): boolean {
  return value === "de" || value === "german";
}

const GERMAN_VERB_LIST_CONTENT = (() => {
  const rawContent = germanVerbListContentJson as
    | Record<string, GermanVerbListContent>
    | GermanVerbListContentEntry[];

  if (Array.isArray(rawContent)) {
    return rawContent.reduce(
      (acc, entry) => {
        if (!isGermanTargetLanguage(entry.targetLanguage)) {
          return acc;
        }

        acc[entry.uiLanguage] = entry;
        return acc;
      },
      {} as Partial<Record<UiLanguageCode, GermanVerbListContent>>,
    );
  }

  return rawContent as Partial<Record<UiLanguageCode, GermanVerbListContent>>;
})();

export function getGermanVerbListPath(uiLang: UiLanguageCode): string {
  return GERMAN_VERB_LIST_PATHS[uiLang];
}

export function resolveGermanVerbListRoute(path: string): UiLanguageCode | null {
  const entry = Object.entries(GERMAN_VERB_LIST_PATHS).find(([, routePath]) => routePath === path);
  return (entry?.[0] as UiLanguageCode | undefined) ?? null;
}

export function getAllGermanVerbListPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map((uiLang) => GERMAN_VERB_LIST_PATHS[uiLang]);
}

export function getGermanVerbListContent(uiLang: UiLanguageCode): GermanVerbListContent {
  return GERMAN_VERB_LIST_CONTENT[uiLang] ?? GERMAN_VERB_LIST_CONTENT.en!;
}
