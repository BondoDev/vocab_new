// Route/content registry for the "Full Vocabulary List" SEO page family —
// one comprehensive A1–C2 vocabulary directory per target language. This is
// the single import surface for routing, SSR/prerender, sitemap generation,
// metadata, and the page component.
//
// All user-facing page copy lives in fullVocabularyListContent.json, one
// record per (targetLanguage, uiLanguage) combination, following the same
// per-family SEO-content pattern as the verb-list families rather than the
// interface JSON (whose t() has no English fallback and isn't available to
// the Node-only sitemap tooling). A combination with no record has no
// route, no hreflang alternate, and no sitemap entry — that is this family's
// missing-translation convention; nothing ever renders untranslated copy.
//
// Deliberately static-import-only (no import.meta.glob): this file is
// compiled to CommonJS by scripts/lib/load-full-vocabulary-list-registry.mjs
// for the sitemap generator, mirroring pastForms100VerbRegistry.ts. Keep
// glob-backed modules (e.g. future vocabulary-entry shards) out of this
// file's import graph.
import fullVocabularyListContentJson from "./fullVocabularyListContent.json";
import {
  SUPPORTED_LEVELS,
  getUiVocabularyLanguage,
  SUPPORTED_UI_LANGUAGES,
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../shared/slugs";

export interface FullVocabularyListLevelContent {
  level: Level;
  name: string;
  description: string;
}

export interface LearningOptionContent {
  heading: string;
  description: string;
  buttonLabel: string;
}

export interface FullVocabularyListContentEntry {
  targetLanguage: TargetLanguageSlug;
  uiLanguage: UiLanguageCode;
  urlSlug: string;
  // Label for this page's entry in the Explore page's target-language dropdown.
  entryButtonLabel: string;
  metadata: {
    metaTitle: string;
    metaDescription: string;
    breadcrumbHomeLabel: string;
  };
  hero: {
    heading: string;
    intro: string;
  };
  globalFilters: {
    searchLabel: string;
    searchPlaceholder: string;
    categoryLabel: string;
    categoryAllOption: string;
    // The category popup shown instead of the dropdown below 582px: its
    // commit button and its ✕ button's accessible name.
    categoryApplyLabel: string;
    categoryCloseLabel: string;
    resetLabel: string;
    resultsLabel: string;
  };
  levelsSection: {
    heading: string;
    // Optional supporting line under the heading.
    description?: string;
    // Optional accordion-header heading text ({level}, {name} tokens), e.g.
    // "{level} English Vocabulary — {name}". When absent the header's
    // visible text serves as its heading.
    levelHeadingTemplate?: string;
  };
  // Always exactly the six CEFR levels in A1→C2 order (validated below).
  levels: FullVocabularyListLevelContent[];
  // Strings containing {level}, {shown}, {total}, or {count} tokens are
  // templates; see formatContentTemplate().
  levelPanel: {
    filtersLabel: string;
    searchLabel: string;
    searchPlaceholder: string;
    categoryLabel: string;
    categoryAllOption: string;
    categoryApplyLabel: string;
    categoryCloseLabel: string;
    resetLabel: string;
    tableLabel: string;
    tableColumns: {
      number: string;
      word: string;
      // Shown only when the UI language differs from the table's language;
      // required anyway so any record can serve as a cross-language page.
      translation: string;
      definition: string;
      sentence: string;
      grammarType: string;
      // Screen-reader-only header of the per-row "⋮" button column.
      actions: string;
    };
    // Accessible name for each row's pronunciation button ({word} token).
    pronounceLabel: string;
    // Accessible name for each row's "⋮" button ({word} token).
    rowActionsLabel: string;
    // Item of that "⋮" menu (opens the add-to-list dialog).
    addToListLabel: string;
    loadingLabel: string;
    loadErrorLabel: string;
    retryLabel: string;
    emptyLabel: string;
    noMatchesLabel: string;
    headerCountLabel: string;
    headerFilteredCountLabel: string;
    shownCountLabel: string;
    loadMoreLabel: string;
    // Mobile (< 582px) row toggle that reveals definition, sentence, type.
    detailsLabel: string;
    hideLabel: string;
  };
  // Display labels for the vocabulary data's `type` values.
  grammarTypes: Record<GrammarTypeKey, string>;
  // The educational sections below the vocabulary directory are optional per
  // record: a UI language shows them only once its own copy is authored, so
  // no record ever renders invented or untranslated text. Each is validated
  // in full when present.
  cefrSection?: {
    heading: string;
    paragraph: string;
    // "{level} — {name}" (level names come from `levels`).
    levelLabelTemplate: string;
    levelSummaries: Record<Level, string>;
  };
  learningSection?: {
    heading: string;
    intro: string;
    tips: Array<{ heading: string; text: string }>;
  };
  // "Start learning" section: two entry points into the app, each a heading,
  // one line, and one action (sign-up for personalized learning, the
  // custom-practice setup for free practice).
  learningOptions?: {
    heading: string;
    description: string;
    personalized: LearningOptionContent;
    freePractice: LearningOptionContent;
  };
  faq?: {
    heading: string;
    items: Array<{ question: string; answer: string }>;
  };
  // Older single "how to use" paragraph, kept for records that don't have
  // learningSection yet (rendered only when learningSection is absent).
  howToUse?: {
    heading: string;
    paragraph: string;
  };
}

// Every `type` value used across src/data/vocabulary/*/vocabulary.json. Each
// content record must label all of them, so any target language's list can
// render without falling back to the raw English key.
export const GRAMMAR_TYPE_KEYS = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "preposition",
  "pronoun",
  "determiner",
  "conjunction",
  "exclamation",
  "interjection",
  "expression",
] as const;

