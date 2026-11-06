/**
 * Hydration of the prerendered CEFR vocabulary-level and conjugated-verb-forms
 * pages, in Chromium, against the production build in dist/.
 *
 * Their data used to sit in the client entry bundle (seo-cefr-content.json
 * and the conjugatedVerbs/*.json tables, ~6 MB). It is now loaded per route:
 * one lazy chunk for the CEFR content (src/app/pages/vocabulary/
 * devSeoCefrPreviewData.ts) and one per target language for the conjugation
 * tables (conjugated100VerbFormsData.ts). src/entry-client.tsx loads the
 * route's data BEFORE hydrateRoot and the pages read it synchronously, so a
 * prerendered page must never suspend while hydrating — otherwise React
 * discards the server markup (#418/#421/#422, which production silences in
 * onRecoverableError, so this test checks the DOM itself). It pins:
 *
 *   - Direct load and refresh with the data chunk deliberately delayed, on
 *     desktop and on a throttled mobile connection: the server-rendered <main>
 *     survives hydration, the route fallback never appears, the content is
 *     unchanged, and the page is interactive.
 *   - Unrelated routes never download either dataset.
 *   - Client-side navigation into both page types (fallback, then content),
 *     and back (cached: no second download).
 *   - A genuine download failure keeps the app mounted.
 *   - Every UI language: a CEFR page for every UI x target language pair and
 *     every prerendered conjugated page hydrate in place.
 *
 * Only the data chunks are delayed or failed (per request, by Playwright
 * routing); every other asset loads normally from a local gzip server over
 * dist/, which honors the build's Vite base ("/" or "/<repo>/" in CI).
 *
 * Run: node scripts/tests/runtime/test-route-data-hydration.mjs
 * Requires a prior `npm run build` and the Playwright Chromium browser.
 */

// page.evaluate/addInitScript callbacks run in the browser.
/* global window, document, MutationObserver, Node */

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { chromium } from "@playwright/test";
import { ROOT_DIR } from "../../lib/compileTs.mjs";
import { loadConjugatedVerbFormsRegistry } from "../../lib/load-conjugated-verb-forms-registry.mjs";

const DIST_DIR = process.env.ROUTE_DATA_HYDRATION_DIST_DIR
  ? path.resolve(process.env.ROUTE_DATA_HYDRATION_DIST_DIR)
  : path.join(ROOT_DIR, "dist");
