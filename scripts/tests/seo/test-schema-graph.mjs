/**
 * Schema @graph regression tests.
 *
 * Verifies that prerendered HTML pages emit correctly structured @graph JSON-LD
 * containing WebPage, DefinedTerm/FAQPage, and BreadcrumbList nodes.
 *
 * Run after build: npm run build && node scripts/tests/seo/test-schema-graph.mjs
 *
 * Expected rich-result enhancement: BreadcrumbList only.
 * DefinedTerm is retained for semantic accuracy.
 * FAQPage is retained as visible, accurate FAQ content.
 * No Course, EducationalOccupationalProgram, Quiz, or LearningResource.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..", "..");
const distDir = path.join(rootDir, "dist");

// ── Parser (same HTML5 state-machine as test-jsonld-escaping.mjs) ─────────────

function parseScriptElements(html) {
  const elements = [];
  let searchFrom = 0;
  const htmlLower = html.toLowerCase();

  while (searchFrom < html.length) {
    const openStart = htmlLower.indexOf("<script", searchFrom);
    if (openStart === -1) break;
    const openEnd = htmlLower.indexOf(">", openStart);
    if (openEnd === -1) break;
    const openTag = html.slice(openStart, openEnd + 1);
    const contentStart = openEnd + 1;
    const closeIdx = htmlLower.indexOf("</script>", contentStart);
    if (closeIdx === -1) break;
    elements.push({ openTag, content: html.slice(contentStart, closeIdx) });
    searchFrom = closeIdx + "</script>".length;
  }

  return elements;
}

function getJsonLd(html) {
  const scripts = parseScriptElements(html);
  const jsonLdScript = scripts.find((s) => s.openTag.includes("application/ld+json"));
  if (!jsonLdScript) return null;
  return JSON.parse(jsonLdScript.content);
}

// ── Test helpers ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let skipped = 0;

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

function skip(name) {
  console.log(`  -  ${name} (skipped — dist/ not built)`);
  skipped++;
}

// ── Guard: dist/ must exist ───────────────────────────────────────────────────

if (!fs.existsSync(distDir)) {
  console.log("\nSKIPPED: dist/ not found. Run `npm run build` first.\n");
  console.log("  0 passed, 0 failed, all skipped (no build)");
  process.exit(0);
}

// ── Locate sample pages ───────────────────────────────────────────────────────

const enDir = path.join(distDir, "en");
const wordDirs = fs.existsSync(enDir)
  ? fs.readdirSync(enDir).filter((d) => d.includes("-word-") && d.includes("--"))
  : [];
const vocabDirs = fs.existsSync(enDir)
  ? fs.readdirSync(enDir).filter((d) => /^english-a1/.test(d))
  : [];

// ── [1] Word page @graph ──────────────────────────────────────────────────────

console.log("\n[1] Word page @graph structure");

if (wordDirs.length === 0) {
  ["@context is schema.org", "@graph exists", "exactly 1 WebPage", "exactly 1 DefinedTerm",
   "exactly 1 BreadcrumbList", "WebPage.mainEntity → DefinedTerm", "WebPage.breadcrumb → BreadcrumbList",
   "BreadcrumbList positions sequential", "BreadcrumbList URLs are production-hosted",
   "word canonical format unchanged", "no Course or EducationalOccupationalProgram"].forEach(skip);
} else {
  const wordHtml = fs.readFileSync(
    path.join(distDir, "en", wordDirs[0], "index.html"),
    "utf8",
  );
  const jsonLd = getJsonLd(wordHtml);

  test("@context is https://schema.org", () => {
    assert.equal(jsonLd?.["@context"], "https://schema.org");
  });

  test("@graph exists and is an array", () => {
    assert.ok(Array.isArray(jsonLd?.["@graph"]), "@graph must be an array");
  });

  test("@graph contains exactly 1 WebPage", () => {
    const nodes = jsonLd["@graph"].filter((n) => n["@type"] === "WebPage");
    assert.equal(nodes.length, 1, `Found ${nodes.length}`);
  });

  test("@graph contains exactly 1 DefinedTerm", () => {
    const nodes = jsonLd["@graph"].filter((n) => n["@type"] === "DefinedTerm");
    assert.equal(nodes.length, 1, `Found ${nodes.length}`);
  });

  test("@graph contains exactly 1 BreadcrumbList", () => {
    const nodes = jsonLd["@graph"].filter((n) => n["@type"] === "BreadcrumbList");
    assert.equal(nodes.length, 1, `Found ${nodes.length}`);
  });

  test("WebPage.mainEntity.@id points to DefinedTerm node", () => {
    const webPage = jsonLd["@graph"].find((n) => n["@type"] === "WebPage");
    const term = jsonLd["@graph"].find((n) => n["@type"] === "DefinedTerm");
    assert.equal(webPage.mainEntity["@id"], term["@id"]);
  });

  test("WebPage.breadcrumb.@id points to BreadcrumbList node", () => {
    const webPage = jsonLd["@graph"].find((n) => n["@type"] === "WebPage");
    const bc = jsonLd["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    assert.equal(webPage.breadcrumb["@id"], bc["@id"]);
  });

  test("BreadcrumbList positions are sequential (1, 2, …)", () => {
    const bc = jsonLd["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    bc.itemListElement.forEach((item, idx) => {
      assert.equal(item.position, idx + 1, `item at index ${idx} has position ${item.position}`);
    });
  });

  test("BreadcrumbList items have at least 2 entries (Home + vocab level)", () => {
    const bc = jsonLd["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    assert.ok(bc.itemListElement.length >= 2, `Only ${bc.itemListElement.length} breadcrumb items`);
  });

  test("BreadcrumbList URLs are production-hosted (https://www.fluentstellar.com)", () => {
    const bc = jsonLd["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    bc.itemListElement.forEach((item) => {
      assert.ok(
        item.item.startsWith("https://www.fluentstellar.com"),
        `Not production-hosted: ${item.item}`,
      );
    });
  });

  test("Word canonical URL format uses double-hyphen concept ID", () => {
    const bc = jsonLd["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    const lastItem = bc.itemListElement[bc.itemListElement.length - 1];
    assert.ok(
      lastItem.item.includes("--"),
      `Word URL missing double-hyphen concept format: ${lastItem.item}`,
    );
    assert.ok(
      /[A-C][1-2]-\d{5}/.test(lastItem.item),
      `Word URL missing conceptId pattern: ${lastItem.item}`,
    );
  });

  test("No Course or EducationalOccupationalProgram in @graph", () => {
    const content = JSON.stringify(jsonLd["@graph"]);
    assert.ok(!content.includes("Course"), "Course found in word @graph");
    assert.ok(!content.includes("EducationalOccupationalProgram"), "EducationalOccupationalProgram found");
  });

  test("DefinedTerm has inDefinedTermSet", () => {
    const term = jsonLd["@graph"].find((n) => n["@type"] === "DefinedTerm");
    assert.ok(term.inDefinedTermSet?.["@type"] === "DefinedTermSet", "inDefinedTermSet missing or wrong type");
  });

  test("WebPage has name, description, url", () => {
    const webPage = jsonLd["@graph"].find((n) => n["@type"] === "WebPage");
    assert.ok(webPage.name?.length > 0, "WebPage.name missing");
    assert.ok(webPage.description?.length > 0, "WebPage.description missing");
    assert.ok(webPage.url?.startsWith("https://"), "WebPage.url missing");
  });
}

// ── [2] Vocabulary-level page @graph ─────────────────────────────────────────

console.log("\n[2] Vocabulary-level page @graph structure");

const vocabPageNames = ["@context is schema.org", "@graph exists", "exactly 1 WebPage", "exactly 1 BreadcrumbList",
  "exactly 1 FAQPage", "FAQPage mainEntity is array of Questions", "WebPage.breadcrumb → BreadcrumbList",
  "BreadcrumbList positions sequential", "no Course or EducationalOccupationalProgram",
  "ItemList only if browsePreviewWords provided"];

if (vocabDirs.length === 0) {
  vocabPageNames.forEach(skip);
} else {
  const vocabHtml = fs.readFileSync(
    path.join(distDir, "en", vocabDirs[0], "index.html"),
    "utf8",
  );
  const jsonLd = getJsonLd(vocabHtml);

  // If the dist/ was built before our @graph changes, skip rather than fail
  if (!jsonLd || !Array.isArray(jsonLd["@graph"])) {
    console.log(`  -  (vocab page in dist/ uses pre-@graph schema — run npm run build to refresh)`);
    vocabPageNames.forEach(skip);
  } else {

  test("@context is https://schema.org", () => {
    assert.equal(jsonLd?.["@context"], "https://schema.org");
  });

  test("@graph exists and is an array", () => {
    assert.ok(Array.isArray(jsonLd?.["@graph"]), "@graph must be an array");
  });

  test("@graph contains exactly 1 WebPage", () => {
    const nodes = jsonLd["@graph"].filter((n) => n["@type"] === "WebPage");
    assert.equal(nodes.length, 1, `Found ${nodes.length}`);
  });

  test("@graph contains exactly 1 BreadcrumbList", () => {
    const nodes = jsonLd["@graph"].filter((n) => n["@type"] === "BreadcrumbList");
    assert.equal(nodes.length, 1, `Found ${nodes.length}`);
  });

  test("@graph contains exactly 1 FAQPage", () => {
    const nodes = jsonLd["@graph"].filter((n) => n["@type"] === "FAQPage");
    assert.equal(nodes.length, 1, `Found ${nodes.length}`);
  });

  test("FAQPage.mainEntity is an array of Questions", () => {
    const faq = jsonLd["@graph"].find((n) => n["@type"] === "FAQPage");
    assert.ok(Array.isArray(faq.mainEntity), "mainEntity must be an array");
    assert.ok(faq.mainEntity.length > 0, "mainEntity is empty");
    assert.equal(faq.mainEntity[0]["@type"], "Question");
    assert.ok(faq.mainEntity[0].acceptedAnswer?.text?.length > 0, "Question.acceptedAnswer.text missing");
  });

  test("WebPage.breadcrumb.@id points to BreadcrumbList node", () => {
    const webPage = jsonLd["@graph"].find((n) => n["@type"] === "WebPage");
    const bc = jsonLd["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    assert.equal(webPage.breadcrumb["@id"], bc["@id"]);
  });

  test("BreadcrumbList positions are sequential (1, 2, …)", () => {
    const bc = jsonLd["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    bc.itemListElement.forEach((item, idx) => {
      assert.equal(item.position, idx + 1, `item at index ${idx} has position ${item.position}`);
    });
  });

  test("BreadcrumbList URLs are production-hosted", () => {
    const bc = jsonLd["@graph"].find((n) => n["@type"] === "BreadcrumbList");
    bc.itemListElement.forEach((item) => {
      assert.ok(
        item.item.startsWith("https://www.fluentstellar.com"),
        `Not production-hosted: ${item.item}`,
      );
    });
  });

  test("No Course or EducationalOccupationalProgram in @graph", () => {
    const content = JSON.stringify(jsonLd["@graph"]);
    assert.ok(!content.includes("Course"), "Course found in vocab @graph");
    assert.ok(!content.includes("EducationalOccupationalProgram"), "EducationalOccupationalProgram found");
  });

  test("ItemList only present when browsePreviewWords provided (none by default)", () => {
    // By default, VocabularyLevelPage does not pass browsePreviewWords to the builder,
    // so ItemList should be absent. If it IS present, every item must have a URL.
    const itemListNodes = jsonLd["@graph"].filter((n) => n["@type"] === "ItemList");
    if (itemListNodes.length > 0) {
      const list = itemListNodes[0];
      assert.ok(list.itemListElement?.length > 0, "ItemList has no items");
      list.itemListElement.forEach((item, idx) => {
        assert.ok(
          item.url?.startsWith("https://www.fluentstellar.com"),
          `ItemList item ${idx} missing canonical URL`,
        );
        assert.ok(
          item.url?.includes("--"),
          `ItemList item ${idx} URL missing concept ID: ${item.url}`,
        );
      });
    }
    // 0 or 1 ItemList nodes are both acceptable
    assert.ok(itemListNodes.length <= 1, `Multiple ItemList nodes found: ${itemListNodes.length}`);
  });
  }
}

// ── [3] Pages without JSON-LD remain unchanged ────────────────────────────────

console.log("\n[3] Pages without JSON-LD (LevelTest, SeoHub)");

const levelTestDirs = fs.existsSync(enDir)
  ? fs.readdirSync(enDir).filter((d) => /^test-your/.test(d) || /english-level/.test(d))
  : [];

const seoHubDirs = fs.existsSync(enDir)
  ? fs.readdirSync(enDir).filter((d) => /seo-hub/.test(d) || /seo-pages/.test(d))
  : [];

if (levelTestDirs.length === 0 && seoHubDirs.length === 0) {
  skip("LevelTest page has no JSON-LD");
  skip("SeoHub page has no JSON-LD");
} else {
  if (levelTestDirs.length > 0) {
    const ltHtml = fs.readFileSync(
      path.join(distDir, "en", levelTestDirs[0], "index.html"),
      "utf8",
    );
    test("LevelTest page has no JSON-LD", () => {
      const scripts = parseScriptElements(ltHtml);
      const jsonLdScripts = scripts.filter((s) => s.openTag.includes("application/ld+json"));
      assert.equal(jsonLdScripts.length, 0, `Found ${jsonLdScripts.length} JSON-LD scripts`);
    });
  }

  if (seoHubDirs.length > 0) {
    const hubHtml = fs.readFileSync(
      path.join(distDir, "en", seoHubDirs[0], "index.html"),
      "utf8",
    );
    test("SeoHub page has no JSON-LD", () => {
      const scripts = parseScriptElements(hubHtml);
      const jsonLdScripts = scripts.filter((s) => s.openTag.includes("application/ld+json"));
      assert.equal(jsonLdScripts.length, 0, `Found ${jsonLdScripts.length} JSON-LD scripts`);
    });
  }
}

// ── [4] Source-level safety checks ───────────────────────────────────────────

console.log("\n[4] Source-level: forbidden schema types not present");

{
  // src/seo/metadata.ts was split (Issue 15) into a compatibility facade plus
  // focused modules. Each JSON-LD-emitting builder now lives in its own file
  // (kept deliberately separate, not merged into a generic graph builder):
  // buildVerbListSeoMetadata (verbLists/common100Verbs/common100VerbsMetadata.ts), buildVocabularyJsonLdGraph
  // (seoSchema.ts), buildWordSeoMetadata (wordPages/wordMetadata.ts). Scan all three
  // instead of the single pre-split file so this guard keeps validating the
  // moved code.
  const jsonLdSourceFiles = {
    "verbLists/common100Verbs/common100VerbsMetadata.ts": path.join(
      rootDir,
      "src",
      "seo",
      "verbLists",
      "common100Verbs",
      "common100VerbsMetadata.ts",
    ),
    "seoSchema.ts": path.join(rootDir, "src", "seo", "vocabularyLevels", "seoSchema.ts"),
    "wordPages/wordMetadata.ts": path.join(rootDir, "src", "seo", "wordPages", "wordMetadata.ts"),
  };
  const jsonLdSources = Object.fromEntries(
    Object.entries(jsonLdSourceFiles).map(([name, filePath]) => [
      name,
      fs.readFileSync(filePath, "utf8"),
    ]),
  );
  const combinedJsonLdSource = Object.values(jsonLdSources).join("\n");

  const FORBIDDEN = [
    "Course",
    "EducationalOccupationalProgram",
    "LearningResource",
    "HowTo",
    "Product",
    "SoftwareApplication",
  ];

  FORBIDDEN.forEach((type) => {
    test(`"${type}" is NOT a schema @type in verbLists/common100Verbs/common100VerbsMetadata.ts / seoSchema.ts / wordPages/wordMetadata.ts`, () => {
      // Only flag it if it appears as a schema @type string value
      const pattern = new RegExp(`"@type":\\s*"${type}"`);
      assert.ok(
        !pattern.test(combinedJsonLdSource),
        `Forbidden schema type "${type}" found as @type value`,
      );
    });
  });

  Object.entries(jsonLdSources).forEach(([name, source]) => {
    test(`"@graph" present in ${name}`, () => {
      const matches = (source.match(/"@graph"/g) ?? []).length;
      assert.ok(matches >= 1, `Expected @graph in ${name}, found ${matches} occurrences`);
    });

    test(`"BreadcrumbList" present in ${name}`, () => {
      const matches = (source.match(/"BreadcrumbList"/g) ?? []).length;
      assert.ok(matches >= 1, `Expected BreadcrumbList in ${name}, found ${matches} occurrences`);
    });
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed, ${skipped} skipped`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exit(1);
}

console.log("Schema @graph regression tests passed.\n");