export type GrammarTypeKey = (typeof GRAMMAR_TYPE_KEYS)[number];

const TABLE_COLUMN_KEYS = ["number", "word", "translation", "definition", "sentence", "grammarType", "actions"] as const;

// Required string fields per object section, checked at module load so a
// malformed record fails the build/sitemap run instead of rendering blanks.
const REQUIRED_SECTION_FIELDS = {
  metadata: ["metaTitle", "metaDescription", "breadcrumbHomeLabel"],
  hero: ["heading", "intro"],
  globalFilters: [
    "searchLabel",
    "searchPlaceholder",
    "categoryLabel",
    "categoryAllOption",
    "categoryApplyLabel",
    "categoryCloseLabel",
    "resetLabel",
    "resultsLabel",
  ],
  levelsSection: ["heading"],
  levelPanel: [
    "filtersLabel",
    "searchLabel",
    "searchPlaceholder",
    "categoryLabel",
    "categoryAllOption",
    "categoryApplyLabel",
    "categoryCloseLabel",
    "resetLabel",
    "tableLabel",
    "pronounceLabel",
    "rowActionsLabel",
    "addToListLabel",
    "loadingLabel",
    "loadErrorLabel",
    "retryLabel",
    "emptyLabel",
    "noMatchesLabel",
    "headerCountLabel",
    "headerFilteredCountLabel",
    "shownCountLabel",
    "loadMoreLabel",
    "detailsLabel",
    "hideLabel",
  ],
} as const;

// Optional sections: when present, every listed string must be non-empty.
const OPTIONAL_SECTION_FIELDS = {
  cefrSection: ["heading", "paragraph", "levelLabelTemplate"],
  learningSection: ["heading", "intro"],
  learningOptions: ["heading", "description"],
  faq: ["heading"],
  howToUse: ["heading", "paragraph"],
} as const;

function assertItemList(
  value: unknown,
  fieldPath: string,
  fields: readonly string[],
  entryLabel: string,
): void {
  if (!Array.isArray(value) || value.length === 0) {
    fail(entryLabel, `field "${fieldPath}" must be a non-empty array.`);
  }
  value.forEach((item, itemIndex) => {
    const itemRecord = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    for (const field of fields) {
      assertNonEmptyString(itemRecord[field], `${fieldPath}[${itemIndex}].${field}`, entryLabel);
    }
  });
}

function fail(entryLabel: string, message: string): never {
  throw new Error(`Invalid full-vocabulary-list content: ${entryLabel} ${message}`);
}

function assertNonEmptyString(value: unknown, fieldPath: string, entryLabel: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(entryLabel, `field "${fieldPath}" must be a non-empty string.`);
  }
}

