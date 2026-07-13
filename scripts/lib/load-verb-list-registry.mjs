import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "../seo-baseline/lib/compileTs.mjs";

export function loadVerbListRegistry(tempDirName = ".tmp-verb-list-registry") {
  const compiled = compileTsToCommonJs(tempDirName, [
    path.join(ROOT_DIR, "src", "data", "verbListRegistry.ts"),
  ]);

  return {
    ...compiled,
    registry: compiled.require("src/data/verbListRegistry"),
  };
}