const ASSETS_DIR = path.join(DIST_DIR, "assets");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const UI_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "ru"];

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}\n    ${String(error.message).split("\n").join("\n    ")}`);
  }
}

assert.ok(fs.existsSync(ASSETS_DIR), "dist/assets is missing; run `npm run build` first");
const template = fs.readFileSync(path.join(DIST_DIR, "index.html"), "utf8");
// Vite base of this build, from the template's entry script (see vite.config.ts).
const BASE = template.match(/<script\b[^>]*\bsrc="([^"]*)assets\/index-[^"]*\.js"/)?.[1] ?? "/";
const entryFile = template.match(/assets\/(index-[^"]*\.js)"/)?.[1];
const entrySource = fs.readFileSync(path.join(ASSETS_DIR, entryFile), "utf8");

// The data chunks, found by name (CEFR) or by the conjugation files' own
// top-level shape (an array of {tense, targetLanguage, verbs} groups).
const assetFiles = fs.readdirSync(ASSETS_DIR).filter((file) => file.endsWith(".js"));
const cefrChunks = assetFiles.filter((file) => file.startsWith("seo-cefr-content-"));
const conjugatedChunks = assetFiles
  .filter((file) => !file.startsWith("index-"))
  .filter((file) => /\[\{"tense":"[a-z_]+","targetLanguage":"[a-z]{2}","verbs":\[/.test(fs.readFileSync(path.join(ASSETS_DIR, file), "utf8")));
assert.equal(cefrChunks.length, 1, `expected 1 CEFR content chunk, found ${cefrChunks.join(", ")}`);
assert.equal(conjugatedChunks.length, 7, `expected 7 conjugated-verb-forms chunks, found ${conjugatedChunks.join(", ")}`);
const chunkKind = (requestUrl) => {
  const file = new URL(requestUrl).pathname.split("/").pop();
  if (cefrChunks.includes(file)) return "cefr";
  if (conjugatedChunks.includes(file)) return "conjugated";
  return null;
};

// Every prerendered CEFR page, found by the page's own markup.
function findCefrPages(dir, route = "") {
  const pages = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "assets") continue;
    const child = path.join(dir, entry.name);
    const file = path.join(child, "index.html");
    if (route !== "" && fs.existsSync(file) && fs.readFileSync(file, "utf8").includes('<main class="vlp ')) pages.push(`${route}/${entry.name}`);
    if (route === "") pages.push(...findCefrPages(child, `/${entry.name}`));
  }
  return pages;
}
const cefrPages = findCefrPages(DIST_DIR).sort();
// One CEFR page per UI x target language pair, so every UI language and
// every target language is hydrated. A UI language has 42 pages (7 targets
// x 6 levels) whose slugs sort grouped by target, levels in order; target t
// is sampled at level t mod 6 so all six levels appear too.
const LEVELS_PER_TARGET = 6;
const cefrSample = [];
for (const ui of UI_LANGUAGES) {
  const pages = cefrPages.filter((route) => route.startsWith(`/${ui}/`));
  for (let target = 0; target * LEVELS_PER_TARGET < pages.length; target += 1) {
    cefrSample.push(pages[target * LEVELS_PER_TARGET + (target % LEVELS_PER_TARGET)]);
  }
}

const registryLoader = loadConjugatedVerbFormsRegistry(".tmp-route-data-hydration-registry");
const conjugatedPages = registryLoader.registry
  .getAllConjugatedVerbFormsPaths()
  .filter((route) => fs.existsSync(path.join(DIST_DIR, route.replace(/^\/+/, ""), "index.html")))
  .sort();
registryLoader.cleanup();

// Static gzip server over dist/, mounted at the build's base.
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon" };
const gzipCache = new Map();
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  if (!pathname.startsWith(BASE)) {
    res.writeHead(404);
    return res.end();
  }
  let file = path.join(DIST_DIR, pathname.slice(BASE.length));
  if (!file.startsWith(DIST_DIR)) {
    res.writeHead(403);
    return res.end();
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) {
    res.writeHead(404);
    return res.end();
  }
  const type = TYPES[path.extname(file)];
  if (type && /gzip/.test(req.headers["accept-encoding"] ?? "") && !type.startsWith("image") && !type.startsWith("font")) {
    if (!gzipCache.has(file)) gzipCache.set(file, zlib.gzipSync(fs.readFileSync(file)));
    res.writeHead(200, { "content-type": type, "content-encoding": "gzip" });
    return res.end(gzipCache.get(file));
  }
  res.writeHead(200, { "content-type": type ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const url = (route) => `${ORIGIN}${BASE.replace(/\/$/, "")}${route}`;

// Records, from document start, the prerendered <main> node and its text,
// any removal of server content, and every appearance of App's route
// fallback (RouteLoadingFallback's "Loading...").
function installRecorder() {
  window.__route = { fallbackSeen: false, removedMain: 0 };
  const isFallback = () =>
    [...document.querySelectorAll("#root div.py-12")].some((node) => node.textContent.trim() === "Loading...");
  document.addEventListener("DOMContentLoaded", () => {
    window.__route.serverMain = document.querySelector("#root main");
    window.__route.serverHeading = document.querySelector("#root main h1")?.textContent ?? null;
    window.__route.serverRows = document.querySelectorAll("#root main tbody tr").length;
    if (isFallback()) window.__route.fallbackSeen = true;
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && (node.matches("main") || node.querySelector?.("main"))) window.__route.removedMain += 1;
        }
      }
      if (isFallback()) window.__route.fallbackSeen = true;
    }).observe(document.getElementById("root"), { childList: true, subtree: true });
  });
}

const browser = await chromium.launch();

// dataRoute(route, kind): optional handler for a data chunk request.
async function openPage({ viewport = DESKTOP, slowNetwork = false, dataRoute } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const dataRequests = [];
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (!requestUrl.startsWith(ORIGIN)) return route.abort();
    const kind = chunkKind(requestUrl);
    if (kind) {
      dataRequests.push(kind);
      if (dataRoute) return dataRoute(route, kind);
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`console: ${message.text()}`);
  });
  if (slowNetwork) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 600 * 1024, uploadThroughput: 150 * 1024 });
  }
  await page.addInitScript(installRecorder);
  return { context, page, problems, dataRequests };
}
const delayed = (ms) => async (route) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await route.continue();
};
const unavailable = (route) => route.fulfill({ status: 503, body: "unavailable" });

// Hydration is complete for the route once React has attached its fiber to
// the server <main> (a hydrated-in-place node) — a replaced <main> fails the
// identity check below instead.
async function expectHydratedInPlace(page) {
  await page.waitForFunction(() => {
    const main = document.querySelector("#root main");
    return Boolean(main && Object.keys(main).some((key) => key.startsWith("__reactFiber$")));
  });
  const recorder = await page.evaluate(() => ({
    sameMain: window.__route.serverMain !== null && window.__route.serverMain === document.querySelector("#root main"),
    removedMain: window.__route.removedMain,
    fallbackSeen: window.__route.fallbackSeen,
    sameHeading: window.__route.serverHeading !== null && window.__route.serverHeading === document.querySelector("#root main h1")?.textContent,
    sameRows: window.__route.serverRows === document.querySelectorAll("#root main tbody tr").length,
  }));
  assert.deepEqual(
    recorder,
    { sameMain: true, removedMain: 0, fallbackSeen: false, sameHeading: true, sameRows: true },
    "prerendered content was replaced or changed during hydration",
  );
}

const firstCefr = (ui) => cefrPages.find((route) => route.startsWith(`/${ui}/`));
const firstConjugated = (ui) => conjugatedPages.find((route) => route.startsWith(`/${ui}/`));

try {
  console.log(`\n=== entry bundle (base ${BASE}) ===\n`);

  await test("the entry bundle no longer inlines the CEFR content or conjugation tables", async () => {
    assert.ok(!/"targetLanguageDisplayName"/.test(entrySource), "CEFR editorial content is still in the entry bundle");
    assert.ok(!/\[\{"tense":"[a-z_]+","targetLanguage":"[a-z]{2}","verbs":\[/.test(entrySource), "conjugation tables are still in the entry bundle");
  });

  console.log("\n=== direct load and refresh, data delayed ===\n");

  await test("CEFR, desktop: delayed content keeps the prerendered page through hydration; refresh too", async () => {
    const { context, page, problems, dataRequests } = await openPage({ dataRoute: delayed(1500) });
    await page.goto(url(firstCefr("en")));
    await expectHydratedInPlace(page);
    await page.reload();
    await expectHydratedInPlace(page);
    assert.deepEqual(problems, []);
    assert.deepEqual(dataRequests, ["cefr", "cefr"], "one CEFR content download per page load, nothing else");
    await context.close();
  });

  await test("CEFR, mobile throttled network: delayed content keeps the prerendered page (ru UI)", async () => {
    const { context, page, problems, dataRequests } = await openPage({ viewport: MOBILE, slowNetwork: true, dataRoute: delayed(1000) });
    await page.goto(url(firstCefr("ru")));
    await expectHydratedInPlace(page);
    assert.deepEqual(problems, []);
    assert.deepEqual(dataRequests, ["cefr"]);
    await context.close();
  });

  await test("conjugated, desktop: delayed table keeps the prerendered page; refresh; tense switch works", async () => {
    const { context, page, problems, dataRequests } = await openPage({ dataRoute: delayed(1500) });
    await page.goto(url("/en/100-most-common-english-verb-conjugations"));
    await expectHydratedInPlace(page);
    await page.reload();
    await expectHydratedInPlace(page);
    const rowsBefore = await page.evaluate(() => document.querySelector("#root main tbody")?.textContent ?? "");
    const tenseButtons = page.locator('#root main button[aria-pressed="false"]');
    assert.ok((await tenseButtons.count()) > 0, "expected an inactive tense button");
    await tenseButtons.last().click();
    await page.waitForFunction(
      (previous) => (document.querySelector("#root main tbody")?.textContent ?? "") !== previous,
      rowsBefore,
    );
    assert.ok((await page.locator("#root main tbody tr").count()) > 0, "switched tense still has rows");
    assert.deepEqual(problems, []);
    assert.deepEqual(dataRequests, ["conjugated", "conjugated"], "one table download per page load, nothing else");
    await context.close();
  });

  await test("conjugated, mobile throttled network: delayed table keeps the prerendered page (es UI)", async () => {
    const { context, page, problems, dataRequests } = await openPage({ viewport: MOBILE, slowNetwork: true, dataRoute: delayed(1000) });
    await page.goto(url(firstConjugated("es")));
    await expectHydratedInPlace(page);
    assert.deepEqual(problems, []);
    assert.deepEqual(dataRequests, ["conjugated"]);
    await context.close();
  });

  console.log("\n=== unrelated routes ===\n");

  await test("home, custom practice, learning resources, about, help, verb and noun lists download neither dataset", async () => {
    const { context, page, problems, dataRequests } = await openPage();
    for (const route of ["/", "/custom-practice", "/en/learning-resources", "/about", "/help", "/en/100-most-common-english-verbs", "/en/100-essential-english-nouns"]) {
      await page.goto(url(route));
      await page.waitForLoadState("networkidle");
    }
    assert.deepEqual(dataRequests, []);
    assert.deepEqual(problems, []);
    await context.close();
  });

  console.log("\n=== client-side navigation ===\n");

  await test("into a CEFR page and a conjugated page (fallback, then content), and back (cached)", async () => {
    const { context, page, problems, dataRequests } = await openPage({ viewport: MOBILE, dataRoute: delayed(800) });
    await page.goto(url("/en/learning-resources"));
    await page.waitForLoadState("networkidle");
    await page.locator('a[href$="/en/english-a1-vocabulary-practice"]').first().click();
    await page.waitForURL(/\/en\/english-a1-vocabulary-practice$/);
    await page.waitForSelector("#root main.vlp h1");
    await page.goBack();
    await page.waitForURL(/\/en\/learning-resources$/);
    await page.locator('a[href$="/en/100-most-common-english-verb-conjugations"]').first().click();
    await page.waitForURL(/\/en\/100-most-common-english-verb-conjugations$/);
    await page.waitForSelector("#root main tbody tr");
    await page.goBack();
    await page.waitForURL(/\/en\/learning-resources$/);
    await page.evaluate(() => { window.__route.fallbackSeen = false; });
    await page.goForward();
    await page.waitForURL(/\/en\/100-most-common-english-verb-conjugations$/);
    await page.waitForSelector("#root main tbody tr");
    // Clicking the conjugated link dropped the CEFR page from forward
    // history, so re-enter it through its link (also a cached render).
    await page.goBack();
    await page.waitForURL(/\/en\/learning-resources$/);
    await page.locator('a[href$="/en/english-a1-vocabulary-practice"]').first().click();
    await page.waitForURL(/\/en\/english-a1-vocabulary-practice$/);
    await page.waitForSelector("#root main.vlp h1");
    assert.equal(await page.evaluate(() => window.__route.fallbackSeen), false, "cached data must not show the fallback");
    assert.deepEqual(dataRequests, ["cefr", "conjugated"], "each dataset downloaded once");
    assert.deepEqual(problems, []);
    await context.close();
  });

  console.log("\n=== genuine download failure ===\n");

  await test("CEFR content unavailable: the app stays mounted and explains the page is unavailable", async () => {
    const { context, page, problems } = await openPage({ dataRoute: unavailable });
    await page.goto(url(firstCefr("en")));
    await page.waitForFunction(() => document.querySelector("#root")?.textContent?.includes("Vocabulary content unavailable."));
    assert.ok(await page.locator("#root header").count(), "header still rendered");
    assert.deepEqual(problems.filter((problem) => problem.startsWith("pageerror")), []);
    await context.close();
  });

  await test("conjugation table unavailable: the page stays mounted with its heading", async () => {
    const { context, page, problems } = await openPage({ dataRoute: unavailable });
    await page.goto(url("/en/100-most-common-english-verb-conjugations"));
    await page.waitForFunction(() => {
      const main = document.querySelector("#root main");
      return Boolean(main && Object.keys(main).some((key) => key.startsWith("__reactFiber$")));
    });
    assert.ok(await page.locator("#root header").count(), "header still rendered");
    assert.ok(await page.locator("#root main h1").count(), "heading still rendered");
    assert.deepEqual(problems.filter((problem) => problem.startsWith("pageerror")), []);
    await context.close();
  });

  console.log(`\n=== every UI language: ${cefrSample.length} CEFR pages, ${conjugatedPages.length} conjugated pages ===\n`);

  await test(`CEFR pages for all ${UI_LANGUAGES.length} UI languages x ${UI_LANGUAGES.length} targets hydrate in place`, async () => {
    assert.ok(cefrPages.length >= 294, `expected at least 294 CEFR pages, found ${cefrPages.length}`);
    assert.equal(cefrSample.length, 49, `expected 49 sampled CEFR pages, found ${cefrSample.length}`);
    const { context, page, problems } = await openPage();
    const failures = [];
    for (const route of cefrSample) {
      try {
        await page.goto(url(route));
        await expectHydratedInPlace(page);
      } catch (error) {
        failures.push(`${route}: ${error.message.split("\n")[0]}`);
      }
    }
    assert.deepEqual(failures, []);
    assert.deepEqual(problems, []);
    await context.close();
  });

  await test("every prerendered conjugated page hydrates in place", async () => {
    assert.ok(conjugatedPages.length >= 7, `expected prerendered conjugated pages, found ${conjugatedPages.length}`);
    assert.deepEqual(
      UI_LANGUAGES.filter((ui) => !firstConjugated(ui)),
      [],
      "every UI language has a prerendered conjugated page",
    );
    const { context, page, problems } = await openPage();
    const failures = [];
    for (const route of conjugatedPages) {
      try {
        await page.goto(url(route));
        await expectHydratedInPlace(page);
      } catch (error) {
        failures.push(`${route}: ${error.message.split("\n")[0]}`);
      }
    }
    assert.deepEqual(failures, []);
    assert.deepEqual(problems, []);
    await context.close();
  });
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
