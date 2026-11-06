/**
 * Route-chunk stylesheets in the prerendered HTML (scripts/build/prerender.mjs).
 *
 * About, Help, and the filters page (LevelCategorySelection) are lazy route
 * chunks that ship their own CSS. Vite only injects that CSS after the JS
 * chunk loads, so the prerender links it in <head>; without it the server
 * markup first painted unstyled and then re-laid out (CLS ~0.6–0.8).
 *
 * Checks, against dist/:
 *   1. Each of those routes links its chunk's stylesheet exactly once, in
 *      <head>, as a root-relative /assets/ path to a file that exists, and
 *      with no duplicate stylesheet href anywhere in the document.
 *   2. The linked stylesheets cover every CSS file Vite itself loads for that
 *      chunk's dynamic import (read from the client entry's preload map), so
 *      a stylesheet moving into a shared chunk is caught here.
 *   3. The chunk's modulepreload stays, pointing at an existing file.
 *   4. Routes without a CSS-bearing chunk link only the main stylesheet.
 *
 * Run: node scripts/tests/prerender/test-prerender-route-css.mjs
 * Requires a prior `npm run build` (dist/ must exist).
 * PRERENDER_ROUTE_CSS_DIST_DIR=<dir> checks another build output instead.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "../../lib/compileTs.mjs";

const DIST_DIR = process.env.PRERENDER_ROUTE_CSS_DIST_DIR
  ? path.resolve(process.env.PRERENDER_ROUTE_CSS_DIST_DIR)
  : path.join(ROOT_DIR, "dist");
const ASSETS_DIR = path.join(DIST_DIR, "assets");

const ROUTES_WITH_CHUNK_CSS = [
  { route: "/about", chunk: "About" },
  { route: "/help", chunk: "Help" },
  { route: "/languages/filters", chunk: "LevelCategorySelection" },
];
const ROUTES_WITHOUT_CHUNK_CSS = ["/", "/custom-practice", "/languages/level-test", "/en/100-essential-english-nouns"];

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}\n    ${String(error.message).split("\n").join("\n    ")}`);
  }
}

assert.ok(fs.existsSync(ASSETS_DIR), "dist/assets is missing; run `npm run build` first");
const assetFiles = fs.readdirSync(ASSETS_DIR);

const readRoute = (route) => fs.readFileSync(path.join(DIST_DIR, route, "index.html"), "utf8");
const linkHrefs = (html, rel) =>
  [...html.matchAll(/<link\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => new RegExp(`\\brel="${rel}"`).test(tag))
    .map((tag) => tag.match(/\bhref="([^"]*)"/)?.[1] ?? "");
const assetExists = (href) => href.startsWith("/assets/") && assetFiles.includes(href.slice("/assets/".length));

// The CSS Vite loads for each dynamic import, from the client entry's
// __vite__mapDeps table: import("./X-hash.js"),__vite__mapDeps([i, ...]).
function readViteCssDeps() {
  const entry = assetFiles.find((file) => /^index-[^.]+\.js$/.test(file));
  assert.ok(entry, "client entry chunk (assets/index-*.js) not found");
  const source = fs.readFileSync(path.join(ASSETS_DIR, entry), "utf8");
  const table = source.match(/m\.f=(\[[^\]]*\])/);
  assert.ok(table, "Vite preload map (__vite__mapDeps) not found in the client entry; update this test's parser");
  const deps = JSON.parse(table[1]);
  const byChunk = new Map();
  for (const [, file, indexes] of source.matchAll(/import\("\.\/([^"]+\.js)"\),__vite__mapDeps\(\[([\d,]*)\]\)/g)) {
    const css = indexes.split(",").map(Number).map((i) => deps[i]).filter((dep) => dep.endsWith(".css")).map((dep) => `/${dep}`);
    byChunk.set(file, css);
  }
  return byChunk;
}
const viteCssDeps = readViteCssDeps();

const mainCss = assetFiles.filter((file) => /^index-[^.]+\.css$/.test(file)).map((file) => `/assets/${file}`);
assert.equal(mainCss.length, 1, `expected one main stylesheet, found ${mainCss.join(", ")}`);

console.log("\n=== routes with chunk CSS ===\n");
for (const { route, chunk } of ROUTES_WITH_CHUNK_CSS) {
  const html = readRoute(route);
  const head = html.slice(0, html.indexOf("</head>"));
  const stylesheets = linkHrefs(html, "stylesheet");
  const chunkCss = stylesheets.filter((href) => href.startsWith(`/assets/${chunk}-`));

  test(`${route}: links the ${chunk} stylesheet once, in <head>, to an existing asset`, () => {
    assert.equal(chunkCss.length, 1, `found ${JSON.stringify(stylesheets)}`);
    assert.ok(assetExists(chunkCss[0]), `${chunkCss[0]} is not a file in dist/assets`);
    assert.ok(linkHrefs(head, "stylesheet").includes(chunkCss[0]), "chunk stylesheet is outside <head>");
  });

  test(`${route}: every stylesheet is valid and unique, main stylesheet included`, () => {
    assert.equal(new Set(stylesheets).size, stylesheets.length, `duplicates in ${JSON.stringify(stylesheets)}`);
    for (const href of stylesheets) assert.ok(assetExists(href), `invalid stylesheet href ${href}`);
    assert.ok(stylesheets.includes(mainCss[0]), "main stylesheet missing");
  });

  test(`${route}: covers all CSS Vite loads for the chunk and keeps its modulepreload`, () => {
    const preloads = linkHrefs(html, "modulepreload").filter((href) => href.startsWith(`/assets/${chunk}-`));
    assert.equal(preloads.length, 1, `modulepreload for ${chunk} missing or duplicated`);
    assert.ok(assetExists(preloads[0]), `${preloads[0]} is not a file in dist/assets`);
    const expected = viteCssDeps.get(preloads[0].slice("/assets/".length));
    assert.ok(expected, `no Vite preload entry for ${preloads[0]}`);
    assert.ok(expected.length > 0, `Vite maps no CSS to ${chunk}; this route no longer needs to be listed here`);
    for (const href of expected) assert.ok(stylesheets.includes(href), `${href} (loaded by Vite for ${chunk}) is not linked`);
  });
}

console.log("\n=== routes without chunk CSS ===\n");
for (const route of ROUTES_WITHOUT_CHUNK_CSS) {
  test(`${route}: links only the main stylesheet`, () => {
    assert.deepEqual(linkHrefs(readRoute(route), "stylesheet"), mainCss);
  });
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
