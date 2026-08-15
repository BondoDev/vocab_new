import {
  SUPPORTED_UI_LANGUAGES,
  getUiVocabularyLanguage,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../shared/slugs";
import conjugatedVerbFormsListJson from "./conjucated100VerbsList.json";

export type ConjugatedVerbFormsRowForms = Record<string, string | null>;
export type ConjugatedVerbFormsRowTenses = Record<string, ConjugatedVerbFormsRowForms>;

interface RawConjugatedVerbConjugation {
  pronoun: string;
  form: string | null;
}

interface RawConjugatedVerbRow {
  word_id: string;
  conjugations: RawConjugatedVerbConjugation[];
}

interface RawConjugatedVerbTenseGroup {
  tense: string;
  targetLanguage?: string;
  verbs: RawConjugatedVerbRow[];
}

function normalizePronounKey(pronoun: string): string {
  const key = pronoun
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s*\/\s*/g, "_")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  switch (key) {
    case "nosotros_nosotras":
      return "nosotros";
    case "vosotros_vosotras":
      return "vosotros";
    default:
      return key;
  }
}

function readTargetLanguageCode(
  tenseGroup: Partial<RawConjugatedVerbTenseGroup>,
  tense: string,
): UiLanguageCode {
  const rawTargetLanguage = tenseGroup.targetLanguage;
  if (rawTargetLanguage === undefined) {
    return "en";
  }

  const targetLanguageCode = String(rawTargetLanguage).trim();
  if (!(SUPPORTED_UI_LANGUAGES as readonly string[]).includes(targetLanguageCode)) {
    throw new Error(
      `Invalid conjugated-verb-forms data: tense "${tense}" has unsupported targetLanguage "${targetLanguageCode}".`,
    );
  }

  return targetLanguageCode as UiLanguageCode;
}

function getOrCreateRows(
  rowsByTargetLanguage: Partial<Record<TargetLanguageSlug, Map<string, ConjugatedVerbFormsRowTenses>>>,
  targetLanguage: TargetLanguageSlug,
): Map<string, ConjugatedVerbFormsRowTenses> {
  const existingRows = rowsByTargetLanguage[targetLanguage];
  if (existingRows) {
    return existingRows;
  }

  const rows = new Map<string, ConjugatedVerbFormsRowTenses>();
  rowsByTargetLanguage[targetLanguage] = rows;
  return rows;
}

