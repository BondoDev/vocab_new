import { SUPPORTED_TARGET_LANGUAGES, type TargetLanguageSlug } from "../../shared/slugs";
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
  verbs: RawConjugatedVerbRow[];
}

function normalizePronounKey(pronoun: string): string {
  return pronoun
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, "_")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildEnglishRowsFromTenseList(rawContent: unknown): Map<string, ConjugatedVerbFormsRowTenses> | null {
  if (!Array.isArray(rawContent) || rawContent.length === 0) {
    return null;
  }

  const rows = new Map<string, ConjugatedVerbFormsRowTenses>();
  const seenTenses = new Set<string>();

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

    if (seenTenses.has(tense)) {
      throw new Error(`Invalid conjugated-verb-forms data: duplicate tense "${tense}".`);
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

  return rows;
}

function buildRowsByTargetLanguage(): Partial<Record<TargetLanguageSlug, Map<string, ConjugatedVerbFormsRowTenses>>> {
  const result: Partial<Record<TargetLanguageSlug, Map<string, ConjugatedVerbFormsRowTenses>>> = {};
  const supportedSet: ReadonlySet<string> = new Set(SUPPORTED_TARGET_LANGUAGES);
  const englishRows = buildEnglishRowsFromTenseList(conjugatedVerbFormsListJson);

  if (englishRows) {
    if (!supportedSet.has("english")) {
      throw new Error('Invalid conjugated-verb-forms data: "english" is not a supported target language.');
    }
    result.english = englishRows;
  }

  return result;
}

const ROWS_BY_TARGET_LANGUAGE = buildRowsByTargetLanguage();

export function getConjugatedVerbFormsRowsById(
  targetLanguage: TargetLanguageSlug,
): Map<string, ConjugatedVerbFormsRowTenses> | null {
  return ROWS_BY_TARGET_LANGUAGE[targetLanguage] ?? null;
}
