// Route/content registry for the "100 Most Common Conjugated Verb Forms"
// page family — the single import surface other code (routing, SSR,
// sitemap generation, the page component) should use.
//
// SEO text content is loaded from one hand-authored JSON file per target
// language under ./textContent/ (e.g. english.json), discovered eagerly via
// Vite's import.meta.glob and merged/validated by
// conjugated100VerbRouteHelpers.ts (which does the real work and stays
// import.meta-free). Mirrors the ./conjugatedVerbs/ split already used for
// the verb-forms table data — see conjugated100VerbFormsData.ts.
//
// Because this file uses import.meta.glob, it cannot be compiled by
// scripts/lib/compileTs.mjs's CommonJS target — the Node-only sitemap
// generator and the test suite therefore do NOT compile this file. Instead
// scripts/lib/load-conjugated-verb-forms-registry.mjs reads
// ./textContent/*.json directly off disk and builds the identical API from
// conjugated100VerbRouteHelpers.ts's createConjugatedVerbFormsRegistry().
// Keep this file's exported function names/signatures in sync with that
// loader's expectations if either changes.
import { SUPPORTED_TARGET_LANGUAGES, type TargetLanguageSlug } from "../../shared/slugs";
import {
  buildConjugatedVerbFormsContentLookup,
  createConjugatedVerbFormsRegistry,
  mergeConjugatedVerbFormsContentByTargetLanguage,
} from "./conjugated100VerbRouteHelpers";

const rawModules = import.meta.glob("./textContent/*.json", { eager: true }) as Record<
  string,
  { default: unknown }
>;

function buildContentByTargetLanguageSlug(): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const supportedSet: ReadonlySet<string> = new Set(SUPPORTED_TARGET_LANGUAGES);

  for (const [modulePath, module] of Object.entries(rawModules)) {
    const fileName = modulePath.split("/").pop() ?? "";
    const targetLanguage = fileName.replace(/\.json$/, "");

    if (!supportedSet.has(targetLanguage)) {
      throw new Error(
        `Invalid conjugated-verb-forms content: "${modulePath}" does not match a supported target language (got "${targetLanguage}").`,
      );
    }

    result[targetLanguage as TargetLanguageSlug] = module.default;
  }

  return result;
}

const CONJUGATED_VERB_FORMS_CONTENT_LOOKUP = buildConjugatedVerbFormsContentLookup(
  mergeConjugatedVerbFormsContentByTargetLanguage(buildContentByTargetLanguageSlug()),
);

const {
  getConjugatedVerbFormsContent,
  getConjugatedVerbFormsPath,
  getAllConjugatedVerbFormsPaths,
  resolveConjugatedVerbFormsRoute,
} = createConjugatedVerbFormsRegistry(CONJUGATED_VERB_FORMS_CONTENT_LOOKUP);

export {
  getConjugatedVerbFormsContent,
  getConjugatedVerbFormsPath,
  getAllConjugatedVerbFormsPaths,
  resolveConjugatedVerbFormsRoute,
};
