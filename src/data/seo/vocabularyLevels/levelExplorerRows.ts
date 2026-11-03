// Row shaping, search, and pagination for the CEFR vocabulary-level page's
// vocabulary explorer. Deliberately free of import.meta (the generated files
// are loaded by levelExplorerData.ts) so this logic compiles and unit-tests
// directly under Node.
import { isValidBrowseWordLemma } from "../shared/browseWordValidation";

export const LEVEL_EXPLORER_PAGE_SIZE = 40;
export const LEVEL_EXPLORER_INITIAL_DATA_ELEMENT_ID = "vocabulary-level-explorer-data";

// One generated row: [conceptId, word, grammar type].
export type LevelExplorerSourceWord = [conceptId: string, word: string, type: string];

export interface LevelExplorerWordFile {
  language: string;
  level: string;
  words: LevelExplorerSourceWord[];
}

export interface LevelExplorerDefinitionFile {
  language: string;
  level: string;
  definitions: Record<string, string>;
}

// How the meaning column is filled: the visitor's UI-language word for the
// same concept (cross-language pages) or the target language's own
// definition (same-language pages, e.g. English UI -> English A1).
export type LevelExplorerMeaningKind = "translation" | "definition";

export interface LevelExplorerRow {
  conceptId: string;
  word: string;
  type: string;
  // "" when the UI-language vocabulary has no word for this concept; the
  // explorer shows a dash rather than substituting other text.
  meaning: string;
  // Only lemmas that pass the word-page validation get a word-page link
  // (matches the rule word pages, word hubs, and browse shards use).
  linkable: boolean;
}

export interface LevelExplorerSearchableRow extends LevelExplorerRow {
  wordKey: string;
  meaningKey: string;
}

// Embedded in the prerendered HTML so the browser's first render — and so
// hydration — matches the server output exactly.
export interface LevelExplorerInitialData {
  pathname: string;
  meaningKind: LevelExplorerMeaningKind;
  totalWords: number;
  // The first LEVEL_EXPLORER_PAGE_SIZE rows in display order.
  rows: LevelExplorerRow[];
}

export function buildLevelExplorerRows(
  words: LevelExplorerWordFile,
  meaningKind: LevelExplorerMeaningKind,
  meaningSource: LevelExplorerWordFile | LevelExplorerDefinitionFile,
): LevelExplorerRow[] {
  const meanings = new Map<string, string>();
  if (meaningKind === "definition") {
    for (const [conceptId, definition] of Object.entries((meaningSource as LevelExplorerDefinitionFile).definitions)) {
      meanings.set(conceptId, definition);
    }
  } else {
    for (const [conceptId, word] of (meaningSource as LevelExplorerWordFile).words) {
      meanings.set(conceptId, word);
    }
  }

  return words.words.map(([conceptId, word, type]) => ({
    conceptId,
    word,
    type,
    meaning: meanings.get(conceptId) ?? "",
    linkable: isValidBrowseWordLemma(word),
  }));
}

// Case- and accent-insensitive search text ("Éclair" matches "eclair"),
// the same normalization the full vocabulary list's search uses.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizeLevelExplorerSearchText(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}

export function toSearchableLevelExplorerRows(rows: LevelExplorerRow[]): LevelExplorerSearchableRow[] {
  return rows.map((row) => ({
    ...row,
    wordKey: normalizeLevelExplorerSearchText(row.word),
    meaningKey: normalizeLevelExplorerSearchText(row.meaning),
  }));
}

// A query matches the word or its meaning. Rows whose word starts with the
// query come first, then rows whose meaning starts with it, then the rest;
// display (alphabetical) order is kept inside each group, so results are
// deterministic.
export function filterLevelExplorerRows(
  rows: LevelExplorerSearchableRow[],
  query: string,
): LevelExplorerSearchableRow[] {
  const needle = normalizeLevelExplorerSearchText(query);
  if (!needle) {
    return rows;
  }
  const wordPrefix: LevelExplorerSearchableRow[] = [];
  const meaningPrefix: LevelExplorerSearchableRow[] = [];
  const contains: LevelExplorerSearchableRow[] = [];
  for (const row of rows) {
    if (row.wordKey.startsWith(needle)) {
      wordPrefix.push(row);
    } else if (row.meaningKey.startsWith(needle)) {
      meaningPrefix.push(row);
    } else if (row.wordKey.includes(needle) || row.meaningKey.includes(needle)) {
      contains.push(row);
    }
  }
  return wordPrefix.concat(meaningPrefix, contains);
}

export function getLevelExplorerPageCount(totalRows: number): number {
  return Math.max(1, Math.ceil(totalRows / LEVEL_EXPLORER_PAGE_SIZE));
}

export function clampLevelExplorerPage(page: number, totalRows: number): number {
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }
  return Math.min(Math.floor(page), getLevelExplorerPageCount(totalRows));
}

export function sliceLevelExplorerPage<T>(rows: T[], page: number): T[] {
  const start = (page - 1) * LEVEL_EXPLORER_PAGE_SIZE;
  return rows.slice(start, start + LEVEL_EXPLORER_PAGE_SIZE);
}

// Page buttons to show: always the first and last page plus a window around
// the current one; null marks a gap ("…").
export function getLevelExplorerPageItems(current: number, total: number, radius = 1): (number | null)[] {
  if (total <= 2 * radius + 5) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  const items: (number | null)[] = [];
  let previous = 0;
  for (let page = 1; page <= total; page++) {
    if (page === 1 || page === total || Math.abs(page - current) <= radius) {
      if (previous && page - previous > 1) {
        items.push(null);
      }
      items.push(page);
      previous = page;
    }
  }
  return items;
}

// Explorer state in the query string (?q=…&page=…). Search and pagination
// states are not separate SEO pages: the canonical URL is always the bare
// CEFR path, and the server always renders page 1 with no query.
export interface LevelExplorerUrlState {
  query: string;
  page: number;
}

export function parseLevelExplorerUrlState(search: string): LevelExplorerUrlState {
  const params = new URLSearchParams(search);
  const query = (params.get("q") ?? "").slice(0, 100);
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return { query, page: Number.isFinite(page) && page > 1 ? page : 1 };
}

// Rewrites only the explorer's own parameters, keeping any others.
export function buildLevelExplorerSearch(currentSearch: string, state: LevelExplorerUrlState): string {
  const params = new URLSearchParams(currentSearch);
  const query = state.query.trim();
  if (query) {
    params.set("q", query);
  } else {
    params.delete("q");
  }
  if (state.page > 1) {
    params.set("page", String(state.page));
  } else {
    params.delete("page");
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}
