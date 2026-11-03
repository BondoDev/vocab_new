// Loads the generated level-explorer files (see
// scripts/generation/generate-level-explorer-data.mjs) for one CEFR page.
// Shared by SSR/prerender (first page of rows, embedded in the HTML) and the
// browser (the complete list, fetched only when the visitor searches or
// leaves page 1), so both produce identical rows.
//
// The glob is lazy: every file is its own small chunk (tens of KB
// gzipped), replacing the multi-megabyte vocabulary.json chunk the page used
// to download on every visit. Kept out of the index.ts barrel, which the
// Node sitemap tooling compiles.
import {
  getUiVocabularyLanguage,
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../shared/slugs";
import {
  LEVEL_EXPLORER_PAGE_SIZE,
  buildLevelExplorerRows,
  type LevelExplorerDefinitionFile,
  type LevelExplorerInitialData,
  type LevelExplorerMeaningKind,
  type LevelExplorerRow,
  type LevelExplorerWordFile,
} from "./levelExplorerRows";

const explorerModules = import.meta.glob("./level-explorer/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

// One request per file per session; a failed load is evicted so Retry can
// start a fresh request.
const fileCache = new Map<string, Promise<unknown>>();

function loadExplorerFile(name: string): Promise<unknown> {
  const cached = fileCache.get(name);
  if (cached) {
    return cached;
  }
  const loader = explorerModules[`./level-explorer/${name}.json`];
  if (!loader) {
    return Promise.reject(new Error(`Missing level-explorer file "${name}"`));
  }
  const pending = loader()
    .then((module) => module.default)
    .catch((error: unknown) => {
      fileCache.delete(name);
      throw error;
    });
  fileCache.set(name, pending);
  return pending;
}

export function getLevelExplorerMeaningKind(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): LevelExplorerMeaningKind {
  return getUiVocabularyLanguage(uiLang) === targetLanguage ? "definition" : "translation";
}

export async function loadLevelExplorerRows(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: Level,
): Promise<LevelExplorerRow[]> {
  const meaningKind = getLevelExplorerMeaningKind(uiLang, targetLanguage);
  const meaningFile =
    meaningKind === "definition"
      ? `${targetLanguage}-${level}-definitions`
      : `${getUiVocabularyLanguage(uiLang)}-${level}`;
  const [words, meanings] = await Promise.all([
    loadExplorerFile(`${targetLanguage}-${level}`),
    loadExplorerFile(meaningFile),
  ]);
  return buildLevelExplorerRows(
    words as LevelExplorerWordFile,
    meaningKind,
    meanings as LevelExplorerWordFile | LevelExplorerDefinitionFile,
  );
}

export async function buildLevelExplorerInitialData(
  pathname: string,
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: Level,
): Promise<LevelExplorerInitialData> {
  const rows = await loadLevelExplorerRows(uiLang, targetLanguage, level);
  return {
    pathname,
    meaningKind: getLevelExplorerMeaningKind(uiLang, targetLanguage),
    totalWords: rows.length,
    rows: rows.slice(0, LEVEL_EXPLORER_PAGE_SIZE),
  };
}
