import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "./compileTs.mjs";

// Mirrors load-past-verb-forms-registry.mjs for the 100-most-common-nouns
// family. Compiles the route registry (static JSON imports, no
// import.meta.glob), the list entries (completeness check) and the launch
// status (src/seo/) in one program, so scripts/generation/generate-sitemap.mjs
// can apply the same indexability rule as the pages' robots meta
// (isNounListIndexable: launched AND complete) without duplicating the
// launched-list set.
export function loadNounListRegistry(tempDirName = ".tmp-noun-list-registry") {
  const nounListDir = path.join(ROOT_DIR, "src", "data", "seo", "listPages", "nounLists", "common100Nouns");
  const compiled = compileTsToCommonJs(tempDirName, [
    path.join(nounListDir, "common100NounRegistry.ts"),
    path.join(nounListDir, "common100NounEntries.ts"),
    path.join(ROOT_DIR, "src", "seo", "listPages", "nounLists", "common100Nouns", "common100NounsLaunchStatus.ts"),
  ]);

  return {
    ...compiled,
    registry: compiled.require("src/data/seo/listPages/nounLists/common100Nouns/common100NounRegistry"),
    entries: compiled.require("src/data/seo/listPages/nounLists/common100Nouns/common100NounEntries"),
    launchStatus: compiled.require("src/seo/listPages/nounLists/common100Nouns/common100NounsLaunchStatus"),
  };
}
