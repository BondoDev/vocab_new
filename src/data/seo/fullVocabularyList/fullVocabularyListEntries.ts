// Vocabulary rows for the full-vocabulary-list tables, read from the
// canonical src/data/vocabulary/{targetLanguage}/vocabulary.json — no copy
// or generated mirror of the word data exists for this family.
//
// Loaded with dynamic import() only, on first demand in the browser: the
// files are ~3 MB each, so a static import would land in the main bundle
// (App.tsx imports the page statically). Vite emits each file as its own
// chunk, shared with the homepage's daily-word loader, so it is fetched at
// most once. Deliberately kept out of fullVocabularyListRegistry.ts and the
// index.ts barrel, which the Node sitemap tooling compiles.
import { TARGET_LANGUAGE_TO_UI_LANGUAGE, type Level, type TargetLanguageSlug } from "../shared/slugs";

export interface FullVocabularyRow {
  conceptId: string;
  word: string;
  definition: string;
  sentence: string;
  // Raw `type` value from vocabulary.json (e.g. "noun"); localized at render.
  type: string;
  // Precomputed normalizeVocabularySearchText(word), so filtering 10k rows
  // per keystroke never re-normalizes.
  searchKey: string;
  // The concept's word in the visitor's UI language; set only when the UI
  // language differs from the table's language and that language's
  // vocabulary.json has the concept (see attachFullVocabularyTranslations).
  translation?: string;
  translationSearchKey?: string;
  // Word forms to bold in `sentence`: the concept's inflected form(s) from
  // src/data/inflected/{language}/inflected.json (the form the sentence
  // actually uses, e.g. "beans" for "bean") plus the lemma as a fallback.
  sentenceForms?: string[];
}

export interface FullVocabularyFilter {
  query: string;
  // Selected grammar types; a row matches if its type is any of them. Empty
  // means every grammar type.
  types: readonly string[];
}

export const EMPTY_FULL_VOCABULARY_FILTER: FullVocabularyFilter = { query: "", types: [] };

// Case- and accent-insensitive search text: "Éclair" and "eclair" match.
// Lenient on purpose — stripping combining marks also folds Cyrillic й/ё
// onto и/е, which is acceptable for a lookup box.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizeVocabularySearchText(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}

export function isFullVocabularyFilterActive(filter: FullVocabularyFilter): boolean {
  return filter.query.trim().length > 0 || filter.types.length > 0;
}

// Applies every filter (all must match; within one filter the selected
// grammar types are alternatives) to one level's complete row list —
// never just the rows already rendered — so Load More pages through the
// filtered result. A query matches the word or its translation; rows where
// either starts with the query rank before rows merely containing it, and
// source order is kept within each group.
export function filterFullVocabularyRows(
  rows: FullVocabularyRow[],
  filters: FullVocabularyFilter[],
): FullVocabularyRow[] {
  const active = filters
    .map((filter) => ({
      query: normalizeVocabularySearchText(filter.query),
      types: filter.types.length > 0 ? new Set(filter.types) : null,
    }))
    .filter((filter) => filter.query || filter.types);
  if (active.length === 0) {
    return rows;
  }

  const prefixMatches: FullVocabularyRow[] = [];
  const otherMatches: FullVocabularyRow[] = [];
  for (const row of rows) {
    let matches = true;
    let isPrefix = true;
    for (const filter of active) {
      if (filter.types && !filter.types.has(row.type)) {
        matches = false;
        break;
      }
      if (filter.query) {
        const wordPosition = row.searchKey.indexOf(filter.query);
        const translationPosition = row.translationSearchKey?.indexOf(filter.query) ?? -1;
        if (wordPosition < 0 && translationPosition < 0) {
          matches = false;
          break;
        }
        isPrefix = isPrefix && (wordPosition === 0 || translationPosition === 0);
      }
    }
    if (matches) {
      (isPrefix ? prefixMatches : otherMatches).push(row);
    }
  }
  return prefixMatches.concat(otherMatches);
}

// Grammar types present in the given rows, in the caller's preferred order
// (GRAMMAR_TYPE_KEYS), so dropdowns never offer a type with zero words.
export function collectGrammarTypes(rows: FullVocabularyRow[], order: readonly string[]): string[] {
  const present = new Set(rows.map((row) => row.type));
  return order.filter((type) => present.has(type));
}

export type FullVocabularyRowsByLevel = Record<Level, FullVocabularyRow[]>;

// BCP 47 voice locale per target language for the browser's speech
// synthesis; matches the locales the verb-list tables already speak with.
export const FULL_VOCABULARY_SPEECH_LANG: Record<TargetLanguageSlug, string> = {
  english: "en-US",
  spanish: "es-ES",
  french: "fr-FR",
  german: "de-DE",
  italian: "it-IT",
  portuguese: "pt-PT",
  russian: "ru-RU",
};

