/**
 * Hydration of the prerendered 100-most-common-nouns pages, in Chromium,
 * against the production build in dist/.
 *
 * The noun table reads its per-language details chunk
 * (common100NounDetails/{listId}.json). It used to go through React.lazy,
 * which always suspends on its first render; App's mount effects then
 * updated the still-dehydrated route boundary, so whenever the chunk had not
 * arrived yet React discarded the prerendered <main> and showed the table
 * fallback (#421, ~1 in 8 production loads). A failed chunk unmounted the
 * whole app. src/entry-client.tsx now loads the details before hydrating and
 * NounListSeoPage reads them synchronously. This test pins that behavior:
 *
 *   - Direct load and refresh with the details response deliberately delayed
 *     (the original race, reproduced deterministically), on desktop and on a
 *     throttled mobile connection: the server-rendered <main> and <table>
 *     nodes survive hydration, the fallback never appears, the table is
 *     complete, and the post-hydration controls appear.
 *   - Client-side navigation into a noun page (fallback, then the table) and
 *     out and back (cached: no fallback, no second download).
 *   - A genuine download failure, direct and client-side: the page stays
 *     mounted and the table renders without details instead of a blank app.
 *   - Every prerendered noun page hydrates without replacing its content.
 *
 * Only the details chunk is delayed or failed (per request, by Playwright
 * routing); every other asset loads normally from a local gzip server over
 * dist/, which honors the build's Vite base ("/" or "/<repo>/" in CI).
 *
 * Run: node scripts/tests/runtime/test-noun-page-hydration.mjs
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

const DIST_DIR = process.env.NOUN_HYDRATION_DIST_DIR
  ? path.resolve(process.env.NOUN_HYDRATION_DIST_DIR)
  : path.join(ROOT_DIR, "dist");
const ASSETS_DIR = path.join(DIST_DIR, "assets");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const ROWS_PER_LIST = 100;

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

// The details chunks are the JSON modules exporting the details file's
// top-level `byConceptId` field (Vite emits named exports for JSON keys).
const detailsChunks = fs
  .readdirSync(ASSETS_DIR)
  .filter((file) => file.endsWith(".js") && !file.startsWith("index-"))
  .filter((file) => /\bas byConceptId\b/.test(fs.readFileSync(path.join(ASSETS_DIR, file), "utf8")));
assert.equal(detailsChunks.length, 7, `expected 7 noun-details chunks, found ${detailsChunks.join(", ")}`);
const isDetailsRequest = (url) => detailsChunks.some((file) => new URL(url).pathname.endsWith(`/assets/${file}`));

// Every prerendered noun page, found by the table's own markup.
function findNounPages(dir, route = "") {
  const pages = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "assets") continue;
    const child = path.join(dir, entry.name);
    const file = path.join(child, "index.html");
    if (fs.existsSync(file) && fs.readFileSync(file, "utf8").includes('<div class="nlt">')) pages.push(`${route}/${entry.name}`);
    if (route === "") pages.push(...findNounPages(child, `/${entry.name}`));
  }
  return pages;
}
const nounPages = findNounPages(DIST_DIR).sort();

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

// Records, from document start, whether the prerendered <main>/<table> nodes
// are still the ones on screen, any removal of server content, and every
// appearance of the table fallback.
function installRecorder() {
  window.__noun = { fallbackSeen: false, removedMain: 0 };
  document.addEventListener("DOMContentLoaded", () => {
    window.__noun.serverMain = document.querySelector("#root main");
    window.__noun.serverTable = document.querySelector("#root .nlt table");
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && (node.matches("main") || node.querySelector?.("main"))) window.__noun.removedMain += 1;
        }
      }
      if (document.querySelector("#root .nlt-pending")) window.__noun.fallbackSeen = true;
    }).observe(document.getElementById("root"), { childList: true, subtree: true });
  });
}

const browser = await chromium.launch();

// detailsRoute(route): optional handler for the details chunk request.
async function openPage({ viewport = DESKTOP, slowNetwork = false, detailsRoute } = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: "block" });
  const detailsRequests = [];
  await context.route("**/*", async (route) => {
    const requestUrl = route.request().url();
    if (!requestUrl.startsWith(ORIGIN)) return route.abort();
    if (isDetailsRequest(requestUrl)) {
      detailsRequests.push(new URL(requestUrl).pathname);
      if (detailsRoute) return detailsRoute(route);
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
  return { context, page, problems, detailsRequests };
}
const delayed = (ms) => async (route) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
  await route.continue();
};
const unavailable = (route) => route.fulfill({ status: 503, body: "unavailable" });

const tableState = (page) =>
  page.evaluate(() => ({
    rows: document.querySelectorAll("#root .nlt tr.nlt-row").length,
    words: [...document.querySelectorAll("#root .nlt-word-text")].map((node) => node.textContent),
    speakButtons: document.querySelectorAll("#root .nlt-speak").length,
    heading: document.querySelector("#root h1")?.textContent ?? null,
    hasHeader: Boolean(document.querySelector("#root header")),
  }));

