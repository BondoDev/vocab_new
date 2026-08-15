import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "../../shared/slugs";

export type ConjugatedVerbFormsTargetLanguageCode = UiLanguageCode;

export interface ConjugatedVerbFormsTableColumns {
  number: string;
  infinitive: string;
  meaning: string;
}

export interface ConjugatedVerbFormsPronounColumn {
  key: string;
  label: string;
}

export interface ConjugatedVerbFormsMetadata {
  title: string;
  metaTitle: string;
  metaDescription: string;
}

export interface ConjugatedVerbFormsHero {
  heading: string;
  subtitle: string;
  introParagraphs: string[];
}

export interface ConjugatedVerbFormsTextSection {
  heading: string;
  paragraphs: string[];
}

export interface ConjugatedVerbFormsTenseGroup {
  key: string;
  label: string;
}

export interface ConjugatedVerbFormsTenseSelector {
  heading: string;
  description: string;
  defaultTense: string;
  groups: ConjugatedVerbFormsTenseGroup[];
}

export interface ConjugatedVerbFormsGrammar {
  heading: string;
  description: string;
  formula: string;
  additionalFormula?: string;
}

export interface ConjugatedVerbFormsTense {
  key: string;
  label: string;
  group: string;
  tableHeading: string;
  tableDescription: string;
  grammar: ConjugatedVerbFormsGrammar;
}

export interface ConjugatedVerbFormsTableSectionContent {
  heading: string;
  description: string;
  scrollHint: string;
  scrollLeftLabel: string;
  scrollRightLabel: string;
  notes: string[];
}

export interface ConjugatedVerbFormsRuleItem {
  heading: string;
  text: string;
  examples: string[];
}

export interface ConjugatedVerbFormsRules {
  heading: string;
  intro: string;
  items: ConjugatedVerbFormsRuleItem[];
}

export interface ConjugatedVerbFormsMistakeItem {
  incorrect: string;
  correct: string;
  explanation: string;
}

export interface ConjugatedVerbFormsCommonMistakes {
  heading: string;
  intro: string;
  items: ConjugatedVerbFormsMistakeItem[];
}

export interface ConjugatedVerbFormsHeadingTextItem {
  heading: string;
  text: string;
}

export interface ConjugatedVerbFormsHowToUse {
  heading: string;
  steps: ConjugatedVerbFormsHeadingTextItem[];
}

export interface ConjugatedVerbFormsTips {
  heading: string;
  items: ConjugatedVerbFormsHeadingTextItem[];
}

export interface ConjugatedVerbFormsCta {
  heading: string;
  description: string;
  primaryLabel: string;
  secondaryLabel: string;
}

export interface ConjugatedVerbFormsRelatedLinkItem {
  key: string;
  label: string;
}

export interface ConjugatedVerbFormsRelated {
  heading: string;
  items: ConjugatedVerbFormsRelatedLinkItem[];
}

export interface ConjugatedVerbFormsFaqItem {
  question: string;
  answer: string;
}

export interface ConjugatedVerbFormsFaq {
  heading: string;
  items: ConjugatedVerbFormsFaqItem[];
}

export interface ConjugatedVerbFormsContent {
  urlSlug: string;
  entryButtonLabel: string;
  tableColumns: ConjugatedVerbFormsTableColumns;
  pronounForms: ConjugatedVerbFormsPronounColumn[];
  metadata: ConjugatedVerbFormsMetadata;
  hero: ConjugatedVerbFormsHero;
  overview: ConjugatedVerbFormsTextSection;
  tenseSelector: ConjugatedVerbFormsTenseSelector;
  tenses: ConjugatedVerbFormsTense[];
  table: ConjugatedVerbFormsTableSectionContent;
  rules: ConjugatedVerbFormsRules;
  commonMistakes: ConjugatedVerbFormsCommonMistakes;
  howToUse: ConjugatedVerbFormsHowToUse;
  tips: ConjugatedVerbFormsTips;
  cta: ConjugatedVerbFormsCta;
  related: ConjugatedVerbFormsRelated;
  faq: ConjugatedVerbFormsFaq;
}

export interface ConjugatedVerbFormsContentEntry extends ConjugatedVerbFormsContent {
  targetLanguage: ConjugatedVerbFormsTargetLanguageCode;
  uiLanguage: UiLanguageCode;
}

export type ConjugatedVerbFormsContentLookup = Map<string, ConjugatedVerbFormsContentEntry>;

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
      `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}" must be a string, got ${typeof value}.`,
    );
  }
}

function assertStringArray(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}" must be a string array.`,
    );
  }
}

function assertObject(value: unknown, fieldPath: string, entryLabel: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}" must be an object.`,
    );
  }

  return value as Record<string, unknown>;
}

function assertHeadingTextItems(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}" must be an array.`,
    );
  }

  value.forEach((item, itemIndex) => {
    const entryItem = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    assertString(entryItem.heading, `${fieldPath}[${itemIndex}].heading`, entryLabel);
    assertString(entryItem.text, `${fieldPath}[${itemIndex}].text`, entryLabel);
  });
}

