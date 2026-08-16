// Pure, Vite-glob-free parsing logic for one target language's tense-grouped
// 100-verb conjugation JSON (e.g. ./conjugatedVerbs/english.json). Kept
// separate from conjugated100VerbFormsData.ts — which uses import.meta.glob
// to discover ./conjugatedVerbs/*.json — so this transform stays unit-testable
// directly under Node via scripts/lib/compileTs.mjs, which cannot compile
// files that reference import.meta (Vite-only syntax). Mirrors the
// conjugated100VerbRouteHelpers.ts split already used alongside
// conjugated100VerbRegistry.ts in this directory.
import { TARGET_LANGUAGE_TO_UI_LANGUAGE, type TargetLanguageSlug } from "../../shared/slugs";

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

// Standard scientific transliteration for the Cyrillic letters that show up
// in Russian pronoun labels, applied before the letter/digit collapsing
// below. Without this, Cyrillic text would either be stripped entirely by
// an ASCII-only filter (see the comment there) or survive as raw Cyrillic,
// which still wouldn't match the Latin "ya"/"ty"/"on_ona_ono"/... keys
// already authored in textContent/russian.json's pronounForms.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  \u0430: "a", \u0431: "b", \u0432: "v", \u0433: "g", \u0434: "d", \u0435: "e", \u0451: "e", \u0436: "zh", \u0437: "z",
  \u0438: "i", \u0439: "i", \u043a: "k", \u043b: "l", \u043c: "m", \u043d: "n", \u043e: "o", \u043f: "p", \u0440: "r",
  \u0441: "s", \u0442: "t", \u0443: "u", \u0444: "f", \u0445: "kh", \u0446: "ts", \u0447: "ch", \u0448: "sh",
  \u0449: "shch", \u044a: "", \u044b: "y", \u044c: "", \u044d: "e", \u044e: "yu", \u044f: "ya",
};

function transliterateCyrillic(value: string): string {
  return value.replace(/[\u0430-\u044f\u0451]/g, (char) => CYRILLIC_TO_LATIN[char] ?? char);
}

export function normalizePronounKey(pronoun: string): string {
  const lowered = pronoun
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const key = transliterateCyrillic(lowered)
    .replace(/\s*\/\s*/g, "_")
    // Collapse anything that isn't a letter or digit in *any* script to
    // "_". A plain /[^a-z0-9]+/ only recognizes ASCII Latin letters, which
    // silently wipes non-Latin pronoun labels out entirely instead of just
    // stripping the punctuation/whitespace around them.
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");

  switch (key) {
    case "nosotros_nosotras":
      return "nosotros";
    case "vosotros_vosotras":
      return "vosotros";
    // French "je / j’" (or a straight-apostrophe "je / j'") — the elided
    // j' form before a vowel sound, not a distinct grammatical person —
    // normalizes to "je_j" by the generic rules above (the apostrophe has
    // no dedicated handling, so it falls through to the catch-all
    // non-alphanumeric replacement like the slash does). Collapse it to
    // the single "je" column key authored in textContent/french.json's
    // pronounForms, the same way nosotros/nosotras collapses above.
    case "je_j":
      return "je";
    default:
      return key;
  }
}

