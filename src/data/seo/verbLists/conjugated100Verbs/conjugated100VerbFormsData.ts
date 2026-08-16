// Loads the linguistic verb-forms dataset for the "100 Most Common
// Conjugated Verb Forms" table — one hand-authored JSON file per target
// language under ./conjugatedVerbs/ (e.g. english.json), each holding that
// language's full tense-grouped 100-verb conjugation array. Mirrors the
// pastForms100Verbs/ split — see pastForms100VerbFormsData.ts. The actual
// row-shaping logic lives in conjugated100VerbFormsRowBuilder.ts (kept
// import.meta-free so it stays unit-testable under Node); this file is only
// responsible for discovering the per-language files via Vite's
// import.meta.glob and handing each one to the builder.
import { SUPPORTED_TARGET_LANGUAGES, type TargetLanguageSlug } from "../../shared/slugs";
import {
  buildConjugatedVerbFormsRows,
  type ConjugatedVerbFormsRowForms,
  type ConjugatedVerbFormsRowTenses,
} from "./conjugated100VerbFormsRowBuilder";

export type { ConjugatedVerbFormsRowForms, ConjugatedVerbFormsRowTenses };

const rawModules = import.meta.glob("./conjugatedVerbs/*.json", { eager: true }) as Record<
  string,
  { default: unknown }
>;

function buildRowsByTargetLanguage(): Partial<Record<TargetLanguageSlug, Map<string, ConjugatedVerbFormsRowTenses>>> {
  const result: Partial<Record<TargetLanguageSlug, Map<string, ConjugatedVerbFormsRowTenses>>> = {};
  const supportedSet: ReadonlySet<string> = new Set(SUPPORTED_TARGET_LANGUAGES);

  for (const [modulePath, module] of Object.entries(rawModules)) {
    const fileName = modulePath.split("/").pop() ?? "";
    const targetLanguage = fileName.replace(/\.json$/, "");

    if (!supportedSet.has(targetLanguage)) {
      throw new Error(
        `Invalid conjugated-verb-forms data: "${modulePath}" does not match a supported target language (got "${targetLanguage}").`,
      );
    }

    result[targetLanguage as TargetLanguageSlug] = buildConjugatedVerbFormsRows(
      modulePath,
      targetLanguage as TargetLanguageSlug,
      module.default,
    );
  }

  return result;
}

const ROWS_BY_TARGET_LANGUAGE = buildRowsByTargetLanguage();

// Returns the word_id -> tense -> pronoun forms lookup for one target
// language, or null while no conjugatedVerbs/{targetLanguage}.json file
// exists yet for it.
export function getConjugatedVerbFormsRowsById(
  targetLanguage: TargetLanguageSlug,
): Map<string, ConjugatedVerbFormsRowTenses> | null {
  return ROWS_BY_TARGET_LANGUAGE[targetLanguage] ?? null;
}