function assertObject(value: unknown, fieldPath: string, entryLabel: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(entryLabel, `field "${fieldPath}" must be an object.`);
  }
  return value as Record<string, unknown>;
}

function validateEntry(value: unknown, index: number): FullVocabularyListContentEntry {
  const entryLabel = `entry #${index}`;
  const record = assertObject(value, "$", entryLabel);

  // The JSON names both languages by short code ("en"), like the verb-list
  // content files; the rest of the app uses full target-language slugs
  // ("english"), so the code is converted once here (see the return below).
  if (!(SUPPORTED_UI_LANGUAGES as readonly unknown[]).includes(record.targetLanguage)) {
    fail(entryLabel, `has unsupported targetLanguage ${JSON.stringify(record.targetLanguage)} (expected a short code such as "en").`);
  }
  if (!(SUPPORTED_UI_LANGUAGES as readonly unknown[]).includes(record.uiLanguage)) {
    fail(entryLabel, `has unsupported uiLanguage ${JSON.stringify(record.uiLanguage)}.`);
  }
  assertNonEmptyString(record.urlSlug, "urlSlug", entryLabel);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.urlSlug as string)) {
    fail(entryLabel, `field "urlSlug" must be a lowercase kebab-case slug.`);
  }
  assertNonEmptyString(record.entryButtonLabel, "entryButtonLabel", entryLabel);

  for (const [section, fields] of Object.entries(REQUIRED_SECTION_FIELDS)) {
    const sectionValue = assertObject(record[section], section, entryLabel);
    for (const field of fields) {
      assertNonEmptyString(sectionValue[field], `${section}.${field}`, entryLabel);
    }
  }

  for (const [section, fields] of Object.entries(OPTIONAL_SECTION_FIELDS)) {
    if (record[section] === undefined) {
      continue;
    }
    const sectionValue = assertObject(record[section], section, entryLabel);
    for (const field of fields) {
      assertNonEmptyString(sectionValue[field], `${section}.${field}`, entryLabel);
    }
  }
  if (record.cefrSection !== undefined) {
    const summaries = assertObject(
      (record.cefrSection as Record<string, unknown>).levelSummaries,
      "cefrSection.levelSummaries",
      entryLabel,
    );
    for (const level of SUPPORTED_LEVELS) {
      assertNonEmptyString(summaries[level], `cefrSection.levelSummaries.${level}`, entryLabel);
    }
  }
  if (record.learningSection !== undefined) {
    assertItemList((record.learningSection as Record<string, unknown>).tips, "learningSection.tips", ["heading", "text"], entryLabel);
  }
  if (record.learningOptions !== undefined) {
    const options = record.learningOptions as Record<string, unknown>;
    for (const option of ["personalized", "freePractice"]) {
      const optionRecord = assertObject(options[option], `learningOptions.${option}`, entryLabel);
      for (const field of ["heading", "description", "buttonLabel"]) {
        assertNonEmptyString(optionRecord[field], `learningOptions.${option}.${field}`, entryLabel);
      }
    }
  }
  if (record.faq !== undefined) {
    assertItemList((record.faq as Record<string, unknown>).items, "faq.items", ["question", "answer"], entryLabel);
  }
  const levelsSection = record.levelsSection as Record<string, unknown>;
  for (const optionalField of ["description", "levelHeadingTemplate"]) {
    if (levelsSection[optionalField] !== undefined) {
      assertNonEmptyString(levelsSection[optionalField], `levelsSection.${optionalField}`, entryLabel);
    }
  }

  const tableColumns = assertObject(
    (record.levelPanel as Record<string, unknown>).tableColumns,
    "levelPanel.tableColumns",
    entryLabel,
  );
  for (const key of TABLE_COLUMN_KEYS) {
    assertNonEmptyString(tableColumns[key], `levelPanel.tableColumns.${key}`, entryLabel);
  }

  const grammarTypes = assertObject(record.grammarTypes, "grammarTypes", entryLabel);
  for (const key of GRAMMAR_TYPE_KEYS) {
    assertNonEmptyString(grammarTypes[key], `grammarTypes.${key}`, entryLabel);
  }

  const levels = record.levels;
  if (!Array.isArray(levels) || levels.length !== SUPPORTED_LEVELS.length) {
    fail(entryLabel, `field "levels" must list all ${SUPPORTED_LEVELS.length} CEFR levels.`);
  }
  levels.forEach((rawLevel, levelIndex) => {
    const levelRecord = assertObject(rawLevel, `levels[${levelIndex}]`, entryLabel);
    if (levelRecord.level !== SUPPORTED_LEVELS[levelIndex]) {
      fail(entryLabel, `field "levels[${levelIndex}].level" must be "${SUPPORTED_LEVELS[levelIndex]}" (A1→C2 order).`);
    }
    assertNonEmptyString(levelRecord.name, `levels[${levelIndex}].name`, entryLabel);
    assertNonEmptyString(levelRecord.description, `levels[${levelIndex}].description`, entryLabel);
  });

  return {
    ...record,
    targetLanguage: getUiVocabularyLanguage(record.targetLanguage as UiLanguageCode),
  } as unknown as FullVocabularyListContentEntry;
}

