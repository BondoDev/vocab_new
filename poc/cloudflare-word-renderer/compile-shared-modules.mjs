// EXPERIMENTAL / build-tooling only — not part of any production entry point.
//
// Compiles a small set of already-isomorphic (React-free, Node-fs-free) route
// modules from src/data/seo into plain CommonJS so this proof-of-concept can
// reuse the *exact* production route-classification logic instead of
// duplicating regexes that could drift. This mirrors the same
// compile-with-the-TypeScript-API pattern already used by
// scripts/test-word-seo-routes.mjs.
//
// Reused modules and why each is safe to reuse in a Workers-style renderer:
//   - src/data/seo/slugs.ts             -> zero imports, plain constants/types
//   - src/data/seo/wordRouteManifest.ts -> imports only slugs.ts
//   - src/data/seo/wordSlugs.ts         -> imports wordRouteManifest + slugs + fixMojibake
//   - src/utils/fixMojibake.ts          -> uses only TextDecoder (available in Workers)
//   - src/data/seo/browseWordValidation.ts -> zero imports, plain regex
// None of these touch node:fs, node:stream, React, or Vercel request/response types.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const outDir = path.join(__dirname, ".compiled");
const require = createRequire(import.meta.url);

let compiled = false;

function compile() {
  if (compiled) return;
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const rootNames = [
    path.join(rootDir, "src", "data", "seo", "slugs.ts"),
    path.join(rootDir, "src", "data", "seo", "wordRouteManifest.ts"),
    path.join(rootDir, "src", "data", "seo", "wordSlugs.ts"),
    path.join(rootDir, "src", "data", "seo", "browseWordValidation.ts"),
    path.join(rootDir, "src", "utils", "fixMojibake.ts"),
  ];

  const program = ts.createProgram({
    rootNames,
    options: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      resolveJsonModule: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
      rootDir,
      outDir,
      noEmit: false,
    },
  });

  const emitResult = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => rootDir,
      getNewLine: () => "\n",
    });
    throw new Error(`TypeScript compile failed:\n${formatted}`);
  }

  fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2));
  compiled = true;
}

export function loadSharedWordRouteModules() {
  compile();
  const wordRouteManifest = require(path.join(outDir, "src", "data", "seo", "wordRouteManifest.js"));
  const wordSlugs = require(path.join(outDir, "src", "data", "seo", "wordSlugs.js"));
  const browseWordValidation = require(path.join(outDir, "src", "data", "seo", "browseWordValidation.js"));
  const slugs = require(path.join(outDir, "src", "data", "seo", "slugs.js"));

  return {
    parseWordRoutePathname: wordSlugs.parseWordRoutePathname,
    buildWordPath: wordSlugs.buildWordPath,
    buildWordBrowsePagePathFromSlug: wordSlugs.buildWordBrowsePagePathFromSlug,
    wordToSlug: wordSlugs.wordToSlug,
    stripDiacriticsForComparison: wordSlugs.stripDiacriticsForComparison,
    isValidBrowseWordLemma: browseWordValidation.isValidBrowseWordLemma,
    SUPPORTED_UI_LANGUAGES: slugs.SUPPORTED_UI_LANGUAGES,
    WORD_ROUTE_CONCEPT_ID_PATTERN: wordRouteManifest.WORD_ROUTE_CONCEPT_ID_PATTERN,
  };
}
