import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "./compileTs.mjs";

export function loadConjugatedVerbFormsRegistry(tempDirName = ".tmp-conjugated-verb-forms-registry") {
  const compiled = compileTsToCommonJs(tempDirName, [
    path.join(
      ROOT_DIR,
      "src",
      "data",
      "seo",
      "verbLists",
      "conjugated100Verbs",
      "conjugated100VerbRegistry.ts",
    ),
    path.join(
      ROOT_DIR,
      "src",
      "seo",
      "verbLists",
      "conjugated100Verbs",
      "conjugatedVerbFormsLaunchStatus.ts",
    ),
  ]);

  return {
    ...compiled,
    registry: compiled.require(
      "src/data/seo/verbLists/conjugated100Verbs/conjugated100VerbRegistry",
    ),
    launchStatus: compiled.require(
      "src/seo/verbLists/conjugated100Verbs/conjugatedVerbFormsLaunchStatus",
    ),
  };
}
