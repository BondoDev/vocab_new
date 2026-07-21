/**
 * Prerender-vs-runtime parity tests.
 *
 * NEW coverage: this is the layer explicitly missing from the existing test
 * suite. scripts/test-word-ssr-http.mjs thoroughly exercises the *runtime*
 * on-demand SSR path (server/word-ssr-runtime.mjs → server-build/entry-server.js),
 * and scripts/test-homepage-visibility.mjs / test-schema-graph.mjs inspect
 * *already-built* files under dist/ — but nothing currently proves that the
 * build-time prerender path (scripts/prerender.mjs, which calls the exact
 * same `render()` function) and the request-time runtime path
 * (server/word-ssr-runtime.mjs, same `render()` function, different template)
 * actually agree for the same URL.
 *
 * This matters directly for the planned Cloudflare migration: any future
 * change that raises WORD_PRERENDER_LIMIT (moving more pages from "rendered
 * on request" to "rendered at build time") is only safe if this script shows
 * both paths produce equivalent SEO output today.
 *
 * Strategy (deliberately does NOT touch WORD_PRERENDER_LIMIT, does NOT run a
 * build, does NOT modify scripts/prerender.mjs or server/word-ssr-runtime.mjs):
 *   Both scripts/prerender.mjs (build time) and server/word-ssr-runtime.mjs
 *   (request time) call the exact same exported `render(pathname, siteOrigin)`
 *   function from the compiled server-build/entry-server.js — they only
 *   differ in which HTML template they inject the result into. So proving
 *   parity between "build time" and "request time" reduces to proving that a
 *   FRESH call to render() right now reproduces the SEO-observable fields
 *   already baked into a route's existing prerendered dist/ file — if it
 *   didn't, that would mean render() is non-deterministic or dist/ is stale
 *   relative to server-build/, either of which is exactly what this suite
 *   exists to catch before any future migration touches this code path.
 *   For every base (non-word) route in getPrerenderRoutes() that already has
 *   a prerendered file sitting in dist/ from a prior build, compare:
 *     (a) the SEO-observable fields extracted from that static dist/ file
 *     (b) the SEO-observable fields from a fresh render() call for that route
 *   Word routes are included in the same comparison whenever the current
 *   dist/ happens to have any prerendered (mirrors the existing convention in
 *   scripts/test-homepage-visibility.mjs of skipping word-page checks with an
 *   explicit note when WORD_PRERENDER_LIMIT=0).
 *
 * Run: node scripts/test-prerender-parity.mjs
 * Requires a prior `npm run build` (or at least `vite build` +
 * `vite build --ssr src/entry-server.tsx --outDir server-build` +
 * `node scripts/prerender.mjs`) so dist/ and server-build/ both exist.
 */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT_DIR } from "./lib/compileTs.mjs";

const DIST_DIR = path.join(ROOT_DIR, "dist");
const SITE_ORIGIN = "https://www.fluentstellar.com";

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

function skip(name, reason) {
  console.log(`  -  ${name} (skipped — ${reason})`);
  skipped++;
}

function extractTagContent(html, tagName) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"));
  return match?.[1] ?? null;
}

function extractCanonical(html) {
  return html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] ?? null;
}

