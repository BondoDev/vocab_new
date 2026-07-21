import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "./compileTs.mjs";

export function loadWordRouteManifest(tempDirName = ".tmp-word-route-manifest") {
  const compiled = compileTsToCommonJs(tempDirName, [
    path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordRouteManifest.ts"),
    path.join(ROOT_DIR, "src", "data", "seo", "shared", "slugs.ts"),
  ]);

  return {
    ...compiled,
    manifest: compiled.require("src/data/seo/wordPages/wordRouteManifest"),
  };
}
