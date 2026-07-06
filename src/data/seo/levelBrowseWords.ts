import type { TargetLanguageSlug, UiLanguageCode } from "./slugs";
import type { CefrLevelCode } from "../vocabularyLevels";
import { buildWordPath } from "./wordSlugs";
const previewModules = import.meta.glob("./level-browse-preview/*.json", {
  eager: true,
}) as Record<string, { default: LevelBrowsePreviewData }>;

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
  const normalizedLevel = level.toLowerCase();
  const previewData = previewModules[`./level-browse-preview/${targetLanguage}-${normalizedLevel}.json`]?.default;
  if (!previewData) {
    return null;
  }
  return {
    targetLanguage: previewData.targetLanguage,
    level: previewData.level,
    totalWords: previewData.totalWords,
    totalPages: previewData.totalPages,
    words: wordsPerPage > 0 ? previewData.words.slice(0, wordsPerPage) : previewData.words,
  };
}
