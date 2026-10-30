// Route/content registry for the "100 most common nouns" SEO pages (the
// nounLists family, sibling of verbLists) — one page per (target-language
// list, UI language), e.g. "100 Essential English Nouns". Every target
// language already has a list (common100NounEntries.ts), so a new page is
// one content record — no code change.
//
// All page copy lives in common100NounContent.json, one record per
// (targetLanguage, uiLanguage), both short codes ("en"). The record's
// targetLanguage selects the list (listId = its vocabulary slug, "english").
// A combination with no record has no route, no
// hreflang alternate, and no sitemap entry — the same missing-translation
// convention as the full-vocabulary-list family; nothing renders
// untranslated copy.
//
// Static imports only: this module must stay compilable to CommonJS for the
// Node sitemap tooling once the family joins the sitemap.
import common100NounContentJson from "./common100NounContent.json";
import { getNounList, type NounList } from "./common100NounEntries";
import {
  getUiVocabularyLanguage,
  SUPPORTED_UI_LANGUAGES,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../../shared/slugs";

export interface NounListGuideItem {
  heading: string;
  text: string;
}

// One educational section below the table. Paragraphs come first, then
// optional examples (with **word** marking the emphasised word), then
// optional items laid out as term definitions or as numbered steps.
export interface NounListGuideSection {
  id: string;
  heading: string;
  paragraphs?: string[];
  examples?: string[];
  layout?: "definitions" | "steps";
  items?: NounListGuideItem[];
}

export interface NounListContentEntry {
  // The list's language as a short code ("en"); listId is its slug.
  targetLanguage: UiLanguageCode;
  uiLanguage: UiLanguageCode;
  urlSlug: string;
  // Button text linking to this page from the Explore dropdown and the
  // Learning Resources hub.
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
  table: {
    // Accessible name of the table region.
    label: string;
    number: string;
    word: string;
    // Shown only when the UI language differs from the list's language;
    // required anyway so any record can serve a cross-language page.
    translation: string;
    definition: string;
    sentence: string;
    // Accessible name of each row's speech button ({word} token).
    pronounceLabel: string;
    // Add-to-list column header (visually hidden) and button tooltip.
    addToList: string;
    // Accessible name of each row's add-to-list button ({word} token).
    addToListWord: string;
  };
  // Display label per category key used by the list's rows (the table's
  // category header rows). Every key the dataset uses must be labelled
  // (validated below).
  categories: Record<string, string>;
  guideSections: NounListGuideSection[];
  practice: {
    heading: string;
    description: string;
    buttonLabel: string;
    vocabularyListLabel: string;
  };
}

export interface NounListRoute {
  uiLang: UiLanguageCode;
  listId: string;
  targetLanguage: TargetLanguageSlug;
}

function fail(entryLabel: string, message: string): never {
  throw new Error(`Invalid noun-list content: ${entryLabel} ${message}`);
}

function assertNonEmptyString(
  value: unknown,
  fieldPath: string,
  entryLabel: string,
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(entryLabel, `field "${fieldPath}" must be a non-empty string.`);
  }
}

