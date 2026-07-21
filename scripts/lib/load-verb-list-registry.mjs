import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "./compileTs.mjs";

export function loadVerbListRegistry(tempDirName = ".tmp-verb-list-registry") {
  const compiled = compileTsToCommonJs(tempDirName, [
    path.join(
      ROOT_DIR,
      "src",
      "data",
      "seo",
      "verbLists",
      "common100Verbs",
      "common100VerbRegistry.ts",
    ),
  ]);

  return {
    ...compiled,
    registry: compiled.require("src/data/seo/verbLists/common100Verbs/common100VerbRegistry"),
  };
}