function assertPronounForms(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}" must be an array.`,
    );
  }

  const seenKeys = new Set<string>();

  value.forEach((item, itemIndex) => {
    const column = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    assertString(column.key, `${fieldPath}[${itemIndex}].key`, entryLabel);
    assertString(column.label, `${fieldPath}[${itemIndex}].label`, entryLabel);

    const key = column.key as string;
    if (key.length === 0) {
      throw new Error(
        `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}[${itemIndex}].key" must be non-empty.`,
      );
    }

    if (seenKeys.has(key)) {
      throw new Error(
        `Invalid conjugated-verb-forms content: ${entryLabel} has duplicate pronounForms key "${key}".`,
      );
    }

    seenKeys.add(key);
  });
}

function assertTenseGroups(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}" must be an array.`,
    );
  }

  const seenKeys = new Set<string>();

  value.forEach((item, itemIndex) => {
    const group = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    assertString(group.key, `${fieldPath}[${itemIndex}].key`, entryLabel);
    assertString(group.label, `${fieldPath}[${itemIndex}].label`, entryLabel);

    const key = group.key as string;
    if (!key) {
      throw new Error(
        `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}[${itemIndex}].key" must be non-empty.`,
      );
    }

    if (seenKeys.has(key)) {
      throw new Error(
        `Invalid conjugated-verb-forms content: ${entryLabel} has duplicate tenseSelector.groups key "${key}".`,
      );
    }

    seenKeys.add(key);
  });
}

function assertTenses(
  value: unknown,
  fieldPath: string,
  entryLabel: string,
  defaultTense: string,
  groupKeys: ReadonlySet<string>,
): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}" must be a non-empty array.`,
    );
  }

  const seenKeys = new Set<string>();

  value.forEach((item, itemIndex) => {
    const tense = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    assertString(tense.key, `${fieldPath}[${itemIndex}].key`, entryLabel);
    assertString(tense.label, `${fieldPath}[${itemIndex}].label`, entryLabel);
    assertString(tense.group, `${fieldPath}[${itemIndex}].group`, entryLabel);
    assertString(tense.tableHeading, `${fieldPath}[${itemIndex}].tableHeading`, entryLabel);
    assertString(tense.tableDescription, `${fieldPath}[${itemIndex}].tableDescription`, entryLabel);

    const key = tense.key as string;
    if (!key) {
      throw new Error(
        `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}[${itemIndex}].key" must be non-empty.`,
      );
    }

    if (seenKeys.has(key)) {
      throw new Error(
        `Invalid conjugated-verb-forms content: ${entryLabel} has duplicate tenses key "${key}".`,
      );
    }

    seenKeys.add(key);

    const group = tense.group as string;
    if (!groupKeys.has(group)) {
      throw new Error(
        `Invalid conjugated-verb-forms content: ${entryLabel} tense "${key}" references unknown group "${group}".`,
      );
    }

    const grammar = assertObject(tense.grammar, `${fieldPath}[${itemIndex}].grammar`, entryLabel);
    assertString(grammar.heading, `${fieldPath}[${itemIndex}].grammar.heading`, entryLabel);
    assertString(grammar.description, `${fieldPath}[${itemIndex}].grammar.description`, entryLabel);
    assertString(grammar.formula, `${fieldPath}[${itemIndex}].grammar.formula`, entryLabel);
    if (grammar.additionalFormula !== undefined) {
      assertString(grammar.additionalFormula, `${fieldPath}[${itemIndex}].grammar.additionalFormula`, entryLabel);
    }
  });

  if (!seenKeys.has(defaultTense)) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} tenseSelector.defaultTense "${defaultTense}" is not present in tenses.`,
    );
  }
}

function assertRuleItems(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}" must be an array.`,
    );
  }

  value.forEach((item, itemIndex) => {
    const rule = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    assertString(rule.heading, `${fieldPath}[${itemIndex}].heading`, entryLabel);
    assertString(rule.text, `${fieldPath}[${itemIndex}].text`, entryLabel);
    assertStringArray(rule.examples, `${fieldPath}[${itemIndex}].examples`, entryLabel);
  });
}

function assertMistakeItems(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}" must be an array.`,
    );
  }

  value.forEach((item, itemIndex) => {
    const mistake = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    assertString(mistake.incorrect, `${fieldPath}[${itemIndex}].incorrect`, entryLabel);
    assertString(mistake.correct, `${fieldPath}[${itemIndex}].correct`, entryLabel);
    assertString(mistake.explanation, `${fieldPath}[${itemIndex}].explanation`, entryLabel);
  });
}

function assertRelatedItems(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}" must be an array.`,
    );
  }

  value.forEach((item, itemIndex) => {
    const relatedItem = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    assertString(relatedItem.key, `${fieldPath}[${itemIndex}].key`, entryLabel);
    assertString(relatedItem.label, `${fieldPath}[${itemIndex}].label`, entryLabel);
  });
}

