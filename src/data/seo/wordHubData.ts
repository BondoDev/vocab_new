import type { Level, UiLanguageCode } from "./slugs";
import { SUPPORTED_LEVELS, SUPPORTED_UI_LANGUAGES } from "./slugs";
import { buildWordPath } from "./wordSlugs";
import {
  WORD_HUB_PAGE_SIZE,
  WORD_HUB_TARGET_LANGUAGE,
  getWordSeoHubLevelPath,
  getWordSeoHubSummaryPath,
} from "./wordHubRoutes";
import { isValidBrowseWordLemma } from "./browseWordValidation";
import { fixMojibake } from "../../utils/fixMojibake";

interface VocabularyEntry {
  concept_id: string;
  word_lemma: string;
  level: string;
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

const vocabularyModules = import.meta.glob("../vocabulary/english/vocabulary.json", {
  eager: true,
}) as Record<string, { default: VocabularyEntry[] }>;

const LEVEL_DISPLAY: Record<Level, string> = {
  a1: "A1",
  a2: "A2",
  b1: "B1",
  b2: "B2",
  c1: "C1",
  c2: "C2",
};

const rawVocabulary =
  vocabularyModules["../vocabulary/english/vocabulary.json"]?.default ?? [];

const WORDS_BY_LEVEL = (() => {
  const buckets = new Map<Level, Array<{ conceptId: string; word: string }>>();

  for (const level of SUPPORTED_LEVELS) {
    buckets.set(level, []);
  }

  const seen = new Set<string>();
  for (const entry of rawVocabulary) {
    const level = SUPPORTED_LEVELS.find(
      (item) => LEVEL_DISPLAY[item] === String(entry.level).toUpperCase(),
    );
    if (!level) {
      continue;
    }

    const conceptId = String(entry.concept_id ?? "").trim();
    const wordLemma = fixMojibake(String(entry.word_lemma ?? "")).trim();
    if (!conceptId || !isValidBrowseWordLemma(wordLemma)) {
      continue;
    }

    const key = `${WORD_HUB_TARGET_LANGUAGE}:${conceptId}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    buckets.get(level)?.push({
      conceptId,
      word: wordLemma,
    });
  }

  return buckets;
})();

export function getWordSeoHubSummaryPageData(
  uiLang: UiLanguageCode,
): WordSeoHubSummaryPageData {
  return {
    summaryPath: getWordSeoHubSummaryPath(uiLang),
    levels: SUPPORTED_LEVELS.map((level) => {
      const words = WORDS_BY_LEVEL.get(level) ?? [];
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
  level: Level,
  page: number,
): WordSeoHubLevelPageData | null {
  const words = WORDS_BY_LEVEL.get(level) ?? [];
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
    summaryPath: getWordSeoHubSummaryPath(uiLang),
    pagePath: getWordSeoHubLevelPath(uiLang, level, page),
    words: pageWords.map((word) => ({
      conceptId: word.conceptId,
      href: buildWordPath(uiLang, WORD_HUB_TARGET_LANGUAGE, word.word, word.conceptId),
      word: word.word,
    })),
  };
}

export function getAllWordSeoHubPaths(): string[] {
  const paths: string[] = [];

  for (const uiLang of SUPPORTED_UI_LANGUAGES) {
    paths.push(getWordSeoHubSummaryPath(uiLang));

    for (const level of SUPPORTED_LEVELS) {
      const words = WORDS_BY_LEVEL.get(level) ?? [];
      const totalPages = Math.max(1, Math.ceil(words.length / WORD_HUB_PAGE_SIZE));
      for (let page = 1; page <= totalPages; page += 1) {
        paths.push(getWordSeoHubLevelPath(uiLang, level, page));
      }
    }
  }

  return paths;
}