function assertObject(
  value: unknown,
  fieldPath: string,
  entryLabel: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(entryLabel, `field "${fieldPath}" must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertStringList(
  value: unknown,
  fieldPath: string,
  entryLabel: string,
): void {
  if (!Array.isArray(value) || value.length === 0) {
    fail(entryLabel, `field "${fieldPath}" must be a non-empty array.`);
  }
  value.forEach((item, index) =>
    assertNonEmptyString(item, `${fieldPath}[${index}]`, entryLabel),
  );
}

const REQUIRED_SECTION_FIELDS = {
  metadata: ["metaTitle", "metaDescription", "breadcrumbHomeLabel"],
  hero: ["heading", "intro"],
  table: [
    "label",
    "number",
    "word",
    "translation",
    "definition",
    "sentence",
    "pronounceLabel",
    "addToList",
    "addToListWord",
  ],
  practice: ["heading", "description", "buttonLabel", "vocabularyListLabel"],
} as const;

function validateGuideSection(
  value: unknown,
  fieldPath: string,
  entryLabel: string,
): void {
  const section = assertObject(value, fieldPath, entryLabel);
  assertNonEmptyString(section.id, `${fieldPath}.id`, entryLabel);
  assertNonEmptyString(section.heading, `${fieldPath}.heading`, entryLabel);
  if (section.paragraphs !== undefined) {
    assertStringList(section.paragraphs, `${fieldPath}.paragraphs`, entryLabel);
  }
  if (section.examples !== undefined) {
    assertStringList(section.examples, `${fieldPath}.examples`, entryLabel);
  }
  if (section.items !== undefined) {
    if (section.layout !== "definitions" && section.layout !== "steps") {
      fail(
        entryLabel,
        `field "${fieldPath}.layout" must be "definitions" or "steps" when items are present.`,
      );
    }
    if (!Array.isArray(section.items) || section.items.length === 0) {
      fail(entryLabel, `field "${fieldPath}.items" must be a non-empty array.`);
    }
    section.items.forEach((item, index) => {
      const itemRecord = assertObject(
        item,
        `${fieldPath}.items[${index}]`,
        entryLabel,
      );
      assertNonEmptyString(
        itemRecord.heading,
        `${fieldPath}.items[${index}].heading`,
        entryLabel,
      );
      assertNonEmptyString(
        itemRecord.text,
        `${fieldPath}.items[${index}].text`,
        entryLabel,
      );
    });
  }
  if (
    section.paragraphs === undefined &&
    section.examples === undefined &&
    section.items === undefined
  ) {
    fail(
      entryLabel,
      `field "${fieldPath}" has no paragraphs, examples, or items.`,
    );
  }
}

function validateEntry(
  value: unknown,
  index: number,
): { entry: NounListContentEntry; list: NounList } {
  const entryLabel = `entry #${index}`;
  const record = assertObject(value, "$", entryLabel);

  if (
    !(SUPPORTED_UI_LANGUAGES as readonly unknown[]).includes(record.targetLanguage)
  ) {
    fail(
      entryLabel,
      `has unsupported targetLanguage ${JSON.stringify(record.targetLanguage)} (expected a short code such as "en").`,
    );
  }
  const list = getNounList(getUiVocabularyLanguage(record.targetLanguage as UiLanguageCode));
  if (!list) {
    fail(entryLabel, `has no noun list for targetLanguage ${JSON.stringify(record.targetLanguage)}.`);
  }
  if (
    !(SUPPORTED_UI_LANGUAGES as readonly unknown[]).includes(record.uiLanguage)
  ) {
    fail(
      entryLabel,
      `has unsupported uiLanguage ${JSON.stringify(record.uiLanguage)}.`,
    );
  }
  assertNonEmptyString(record.urlSlug, "urlSlug", entryLabel);
  assertNonEmptyString(record.entryButtonLabel, "entryButtonLabel", entryLabel);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.urlSlug as string)) {
    fail(entryLabel, `field "urlSlug" must be a lowercase kebab-case slug.`);
  }

  for (const [section, fields] of Object.entries(REQUIRED_SECTION_FIELDS)) {
    const sectionValue = assertObject(record[section], section, entryLabel);
    for (const field of fields) {
      assertNonEmptyString(
        sectionValue[field],
        `${section}.${field}`,
        entryLabel,
      );
    }
  }

  const categories = assertObject(record.categories, "categories", entryLabel);
  for (const row of list.rows) {
    assertNonEmptyString(
      categories[row.category],
      `categories.${row.category}`,
      entryLabel,
    );
  }

  if (!Array.isArray(record.guideSections)) {
    fail(entryLabel, `field "guideSections" must be an array.`);
  }
  record.guideSections.forEach((section, sectionIndex) =>
    validateGuideSection(section, `guideSections[${sectionIndex}]`, entryLabel),
  );

  return { entry: record as unknown as NounListContentEntry, list };
}

interface ResolvedContent {
  entry: NounListContentEntry;
  list: NounList;
  path: string;
}

function lookupKey(listId: string, uiLanguage: string): string {
  return `${listId}::${uiLanguage}`;
}

function buildContentLookup(rawContent: unknown): Map<string, ResolvedContent> {
  if (!Array.isArray(rawContent)) {
    throw new Error("Invalid noun-list content: expected a top-level array.");
  }

  const lookup = new Map<string, ResolvedContent>();
  const seenPaths = new Set<string>();
  // URL slugs stay English: every UI-language page of one list shares a
  // slug and differs only in the /{uiLanguage}/ prefix, so one slug per list.
  const slugByList = new Map<string, string>();

  rawContent.forEach((rawEntry, index) => {
    const { entry, list } = validateEntry(rawEntry, index);
    const key = lookupKey(list.id, entry.uiLanguage);
    if (lookup.has(key)) {
      fail(
        `entry #${index}`,
        `duplicates targetLanguage="${entry.targetLanguage}", uiLanguage="${entry.uiLanguage}".`,
      );
    }
    const path = `/${entry.uiLanguage}/${entry.urlSlug}`;
    if (seenPaths.has(path)) {
      fail(`entry #${index}`, `duplicates route path "${path}".`);
    }
    seenPaths.add(path);
    const listSlug = slugByList.get(list.id);
    if (listSlug === undefined) {
      slugByList.set(list.id, entry.urlSlug);
    } else if (listSlug !== entry.urlSlug) {
      fail(
        `entry #${index}`,
        `urlSlug "${entry.urlSlug}" differs from "${listSlug}" used by other targetLanguage="${entry.targetLanguage}" records; all UI languages of a list share one English slug.`,
      );
    }
    lookup.set(key, { entry, list, path });
  });

  return lookup;
}

const NOUN_LIST_CONTENT_LOOKUP = buildContentLookup(common100NounContentJson);

export function getNounListContent(
  listId: string,
  uiLanguage: UiLanguageCode,
): NounListContentEntry | null {
  return (
    NOUN_LIST_CONTENT_LOOKUP.get(lookupKey(listId, uiLanguage))?.entry ?? null
  );
}

export function getNounListPath(
  listId: string,
  uiLanguage: UiLanguageCode,
): string | null {
  return (
    NOUN_LIST_CONTENT_LOOKUP.get(lookupKey(listId, uiLanguage))?.path ?? null
  );
}

export function getAllNounListPaths(): string[] {
  return Array.from(
    NOUN_LIST_CONTENT_LOOKUP.values(),
    (resolved) => resolved.path,
  );
}

export function resolveNounListRoute(path: string): NounListRoute | null {
  for (const resolved of NOUN_LIST_CONTENT_LOOKUP.values()) {
    if (resolved.path === path) {
      return {
        uiLang: resolved.entry.uiLanguage,
        listId: resolved.list.id,
        targetLanguage: resolved.list.targetLanguage,
      };
    }
  }
  return null;
}