function assertFaqItems(value: unknown, fieldPath: string, entryLabel: string): void {
  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} field "${fieldPath}" must be an array.`,
    );
  }

  value.forEach((item, itemIndex) => {
    const faqItem = assertObject(item, `${fieldPath}[${itemIndex}]`, entryLabel);
    assertString(faqItem.question, `${fieldPath}[${itemIndex}].question`, entryLabel);
    assertString(faqItem.answer, `${fieldPath}[${itemIndex}].answer`, entryLabel);
  });
}

function validateContentEntryShape(value: unknown, index: number): ConjugatedVerbFormsContentEntry {
  const entryLabel = describeEntry(index, value);
  const record = assertObject(value, "$", entryLabel);

  assertString(record.targetLanguage, "targetLanguage", entryLabel);
  assertString(record.uiLanguage, "uiLanguage", entryLabel);

  if (!SUPPORTED_SHORT_CODE_SET.has(record.targetLanguage as string)) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} has unsupported targetLanguage "${String(record.targetLanguage)}".`,
    );
  }

  if (!SUPPORTED_SHORT_CODE_SET.has(record.uiLanguage as string)) {
    throw new Error(
      `Invalid conjugated-verb-forms content: ${entryLabel} has unsupported uiLanguage "${String(record.uiLanguage)}".`,
    );
  }

  assertString(record.urlSlug, "urlSlug", entryLabel);
  assertString(record.entryButtonLabel, "entryButtonLabel", entryLabel);

  const tableColumns = assertObject(record.tableColumns, "tableColumns", entryLabel);
  assertString(tableColumns.number, "tableColumns.number", entryLabel);
  assertString(tableColumns.infinitive, "tableColumns.infinitive", entryLabel);
  assertString(tableColumns.meaning, "tableColumns.meaning", entryLabel);
  assertPronounForms(record.pronounForms, "pronounForms", entryLabel);

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

  const tenseSelector = assertObject(record.tenseSelector, "tenseSelector", entryLabel);
  assertString(tenseSelector.heading, "tenseSelector.heading", entryLabel);
  assertString(tenseSelector.description, "tenseSelector.description", entryLabel);
  assertString(tenseSelector.defaultTense, "tenseSelector.defaultTense", entryLabel);
  assertTenseGroups(tenseSelector.groups, "tenseSelector.groups", entryLabel);
  const groupKeys = new Set(
    (tenseSelector.groups as Array<{ key: string }>).map((group) => group.key),
  );
  assertTenses(record.tenses, "tenses", entryLabel, tenseSelector.defaultTense as string, groupKeys);

  const table = assertObject(record.table, "table", entryLabel);
  assertString(table.heading, "table.heading", entryLabel);
  assertString(table.description, "table.description", entryLabel);
  assertString(table.scrollHint, "table.scrollHint", entryLabel);
  assertString(table.scrollLeftLabel, "table.scrollLeftLabel", entryLabel);
  assertString(table.scrollRightLabel, "table.scrollRightLabel", entryLabel);
  assertStringArray(table.notes, "table.notes", entryLabel);

  const rules = assertObject(record.rules, "rules", entryLabel);
  assertString(rules.heading, "rules.heading", entryLabel);
  assertString(rules.intro, "rules.intro", entryLabel);
  assertRuleItems(rules.items, "rules.items", entryLabel);

  const commonMistakes = assertObject(record.commonMistakes, "commonMistakes", entryLabel);
  assertString(commonMistakes.heading, "commonMistakes.heading", entryLabel);
  assertString(commonMistakes.intro, "commonMistakes.intro", entryLabel);
  assertMistakeItems(commonMistakes.items, "commonMistakes.items", entryLabel);

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

  return record as unknown as ConjugatedVerbFormsContentEntry;
}

export function buildConjugatedVerbFormsContentLookup(rawContent: unknown): ConjugatedVerbFormsContentLookup {
  if (!Array.isArray(rawContent)) {
    throw new Error("Invalid conjugated-verb-forms content: expected a top-level array.");
  }

  const lookup: ConjugatedVerbFormsContentLookup = new Map();

  rawContent.forEach((rawEntry, index) => {
    const entry = validateContentEntryShape(rawEntry, index);
    const key = lookupKey(entry.targetLanguage, entry.uiLanguage);

    if (lookup.has(key)) {
      throw new Error(
        `Invalid conjugated-verb-forms content: duplicate combination targetLanguage="${entry.targetLanguage}", uiLanguage="${entry.uiLanguage}" (entry #${index}).`,
      );
    }

    lookup.set(key, entry);
  });

  return lookup;
}

export function getConjugatedVerbFormsContentEntry(
  lookup: ConjugatedVerbFormsContentLookup,
  targetLanguageCode: ConjugatedVerbFormsTargetLanguageCode,
  uiLanguage: UiLanguageCode,
): ConjugatedVerbFormsContentEntry | null {
  return lookup.get(lookupKey(targetLanguageCode, uiLanguage)) ?? null;
}
