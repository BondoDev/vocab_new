// Guard: scripts/generation/generate-sitemap.mjs's CEFR vocabulary-level
// route enumeration must derive from the application's own route registry
// (getAllLocalizedVocabularyRoutes(), src/data/seo/vocabularyLevels/
// vocabularyLevelRoutes.ts) — not by scanning the legacy
// src/data/seo/vocabularyLevels/{ui}/{target}.json matrix, which is no
// longer used for page rendering or metadata (see docs/generated-data.md).
//
// Reads the already-generated public/sitemaps/sitemap-cefr.xml as it
// currently sits in the working tree (does not run the generator itself —
// run `npm run sitemap` first if verifying a fresh change) and compares it
// against the live route registry, so a regression back to matrix scanning,
// a missing/extra route, or incorrect localized slug construction all fail
// this test without reimplementing the collector's logic.
//
// Run: node scripts/tests/seo/test-sitemap-vocabulary-route-source.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadVocabularyLevelRoutes } from "../../lib/load-vocabulary-level-routes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const SITE_URL = (process.env.SITE_URL || "https://www.fluentstellar.com").replace(/\/+$/, "");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");
}

function extractLocs(xml) {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map(([, loc]) => loc);
}

console.log("\n=== sitemap-cefr.xml vocabulary-level route source ===\n");

const loader = loadVocabularyLevelRoutes(".tmp-test-sitemap-vocabulary-route-source");
let expectedVocabularyPaths;
try {
  expectedVocabularyPaths = loader.routes
    .getAllLocalizedVocabularyRoutes()
    .map((route) => route.path);
} finally {
  loader.cleanup();
}

test("getAllLocalizedVocabularyRoutes() has no duplicate paths", () => {
  const seen = new Set();
  const duplicates = expectedVocabularyPaths.filter((p) => (seen.has(p) ? true : (seen.add(p), false)));
  assert.deepEqual(duplicates.slice(0, 10), [], `${duplicates.length} duplicate route(s)`);
});

const cefrXml = readFile("public/sitemaps/sitemap-cefr.xml");
const cefrLocs = new Set(extractLocs(cefrXml));

test("every getAllLocalizedVocabularyRoutes() path appears in sitemap-cefr.xml", () => {
  const missing = expectedVocabularyPaths.filter((p) => !cefrLocs.has(`${SITE_URL}${p}`));
  assert.deepEqual(
    missing.slice(0, 10),
    [],
    `${missing.length} route(s) from getAllLocalizedVocabularyRoutes() missing from sitemap-cefr.xml (showing up to 10)`,
  );
});

const levelTestEntries = JSON.parse(
  readFile("src/data/seo/levelTests/seo_level_test_content.json").replace(/^﻿/, ""),
);
const expectedLevelTestPaths = new Set(
  levelTestEntries
    .map((entry) => (entry && typeof entry.path === "string" ? entry.path.trim() : ""))
    .filter(Boolean),
);

test("sitemap-cefr.xml contains exactly the vocabulary-level routes plus the level-test routes, no more", () => {
  const expectedTotal = new Set(expectedVocabularyPaths).size + expectedLevelTestPaths.size;
  assert.equal(
    cefrLocs.size,
    expectedTotal,
    `sitemap-cefr.xml has ${cefrLocs.size} URLs; expected ${expectedTotal} (${new Set(expectedVocabularyPaths).size} vocabulary-level + ${expectedLevelTestPaths.size} level-test)`,
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("sitemap vocabulary-level route source guard passed");
}