function extractMetaRobots(html) {
  return html.match(/<meta[^>]*name=["']robots["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? null;
}

function extractJsonLd(html) {
  const openMatch = /<script\s[^>]*type=["']application\/ld\+json["'][^>]*>/i.exec(html);
  if (!openMatch) return null;
  const start = openMatch.index + openMatch[0].length;
  const end = html.indexOf("</script>", start);
  if (end === -1) return null;
  return html.slice(start, end);
}

function extractHreflangHrefs(html) {
  return Array.from(
    html.matchAll(/<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["'][^>]+href=["']([^"']+)["']/gi),
  )
    .map(([, hreflang, href]) => `${hreflang}=${href}`)
    .sort();
}

function extractRootInnerHtml(html) {
  const rootMarker = '<div id="root">';
  const rootStart = html.indexOf(rootMarker);
  if (rootStart === -1) return "";
  const contentStart = rootStart + rootMarker.length;
  const bodyEnd = html.indexOf("</body>", contentStart);
  const rootCloseEnd = html.lastIndexOf("</div>", bodyEnd === -1 ? html.length : bodyEnd);
  const slice =
    rootCloseEnd === -1 || rootCloseEnd <= contentStart
      ? html.slice(contentStart, bodyEnd === -1 ? undefined : bodyEnd)
      : html.slice(contentStart, rootCloseEnd);
  // Normalize insignificant whitespace between tags only — do not touch text content.
  return normalizeInsignificantWhitespace(slice);
}

function normalizeInsignificantWhitespace(html) {
  return html.replace(/>\s+</g, "><").trim();
}

/** Full prerendered HTML document (dist/<route>/index.html). */
function extractSeoSnapshotFromDocument(html) {
  return {
    title: extractTagContent(html, "title"),
    canonical: extractCanonical(html),
    robots: extractMetaRobots(html),
    hreflang: extractHreflangHrefs(html),
    jsonLd: extractJsonLd(html),
    h1: extractTagContent(html, "h1"),
    rootInnerHtml: extractRootInnerHtml(html),
  };
}

/**
 * A fresh `render()` result — {headTags, appHtml} — is not a full HTML
 * document (no <html>/<head>/<body>/<div id="root">), it's the exact pair of
 * fragments that both scripts/prerender.mjs and server/word-ssr-runtime.mjs
 * inject into their respective templates. Extracting from the concatenation
 * of the two fragments directly (rather than reconstructing a full document)
 * avoids re-implementing either script's template-injection logic here.
 */
function extractSeoSnapshotFromRenderResult({ headTags, appHtml }) {
  const headOnly = headTags;
  return {
    title: extractTagContent(headOnly, "title"),
    canonical: extractCanonical(headOnly),
    robots: extractMetaRobots(headOnly),
    hreflang: extractHreflangHrefs(headOnly),
    jsonLd: extractJsonLd(headOnly),
    h1: extractTagContent(appHtml, "h1"),
    rootInnerHtml: normalizeInsignificantWhitespace(appHtml),
  };
}

function distFileForRoute(route) {
  const normalized = route.replace(/^\/+/, "");
  const candidate = normalized === "" ? "index.html" : path.join(normalized, "index.html");
  return path.join(DIST_DIR, candidate);
}

async function main() {
  if (!fsSync.existsSync(DIST_DIR)) {
    console.log("\nSKIPPED: dist/ not found. Run `npm run build` first.\n");
    console.log("  0 passed, 0 failed, all skipped (no build)");
    return;
  }

  const entryServerPath = path.join(ROOT_DIR, "server-build", "entry-server.js");
  if (!fsSync.existsSync(entryServerPath)) {
    console.log("\nSKIPPED: server-build/entry-server.js not found. Run `npm run build` first.\n");
    console.log("  0 passed, 0 failed, all skipped (no SSR build)");
    return;
  }

  const entryServer = await import(pathToFileURL(entryServerPath).href);
  const allPrerenderRoutes = entryServer.getPrerenderRoutes();

  // Smallest matrix that covers every distinct route family produced by
  // getPrerenderRoutes(), rather than exhaustively re-rendering every
  // combination (there are 100+ base routes once every UI-language ×
  // practice-language × CEFR-level combination is enumerated).
  const routeSamples = [
    "/",
    "/about",
    "/help",
    "/languages",
    "/explore",
    allPrerenderRoutes.find((r) => /-vocabulary-practice$/.test(r)), // one CEFR vocabulary hub page
    allPrerenderRoutes.find((r) => /\/seo-pages$|\/paginas-seo$|\/pages-seo$/.test(r)), // localized SEO hub
    allPrerenderRoutes.find((r) => /word-pages$/.test(r)), // word SEO hub summary
    allPrerenderRoutes.find((r) => /level-test$/.test(r)), // level-test page
    allPrerenderRoutes.find((r) => /most-common-.*-verbs$|glagolov$/.test(r)), // English verb list
    allPrerenderRoutes.find((r) => /practice$/.test(r) && r.includes("exercises")), // one practice route
  ].filter((route, index, all) => route && all.indexOf(route) === index);

  console.log(`\nSampling ${routeSamples.length} route(s) from ${allPrerenderRoutes.length} total prerender routes:`);
  routeSamples.forEach((r) => console.log(`  - ${r}`));

  for (const route of routeSamples) {
    const distFile = distFileForRoute(route);
    console.log(`\n[route] ${route}`);

    if (!fsSync.existsSync(distFile)) {
      skip(`${route}: prerendered file exists in dist/`, `not found at ${path.relative(ROOT_DIR, distFile)} — build may not have generated it`);
      continue;
    }

    const staticHtml = await fs.readFile(distFile, "utf8");
    const staticSnapshot = extractSeoSnapshotFromDocument(staticHtml);

    // Fresh call to the exact same render() function scripts/prerender.mjs
    // called when it produced the static file above.
    const freshRenderResult = await entryServer.render(route, SITE_ORIGIN);
    const freshSnapshot = extractSeoSnapshotFromRenderResult(freshRenderResult);

    test(`${route}: title matches between prerendered build output and a fresh render() call`, () =>
      assert.equal(freshSnapshot.title, staticSnapshot.title));
    test(`${route}: canonical matches between prerendered build output and a fresh render() call`, () =>
      assert.equal(freshSnapshot.canonical, staticSnapshot.canonical));
    test(`${route}: robots meta matches between prerendered build output and a fresh render() call`, () =>
      assert.equal(freshSnapshot.robots, staticSnapshot.robots));
    test(`${route}: hreflang set matches between prerendered build output and a fresh render() call`, () =>
      assert.deepEqual(freshSnapshot.hreflang, staticSnapshot.hreflang));
    test(`${route}: JSON-LD matches between prerendered build output and a fresh render() call`, () => {
      if (staticSnapshot.jsonLd === null && freshSnapshot.jsonLd === null) return;
      assert.equal(freshSnapshot.jsonLd, staticSnapshot.jsonLd);
    });
    test(`${route}: H1 matches between prerendered build output and a fresh render() call`, () =>
      assert.equal(freshSnapshot.h1, staticSnapshot.h1));
    test(`${route}: rendered app root HTML matches between prerendered build output and a fresh render() call`, () =>
      assert.equal(freshSnapshot.rootInnerHtml, staticSnapshot.rootInnerHtml));
  }

  // Word pages: only exercised if the current build actually prerendered any
  // (mirrors the existing skip convention in scripts/test-homepage-visibility.mjs
  // for the same WORD_PRERENDER_LIMIT=0-by-default reason — this script does
  // not set or override that variable).
  console.log(`\n[word pages] prerendered-word-page parity`);
  const enDir = path.join(DIST_DIR, "en");
  const wordDirs = fsSync.existsSync(enDir)
    ? fsSync.readdirSync(enDir).filter((d) => d.includes("-word-") && d.includes("--"))
    : [];

  if (wordDirs.length === 0) {
    skip("word page: prerendered build output vs fresh render() parity", "no prerendered word pages in current dist/ (WORD_PRERENDER_LIMIT=0 or not set)");
  } else {
    const route = `/en/${wordDirs[0]}`;
    const staticHtml = await fs.readFile(path.join(enDir, wordDirs[0], "index.html"), "utf8");
    const staticSnapshot = extractSeoSnapshotFromDocument(staticHtml);
    const freshRenderResult = await entryServer.render(route, SITE_ORIGIN);
    const freshSnapshot = extractSeoSnapshotFromRenderResult(freshRenderResult);

    test(`${route}: title matches between prerendered build output and a fresh render() call`, () =>
      assert.equal(freshSnapshot.title, staticSnapshot.title));
    test(`${route}: canonical matches between prerendered build output and a fresh render() call`, () =>
      assert.equal(freshSnapshot.canonical, staticSnapshot.canonical));
    test(`${route}: JSON-LD matches between prerendered build output and a fresh render() call`, () =>
      assert.equal(freshSnapshot.jsonLd, staticSnapshot.jsonLd));
    test(`${route}: rendered app root HTML matches between prerendered build output and a fresh render() call`, () =>
      assert.equal(freshSnapshot.rootInnerHtml, staticSnapshot.rootInnerHtml));
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  console.log(`─────────────────────────────────────────\n`);

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log("prerender-vs-runtime parity tests passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