const VOCABULARY_IMPORTERS: Record<TargetLanguageSlug, () => Promise<{ default: unknown }>> = {
  english: () => import("../../vocabulary/english/vocabulary.json"),
  spanish: () => import("../../vocabulary/spanish/vocabulary.json"),
  french: () => import("../../vocabulary/french/vocabulary.json"),
  german: () => import("../../vocabulary/german/vocabulary.json"),
  italian: () => import("../../vocabulary/italian/vocabulary.json"),
  portuguese: () => import("../../vocabulary/portuguese/vocabulary.json"),
  russian: () => import("../../vocabulary/russian/vocabulary.json"),
};

const INFLECTED_IMPORTERS: Record<TargetLanguageSlug, () => Promise<{ default: unknown }>> = {
  english: () => import("../../inflected/english/inflected.json"),
  spanish: () => import("../../inflected/spanish/inflected.json"),
  french: () => import("../../inflected/french/inflected.json"),
  german: () => import("../../inflected/german/inflected.json"),
  italian: () => import("../../inflected/italian/inflected.json"),
  portuguese: () => import("../../inflected/portuguese/inflected.json"),
  russian: () => import("../../inflected/russian/inflected.json"),
};

const LEVEL_BY_SOURCE_CODE: Record<string, Level> = {
  A1: "a1",
  A2: "a2",
  B1: "b1",
  B2: "b2",
  C1: "c1",
  C2: "c2",
};

// Trims and collapses internal whitespace runs (some source definitions
// contain stray double spaces).
function readText(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// A concept with no word in a language is marked with a dash-only lemma:
// "-" in most files, but some (es/fr/de/it/pt/ru) use an em dash "—".
const MISSING_LEMMA = new RegExp("^[-–—]+$");

function isUsableLemma(word: string): boolean {
  return word.length > 0 && !MISSING_LEMMA.test(word);
}

// Groups rows by CEFR level. Skips entries without a usable lemma (see
// isUsableLemma) and repeated concept ids
// (first occurrence wins), matching the practice flow's rules in
// resolveVocabularyWordData.ts. Note the source field is spelled
// "definiton"; "definition" is accepted too in case it is ever corrected.
//
// With `sortLocale` (the table language's code, e.g. "de"), each level is
// sorted alphabetically by its own word using that language's collation
// (ä beside a in German, ñ after n in Spanish, Cyrillic order in Russian).
// Source files are ordered by concept id, i.e. by the English word, so
// without this every non-English table would follow English order.
// Array.prototype.sort is stable, so equal words keep source order.
export function groupFullVocabularyRows(entries: unknown, sortLocale?: string): FullVocabularyRowsByLevel {
  const grouped: FullVocabularyRowsByLevel = { a1: [], a2: [], b1: [], b2: [], c1: [], c2: [] };
  if (!Array.isArray(entries)) {
    return grouped;
  }

  const seenConceptIds = new Set<string>();
  for (const raw of entries) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const conceptId = readText(entry.concept_id);
    const word = readText(entry.word_lemma);
    const level = LEVEL_BY_SOURCE_CODE[readText(entry.level).toUpperCase()];
    if (!conceptId || !isUsableLemma(word) || !level || seenConceptIds.has(conceptId)) {
      continue;
    }
    seenConceptIds.add(conceptId);
    grouped[level].push({
      conceptId,
      word,
      searchKey: normalizeVocabularySearchText(word),
      definition: readText(entry.definiton) || readText(entry.definition),
      sentence: readText(entry.sentence),
      type: readText(entry.type).toLowerCase(),
    });
  }

  if (sortLocale) {
    const collator = new Intl.Collator(sortLocale, { numeric: true });
    for (const rows of Object.values(grouped)) {
      rows.sort((a, b) => collator.compare(a.word, b.word));
    }
  }

  return grouped;
}

// One shared import per vocabulary file, reused whether that language is
// the table's target language or another table's translation language. A
// failed load is evicted so a retry can start a fresh request.
const moduleCache = new Map<TargetLanguageSlug, Promise<unknown>>();

function loadVocabularyEntries(language: TargetLanguageSlug): Promise<unknown> {
  const cached = moduleCache.get(language);
  if (cached) {
    return cached;
  }

  const pending = VOCABULARY_IMPORTERS[language]()
    .then((module) => module.default)
    .catch((error: unknown) => {
      moduleCache.delete(language);
      throw error;
    });
  moduleCache.set(language, pending);
  return pending;
}

// True once this language's vocabulary file has been (or is being) fetched
// in this browser session. Always false during SSR and on a fresh page load.
export function isFullVocabularyLoadStarted(language: TargetLanguageSlug): boolean {
  return moduleCache.has(language);
}

