import type { TargetLanguageSlug } from "../slugs";

const browseSearchModules = import.meta.glob("./word-browse-shards/*.json") as Record<
  string,
  () => Promise<{ default: WordBrowseSearchShardData }>
>;

const browseSearchDataCache = new Map<string, Promise<WordBrowseSearchShardData | null>>();

export interface WordBrowseSearchWordEntry {
  conceptId: string;
  wordLemma: string;
}

export interface WordBrowseSearchShardData {
  targetLanguage: TargetLanguageSlug;
  level: string;
  totalWords: number;
  totalPages: number;
  words: WordBrowseSearchWordEntry[];
}

function normalizeLevel(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

function browseSearchModulePath(targetLanguage: TargetLanguageSlug, level: string): string {
  return `./word-browse-shards/${targetLanguage}-${normalizeLevel(level)}.json`;
}

export function getWordBrowseSearchShardKey(
  targetLanguage: TargetLanguageSlug,
  level: string,
): string {
  return `${targetLanguage}:${normalizeLevel(level)}`;
}

export function getWordBrowseSearchData(
  targetLanguage: TargetLanguageSlug,
  level: string,
): Promise<WordBrowseSearchShardData | null> {
  const cacheKey = getWordBrowseSearchShardKey(targetLanguage, level);
  const cached = browseSearchDataCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const loadModule = browseSearchModules[browseSearchModulePath(targetLanguage, level)];
  const pending = loadModule ? loadModule().then((module) => module.default) : Promise.resolve(null);
  browseSearchDataCache.set(cacheKey, pending);
  return pending;
}
