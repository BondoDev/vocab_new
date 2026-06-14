import levelTestContentJson from "../../../guidelines/seo_level_test_content.json";
import { buildLocalizedVocabularyPath, type TargetLanguageSlug, type UiLanguageCode } from "../seo/slugs";

export interface LevelTestContentSection {
  heading: string;
  paragraphs: string[];
}

export interface LevelTestContent {
  title: string;
  metaTitle: string;
  metaDescription: string;
  introParagraphs: string[];
  sections: LevelTestContentSection[];
  practiceLinksHeading: string;
  startButtonLabel: string;
}

interface LevelTestContentEntry {
  uiLanguage: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  path: string;
  content: LevelTestContent;
}

const levelTestEntries = levelTestContentJson as LevelTestContentEntry[];

const LEVEL_TEST_PATHS: Partial<
  Record<UiLanguageCode, Partial<Record<TargetLanguageSlug, string>>>
> = {};

const LEVEL_TEST_CONTENT: Partial<
  Record<UiLanguageCode, Partial<Record<TargetLanguageSlug, LevelTestContent>>>
> = {};

for (const entry of levelTestEntries) {
  LEVEL_TEST_PATHS[entry.uiLanguage] ??= {};
  LEVEL_TEST_CONTENT[entry.uiLanguage] ??= {};
  LEVEL_TEST_PATHS[entry.uiLanguage]![entry.targetLanguage] = entry.path;
  LEVEL_TEST_CONTENT[entry.uiLanguage]![entry.targetLanguage] = entry.content;
}

export function getLevelTestContent(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): LevelTestContent | null {
  return LEVEL_TEST_CONTENT[uiLang]?.[targetLanguage] ?? null;
}

export function getLevelTestSeoPath(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): string | null {
  return LEVEL_TEST_PATHS[uiLang]?.[targetLanguage] ?? null;
}

export function resolveLevelTestSeoRoute(path: string): {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
} | null {
  for (const [uiLang, targetMap] of Object.entries(LEVEL_TEST_PATHS) as Array<
    [UiLanguageCode, Partial<Record<TargetLanguageSlug, string>>]
  >) {
    for (const [targetLanguage, routePath] of Object.entries(targetMap) as Array<
      [TargetLanguageSlug, string]
    >) {
      if (routePath === path) {
        return { uiLang, targetLanguage };
      }
    }
  }

  return null;
}

export function getEnglishLevelPracticeLinks(uiLang: UiLanguageCode) {
  const levels = ["a1", "a2", "b1", "b2", "c1", "c2"] as const;
  const labelBuilder: Record<UiLanguageCode, (level: string) => string> = {
    en: (level) => `English ${level} Vocabulary Practice`,
    es: (level) => `Vocabulario de inglés ${level}`,
    fr: (level) => `Vocabulaire anglais ${level}`,
    de: (level) => `Englisch ${level} Wortschatz`,
    it: (level) => `Vocabolario inglese ${level}`,
    pt: (level) => `Vocabulário de inglês ${level}`,
    ru: (level) => `Английская лексика ${level}`,
  };

  return levels
    .map((level) => ({
      level: level.toUpperCase(),
      href: buildLocalizedVocabularyPath(uiLang, "english", level),
      label: (labelBuilder[uiLang] ?? labelBuilder.en)(level.toUpperCase()),
    }))
    .filter((item) => Boolean(item.href));
}
