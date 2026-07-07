import type { TargetLanguageSlug, UiLanguageCode } from "./slugs";
import type { CefrLevelCode } from "../vocabularyLevels";
import { isValidBrowseWordLemma } from "./browseWordValidation";
import { LEVEL_DISPLAY } from "./vocabularyLevelCopy";
import { buildWordPath } from "./wordSlugs";
const previewModules = import.meta.glob("./level-browse-preview/*.json", {
  eager: true,
}) as Record<string, { default: LevelBrowsePreviewData }>;
const vocabularyModules = import.meta.glob("../vocabulary/*/vocabulary.json", {
  eager: true,
}) as Record<string, { default: Array<{ concept_id: string; word_lemma: string; level: string }> }>;

export interface BrowseWordLink {
  conceptId: string;
  href: string;
  word: string;
}

export interface LevelBrowsePreviewWord {
  concept_id: string;
  word_lemma: string;
}

export interface LevelBrowsePreviewData {
  targetLanguage: TargetLanguageSlug;
  level: string;
  totalWords: number;
  totalPages: number;
  words: LevelBrowsePreviewWord[];
}

export function getLevelBrowseWordLinks(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: CefrLevelCode,
  limit = 0,
): BrowseWordLink[] {
  const previewData = getLevelBrowsePreviewData(targetLanguage, level, limit > 0 ? limit : 54);
  if (!previewData) {
    return [];
  }
  return previewData.words.slice(0, limit > 0 ? limit : previewData.words.length).map((entry) => ({
    conceptId: entry.concept_id,
    href: buildWordPath(uiLang, targetLanguage, entry.word_lemma, entry.concept_id),
    word: entry.word_lemma,
  }));
}

export function getLevelBrowsePreviewData(
  targetLanguage: TargetLanguageSlug,
  level: CefrLevelCode,
  wordsPerPage = 54,
): LevelBrowsePreviewData | null {
  const normalizedLevel = level.toLowerCase() as CefrLevelCode;
  const previewData = previewModules[`./level-browse-preview/${targetLanguage}-${normalizedLevel}.json`]?.default;
  if (previewData) {
    return {
      targetLanguage: previewData.targetLanguage,
      level: previewData.level,
      totalWords: previewData.totalWords,
      totalPages: previewData.totalPages,
      words: wordsPerPage > 0 ? previewData.words.slice(0, wordsPerPage) : previewData.words,
    };
  }

  const vocabularyModule = vocabularyModules[`../vocabulary/${targetLanguage}/vocabulary.json`]?.default;
  if (!vocabularyModule) {
    return null;
  }

  const levelDisplay = LEVEL_DISPLAY[normalizedLevel];
  const seen = new Set<string>();
  const words: LevelBrowsePreviewWord[] = [];

  for (const entry of vocabularyModule) {
    if (
      entry.level !== levelDisplay ||
      !isValidBrowseWordLemma(entry.word_lemma) ||
      seen.has(entry.concept_id)
    ) {
      continue;
    }

    seen.add(entry.concept_id);
    words.push({
      concept_id: entry.concept_id,
      word_lemma: entry.word_lemma,
    });
  }

  return {
    targetLanguage,
    level: levelDisplay,
    totalWords: words.length,
    totalPages: Math.max(1, Math.ceil(words.length / 54)),
    words: wordsPerPage > 0 ? words.slice(0, wordsPerPage) : words,
  };
}
