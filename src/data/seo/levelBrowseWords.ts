import type { TargetLanguageSlug } from "./slugs";
import { SUPPORTED_LEVELS, SUPPORTED_TARGET_LANGUAGES, type UiLanguageCode } from "./slugs";
import type { CefrLevelCode } from "./vocabularyLevels";
import { buildWordPath } from "./wordSlugs";

const previewModules = import.meta.glob("./level-browse-preview/*.json") as Record<
  string,
  () => Promise<{ default: LevelBrowsePreviewData }>
>;

const previewDataCache = new Map<string, Promise<LevelBrowsePreviewData | null>>();

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

/** All expected `${targetLanguage}-${level}` preview keys (7 languages x 6 levels = 42). */
export const EXPECTED_LEVEL_BROWSE_PREVIEW_KEYS: string[] = SUPPORTED_TARGET_LANGUAGES.flatMap((targetLanguage) =>
  SUPPORTED_LEVELS.map((level) => `${targetLanguage}-${level}`),
);

function previewModulePath(key: string): string {
  return `./level-browse-preview/${key}.json`;
}

function loadPreviewData(key: string): Promise<LevelBrowsePreviewData | null> {
  const cached = previewDataCache.get(key);
  if (cached) {
    return cached;
  }

  const loadModule = previewModules[previewModulePath(key)];
  const pending = loadModule ? loadModule().then((module) => module.default) : Promise.resolve(null);
  previewDataCache.set(key, pending);
  return pending;
}

export async function getLevelBrowseWordLinks(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: CefrLevelCode,
  limit = 0,
): Promise<BrowseWordLink[]> {
  const previewData = await getLevelBrowsePreviewData(targetLanguage, level, limit > 0 ? limit : 54);
  if (!previewData) {
    return [];
  }
  return previewData.words.slice(0, limit > 0 ? limit : previewData.words.length).map((entry) => ({
    conceptId: entry.concept_id,
    href: buildWordPath(uiLang, targetLanguage, entry.word_lemma, entry.concept_id),
    word: entry.word_lemma,
  }));
}

export async function getLevelBrowsePreviewData(
  targetLanguage: TargetLanguageSlug,
  level: CefrLevelCode,
  wordsPerPage = 54,
): Promise<LevelBrowsePreviewData | null> {
  const normalizedLevel = level.toLowerCase() as CefrLevelCode;
  const previewData = await loadPreviewData(`${targetLanguage}-${normalizedLevel}`);
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

interface LevelBrowsePreviewCompletenessResult {
  expected: string[];
  available: string[];
  missing: string[];
  unexpected: string[];
  malformed: string[];
}

function isMalformedPreviewData(data: unknown): boolean {
  if (!data || typeof data !== "object") {
    return true;
  }
  const candidate = data as Partial<LevelBrowsePreviewData>;
  return (
    typeof candidate.targetLanguage !== "string" ||
    typeof candidate.level !== "string" ||
    typeof candidate.totalWords !== "number" ||
    typeof candidate.totalPages !== "number" ||
    !Array.isArray(candidate.words) ||
    candidate.words.length === 0 ||
    candidate.words.some(
      (word) => typeof word?.concept_id !== "string" || typeof word?.word_lemma !== "string",
    )
  );
}

/**
 * Validates that every supported (targetLanguage, level) combination has a
 * well-formed preview JSON file. Intended for build/test-time use so a
 * missing or malformed preview fails loudly instead of silently degrading
 * CEFR browse links in production SSR/prerendered HTML.
 */
export async function validateLevelBrowsePreviewCompleteness(): Promise<LevelBrowsePreviewCompletenessResult> {
  const available = Object.keys(previewModules)
    .map((modulePath) => modulePath.match(/^\.\/level-browse-preview\/(.+)\.json$/)?.[1])
    .filter((key): key is string => Boolean(key));
  const availableSet = new Set(available);
  const expectedSet = new Set(EXPECTED_LEVEL_BROWSE_PREVIEW_KEYS);

  const missing = EXPECTED_LEVEL_BROWSE_PREVIEW_KEYS.filter((key) => !availableSet.has(key));
  const unexpected = available.filter((key) => !expectedSet.has(key));

  const malformed: string[] = [];
  for (const key of EXPECTED_LEVEL_BROWSE_PREVIEW_KEYS) {
    if (!availableSet.has(key)) {
      continue;
    }
    const data = await loadPreviewData(key);
    if (isMalformedPreviewData(data)) {
      malformed.push(key);
    }
  }

  return {
    expected: EXPECTED_LEVEL_BROWSE_PREVIEW_KEYS,
    available,
    missing,
    unexpected,
    malformed,
  };
}
