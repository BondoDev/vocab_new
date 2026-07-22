/**
 * Shared TypeScript → CommonJS compile helper for Node-based scripts under
 * scripts/ and workers/word-ssr/. Originally added under scripts/seo-baseline/lib/
 * for the seo-baseline capture/fixtures scripts only; moved here once real
 * consumers spanned unrelated domains (sync-vocabulary-levels, import-boundaries,
 * generated-data-ownership, word-route-manifest/verb-list loaders, and the
 * offline full-corpus tools in workers/word-ssr/).
 *
 * scripts/tests/seo/test-word-seo-routes.mjs, scripts/test-word-ssr-http.mjs,
 * scripts/tests/seo/test-jsonld-escaping.mjs, and scripts/tests/seo/test-seo-core-routes.mjs each
 * keep their own independent inline copy of this pattern — consolidating them
 * onto this helper is a separate, later task, not done here.
 *
 * Compiles a fixed set of source .ts/.tsx files to a scratch directory and
 * returns a `require()` bound to that directory, so callers can load the
 * compiled CommonJS output directly.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// scripts/lib/ is two levels below the repo root (scripts/lib -> scripts -> root).
export const ROOT_DIR = path.resolve(__dirname, "..", "..");

/**
 * @param {string} tempDirName - unique scratch directory name (under repo root)
 * @param {string[]} rootNames - absolute paths to .ts/.tsx entry files to compile
 * @returns {{ require: NodeRequire, tempDir: string, cleanup: () => void }}
 */
export function compileTsToCommonJs(tempDirName, rootNames) {
  const tempDir = path.join(ROOT_DIR, tempDirName);
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const program = ts.createProgram({
    rootNames,
    options: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      jsx: ts.JsxEmit.ReactJSX,
      resolveJsonModule: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
      rootDir: ROOT_DIR,
      outDir: tempDir,
      noEmit: false,
    },
  });

  const emitResult = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => ROOT_DIR,
      getNewLine: () => "\n",
    });
    throw new Error(`TypeScript compile failed:\n${formatted}`);
  }

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ type: "commonjs" }, null, 2),
  );

  const scopedRequire = createRequire(import.meta.url);
  const requireCompiled = (relativePathWithoutExt) =>
    scopedRequire(path.join(tempDir, `${relativePathWithoutExt}.js`));

  return {
    require: requireCompiled,
    tempDir,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true }),
  };
}

const UTF8_BOM_PATTERN = new RegExp("^" + String.fromCharCode(0xfeff));

export function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8").replace(UTF8_BOM_PATTERN, ""),
  );
}
