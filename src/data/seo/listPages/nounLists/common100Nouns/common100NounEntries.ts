// Rows for the "100 most common nouns" SEO pages. common100NounList.json is
// one language-independent list — position (`N`), `concept_id`, and an
// English category label — shared by every target-language page: each page
// shows that language's word for the concept. The words, definitions,
// sentences and translations come from the generated details
// (common100NounDetails.ts), joined by concept id.
//
// The JSON's category labels are turned into stable keys ("People & Family"
// -> "people-family"); each page's content record (common100NounContent.json)
// supplies the displayed, UI-language label per key.
//
// Static imports only (no import.meta.glob): the registry imports this module
// and must stay compilable to CommonJS for the Node sitemap tooling, like the
// other list-page registries.
import common100NounListJson from "./common100NounList.json";
import { SUPPORTED_TARGET_LANGUAGES, type TargetLanguageSlug } from "../../../shared/slugs";

export interface NounListRow {
  // 1-based display position (`N`); rows are always served in this order.
  order: number;
  // Vocabulary concept id (e.g. "A1-00768"), as in src/data/vocabulary.
  conceptId: string;
  // Category key derived from the list's label (see toCategoryKey).
  category: string;
}

export interface NounList {
  // Target language's vocabulary folder name, e.g. "english".
  id: string;
  targetLanguage: TargetLanguageSlug;
  // BCP 47 tag for the word's `lang` attribute and browser speech.
  speechLang: string;
  // The number of words the finished list contains (the "100" in the page
  // title). Until rows.length reaches it the list is incomplete and its pages
  // stay noindex regardless of the launch flag (see
  // src/seo/listPages/nounLists/common100Nouns/common100NounsLaunchStatus.ts).
  expectedWordCount: number;
  rows: NounListRow[];
}

// Every target language has a noun list (the same 100 concepts in its own
// words); a page exists for a (target, UI language) pair only once
// common100NounContent.json has a record for it. Voice locales match the
// full vocabulary list's and the verb lists'. Kept local rather than
// imported from fullVocabularyListEntries.ts, whose dynamic vocabulary
// imports must stay out of this sitemap-compiled module.
const NOUN_LIST_SPEECH_LANG: Record<TargetLanguageSlug, string> = {
  english: "en-US",
  spanish: "es-ES",
  french: "fr-FR",
  german: "de-DE",
  italian: "it-IT",
  portuguese: "pt-PT",
  russian: "ru-RU",
};

const EXPECTED_WORD_COUNT = 100;

function fail(message: string): never {
  throw new Error(`Invalid common100NounList.json: ${message}`);
}

export function toCategoryKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Checked at module load so a malformed list fails the build instead of
// rendering a broken table. `N` must run 1..n without gaps so the displayed
// numbers stay stable when rows are added or edited.
function validateRows(raw: unknown): NounListRow[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    fail("expected a non-empty array.");
  }

  const seenConceptIds = new Set<string>();
  const rows = raw.map((entry: unknown, index: number): NounListRow => {
    const row = (entry ?? {}) as Record<string, unknown>;
    if (row.N !== index + 1) {
      fail(`[${index}].N must be ${index + 1} (consecutive, starting at 1).`);
    }
    if (typeof row.concept_id !== "string" || !/^[A-C][12]-\d+$/.test(row.concept_id)) {
      fail(`[${index}].concept_id must be a vocabulary concept id such as "A1-00768".`);
    }
    if (seenConceptIds.has(row.concept_id)) {
      fail(`[${index}].concept_id "${row.concept_id}" is duplicated.`);
    }
    seenConceptIds.add(row.concept_id);
    const category = typeof row.category === "string" ? toCategoryKey(row.category) : "";
    if (!category) {
      fail(`[${index}].category must be a non-empty label such as "People & Family".`);
    }
    return { order: index + 1, conceptId: row.concept_id, category };
  });

  // The table shows one header row per category above that category's
  // words, so each category must be one contiguous block; otherwise it would
  // appear twice, or the numbering would have to jump around.
  const closedCategories = new Set<string>();
  rows.forEach((row, index) => {
    const previous = rows[index - 1]?.category;
    if (previous !== undefined && previous !== row.category) {
      closedCategories.add(previous);
    }
    if (closedCategories.has(row.category)) {
      fail(`[${index}].category "${row.category}" must be contiguous with its earlier entries.`);
    }
  });

  if (rows.length > EXPECTED_WORD_COUNT) {
    fail(`has ${rows.length} entries but the list is capped at ${EXPECTED_WORD_COUNT}.`);
  }
  return rows;
}

const ROWS = validateRows(common100NounListJson);

const NOUN_LISTS: ReadonlyMap<string, NounList> = new Map(
  SUPPORTED_TARGET_LANGUAGES.map((targetLanguage) => [
    targetLanguage,
    {
      id: targetLanguage,
      targetLanguage,
      speechLang: NOUN_LIST_SPEECH_LANG[targetLanguage],
      expectedWordCount: EXPECTED_WORD_COUNT,
      rows: ROWS,
    },
  ]),
);

export function getNounList(listId: string): NounList | null {
  return NOUN_LISTS.get(listId) ?? null;
}

export function isNounListComplete(list: NounList): boolean {
  return list.rows.length === list.expectedWordCount;
}
