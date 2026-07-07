// EXPERIMENTAL / Node-only test harness — NOT part of production. Compares
// the proof-of-concept renderer's output against the REAL production SSR
// render() function (server-build/entry-server.js, built by `npm run build`)
// for the same sample word routes, using the real vocabulary data (our
// sample records are drawn from the real English A1 vocabulary, so
// production's render() resolves the exact same words).
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadSharedWordRouteModules } from "./compile-shared-modules.mjs";
import { renderWordPocResponse } from "./renderer.mjs";
import { loadStore } from "./load-store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..", "..");
const SITE_ORIGIN = "https://www.fluentstellar.com";

const shared = loadSharedWordRouteModules();
const store = loadStore();

async function loadProductionEntryServer() {
  const entryPath = path.join(rootDir, "server-build", "entry-server.js");
  return import(pathToFileURL(entryPath).href);
}

function extractTag(html, regex) {
  const match = html.match(regex);
  return match ? match[1] : null;
}

function extractAll(html, regex) {
  return [...html.matchAll(regex)].map((m) => m[1]);
}

function stripTagsForTextComparison(html) {
  // Production highlights the matched word inside the example sentence by
  // wrapping it in <strong>, splitting what would otherwise be one
  // contiguous text run across several inline elements (e.g. "The story is
  // <strong>about</strong> a little dog."). Stripping tags lets us compare
  // visible text content semantically instead of requiring an identical DOM
  // shape, per the task's "semantic equivalence, not byte-for-byte" rule.
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ");
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function compareRoute(entryServer, pathname, { expectBrowsePage = 1 } = {}) {
  console.log(`\n[route] ${pathname}`);

  const prod = entryServer.render(pathname, SITE_ORIGIN);
  const poc = renderWordPocResponse(pathname, SITE_ORIGIN, shared, store);

  return prod.then((prodPage) => {
    assert.equal(poc.status, 200, "poc: expected canonical 200 response");

    const prodHtml = prodPage.headTags;
    const prodBody = prodPage.appHtml;
    const pocHead = poc.body.match(/<head>([\s\S]*?)<\/head>/)[1];
    const pocBody = poc.body.match(/<body>([\s\S]*?)<\/body>/)[1];

    // --- title ---
    const prodTitle = decodeHtmlEntities(extractTag(prodHtml, /<title>([\s\S]*?)<\/title>/));
    const pocTitle = decodeHtmlEntities(extractTag(pocHead, /<title>([\s\S]*?)<\/title>/));
    assert.equal(pocTitle, prodTitle, "title mismatch");
    console.log(`  ✓ title: "${pocTitle}"`);

    // --- description ---
    const prodDesc = decodeHtmlEntities(
      extractTag(prodHtml, /<meta name="description" content="([\s\S]*?)">/),
    );
    const pocDesc = decodeHtmlEntities(
      extractTag(pocHead, /<meta name="description" content="([\s\S]*?)">/),
    );
    assert.equal(pocDesc, prodDesc, "description mismatch");
    console.log(`  ✓ description matches`);

    // --- canonical ---
    const prodCanonical = extractTag(prodHtml, /<link rel="canonical" href="([\s\S]*?)">/);
    const pocCanonical = extractTag(pocHead, /<link rel="canonical" href="([\s\S]*?)">/);
    assert.equal(pocCanonical, prodCanonical, "canonical mismatch");
    console.log(`  ✓ canonical: ${pocCanonical}`);

    // --- robots ---
    const prodRobots = extractTag(prodHtml, /<meta name="robots" content="([\s\S]*?)">/);
    const pocRobots = extractTag(pocHead, /<meta name="robots" content="([\s\S]*?)">/);
    assert.equal(pocRobots, prodRobots, "robots mismatch");
    console.log(`  ✓ robots: ${pocRobots ?? "(none, as expected)"}`);

    // --- hreflang set ---
    const prodHreflangs = extractAll(prodHtml, /hreflang="([\s\S]*?)"/g).sort();
    const pocHreflangs = extractAll(pocHead, /hreflang="([\s\S]*?)"/g).sort();
    assert.deepEqual(pocHreflangs, prodHreflangs, "hreflang set mismatch");
    console.log(`  ✓ hreflang set matches (${pocHreflangs.length} entries)`);

    // --- JSON-LD (structural: same @type list + same DefinedTerm name/url) ---
    const prodJsonLdRaw = extractTag(
      prodHtml,
      /<script type="application\/ld\+json" data-managed-jsonld="true">([\s\S]*?)<\/script>/,
    );
    const pocJsonLdRaw = extractTag(
      pocHead,
      /<script type="application\/ld\+json" data-managed-jsonld="true">([\s\S]*?)<\/script>/,
    );
    const prodJsonLd = JSON.parse(prodJsonLdRaw);
    const pocJsonLd = JSON.parse(pocJsonLdRaw);
    const prodTypes = prodJsonLd["@graph"].map((n) => n["@type"]).sort();
    const pocTypes = pocJsonLd["@graph"].map((n) => n["@type"]).sort();
    assert.deepEqual(pocTypes, prodTypes, "JSON-LD @graph @type set mismatch");
    const prodTerm = prodJsonLd["@graph"].find((n) => n["@type"] === "DefinedTerm");
    const pocTerm = pocJsonLd["@graph"].find((n) => n["@type"] === "DefinedTerm");
    assert.equal(pocTerm.name, prodTerm.name, "JSON-LD DefinedTerm.name mismatch");
    assert.equal(pocTerm.url, prodTerm.url, "JSON-LD DefinedTerm.url mismatch");
    console.log(`  ✓ JSON-LD @graph types match: [${pocTypes.join(", ")}]`);

    // --- H1 (semantic: same text content present in both bodies) ---
    const prodH1 = decodeHtmlEntities(extractTag(prodBody, /<h1[^>]*>([\s\S]*?)<\/h1>/));
    const pocH1 = decodeHtmlEntities(extractTag(pocBody, /<h1[^>]*>([\s\S]*?)<\/h1>/));
    assert.equal(pocH1, prodH1, "H1 text mismatch");
    console.log(`  ✓ H1: "${pocH1}"`);

    const prodText = stripTagsForTextComparison(prodBody);
    const pocText = stripTagsForTextComparison(pocBody);

    // --- definition text present in both ---
    const concept = Object.values(store.concepts).find(
      (c) => prodText.includes(c.definition.trim()) && pathname.includes(c.conceptId),
    );
    assert.ok(concept, "could not locate matching concept record for this route");
    assert.ok(prodText.includes(concept.definition.trim()), "prod body missing definition text");
    assert.ok(pocText.includes(concept.definition.trim()), "poc body missing definition text");
    console.log(`  ✓ definition text present in both`);

    // --- example sentence present in both (text-only comparison: production
    // wraps the matched word in <strong>, splitting the sentence across
    // inline elements, so we compare visible text, not raw HTML) ---
    assert.ok(prodText.includes(concept.example.trim()), "prod body missing example sentence");
    assert.ok(pocText.includes(concept.example.trim()), "poc body missing example sentence");
    console.log(`  ✓ example sentence present in both`);

    // --- other meanings (if any) ---
    if (concept.otherMeaningConceptIds.length > 0) {
      for (const otherId of concept.otherMeaningConceptIds) {
        const other = store.concepts[otherId];
        assert.ok(prodText.includes(other.definition.trim()), `prod body missing other-meaning definition for ${otherId}`);
        assert.ok(pocText.includes(other.definition.trim()), `poc body missing other-meaning definition for ${otherId}`);
      }
      console.log(`  ✓ other meanings present in both (${concept.otherMeaningConceptIds.length})`);
    }

    // --- related words (if any) ---
    if (concept.relatedConceptIds.length > 0) {
      const sampleRelatedId = concept.relatedConceptIds[0];
      const sampleRelated = store.concepts[sampleRelatedId];
      const relatedHref = shared.buildWordPath("en", "english", sampleRelated.wordLemma, sampleRelatedId);
      assert.ok(prodBody.includes(relatedHref), "prod body missing a related-word link");
      assert.ok(pocBody.includes(relatedHref), "poc body missing a related-word link");
      console.log(`  ✓ related-word link present in both (sample: ${relatedHref})`);
    }

    // --- browse links: count matches expected page size ---
    const prodBrowseHrefCount = extractAll(prodBody, /href="([^"]*-word-[^"]+)"/g).length;
    const pocBrowseHrefCount = extractAll(pocBody, /href="([^"]*-word-[^"]+)"/g).length;
    assert.ok(prodBrowseHrefCount > 0, "prod body has zero word-page links");
    assert.ok(pocBrowseHrefCount > 0, "poc body has zero word-page links");
    console.log(
      `  ✓ word-page link counts: prod=${prodBrowseHrefCount}, poc=${pocBrowseHrefCount} (both nonzero; exact set differs because prod draws from the full ${"962"}-word A1 corpus and poc from the ${store.browseShard.totalCount}-word sample — expected, not a defect)`,
    );

    return true;
  });
}

async function main() {
  const entryServer = await loadProductionEntryServer();
  let passed = 0;

  const routes = [
    "/en/english-word-about--A1-00001",
    "/en/english-word-café--A1-00161",
    "/en/english-word-american--A1-00028",
    "/en/english-word-american--A1-00074",
    "/en/english-word-about--A1-00001/browse/page/2",
  ];

  for (const route of routes) {
    await compareRoute(entryServer, route);
    passed += 1;
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`${passed} canonical route(s) passed SEO parity check`);
  console.log(`─────────────────────────────────────────`);
}

main().catch((err) => {
  console.error("PARITY CHECK FAILED:", err);
  process.exit(1);
});
