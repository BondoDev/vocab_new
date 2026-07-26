// Content shape, validation, and lookup-building for the "100 Most Common
// Verb Past Forms" page family. Mirrors the pattern established by
// ../common100Verbs/common100VerbRouteHelpers.ts, but the content file here
// is a single flat array of (targetLanguage, uiLanguage) records — up to 49,
// one per combination of the project's 7 short language codes — authored by
// hand directly into pastForms100VerbsContent.json, one combination at a
// time. buildPastVerbFormsContentLookup() intentionally accepts any subset
// of the 49 combinations (see its own comment); getMissingPastVerbFormsCombinations()
// is available for a separate completeness check.
//
// Both targetLanguage and uiLanguage use the project's short canonical
// language codes (en/de/es/fr/it/pt/ru) per an explicit product decision —
// unlike the rest of the app, which identifies a target language by its
// full-name TargetLanguageSlug (e.g. "german"). pastForms100VerbRegistry.ts
// converts between the two at the lookup boundary, so this short-code choice
// stays local to this content file and does not ripple into
// routing/App.tsx/entry-server.tsx.
import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "../../shared/slugs";

// The JSON's targetLanguage field is a short code (the same 7-value set as
// UiLanguageCode), not the app-wide full-name TargetLanguageSlug — named
// distinctly here to keep that semantic difference visible at the type level.
export type PastVerbFormsTargetLanguageCode = UiLanguageCode;

export interface PastVerbFormsTableColumns {
  number: string;
  infinitive: string;
  translation: string;
}

// Defines the quantity, order, identity, and localized label of every
// dynamic verb-form column. `key` is a stable identifier a future verb-data
// row will be looked up by (e.g. `row.forms[form.key]`); `label` is the
// localized visible column header for the current uiLanguage.
export interface PastVerbFormsFormColumn {
  key: string;
  label: string;
}

export interface PastVerbFormsMetadata {
  title: string;
  metaTitle: string;
  metaDescription: string;
}

export interface PastVerbFormsHero {
  heading: string;
  subtitle: string;
  introParagraphs: string[];
}

export interface PastVerbFormsOverview {
  heading: string;
  paragraphs: string[];
}

export interface PastVerbFormsTableSectionContent {
  heading: string;
  description: string;
  notes: string[];
}

export interface PastVerbFormsHowToUseStep {
  heading: string;
  text: string;
}

export interface PastVerbFormsHowToUse {
  heading: string;
  steps: PastVerbFormsHowToUseStep[];
}

export interface PastVerbFormsTipItem {
  heading: string;
  text: string;
}

export interface PastVerbFormsTips {
  heading: string;
  items: PastVerbFormsTipItem[];
}

export interface PastVerbFormsCta {
  heading: string;
  description: string;
  primaryLabel: string;
  secondaryLabel: string;
}

// key is resolved against a TypeScript-owned route-builder map (see
// PastVerbFormsSeoPage.tsx) — only the label is authored content. This keeps
// routes in TypeScript and labels in JSON, matching src/data/seo/README.md.
export interface PastVerbFormsRelatedLinkItem {
  key: string;
  label: string;
}

export interface PastVerbFormsRelated {
  heading: string;
  items: PastVerbFormsRelatedLinkItem[];
}

export interface PastVerbFormsFaqItem {
  question: string;
  answer: string;
}

export interface PastVerbFormsFaq {
  heading: string;
  items: PastVerbFormsFaqItem[];
}

export interface PastVerbFormsContent {
  urlSlug: string;
  // Label for buttons on OTHER pages that link to this page — not rendered
  // on this page itself.
  entryButtonLabel: string;
  tableColumns: PastVerbFormsTableColumns;
  pastForms: PastVerbFormsFormColumn[];
  metadata: PastVerbFormsMetadata;
  hero: PastVerbFormsHero;
  overview: PastVerbFormsOverview;
  table: PastVerbFormsTableSectionContent;
  howToUse: PastVerbFormsHowToUse;
  tips: PastVerbFormsTips;
  cta: PastVerbFormsCta;
  related: PastVerbFormsRelated;
  faq: PastVerbFormsFaq;
}

export interface PastVerbFormsContentEntry extends PastVerbFormsContent {
  targetLanguage: PastVerbFormsTargetLanguageCode;
  uiLanguage: UiLanguageCode;
}

export type PastVerbFormsContentLookup = Map<string, PastVerbFormsContentEntry>;

const SUPPORTED_SHORT_CODE_SET: ReadonlySet<string> = new Set(SUPPORTED_UI_LANGUAGES);

function lookupKey(targetLanguageCode: string, uiLanguage: string): string {
  return `${targetLanguageCode}::${uiLanguage}`;
}

function describeEntry(index: number, value: unknown): string {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `entry #${index} (targetLanguage=${JSON.stringify(record.targetLanguage)}, uiLanguage=${JSON.stringify(record.uiLanguage)})`;
  }

  return `entry #${index}`;
}