function buildRowsByTargetLanguageFromTenseList(
  rawContent: unknown,
): Partial<Record<TargetLanguageSlug, Map<string, ConjugatedVerbFormsRowTenses>>> {
  const rowsByTargetLanguage: Partial<Record<TargetLanguageSlug, Map<string, ConjugatedVerbFormsRowTenses>>> = {};

  if (!Array.isArray(rawContent) || rawContent.length === 0) {
    return rowsByTargetLanguage;
  }

  const seenTensesByTargetLanguage = new Map<TargetLanguageSlug, Set<string>>();

  rawContent.forEach((rawTenseGroup, tenseIndex) => {
    if (!rawTenseGroup || typeof rawTenseGroup !== "object" || Array.isArray(rawTenseGroup)) {
      throw new Error(
        `Invalid conjugated-verb-forms data: tense entry #${tenseIndex} must be an object.`,
      );
    }

    const tenseGroup = rawTenseGroup as Partial<RawConjugatedVerbTenseGroup>;
    const tense = String(tenseGroup.tense ?? "").trim();
    if (!tense) {
      throw new Error(
        `Invalid conjugated-verb-forms data: tense entry #${tenseIndex} is missing a non-empty "tense".`,
      );
    }

    const targetLanguageCode = readTargetLanguageCode(tenseGroup, tense);
    const targetLanguage = getUiVocabularyLanguage(targetLanguageCode);
    const rows = getOrCreateRows(rowsByTargetLanguage, targetLanguage);
    const seenTenses = seenTensesByTargetLanguage.get(targetLanguage) ?? new Set<string>();
    seenTensesByTargetLanguage.set(targetLanguage, seenTenses);

    if (seenTenses.has(tense)) {
      throw new Error(
        `Invalid conjugated-verb-forms data: duplicate tense "${tense}" for targetLanguage "${targetLanguageCode}".`,
      );
    }
    seenTenses.add(tense);

    if (!Array.isArray(tenseGroup.verbs)) {
      throw new Error(
        `Invalid conjugated-verb-forms data: tense "${tense}" field "verbs" must be an array.`,
      );
    }

    const seenVerbIdsForTense = new Set<string>();

    tenseGroup.verbs.forEach((rawVerb, verbIndex) => {
      if (!rawVerb || typeof rawVerb !== "object" || Array.isArray(rawVerb)) {
        throw new Error(
          `Invalid conjugated-verb-forms data: tense "${tense}" verb entry #${verbIndex} must be an object.`,
        );
      }

      const verb = rawVerb as Partial<RawConjugatedVerbRow>;
      const id = String(verb.word_id ?? "").trim();
      if (!id) {
        throw new Error(
          `Invalid conjugated-verb-forms data: tense "${tense}" verb entry #${verbIndex} is missing a non-empty "word_id".`,
        );
      }

      if (seenVerbIdsForTense.has(id)) {
        throw new Error(
          `Invalid conjugated-verb-forms data: tense "${tense}" has duplicate word_id "${id}".`,
        );
      }
      seenVerbIdsForTense.add(id);

      if (!Array.isArray(verb.conjugations)) {
        throw new Error(
          `Invalid conjugated-verb-forms data: tense "${tense}" word_id "${id}" field "conjugations" must be an array.`,
        );
      }

      const forms: ConjugatedVerbFormsRowForms = {};
      const seenPronouns = new Set<string>();

      verb.conjugations.forEach((rawConjugation, conjugationIndex) => {
        if (!rawConjugation || typeof rawConjugation !== "object" || Array.isArray(rawConjugation)) {
          throw new Error(
            `Invalid conjugated-verb-forms data: tense "${tense}" word_id "${id}" conjugation #${conjugationIndex} must be an object.`,
          );
        }

        const conjugation = rawConjugation as Partial<RawConjugatedVerbConjugation>;
        const pronounKey = normalizePronounKey(String(conjugation.pronoun ?? ""));
        if (!pronounKey) {
          throw new Error(
            `Invalid conjugated-verb-forms data: tense "${tense}" word_id "${id}" conjugation #${conjugationIndex} is missing a non-empty "pronoun".`,
          );
        }

        if (seenPronouns.has(pronounKey)) {
          throw new Error(
            `Invalid conjugated-verb-forms data: tense "${tense}" word_id "${id}" has duplicate pronoun "${conjugation.pronoun}".`,
          );
        }
        seenPronouns.add(pronounKey);

        if (conjugation.form !== null && typeof conjugation.form !== "string") {
          throw new Error(
            `Invalid conjugated-verb-forms data: tense "${tense}" word_id "${id}" pronoun "${conjugation.pronoun}" form must be a string or null.`,
          );
        }

        forms[pronounKey] = conjugation.form ?? null;
      });

      const rowTenses = rows.get(id) ?? {};
      rowTenses[tense] = forms;
      rows.set(id, rowTenses);
    });
  });

  return rowsByTargetLanguage;
}

function buildRowsByTargetLanguage(): Partial<Record<TargetLanguageSlug, Map<string, ConjugatedVerbFormsRowTenses>>> {
  return buildRowsByTargetLanguageFromTenseList(conjugatedVerbFormsListJson);
}

const ROWS_BY_TARGET_LANGUAGE = buildRowsByTargetLanguage();

export function getConjugatedVerbFormsRowsById(
  targetLanguage: TargetLanguageSlug,
): Map<string, ConjugatedVerbFormsRowTenses> | null {
  return ROWS_BY_TARGET_LANGUAGE[targetLanguage] ?? null;
}
