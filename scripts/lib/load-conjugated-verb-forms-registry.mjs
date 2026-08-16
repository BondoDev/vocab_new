import fs from "node:fs";
import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "./compileTs.mjs";

const TEXT_CONTENT_DIR = path.join(
  ROOT_DIR,
  "src",
  "data",
  "seo",
  "verbLists",
  "conjugated100Verbs",
  "textContent",
);

// conjugated100VerbRegistry.ts uses import.meta.glob (Vite-only syntax) to
// discover ./textContent/*.json, which compileTsToCommonJs cannot compile
// (module: CommonJS rejects import.meta outright — see that file's header
// comment). So instead of compiling the registry, this loader reads
// ./textContent/*.json directly off disk and builds the identical
// registry API via conjugated100VerbRouteHelpers.ts's
// createConjugatedVerbFormsRegistry(), which is import.meta-free.
function readContentByTargetLanguageSlug() {
  const contentByTargetLanguageSlug = {};

  for (const fileName of fs.readdirSync(TEXT_CONTENT_DIR)) {
    if (!fileName.endsWith(".json")) continue;
    const targetLanguageSlug = fileName.replace(/\.json$/, "");
    contentByTargetLanguageSlug[targetLanguageSlug] = JSON.parse(
      fs.readFileSync(path.join(TEXT_CONTENT_DIR, fileName), "utf8"),
    );
  }

  return contentByTargetLanguageSlug;
}

export function loadConjugatedVerbFormsRegistry(tempDirName = ".tmp-conjugated-verb-forms-registry") {
  const compiled = compileTsToCommonJs(tempDirName, [
    path.join(
      ROOT_DIR,
      "src",
      "data",
      "seo",
      "verbLists",
      "conjugated100Verbs",
      "conjugated100VerbRouteHelpers.ts",
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

  const routeHelpers = compiled.require(
    "src/data/seo/verbLists/conjugated100Verbs/conjugated100VerbRouteHelpers",
  );

  const lookup = routeHelpers.buildConjugatedVerbFormsContentLookup(
    routeHelpers.mergeConjugatedVerbFormsContentByTargetLanguage(readContentByTargetLanguageSlug()),
  );

  return {
    ...compiled,
    registry: routeHelpers.createConjugatedVerbFormsRegistry(lookup),
    launchStatus: compiled.require(
      "src/seo/verbLists/conjugated100Verbs/conjugatedVerbFormsLaunchStatus",
    ),
  };
}