export function loadFullVocabularyRows(targetLanguage: TargetLanguageSlug): Promise<FullVocabularyRowsByLevel> {
  return loadVocabularyEntries(targetLanguage).then((entries) =>
    groupFullVocabularyRows(entries, TARGET_LANGUAGE_TO_UI_LANGUAGE[targetLanguage]),
  );
}

export interface FullVocabularyTranslation {
  word: string;
  // That language's own definition of the concept ("" if the file has none).
  definition: string;
}

// concept_id -> lemma + definition in one language, used to translate another
// language's rows (vocabulary.json files share concept ids across languages,
// and each file writes its definitions in its own language). Same
// usable-lemma and first-occurrence-wins rules as groupFullVocabularyRows.
export function buildTranslationIndex(entries: unknown): Map<string, FullVocabularyTranslation> {
  const index = new Map<string, FullVocabularyTranslation>();
  if (!Array.isArray(entries)) {
    return index;
  }
  for (const raw of entries) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const conceptId = readText(entry.concept_id);
    const word = readText(entry.word_lemma);
    if (conceptId && isUsableLemma(word) && !index.has(conceptId)) {
      index.set(conceptId, { word, definition: readText(entry.definiton) || readText(entry.definition) });
    }
  }
  return index;
}

export function loadFullVocabularyTranslations(
  language: TargetLanguageSlug,
): Promise<Map<string, FullVocabularyTranslation>> {
  return loadVocabularyEntries(language).then(buildTranslationIndex);
}

// Returns new rows carrying each concept's word in the visitor's UI language
// (searchable too) and replacing the definition with the UI language's own,
// so definitions read in the visitor's language. Concepts the UI-language
// file lacks keep no translation and their original definition; example
// sentences always stay in the table's language, since they demonstrate the
// table word.
export function attachFullVocabularyTranslations(
  rowsByLevel: FullVocabularyRowsByLevel,
  translations: Map<string, FullVocabularyTranslation>,
): FullVocabularyRowsByLevel {
  const withTranslation = (rows: FullVocabularyRow[]) =>
    rows.map((row) => {
      const translation = translations.get(row.conceptId);
      return translation
        ? {
            ...row,
            translation: translation.word,
            translationSearchKey: normalizeVocabularySearchText(translation.word),
            definition: translation.definition || row.definition,
          }
        : row;
    });
  return {
    a1: withTranslation(rowsByLevel.a1),
    a2: withTranslation(rowsByLevel.a2),
    b1: withTranslation(rowsByLevel.b1),
    b2: withTranslation(rowsByLevel.b2),
    c1: withTranslation(rowsByLevel.c1),
    c2: withTranslation(rowsByLevel.c2),
  };
}

// concept_id -> inflected forms. Keys vary by language file ("word_inflected1"
// in English, "word_inflected-1"/"word_inflected-2" in German, ...), so any
// key containing "inflected" counts — the same rule the practice flow uses.
export function buildInflectedFormsIndex(entries: unknown): Map<string, string[]> {
  const index = new Map<string, string[]>();
  if (!Array.isArray(entries)) {
    return index;
  }
  for (const raw of entries) {
    const entry = (raw ?? {}) as Record<string, unknown>;
    const conceptId = readText(entry.concept_id);
    if (!conceptId || index.has(conceptId)) {
      continue;
    }
    const forms = Object.entries(entry)
      .filter(([key]) => /inflected/i.test(key))
      .map(([, value]) => readText(value))
      .filter((form) => form && form !== "-");
    if (forms.length > 0) {
      index.set(conceptId, forms);
    }
  }
  return index;
}

// Bolding is an enhancement: if the inflected file fails to load, resolve to
// an empty index so the table still renders (lemma-only highlighting).
export function loadFullVocabularyInflectedForms(language: TargetLanguageSlug): Promise<Map<string, string[]>> {
  return INFLECTED_IMPORTERS[language]()
    .then((module) => buildInflectedFormsIndex(module.default))
    .catch(() => new Map<string, string[]>());
}

export function attachFullVocabularySentenceForms(
  rowsByLevel: FullVocabularyRowsByLevel,
  inflectedForms: Map<string, string[]>,
): FullVocabularyRowsByLevel {
  const withForms = (rows: FullVocabularyRow[]) =>
    rows.map((row) => ({ ...row, sentenceForms: [...(inflectedForms.get(row.conceptId) ?? []), row.word] }));
  return {
    a1: withForms(rowsByLevel.a1),
    a2: withForms(rowsByLevel.a2),
    b1: withForms(rowsByLevel.b1),
    b2: withForms(rowsByLevel.b2),
    c1: withForms(rowsByLevel.c1),
    c2: withForms(rowsByLevel.c2),
  };
}