function assertString(value: unknown, fieldPath: string, entryLabel: string): void {
  if (typeof value !== "string") {
    throw new Error(
      `Invalid past-verb-forms content: ${entryLabel} field "${fieldPath}" must be a string, got ${typeof value}.`,
    );
  }
}

function assertStringArray(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(
      `Invalid past-verb-forms content: ${entryLabel} field "${fieldPath}" must be a string array.`,
    );
  }
}

function assertObject(value: unknown, fieldPath: string, entryLabel: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Invalid past-verb-forms content: ${entryLabel} field "${fieldPath}" must be an object.`,
    );
  }

  return value as Record<string, unknown>;
}

function assertFaqItems(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid past-verb-forms content: ${entryLabel} field "${fieldPath}" must be an array.`,
    );
  }

  value.forEach((item, itemIndex) => {
    const faqItem = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    assertString(faqItem.question, `${fieldPath}[${itemIndex}].question`, entryLabel);
    assertString(faqItem.answer, `${fieldPath}[${itemIndex}].answer`, entryLabel);
  });
}

function assertRelatedItems(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid past-verb-forms content: ${entryLabel} field "${fieldPath}" must be an array.`,
    );
  }

  value.forEach((item, itemIndex) => {
    const relatedItem = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    assertString(relatedItem.key, `${fieldPath}[${itemIndex}].key`, entryLabel);
    assertString(relatedItem.label, `${fieldPath}[${itemIndex}].label`, entryLabel);
  });
}

// Validates howToUse.steps / tips.items — both share the { heading, text } shape.
function assertHeadingTextItems(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid past-verb-forms content: ${entryLabel} field "${fieldPath}" must be an array.`,
    );
  }

  value.forEach((item, itemIndex) => {
    const entryItem = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    assertString(entryItem.heading, `${fieldPath}[${itemIndex}].heading`, entryLabel);
    assertString(entryItem.text, `${fieldPath}[${itemIndex}].text`, entryLabel);
  });
}

function assertTableColumns(value: unknown, fieldPath: string, entryLabel: string): void {
  const columns = assertObject(value, fieldPath, entryLabel);
  assertString(columns.number, `${fieldPath}.number`, entryLabel);
  assertString(columns.infinitive, `${fieldPath}.infinitive`, entryLabel);
  assertString(columns.translation, `${fieldPath}.translation`, entryLabel);
}

