// EXPERIMENTAL / Node-only test harness — NOT part of production. Verifies
// the proof-of-concept renderer's redirect/error classification matches
// production's resolveWordSeoRequest() (server-build/entry-server.js) for
// route-shape edge cases (legacy URLs, malformed concept IDs, invalid browse
// pages, unsupported languages) — cases where the *route manifest itself*
// determines the outcome, independent of which records happen to be loaded.
//
// One case (deliberately-missing concept) is DESIGNED to diverge from
// production: production has the full corpus and would render that word
// normally, while this prototype's ~81-record sample does not include it.
// That case is checked against the prototype's OWN expected behavior (410,
// not a prod/poc diff), and is explicitly called out below.
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

function prodStatusFor(resolution) {
  if (resolution.kind === "redirect") return { status: 308, location: resolution.location };
  if (resolution.kind === "canonical") return { status: 200 };
  return { status: 410, reason: resolution.reason };
}

async function checkAgainstProduction(entryServer, label, pathname) {
  const prodResolution = await entryServer.resolveWordSeoRequest(pathname);
  const prod = prodStatusFor(prodResolution);
  const poc = renderWordPocResponse(pathname, SITE_ORIGIN, shared, store);

  assert.equal(poc.status, prod.status, `${label}: status mismatch (prod=${prod.status}, poc=${poc.status})`);
  if (prod.status === 308) {
    assert.equal(poc.headers.Location, prod.location, `${label}: redirect location mismatch`);
  }
  console.log(
    `  ✓ ${label}: ${pathname}\n      -> prod=${prod.status}${prod.location ? ` (${prod.location})` : ""}, poc=${poc.status}${poc.headers.Location ? ` (${poc.headers.Location})` : ""}`,
  );
}

function checkPocOnly(label, pathname, expectedStatus, extra) {
  const poc = renderWordPocResponse(pathname, SITE_ORIGIN, shared, store);
  assert.equal(poc.status, expectedStatus, `${label}: expected status ${expectedStatus}, got ${poc.status}`);
  if (extra) extra(poc);
  console.log(`  ✓ ${label}: ${pathname} -> poc=${poc.status}`);
}

async function main() {
  const entryServer = await loadProductionEntryServer();

  console.log("\n[1] Cases where poc must match production's real route-manifest behavior");
  await checkAgainstProduction(
    entryServer,
    "legacy single-hyphen route",
    "/en/english-word-about-A1-00001",
  );
  await checkAgainstProduction(
    entryServer,
    "legacy-slug-format (self-inconsistent raw slug)",
    "/en/english-word-About--A1-00001",
  );
  await checkAgainstProduction(
    entryServer,
    "malformed concept ID (too few digits)",
    "/en/english-word-about--A1-1",
  );
  await checkAgainstProduction(
    entryServer,
    "invalid browse page (non-numeric)",
    "/en/english-word-about--A1-00001/browse/page/abc",
  );
  await checkAgainstProduction(
    entryServer,
    "unsupported UI language",
    "/xx/english-word-about--A1-00001",
  );
  await checkAgainstProduction(
    entryServer,
    "unsupported target language",
    "/en/klingon-word-about--A1-00001",
  );
  await checkAgainstProduction(
    entryServer,
    "slug-only route (no concept ID)",
    "/en/english-word-about",
  );

  console.log("\n[2] Accent-insensitive recovery redirect (normalized slug mismatch)");
  await checkAgainstProduction(
    entryServer,
    "unaccented slug for café (should redirect to accented canonical)",
    "/en/english-word-cafe--A1-00161",
  );

  console.log(
    "\n[3] Prototype-only case: concept exists in the real corpus but is deliberately\n" +
      "    excluded from this prototype's ~81-record sample store (not a prod/poc\n" +
      "    comparison — production would render this word normally since it has the\n" +
      "    full corpus; this checks the prototype's OWN 410 behavior for a genuinely\n" +
      "    absent key, which is what 'missing record' means once a real deployment's\n" +
      "    store is complete).",
  );
  checkPocOnly(
    "concept ID absent from prototype store",
    `/en/english-word-somename--${store.manifest.deliberatelyMissingConceptId}`,
    410,
    (poc) => {
      assert.equal(poc.headers["X-Robots-Tag"], "noindex, nofollow", "expected noindex, nofollow header");
      assert.equal(poc.body, "410 Gone", "expected minimal 410 body, matching production's minimal not-found response");
    },
  );

  console.log("\n[4] Invalid browse page beyond total pages (both stores) — expect 410");
  checkPocOnly(
    "browse page beyond total pages (prototype has 2 pages)",
    "/en/english-word-about--A1-00001/browse/page/3",
    410,
  );

  console.log("\n─────────────────────────────────────────");
  console.log("redirect/error parity check passed");
  console.log("─────────────────────────────────────────");
}

main().catch((err) => {
  console.error("REDIRECT/ERROR CHECK FAILED:", err);
  process.exit(1);
});
