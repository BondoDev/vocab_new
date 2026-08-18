// STAGING-ONLY, Node-only test harness. Compares the RUNNING wrangler dev
// Worker (http://127.0.0.1:8787 by default) against the real production SSR
// render() (server-build/entry-server.js) for the same sample word routes.
// Requires both `npm run build` (for server-build/entry-server.js) and
// `npx wrangler dev --config workers/word-ssr/config/wrangler.full.toml
// --local` (run from the repository root) to already be running.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(workerDir, "..", "..");
const WORKER_ORIGIN = process.env.STAGING_WORKER_ORIGIN ?? "http://127.0.0.1:8787";
const SITE_ORIGIN = "https://www.fluentstellar.com";

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

function decodeHtmlEntities(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTagsForTextComparison(html) {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ");
}

async function compareCanonicalRoute(entryServer, pathname) {
  console.log(`\n[route] ${pathname}`);

  const prodPage = await entryServer.render(pathname, SITE_ORIGIN);
  const stagingRes = await fetch(`${WORKER_ORIGIN}${pathname}`);
  assert.equal(stagingRes.status, 200, "staging: expected canonical 200 response");
  const stagingHtml = await stagingRes.text();

  const prodHtml = prodPage.headTags;
  const prodBody = prodPage.appHtml;
  const stagingHead = stagingHtml.match(/<head>([\s\S]*?)<\/head>/)[1];
  const stagingBody = stagingHtml.match(/<div id="root">([\s\S]*)<\/div>\s*<\/body>/)[1];

  const prodTitle = decodeHtmlEntities(extractTag(prodHtml, /<title>([\s\S]*?)<\/title>/));
  const stagingTitle = decodeHtmlEntities(extractTag(stagingHead, /<title>([\s\S]*?)<\/title>/));
  assert.equal(stagingTitle, prodTitle, "title mismatch");
  console.log(`  title: "${stagingTitle}"`);

  const prodDesc = decodeHtmlEntities(extractTag(prodHtml, /<meta name="description" content="([\s\S]*?)">/));
  const stagingDesc = decodeHtmlEntities(extractTag(stagingHead, /<meta name="description" content="([\s\S]*?)">/));
  assert.equal(stagingDesc, prodDesc, "description mismatch");
  console.log("  description matches");

  const prodRobots = extractTag(prodHtml, /<meta name="robots" content="([\s\S]*?)">/);
  const stagingRobots = extractTag(stagingHead, /<meta name="robots" content="([\s\S]*?)">/);
  assert.equal(stagingRobots, prodRobots, "robots mismatch");
  console.log(`  robots: ${stagingRobots ?? "(none, as expected)"}`);

  const prodHreflangs = extractAll(prodHtml, /hreflang="([\s\S]*?)"/g).sort();
  const stagingHreflangs = extractAll(stagingHead, /hreflang="([\s\S]*?)"/g).sort();
  assert.deepEqual(stagingHreflangs, prodHreflangs, "hreflang set mismatch");
  console.log(`  hreflang set matches (${stagingHreflangs.length} entries)`);

  const prodJsonLd = JSON.parse(
    extractTag(prodHtml, /<script type="application\/ld\+json" data-managed-jsonld="true">([\s\S]*?)<\/script>/),
  );
  const stagingJsonLd = JSON.parse(
    extractTag(stagingHead, /<script type="application\/ld\+json" data-managed-jsonld="true">([\s\S]*?)<\/script>/),
  );
  const prodTypes = prodJsonLd["@graph"].map((n) => n["@type"]).sort();
  const stagingTypes = stagingJsonLd["@graph"].map((n) => n["@type"]).sort();
  assert.deepEqual(stagingTypes, prodTypes, "JSON-LD @graph type set mismatch");
  const prodTerm = prodJsonLd["@graph"].find((n) => n["@type"] === "DefinedTerm");
  const stagingTerm = stagingJsonLd["@graph"].find((n) => n["@type"] === "DefinedTerm");
  assert.equal(stagingTerm.name, prodTerm.name, "JSON-LD DefinedTerm.name mismatch");
  console.log(`  JSON-LD @graph types match: [${stagingTypes.join(", ")}]`);

  const prodH1 = decodeHtmlEntities(extractTag(prodBody, /<h1[^>]*>([\s\S]*?)<\/h1>/));
  const stagingH1 = decodeHtmlEntities(extractTag(stagingBody, /<h1[^>]*>([\s\S]*?)<\/h1>/));
  assert.equal(stagingH1, prodH1, "H1 text mismatch");
  console.log(`  H1: "${stagingH1}"`);

  const prodText = stripTagsForTextComparison(prodBody);
  const stagingText = stripTagsForTextComparison(stagingBody);
  const definitionMatch = prodBody.match(/<p class="mt-5 text-base leading-relaxed text-muted-foreground">([\s\S]*?)<\/p>/);
  if (definitionMatch) {
    const definition = decodeHtmlEntities(definitionMatch[1]).trim();
    assert.ok(prodText.includes(definition), "sanity: prod body should contain its own definition");
    assert.ok(stagingText.includes(definition), "staging body missing definition text");
    console.log("  definition text present in staging");
  }

  const prodWordLinkCount = extractAll(prodBody, /href="([^"]*-word-[^"]+)"/g).length;
  const stagingWordLinkCount = extractAll(stagingBody, /href="([^"]*-word-[^"]+)"/g).length;
  assert.ok(prodWordLinkCount > 0, "prod body has zero word-page links");
  assert.ok(stagingWordLinkCount > 0, "staging body has zero word-page links");
  console.log(
    `  word-page link counts: prod=${prodWordLinkCount}, staging=${stagingWordLinkCount} (differ: prod draws from the full corpus, staging from the 81-word sample — expected)`,
  );

  const hasHydrationScript = stagingHtml.includes('<script type="application/json" id="word-page-data">');
  assert.ok(hasHydrationScript, 'staging HTML missing <script type="application/json" id="word-page-data">');
  console.log('  compact word-page-data JSON block present');
}

async function compareRedirectRoute(entryServer, label, pathname) {
  const prodResolution = await entryServer.resolveWordSeoRequest(pathname);
  const stagingRes = await fetch(`${WORKER_ORIGIN}${pathname}`, { redirect: "manual" });

  if (prodResolution.kind === "redirect") {
    assert.equal(stagingRes.status, 308, `${label}: expected 308`);
    const stagingLocationRaw = stagingRes.headers.get("location");
    // Semantic comparison, not byte-for-byte: production's Location header
    // contains literal UTF-8 (Node's http module writes it through
    // uncompliantly-but-tolerated); the Workers Headers API enforces
    // ISO-8859-1 per the Fetch spec, so the staging Worker percent-encodes
    // non-ASCII characters (e.g. "café" -> "caf%C3%A9"). Both resolve to the
    // identical final URL once a browser navigates and percent-decodes.
    const stagingLocationDecoded = decodeURI(stagingLocationRaw);
    assert.equal(stagingLocationDecoded, prodResolution.location, `${label}: redirect location mismatch`);
    console.log(`  ${label}: prod->308(${prodResolution.location}) staging->308(${stagingLocationRaw}) MATCH (decoded)`);
  } else {
    assert.equal(stagingRes.status, 410, `${label}: expected 410`);
    console.log(`  ${label}: prod->${prodResolution.kind} staging->410 MATCH (non-canonical)`);
  }
}

async function main() {
  const entryServer = await loadProductionEntryServer();

  console.log("=== Canonical route SEO parity (staging Worker vs production SSR) ===");
  await compareCanonicalRoute(entryServer, "/en/english-word-about--A1-00001");
  await compareCanonicalRoute(entryServer, "/en/english-word-american--A1-00028");
  await compareCanonicalRoute(entryServer, "/en/english-word-about--A1-00001/browse/page/2");

  console.log("\n=== Redirect/error parity ===");
  await compareRedirectRoute(entryServer, "legacy single-hyphen", "/en/english-word-about-A1-00001");
  await compareRedirectRoute(entryServer, "legacy-slug-format", "/en/english-word-About--A1-00001");
  await compareRedirectRoute(entryServer, "accent redirect (cafe->café)", "/en/english-word-cafe--A1-00161");
  await compareRedirectRoute(entryServer, "malformed concept id", "/en/english-word-about--A1-1");
  await compareRedirectRoute(entryServer, "unsupported ui language", "/xx/english-word-about--A1-00001");
  await compareRedirectRoute(entryServer, "unsupported target language", "/en/klingon-word-about--A1-00001");
  await compareRedirectRoute(entryServer, "invalid browse page", "/en/english-word-about--A1-00001/browse/page/abc");

  console.log("\n─────────────────────────────────────────");
  console.log("staging Worker vs production SSR parity check passed");
  console.log("─────────────────────────────────────────");
}

main().catch((err) => {
  console.error("PARITY CHECK FAILED:", err);
  process.exitCode = 1;
});
