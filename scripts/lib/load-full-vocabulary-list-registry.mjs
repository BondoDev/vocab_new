import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "./compileTs.mjs";

// Mirrors load-past-verb-forms-registry.mjs for the full-vocabulary-list
// SEO family. Compiles the route registry (static JSON import, no
// import.meta.glob) and the launch-status flag (src/seo/) in one program so
// scripts/generation/generate-sitemap.mjs can gate sitemap inclusion on
// FULL_VOCABULARY_LIST_LAUNCHED without duplicating the flag's value.
export function loadFullVocabularyListRegistry(tempDirName = ".tmp-full-vocabulary-list-registry") {
  const compiled = compileTsToCommonJs(tempDirName, [
    path.join(ROOT_DIR, "src", "data", "seo", "listPages", "fullVocabularyList", "fullVocabularyListRegistry.ts"),
    path.join(ROOT_DIR, "src", "seo", "listPages", "fullVocabularyList", "fullVocabularyListLaunchStatus.ts"),
  ]);

  return {
    ...compiled,
    registry: compiled.require("src/data/seo/listPages/fullVocabularyList/fullVocabularyListRegistry"),
    launchStatus: compiled.require("src/seo/listPages/fullVocabularyList/fullVocabularyListLaunchStatus"),
  };
}
