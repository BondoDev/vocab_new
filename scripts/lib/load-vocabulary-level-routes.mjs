import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "./compileTs.mjs";

export function loadVocabularyLevelRoutes(tempDirName = ".tmp-vocabulary-level-routes") {
  const compiled = compileTsToCommonJs(tempDirName, [
    path.join(
      ROOT_DIR,
      "src",
      "data",
      "seo",
      "vocabularyLevels",
      "vocabularyLevelRoutes.ts",
    ),
  ]);

  return {
    ...compiled,
    routes: compiled.require("src/data/seo/vocabularyLevels/vocabularyLevelRoutes"),
  };
}
