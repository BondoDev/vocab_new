import type { Level, TargetLanguageSlug, UiLanguageCode } from "../slugs";
import { SUPPORTED_LEVELS, SUPPORTED_TARGET_LANGUAGES, SUPPORTED_UI_LANGUAGES } from "../slugs";
import { buildWordPath } from "./wordSlugs";
import {
  WORD_HUB_PAGE_SIZE,
  getWordSeoHubLevelPath,
  getWordSeoHubSummaryPath,
} from "./wordHubRoutes";
import { isValidBrowseWordLemma } from "../browseWordValidation";
import { fixMojibake } from "../../../utils/fixMojibake";

interface VocabularyEntry {
  targetLanguage: TargetLanguageSlug;
  levels: Record<Level, Array<[conceptId: string, word: string]>>;
}

export interface WordSeoHubWordLink {
  conceptId: string;
  href: string;
  word: string;
}

export interface WordSeoHubLevelSummary {
  level: Level;
  totalWords: number;
  totalPages: number;
}

export interface WordSeoHubSummaryPageData {
  levels: WordSeoHubLevelSummary[];
  summaryPath: string;
}

export interface WordSeoHubLevelPageData {
  level: Level;
  page: number;
  totalPages: number;
  totalWords: number;
  summaryPath: string;
  pagePath: string;
  words: WordSeoHubWordLink[];
}

const vocabularyModules = import.meta.glob("./word-hub-pages/*.json", {
  eager: true,
}) as Record<string, { default: VocabularyEntry }>;

function loadWordsByLevel(targetLanguage: TargetLanguageSlug): Map<Level, Array<{ conceptId: string; word: string }>> {
  const rawVocabulary =
    vocabularyModules[`./word-hub-pages/${targetLanguage}.json`]?.default ??
    { targetLanguage, levels: {} as VocabularyEntry["levels"] };
  const buckets = new Map<Level, Array<{ conceptId: string; word: string }>>();
  for (const level of SUPPORTED_LEVELS) {
    const words = rawVocabulary.levels[level] ?? [];
    buckets.set(
      level,
      words
        .map(([conceptId, wordLemma]) => {
          const normalizedConceptId = String(conceptId ?? "").trim();
          const normalizedWord = fixMojibake(String(wordLemma ?? "")).trim();
          if (!normalizedConceptId || !isValidBrowseWordLemma(normalizedWord)) {
            return null;
          }

          return {
            conceptId: normalizedConceptId,
            word: normalizedWord,
          };
        })
        .filter((word): word is { conceptId: string; word: string } => Boolean(word)),
    );
  }

  return buckets;
}

const WORDS_BY_LEVEL_BY_TARGET_LANGUAGE = new Map<
  TargetLanguageSlug,
  Map<Level, Array<{ conceptId: string; word: string }>>
>();

function getWordsByLevel(targetLanguage: TargetLanguageSlug): Map<Level, Array<{ conceptId: string; word: string }>> {
  let wordsByLevel = WORDS_BY_LEVEL_BY_TARGET_LANGUAGE.get(targetLanguage);
  if (!wordsByLevel) {
    wordsByLevel = loadWordsByLevel(targetLanguage);
    WORDS_BY_LEVEL_BY_TARGET_LANGUAGE.set(targetLanguage, wordsByLevel);
  }
  return wordsByLevel;
}

export function getWordSeoHubSummaryPageData(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): WordSeoHubSummaryPageData {
  const wordsByLevel = getWordsByLevel(targetLanguage);
  return {
    summaryPath: getWordSeoHubSummaryPath(uiLang, targetLanguage),
    levels: SUPPORTED_LEVELS.map((level) => {
      const words = wordsByLevel.get(level) ?? [];
      return {
        level,
        totalWords: words.length,
        totalPages: Math.max(1, Math.ceil(words.length / WORD_HUB_PAGE_SIZE)),
      };
    }),
  };
}

export function getWordSeoHubLevelPageData(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: Level,
  page: number,
): WordSeoHubLevelPageData | null {
  const wordsByLevel = getWordsByLevel(targetLanguage);
  const words = wordsByLevel.get(level) ?? [];
  const totalPages = Math.max(1, Math.ceil(words.length / WORD_HUB_PAGE_SIZE));
  if (page < 1 || page > totalPages) {
    return null;
  }

  const startIndex = (page - 1) * WORD_HUB_PAGE_SIZE;
  const pageWords = words.slice(startIndex, startIndex + WORD_HUB_PAGE_SIZE);

  return {
    level,
    page,
    totalPages,
    totalWords: words.length,
    summaryPath: getWordSeoHubSummaryPath(uiLang, targetLanguage),
    pagePath: getWordSeoHubLevelPath(uiLang, targetLanguage, level, page),
    words: pageWords.map((word) => ({
      conceptId: word.conceptId,
      href: buildWordPath(uiLang, targetLanguage, word.word, word.conceptId),
      word: word.word,
    })),
  };
}

export function getAllWordSeoHubPaths(
  targetLanguages: TargetLanguageSlug[] = [...SUPPORTED_TARGET_LANGUAGES],
): string[] {
  const paths: string[] = [];

  for (const targetLanguage of targetLanguages) {
    const wordsByLevel = getWordsByLevel(targetLanguage);

    for (const uiLang of SUPPORTED_UI_LANGUAGES) {
      paths.push(getWordSeoHubSummaryPath(uiLang, targetLanguage));

      for (const level of SUPPORTED_LEVELS) {
        const words = wordsByLevel.get(level) ?? [];
        const totalPages = Math.max(1, Math.ceil(words.length / WORD_HUB_PAGE_SIZE));
        for (let page = 1; page <= totalPages; page += 1) {
          paths.push(getWordSeoHubLevelPath(uiLang, targetLanguage, level, page));
        }
      }
    }
  }

  return paths;
}
