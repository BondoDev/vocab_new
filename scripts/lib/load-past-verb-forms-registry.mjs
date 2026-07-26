import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "./compileTs.mjs";

// Mirrors load-verb-list-registry.mjs for the sibling past-verb-forms
// subtype. Compiles both the route registry (paths/content) and the
// launch-status flag (src/seo/) in one program so scripts/generation/generate-sitemap.mjs
// can gate sitemap inclusion on PAST_VERB_FORMS_LAUNCHED without duplicating
// the flag's value.
export function loadPastVerbFormsRegistry(tempDirName = ".tmp-past-verb-forms-registry") {
  const compiled = compileTsToCommonJs(tempDirName, [
    path.join(
      ROOT_DIR,
      "src",
      "data",
      "seo",
      "verbLists",
      "pastForms100Verbs",
      "pastForms100VerbRegistry.ts",
    ),
    path.join(
      ROOT_DIR,
      "src",
      "seo",
      "verbLists",
      "pastForms100Verbs",
      "pastVerbFormsLaunchStatus.ts",
    ),
  ]);

  return {
    ...compiled,
    registry: compiled.require(
      "src/data/seo/verbLists/pastForms100Verbs/pastForms100VerbRegistry",
    ),
    launchStatus: compiled.require(
      "src/seo/verbLists/pastForms100Verbs/pastVerbFormsLaunchStatus",
    ),
  };
}
