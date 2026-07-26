// Loads the linguistic verb-forms dataset for the "100 Most Common Verb
// Past Forms" table — one hand-authored JSON file per target language under
// ./pastForms/ (e.g. english.json), keyed by concept_id (the same id space
// as ../shared/list_of_100_most_used_verb.json and
// ../common100Verbs/common100VerbList.ts). Deliberately separate from
// pastForms100VerbsContent.json: that file owns localized SEO copy and
// column headers (per targetLanguage x uiLanguage); this owns the actual
// per-verb past-form values, which do not vary by UI language. Import
// boundary G10 in docs/import-boundaries.md.
import { SUPPORTED_TARGET_LANGUAGES, type TargetLanguageSlug } from "../../shared/slugs";

export type PastVerbFormsRowForms = Record<string, string | null>;

interface RawPastVerbFormsRow {
  concept_id: string;
  [formKey: string]: string | null;
}

const rawModules = import.meta.glob("./pastForms/*.json", { eager: true }) as Record<
  string,
  { default: RawPastVerbFormsRow[] }
>;

function buildRowsByTargetLanguage(): Partial<Record<TargetLanguageSlug, Map<string, PastVerbFormsRowForms>>> {
  const result: Partial<Record<TargetLanguageSlug, Map<string, PastVerbFormsRowForms>>> = {};
  const supportedSet: ReadonlySet<string> = new Set(SUPPORTED_TARGET_LANGUAGES);

  for (const [modulePath, module] of Object.entries(rawModules)) {
    const fileName = modulePath.split("/").pop() ?? "";
    const targetLanguage = fileName.replace(/\.json$/, "");

    if (!supportedSet.has(targetLanguage)) {
      throw new Error(
        `Invalid past-verb-forms data: "${modulePath}" does not match a supported target language (got "${targetLanguage}").`,
      );
    }

    const rows = new Map<string, PastVerbFormsRowForms>();

    module.default.forEach((row, index) => {
      const id = String(row?.concept_id ?? "").trim();
      if (!id) {
        throw new Error(
          `Invalid past-verb-forms data: ${modulePath} entry #${index} is missing a non-empty "concept_id".`,
        );
      }

      if (rows.has(id)) {
        throw new Error(`Invalid past-verb-forms data: ${modulePath} has duplicate concept_id "${id}".`);
      }

      const { concept_id: _conceptId, ...forms } = row;
      rows.set(id, forms);
    });

    result[targetLanguage as TargetLanguageSlug] = rows;
  }

  return result;
}

const ROWS_BY_TARGET_LANGUAGE = buildRowsByTargetLanguage();

// Returns the concept_id -> forms lookup for one target language, or null
// while no pastForms/{targetLanguage}.json file exists yet for it.
export function getPastVerbFormsRowsById(
  targetLanguage: TargetLanguageSlug,
): Map<string, PastVerbFormsRowForms> | null {
  return ROWS_BY_TARGET_LANGUAGE[targetLanguage] ?? null;
}
