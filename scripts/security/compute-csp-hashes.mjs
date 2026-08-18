// Deterministically recomputes the CSP hashes for FluentStellar's static
// executable inline content: the language-detection <script> (index.html)
// and the static inline <style> blocks (ListeningExercise.tsx,
// ConnectWordsExercise.tsx, PracticeResults.tsx).
//
// CSP hashes a script/style element's exact text content (the literal bytes
// between the opening and closing tags, as UTF-8) — <script> and <style>
// are HTML "raw text" elements, so the browser does NOT perform character-
// reference (entity) decoding on their content before hashing; what's
// between the tags in the served HTML is exactly what gets hashed. This
// script extracts that same literal text (never a hand-typed/estimated
// value) and prints `sha256-<base64>` for each, plus a summary noting which
// blocks are byte-identical (so the CSP doesn't carry duplicate hashes).
//
// Run: node scripts/security/compute-csp-hashes.mjs
// Also importable — used by scripts/tests/security/test-csp-hash-freshness.mjs
// to fail if a source edit ever makes the hardcoded CSP hashes stale.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..");

function sha256Base64(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("base64");
}

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), "utf8");
}

// Extracts the literal text between <script> and </script> for the
// language-detection snippet specifically (matched by its distinctive
// `try{var _l=` opening so an unrelated <script> tag can never be picked up
// silently). Verified elsewhere (test-csp-hash-freshness.mjs) to be
// byte-identical across index.html, dist/index.html, and
// server-build/ssr-template.html — Vite does not transform non-module
// inline <script> content, so the repo source is the same bytes a browser
// receives.
export function extractLangDetectScript(html) {
  const match = html.match(/<script>(try\{var _l=\[[\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error("extractLangDetectScript: could not locate the language-detection <script> in the given HTML.");
  }
  return match[1];
}

// Extracts the literal text of a `<style>{`...`}</style>` (or
// `<style>\n  {`...`}\n</style>`) JSX block — i.e. exactly the string
// between the template literal's backticks, which is what React sets as
// the rendered <style> element's text content (the JSX whitespace directly
// touching <style>/{ and }/</style> is not part of that string; the
// content between the backticks, including its own leading/trailing
// newlines and indentation, is).
export function extractInlineStyleBlock(source) {
  const match = source.match(/<style>\s*\{`([\s\S]*?)`\}\s*<\/style>/);
  if (!match) {
    throw new Error("extractInlineStyleBlock: could not locate a `<style>{`...`}</style>` block in the given source.");
  }
  return match[1];
}

export function computeAllCspHashes() {
  const indexHtml = readFile("index.html");
  const langDetectScript = extractLangDetectScript(indexHtml);

  const styleSources = {
    ListeningExercise: readFile("src/features/practice/exercises/ListeningExercise.tsx"),
    ConnectWordsExercise: readFile("src/features/practice/exercises/ConnectWordsExercise.tsx"),
    PracticeResults: readFile("src/features/practice/components/PracticeResults.tsx"),
  };

  const styleBlocks = Object.fromEntries(
    Object.entries(styleSources).map(([name, source]) => [name, extractInlineStyleBlock(source)]),
  );

  const scriptHash = `sha256-${sha256Base64(langDetectScript)}`;

  const styleHashesByOwner = Object.fromEntries(
    Object.entries(styleBlocks).map(([name, content]) => [name, `sha256-${sha256Base64(content)}`]),
  );

  // Dedupe: the CSP only needs each *distinct* hash once.
  const uniqueStyleHashes = [...new Set(Object.values(styleHashesByOwner))];

  return {
    script: { langDetectScript: scriptHash },
    style: { byOwner: styleHashesByOwner, unique: uniqueStyleHashes },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = computeAllCspHashes();
  console.log("Language-detection script hash:");
  console.log(`  'sha256-${result.script.langDetectScript.replace(/^sha256-/, "")}'`);
  console.log("\nInline style block hashes (by source file):");
  for (const [name, hash] of Object.entries(result.style.byOwner)) {
    console.log(`  ${name}: '${hash}'`);
  }
  console.log(`\nUnique style hashes (${result.style.unique.length}):`);
  for (const hash of result.style.unique) {
    console.log(`  '${hash}'`);
  }
}