// Parses one already-loaded JSON module's content (an array of tense
// groups) into word_id -> tense -> pronoun-form rows for a single target
// language. `modulePath` is only used to make thrown validation errors
// identify which source file is malformed.
export function buildConjugatedVerbFormsRows(
  modulePath: string,
  targetLanguage: TargetLanguageSlug,
  rawContent: unknown,
): Map<string, ConjugatedVerbFormsRowTenses> {
  const rows = new Map<string, ConjugatedVerbFormsRowTenses>();

  if (!Array.isArray(rawContent) || rawContent.length === 0) {
    return rows;
  }

  const expectedTargetLanguageCode = TARGET_LANGUAGE_TO_UI_LANGUAGE[targetLanguage];
  const seenTenses = new Set<string>();

  rawContent.forEach((rawTenseGroup, tenseIndex) => {
    if (!rawTenseGroup || typeof rawTenseGroup !== "object" || Array.isArray(rawTenseGroup)) {
      throw new Error(
        `Invalid conjugated-verb-forms data: ${modulePath} entry #${tenseIndex} must be an object.`,
      );
    }

    const tenseGroup = rawTenseGroup as Partial<RawConjugatedVerbTenseGroup>;
    const tense = String(tenseGroup.tense ?? "").trim();
    if (!tense) {
      throw new Error(
        `Invalid conjugated-verb-forms data: ${modulePath} entry #${tenseIndex} is missing a non-empty "tense".`,
      );
    }

    if (seenTenses.has(tense)) {
      throw new Error(`Invalid conjugated-verb-forms data: ${modulePath} has duplicate tense "${tense}".`);
    }
    seenTenses.add(tense);

    const targetLanguageCode = String(tenseGroup.targetLanguage ?? expectedTargetLanguageCode).trim();
    if (targetLanguageCode !== expectedTargetLanguageCode) {
      throw new Error(
        `Invalid conjugated-verb-forms data: ${modulePath} tense "${tense}" has targetLanguage ` +
          `"${targetLanguageCode}", expected "${expectedTargetLanguageCode}" (derived from the file name).`,
      );
    }

    if (!Array.isArray(tenseGroup.verbs)) {
      throw new Error(
        `Invalid conjugated-verb-forms data: ${modulePath} tense "${tense}" field "verbs" must be an array.`,
      );
    }

    const seenVerbIdsForTense = new Set<string>();

    tenseGroup.verbs.forEach((rawVerb, verbIndex) => {
      if (!rawVerb || typeof rawVerb !== "object" || Array.isArray(rawVerb)) {
        throw new Error(
          `Invalid conjugated-verb-forms data: ${modulePath} tense "${tense}" verb entry #${verbIndex} must be an object.`,
        );
      }

      const verb = rawVerb as Partial<RawConjugatedVerbRow>;
      const id = String(verb.word_id ?? "").trim();
      if (!id) {
        throw new Error(
          `Invalid conjugated-verb-forms data: ${modulePath} tense "${tense}" verb entry #${verbIndex} is missing a non-empty "word_id".`,
        );
      }

      if (seenVerbIdsForTense.has(id)) {
        throw new Error(
          `Invalid conjugated-verb-forms data: ${modulePath} tense "${tense}" has duplicate word_id "${id}".`,
        );
      }
      seenVerbIdsForTense.add(id);

      if (!Array.isArray(verb.conjugations)) {
        throw new Error(
          `Invalid conjugated-verb-forms data: ${modulePath} tense "${tense}" word_id "${id}" field "conjugations" must be an array.`,
        );
      }

      const forms: ConjugatedVerbFormsRowForms = {};
      const seenPronouns = new Set<string>();

      verb.conjugations.forEach((rawConjugation, conjugationIndex) => {
        if (!rawConjugation || typeof rawConjugation !== "object" || Array.isArray(rawConjugation)) {
          throw new Error(
            `Invalid conjugated-verb-forms data: ${modulePath} tense "${tense}" word_id "${id}" conjugation #${conjugationIndex} must be an object.`,
          );
        }

        const conjugation = rawConjugation as Partial<RawConjugatedVerbConjugation>;
        const pronounKey = normalizePronounKey(String(conjugation.pronoun ?? ""));
        if (!pronounKey) {
          throw new Error(
            `Invalid conjugated-verb-forms data: ${modulePath} tense "${tense}" word_id "${id}" conjugation #${conjugationIndex} is missing a non-empty "pronoun".`,
          );
        }

        if (seenPronouns.has(pronounKey)) {
          throw new Error(
            `Invalid conjugated-verb-forms data: ${modulePath} tense "${tense}" word_id "${id}" has duplicate pronoun "${conjugation.pronoun}".`,
          );
        }
        seenPronouns.add(pronounKey);

        if (conjugation.form !== null && typeof conjugation.form !== "string") {
          throw new Error(
            `Invalid conjugated-verb-forms data: ${modulePath} tense "${tense}" word_id "${id}" pronoun "${conjugation.pronoun}" form must be a string or null.`,
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