function lookupKey(targetLanguage: string, uiLanguage: string): string {
  return `${targetLanguage}::${uiLanguage}`;
}

function buildContentLookup(rawContent: unknown): Map<string, FullVocabularyListContentEntry> {
  if (!Array.isArray(rawContent)) {
    throw new Error("Invalid full-vocabulary-list content: expected a top-level array.");
  }

  const lookup = new Map<string, FullVocabularyListContentEntry>();
  const seenPaths = new Set<string>();

  rawContent.forEach((rawEntry, index) => {
    const entry = validateEntry(rawEntry, index);
    const key = lookupKey(entry.targetLanguage, entry.uiLanguage);
    if (lookup.has(key)) {
      fail(`entry #${index}`, `duplicates targetLanguage="${entry.targetLanguage}", uiLanguage="${entry.uiLanguage}".`);
    }
    const path = `/${entry.uiLanguage}/${entry.urlSlug}`;
    if (seenPaths.has(path)) {
      fail(`entry #${index}`, `duplicates route path "${path}".`);
    }
    seenPaths.add(path);
    lookup.set(key, entry);
  });

  return lookup;
}

const FULL_VOCABULARY_LIST_CONTENT_LOOKUP = buildContentLookup(fullVocabularyListContentJson);

export function getFullVocabularyListContent(
  targetLanguage: TargetLanguageSlug,
  uiLanguage: UiLanguageCode,
): FullVocabularyListContentEntry | null {
  return FULL_VOCABULARY_LIST_CONTENT_LOOKUP.get(lookupKey(targetLanguage, uiLanguage)) ?? null;
}

export function getFullVocabularyListPath(
  targetLanguage: TargetLanguageSlug,
  uiLanguage: UiLanguageCode,
): string | null {
  const content = getFullVocabularyListContent(targetLanguage, uiLanguage);
  return content ? `/${uiLanguage}/${content.urlSlug}` : null;
}

export function getAllFullVocabularyListPaths(): string[] {
  return Array.from(
    FULL_VOCABULARY_LIST_CONTENT_LOOKUP.values(),
    (entry) => `/${entry.uiLanguage}/${entry.urlSlug}`,
  );
}

export function resolveFullVocabularyListRoute(
  path: string,
): { uiLang: UiLanguageCode; targetLanguage: TargetLanguageSlug } | null {
  for (const entry of FULL_VOCABULARY_LIST_CONTENT_LOOKUP.values()) {
    if (`/${entry.uiLanguage}/${entry.urlSlug}` === path) {
      return { uiLang: entry.uiLanguage, targetLanguage: entry.targetLanguage };
    }
  }
  return null;
}

// Fills {token} placeholders in levelPanel templates (e.g. {level} -> "B1",
// {count} -> "300"). Tokens rather than string concatenation so each UI
// language can place values wherever its word order requires. When a
// locale is given, numeric values get that language's digit grouping
// ("1,224" in English, "1.224" in German).
export function formatContentTemplate(
  template: string,
  values: Record<string, string | number>,
  locale?: string,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (!(key in values)) {
      return match;
    }
    const value = values[key];
    return typeof value === "number" && locale ? value.toLocaleString(locale) : String(value);
  });
}