// The post-hydration speak buttons only render once hydration has finished.
async function expectHydratedInPlace(page) {
  await page.waitForSelector("#root .nlt-speak");
  const recorder = await page.evaluate(() => ({
    sameMain: window.__noun.serverMain !== null && window.__noun.serverMain === document.querySelector("#root main"),
    sameTable: window.__noun.serverTable !== null && window.__noun.serverTable === document.querySelector("#root .nlt table"),
    removedMain: window.__noun.removedMain,
    fallbackSeen: window.__noun.fallbackSeen,
  }));
  assert.deepEqual(recorder, { sameMain: true, sameTable: true, removedMain: 0, fallbackSeen: false }, "prerendered content was replaced");
  const table = await tableState(page);
  assert.equal(table.rows, ROWS_PER_LIST, "table row count");
  assert.equal(table.words.length, ROWS_PER_LIST);
  assert.ok(table.words.every((word) => word && word !== "—"), "every row has its word");
  assert.equal(table.speakButtons, ROWS_PER_LIST);
}

try {
  console.log(`\n=== direct load and refresh, details delayed (base ${BASE}) ===\n`);

  await test("desktop: delayed details keep the prerendered page through hydration; refresh too", async () => {
    const { context, page, problems, detailsRequests } = await openPage({ detailsRoute: delayed(1500) });
    await page.goto(url("/en/100-essential-english-nouns"));
    await expectHydratedInPlace(page);
    await page.reload();
    await expectHydratedInPlace(page);
    assert.deepEqual(problems, []);
    assert.equal(detailsRequests.length, 2, "one details download per page load");
    await context.close();
  });

  await test("mobile, throttled network: delayed details keep the prerendered page (translated list)", async () => {
    const { context, page, problems, detailsRequests } = await openPage({ viewport: MOBILE, slowNetwork: true, detailsRoute: delayed(1000) });
    await page.goto(url("/ru/100-essential-german-nouns"));
    await expectHydratedInPlace(page);
    assert.deepEqual(problems, []);
    assert.equal(detailsRequests.length, 1);
    await context.close();
  });

  console.log("\n=== client-side navigation ===\n");

  await test("into a noun page (fallback, then table), out, and back (cached)", async () => {
    const { context, page, problems, detailsRequests } = await openPage({ viewport: MOBILE, detailsRoute: delayed(800) });
    await page.goto(url("/en/learning-resources"));
    await page.waitForLoadState("networkidle");
    assert.equal(detailsRequests.length, 0, "unrelated routes never download noun details");
    await page.locator('a[href$="/en/100-essential-english-nouns"]').first().click();
    await page.waitForSelector("#root .nlt-pending");
    await page.waitForSelector("#root .nlt-speak");
    let table = await tableState(page);
    assert.equal(table.rows, ROWS_PER_LIST);
    assert.ok(table.words.every((word) => word && word !== "—"));
    await page.locator('a[href$="/en/english-vocabulary-list"]').first().click();
    await page.waitForURL(/\/en\/english-vocabulary-list$/);
    await page.evaluate(() => { window.__noun.fallbackSeen = false; });
    await page.goBack();
    await page.waitForURL(/\/en\/100-essential-english-nouns$/);
    await page.waitForSelector("#root .nlt-speak");
    table = await tableState(page);
    assert.equal(table.rows, ROWS_PER_LIST);
    assert.equal(await page.evaluate(() => window.__noun.fallbackSeen), false, "cached details must not show the fallback");
    assert.equal(detailsRequests.length, 1, "details downloaded once");
    assert.deepEqual(problems, []);
    await context.close();
  });

  console.log("\n=== genuine download failure ===\n");

  await test("direct load: the page stays mounted and the table renders without details", async () => {
    const { context, page, problems } = await openPage({ detailsRoute: unavailable });
    await page.goto(url("/en/100-essential-english-nouns"));
    await page.waitForFunction(() => document.querySelectorAll("#root .nlt-speak").length > 0);
    const table = await tableState(page);
    assert.ok(table.hasHeader && table.heading, "header and heading still rendered");
    assert.equal(table.rows, ROWS_PER_LIST);
    assert.ok(table.words.every((word) => word === "—"), "rows fall back to the missing-details dash");
    assert.deepEqual(problems.filter((problem) => problem.startsWith("pageerror")), []);
    await context.close();
  });

  await test("client-side navigation: the page renders without details instead of a blank app", async () => {
    const { context, page, problems } = await openPage({ detailsRoute: unavailable });
    await page.goto(url("/en/learning-resources"));
    await page.waitForLoadState("networkidle");
    await page.locator('a[href$="/en/100-essential-english-nouns"]').first().click();
    await page.waitForFunction(() => document.querySelectorAll("#root .nlt-speak").length > 0);
    const table = await tableState(page);
    assert.ok(table.hasHeader && table.heading);
    assert.equal(table.rows, ROWS_PER_LIST);
    assert.ok(table.words.every((word) => word === "—"));
    assert.deepEqual(problems.filter((problem) => problem.startsWith("pageerror")), []);
    await context.close();
  });

  console.log(`\n=== every prerendered noun page (${nounPages.length}) ===\n`);

  await test(`all ${nounPages.length} noun pages hydrate in place with a complete table`, async () => {
    assert.ok(nounPages.length >= 49, `expected at least 49 noun pages, found ${nounPages.length}`);
    const { context, page, problems } = await openPage();
    const failures = [];
    for (const route of nounPages) {
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
