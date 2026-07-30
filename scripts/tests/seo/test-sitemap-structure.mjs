/**
 * Sitemap structural regression tests.
 *
 * NEW coverage: scripts/tests/seo/test-word-seo-routes.mjs already spot-checks that
 * legacy/slug-only URLs are absent from word sitemaps and that entries use
 * the canonical double-hyphen concept format — but it only inspects the
 * literal "about" word case, and nothing currently verifies sitemap-index
 * ↔ child-file consistency, cross-file duplicate URLs, or exhaustive
 * canonical-shape conformance across every entry in every word sitemap file.
 * This script adds that structural layer without touching sitemap generation
 * itself (scripts/generation/generate-sitemap.mjs is not modified or re-run — this only
 * reads the already-generated public/sitemap.xml and public/sitemaps/*.xml
 * files as they currently sit in the working tree).
 *
 * Run: node scripts/tests/seo/test-sitemap-structure.mjs
 * No build required.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const SITEMAPS_DIR = path.join(PUBLIC_DIR, "sitemaps");

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

function extractSitemapIndexEntries(xml) {
  return Array.from(xml.matchAll(/<sitemap>\s*<loc>([^<]+)<\/loc>/g)).map(([, loc]) => loc);
}

function findDuplicates(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return Array.from(duplicates);
}

async function main() {
  console.log("\n[1] sitemap.xml index ↔ public/sitemaps/*.xml consistency");
  {
    const indexXml = readFile("public/sitemap.xml");
    const indexedLocs = extractSitemapIndexEntries(indexXml);
    const indexedFileNames = indexedLocs.map((loc) => {
      const url = new URL(loc);
      return url.pathname.replace(/^\/+/, "");
    });

    test("sitemap.xml is well-formed XML (no unclosed tags)", () => {
      const openTags = (indexXml.match(/<sitemap>/g) ?? []).length;
      const closeTags = (indexXml.match(/<\/sitemap>/g) ?? []).length;
      assert.equal(openTags, closeTags, `mismatched <sitemap> tags: ${openTags} open vs ${closeTags} close`);
    });

    test("sitemap.xml lists at least one child sitemap", () => {
      assert.ok(indexedFileNames.length > 0);
    });

    const actualFiles = fs
      .readdirSync(SITEMAPS_DIR)
      .filter((name) => name.endsWith(".xml"))
      .map((name) => `sitemaps/${name}`);

    test("every file referenced by sitemap.xml actually exists in public/sitemaps/", () => {
      const missing = indexedFileNames.filter((name) => !actualFiles.includes(name));
      assert.deepEqual(missing, [], `sitemap.xml references missing files: ${missing.join(", ")}`);
    });

    test("every file in public/sitemaps/ is referenced by sitemap.xml (no orphaned child sitemaps)", () => {
      const orphaned = actualFiles.filter((name) => !indexedFileNames.includes(name));
      assert.deepEqual(orphaned, [], `orphaned sitemap files not listed in the index: ${orphaned.join(", ")}`);
    });

    test("sitemap.xml has no duplicate child-sitemap entries", () => {
      assert.deepEqual(findDuplicates(indexedFileNames), []);
    });
  }

  console.log("\n[2] Per-file XML well-formedness and <loc> uniqueness");
  const childFiles = fs.readdirSync(SITEMAPS_DIR).filter((name) => name.endsWith(".xml"));
  const allLocsByFile = new Map();

  for (const fileName of childFiles) {
    const xml = fs.readFileSync(path.join(SITEMAPS_DIR, fileName), "utf8");
    const locs = extractLocs(xml);
    allLocsByFile.set(fileName, locs);

    test(`${fileName}: <url> open/close tag counts match`, () => {
      const openTags = (xml.match(/<url>/g) ?? []).length;
      const closeTags = (xml.match(/<\/url>/g) ?? []).length;
      assert.equal(openTags, closeTags);
    });

    test(`${fileName}: <loc> count matches <url> count (no stray/extra <loc>)`, () => {
      const urlCount = (xml.match(/<url>/g) ?? []).length;
      assert.equal(locs.length, urlCount);
    });

    test(`${fileName}: has no duplicate <loc> entries within the file`, () => {
      assert.deepEqual(findDuplicates(locs), []);
    });

    test(`${fileName}: every <loc> is an absolute https://www.fluentstellar.com URL`, () => {
      const bad = locs.filter((loc) => !loc.startsWith("https://www.fluentstellar.com/"));
      assert.deepEqual(bad, [], `non-production-hosted URLs: ${bad.slice(0, 3).join(", ")}`);
    });
  }

  console.log("\n[3] Cross-file duplicate <loc> detection");
  {
    const globalCounts = new Map();
    for (const [fileName, locs] of allLocsByFile) {
      for (const loc of locs) {
        const list = globalCounts.get(loc) ?? [];
        list.push(fileName);
        globalCounts.set(loc, list);
      }
    }
    const crossFileDuplicates = Array.from(globalCounts.entries()).filter(([, files]) => files.length > 1);

    test("no URL appears in more than one sitemap file", () => {
      assert.deepEqual(
        crossFileDuplicates.map(([loc]) => loc),
        [],
        `URLs duplicated across files: ${crossFileDuplicates
          .slice(0, 3)
          .map(([loc, files]) => `${loc} (${files.join(", ")})`)
          .join("; ")}`,
      );
    });
  }

  console.log("\n[4] Word sitemap exclusion policy");
  {
    // Word SEO pages remain live, routable, and indexable (see
    // src/seo/wordPages/wordMetadata.ts) — they are intentionally excluded
    // from XML sitemap discovery only. Canonical-shape coverage for word
    // routes lives in test-word-seo-routes.mjs, validated against the
    // route-manifest source directly rather than a generated sitemap file.
    const wordSitemapFiles = childFiles.filter((name) => /^sitemap-words-/.test(name));
    test("no sitemap-words-*.xml files exist under public/sitemaps/", () => {
      assert.deepEqual(wordSitemapFiles, []);
    });

    const indexXml = readFile("public/sitemap.xml");
    const indexedFileNames = extractSitemapIndexEntries(indexXml).map((loc) => {
      const url = new URL(loc);
      return url.pathname.replace(/^\/+/, "");
    });

    test("sitemap.xml has no index entry referencing a word sitemap", () => {
      assert.deepEqual(
        indexedFileNames.filter((name) => /^sitemaps\/sitemap-words-/.test(name)),
        [],
      );
    });

    test("sitemap.xml still indexes the expected non-word sitemap children", () => {
      for (const expected of ["sitemaps/sitemap-core.xml", "sitemaps/sitemap-cefr.xml", "sitemaps/verb-lists.xml"]) {
        assert.ok(indexedFileNames.includes(expected), `sitemap.xml is missing expected child: ${expected}`);
      }
    });
  }

  console.log("\n[5] Core and CEFR sitemap sanity");
  {
    const coreXml = readFile("public/sitemaps/sitemap-core.xml");
    const coreLocs = extractLocs(coreXml);
    test("sitemap-core.xml includes the homepage", () =>
      assert.ok(coreLocs.some((loc) => loc === "https://www.fluentstellar.com/")));
    test("sitemap-core.xml includes /about and /help", () => {
      assert.ok(coreLocs.some((loc) => loc.endsWith("/about")));
      assert.ok(coreLocs.some((loc) => loc.endsWith("/help")));
    });

    if (fs.existsSync(path.join(SITEMAPS_DIR, "sitemap-cefr.xml"))) {
      const cefrXml = readFile("public/sitemaps/sitemap-cefr.xml");
      const cefrLocs = extractLocs(cefrXml);
      test("sitemap-cefr.xml has no duplicate entries", () => assert.deepEqual(findDuplicates(cefrLocs), []));
      test("sitemap-cefr.xml is non-empty", () => assert.ok(cefrLocs.length > 0));
    }

    const indexXml = readFile("public/sitemap.xml");
    const indexedLocs = extractSitemapIndexEntries(indexXml);
    test("sitemap.xml references the dedicated verb-lists sitemap", () =>
      assert.ok(indexedLocs.includes("https://www.fluentstellar.com/sitemaps/verb-lists.xml")));

    const verbListsXml = readFile("public/sitemaps/verb-lists.xml");
    const verbListLocs = extractLocs(verbListsXml);
    test("verb-lists.xml contains exactly 98 verb-list URLs", () => assert.equal(verbListLocs.length, 98));
    test("verb-lists.xml has no duplicate entries", () => assert.deepEqual(findDuplicates(verbListLocs), []));
    test("verb-lists.xml and sitemap-core.xml do not overlap", () => {
      const overlap = verbListLocs.filter((loc) => coreLocs.includes(loc));
      assert.deepEqual(overlap, []);
    });
  }

  console.log("\n[6] static files back the Cloudflare Static Assets MIME contract");
  {
    // On Cloudflare, sitemap/robots Content-Type comes from Static Assets'
    // extension-based MIME mapping (verified live: application/xml for
    // /sitemap.xml and /sitemaps/*, text/plain for /robots.txt). The repo-side
    // contract is therefore that these routes exist as real .xml/.txt files
    // under public/ (copied verbatim into dist/ and the Worker's assets-full/
    // bundle) rather than being rewritten or served by code.
    test("/sitemap.xml exists as a static .xml file", () =>
      assert.ok(fs.existsSync(path.join(PUBLIC_DIR, "sitemap.xml"))));
    test("public/sitemaps/ contains only .xml files", () => {
      const entries = fs.readdirSync(SITEMAPS_DIR);
      assert.ok(entries.length > 0, "public/sitemaps/ is empty");
      assert.deepEqual(entries.filter((name) => !name.endsWith(".xml")), []);
    });
    test("/robots.txt exists as a static .txt file", () =>
      assert.ok(fs.existsSync(path.join(PUBLIC_DIR, "robots.txt"))));
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────────\n`);

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log("sitemap structure tests passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