// Validates pastForms: an array of { key, label }. Every populated item's
// key must be a non-empty string, unique within the record (form columns are
// looked up by key later, so a duplicate or blank key would be ambiguous).
function assertPastForms(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid past-verb-forms content: ${entryLabel} field "${fieldPath}" must be an array.`,
    );
  }

  const seenKeys = new Set<string>();

  value.forEach((item, itemIndex) => {
    const formColumn = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    assertString(formColumn.key, `${fieldPath}[${itemIndex}].key`, entryLabel);
    assertString(formColumn.label, `${fieldPath}[${itemIndex}].label`, entryLabel);

    const key = formColumn.key as string;
    if (key.length === 0) {
      throw new Error(
        `Invalid past-verb-forms content: ${entryLabel} field "${fieldPath}[${itemIndex}].key" must be non-empty.`,
      );
    }

    if (seenKeys.has(key)) {
      throw new Error(
        `Invalid past-verb-forms content: ${entryLabel} has duplicate pastForms key "${key}".`,
      );
    }

    seenKeys.add(key);
  });
}

// Validates one raw JSON record's full shape (every required key present,
// every field the correct primitive/array/object type) and returns it
// narrowed to PastVerbFormsContentEntry. Throws a descriptive Error
// identifying the offending entry and field path on any malformed structure.
function validateContentEntryShape(value: unknown, index: number): PastVerbFormsContentEntry {
  const entryLabel = describeEntry(index, value);
  const record = assertObject(value, "$", entryLabel);

  assertString(record.targetLanguage, "targetLanguage", entryLabel);
  assertString(record.uiLanguage, "uiLanguage", entryLabel);

  if (!SUPPORTED_SHORT_CODE_SET.has(record.targetLanguage as string)) {
    throw new Error(
      `Invalid past-verb-forms content: ${entryLabel} has unsupported targetLanguage "${String(record.targetLanguage)}".`,
    );
  }

  if (!SUPPORTED_SHORT_CODE_SET.has(record.uiLanguage as string)) {
    throw new Error(
      `Invalid past-verb-forms content: ${entryLabel} has unsupported uiLanguage "${String(record.uiLanguage)}".`,
    );
  }

  assertString(record.urlSlug, "urlSlug", entryLabel);
  assertString(record.entryButtonLabel, "entryButtonLabel", entryLabel);
  assertTableColumns(record.tableColumns, "tableColumns", entryLabel);
  assertPastForms(record.pastForms, "pastForms", entryLabel);

  const metadata = assertObject(record.metadata, "metadata", entryLabel);
  assertString(metadata.title, "metadata.title", entryLabel);
  assertString(metadata.metaTitle, "metadata.metaTitle", entryLabel);
  assertString(metadata.metaDescription, "metadata.metaDescription", entryLabel);

  const hero = assertObject(record.hero, "hero", entryLabel);
  assertString(hero.heading, "hero.heading", entryLabel);
  assertString(hero.subtitle, "hero.subtitle", entryLabel);
  assertStringArray(hero.introParagraphs, "hero.introParagraphs", entryLabel);

  const overview = assertObject(record.overview, "overview", entryLabel);
  assertString(overview.heading, "overview.heading", entryLabel);
  assertStringArray(overview.paragraphs, "overview.paragraphs", entryLabel);

  const table = assertObject(record.table, "table", entryLabel);
  assertString(table.heading, "table.heading", entryLabel);
  assertString(table.description, "table.description", entryLabel);
  assertStringArray(table.notes, "table.notes", entryLabel);

  const howToUse = assertObject(record.howToUse, "howToUse", entryLabel);
  assertString(howToUse.heading, "howToUse.heading", entryLabel);
  assertHeadingTextItems(howToUse.steps, "howToUse.steps", entryLabel);

  const tips = assertObject(record.tips, "tips", entryLabel);
  assertString(tips.heading, "tips.heading", entryLabel);
  assertHeadingTextItems(tips.items, "tips.items", entryLabel);

  const cta = assertObject(record.cta, "cta", entryLabel);
  assertString(cta.heading, "cta.heading", entryLabel);
  assertString(cta.description, "cta.description", entryLabel);
  assertString(cta.primaryLabel, "cta.primaryLabel", entryLabel);
  assertString(cta.secondaryLabel, "cta.secondaryLabel", entryLabel);

  const related = assertObject(record.related, "related", entryLabel);
  assertString(related.heading, "related.heading", entryLabel);
  assertRelatedItems(related.items, "related.items", entryLabel);

  const faq = assertObject(record.faq, "faq", entryLabel);
  assertString(faq.heading, "faq.heading", entryLabel);
  assertFaqItems(faq.items, "faq.items", entryLabel);

  return record as unknown as PastVerbFormsContentEntry;
}

// Builds the (targetLanguage, uiLanguage) -> content lookup from the flat
// JSON array, validating every present entry's shape and rejecting duplicate
// combinations. Deliberately does NOT require all 49 combinations to be
// present: this runs eagerly at module-import time (App.tsx imports it
// unconditionally via pageRouting.ts), and content is authored by hand one
// (targetLanguage, uiLanguage) combination at a time — a hard "must be
// complete" gate here would crash the entire site, not just an unfinished
// past-verb-forms page, for as long as any combination remains unauthored.
// Use assertPastVerbFormsContentComplete() below for a completeness check
// that isn't wired into the app's load path. Throws a single descriptive
// Error on the first shape/duplicate problem found rather than returning a
// partially-valid lookup, so a malformed content file still fails fast.
export function buildPastVerbFormsContentLookup(rawContent: unknown): PastVerbFormsContentLookup {
  if (!Array.isArray(rawContent)) {
    throw new Error("Invalid past-verb-forms content: expected a top-level array.");
  }

  const lookup: PastVerbFormsContentLookup = new Map();

  rawContent.forEach((rawEntry, index) => {
    const entry = validateContentEntryShape(rawEntry, index);
    const key = lookupKey(entry.targetLanguage, entry.uiLanguage);

    if (lookup.has(key)) {
      throw new Error(
        `Invalid past-verb-forms content: duplicate combination targetLanguage="${entry.targetLanguage}", uiLanguage="${entry.uiLanguage}" (entry #${index}).`,
      );
    }

    lookup.set(key, entry);
  });

  return lookup;
}

// Returns every (targetLanguage, uiLanguage) combination that has no record
// yet, in "targetLanguage/uiLanguage" form. Empty once all 49 combinations
// have been authored. Intended for a manual/CI completeness check — not
// called from buildPastVerbFormsContentLookup (see comment above).
export function getMissingPastVerbFormsCombinations(lookup: PastVerbFormsContentLookup): string[] {
  return SUPPORTED_UI_LANGUAGES.flatMap((targetLanguage) =>
    SUPPORTED_UI_LANGUAGES.filter((uiLanguage) => !lookup.has(lookupKey(targetLanguage, uiLanguage))).map(
      (uiLanguage) => `${targetLanguage}/${uiLanguage}`,
    ),
  );
}

export function getPastVerbFormsContentEntry(
  lookup: PastVerbFormsContentLookup,
  targetLanguageCode: PastVerbFormsTargetLanguageCode,
  uiLanguage: UiLanguageCode,
): PastVerbFormsContentEntry | null {
  return lookup.get(lookupKey(targetLanguageCode, uiLanguage)) ?? null;
}
