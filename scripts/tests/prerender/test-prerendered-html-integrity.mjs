/**
 * Byte-level integrity of the prerendered HTML in dist/.
 *
 * Guards against the React 18.3.1 renderToPipeableStream defect that put NUL
 * bytes into prerendered pages: its Node writer (writeStringChunk) flushed the
 * whole 2 KB view whenever a multibyte character did not fit, shipping the
 * unused zero padding inside text and attributes. Corruption landed only next
 * to multibyte characters, so it hit accented Latin and Cyrillic content and
 * word-link hrefs (`/de/german-word-\0ängstlich--A1-00009`), shifting position
 * with every content change. src/entry-server.tsx now renders with
 * renderToReadableStream; this test fails if any generated page regresses.
 *
 * Checks:
 *   1. src/entry-server.tsx does not use renderToPipeableStream again.
 *   2. The renderer entry-server uses produces NUL-free, renderToString-equal
 *      markup for synthetic accented/Cyrillic/3-byte content at many byte
 *      offsets (independent of dist/).
 *   3. Every dist/**\/index.html: strict UTF-8, no NUL or other C0 control
 *      characters, no U+FFFD, complete document with non-trivial #root, and
 *      sitemap pages keep substantial content.
 *   4. Every internal href is free of control/replacement characters, and
 *      every word link parses as a canonical route (a non-normalized slug is
 *      the corruption signature: the Worker would 308 it).
 *   5. On CEFR and word-index pages, where the anchor text is the lemma, every
 *      word href equals buildWordPath(ui, target, text, conceptId).
 *   6. Explicit multilingual fixtures that were previously corrupted.
 *
 * Run: node scripts/tests/prerender/test-prerendered-html-integrity.mjs
 * Requires a prior `npm run build` (dist/ must exist).
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { compileTsToCommonJs, ROOT_DIR } from "../../lib/compileTs.mjs";

const DIST_DIR = process.env.PRERENDER_INTEGRITY_DIST_DIR
  ? path.resolve(process.env.PRERENDER_INTEGRITY_DIST_DIR)
  : path.join(ROOT_DIR, "dist");
const SITE_ORIGIN = "https://www.fluentstellar.com";
const MIN_ROOT_CHARS = 200;
const MIN_SITEMAP_ROOT_CHARS = 5_000;
const MAX_REPORTED = 15;

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
async function testAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}\n    ${String(error.message).split("\n").join("\n    ")}`);
  }
}
const report = (problems) => problems.slice(0, MAX_REPORTED).join("\n") + (problems.length > MAX_REPORTED ? `\n… ${problems.length - MAX_REPORTED} more` : "");

console.log("\n=== renderer ===\n");

test("src/entry-server.tsx does not use renderToPipeableStream", () => {
  const source = fs.readFileSync(path.join(ROOT_DIR, "src", "entry-server.tsx"), "utf8");
  const code = source.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/renderToPipeableStream/.test(code), "entry-server.tsx calls renderToPipeableStream, whose React 18.3.1 Node writer emits NUL bytes");
  assert.ok(/renderToReadableStream/.test(code), "entry-server.tsx no longer renders with renderToReadableStream");
});

await testAsync("renderToReadableStream emits no NUL for accented Latin, Cyrillic and 3-byte text at shifting offsets", async () => {
  const require = createRequire(path.join(ROOT_DIR, "package.json"));
  const React = require("react");
  const { renderToReadableStream, renderToString } = require("react-dom/server.browser");
  const words = ["ängstlich", "gefäß", "réseauter", "приключение", "возраст", "naïve — …", "plain"];
  const problems = [];
  // Prefix lengths shift every multibyte character across all positions of
  // the renderer's internal buffer boundaries.
  for (let prefix = 0; prefix < 64; prefix += 1) {
    const tree = React.createElement(
      "ul",
      { "data-prefix": "x".repeat(prefix) },
      Array.from({ length: 300 }, (_, i) => {
        const word = words[i % words.length];
        return React.createElement(
          "li",
          { key: i },
          React.createElement("a", { href: `/de/german-word-${word}--A1-${String(i).padStart(5, "0")}` }, word),
        );
      }),
    );
    const stream = await renderToReadableStream(tree);
    await stream.allReady;
    const html = await new Response(stream).text();
    if (html.includes("\0")) problems.push(`prefix ${prefix}: NUL in output`);
    else if (html !== renderToString(tree)) problems.push(`prefix ${prefix}: differs from renderToString`);
  }
  assert.deepEqual(problems, [], report(problems));
});

if (!fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  console.error(`\n${DIST_DIR} has no prerendered output — run \`npm run build\` first.`);
  process.exit(1);
}

const compiled = compileTsToCommonJs(".tmp-prerendered-html-integrity", [
  path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordRouteManifest.ts"),
  path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordSlugs.ts"),
]);

try {
  const { parseWordRoutePathname } = compiled.require("src/data/seo/wordPages/wordRouteManifest");
  const { buildWordPath } = compiled.require("src/data/seo/wordPages/wordSlugs");

  const sitemapPaths = new Set();
  const sitemapDir = path.join(ROOT_DIR, "public", "sitemaps");
  for (const file of fs.readdirSync(sitemapDir)) {
    for (const match of fs.readFileSync(path.join(sitemapDir, file), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)) {
      sitemapPaths.add(decodeURIComponent(new URL(match[1]).pathname));
    }
  }

  const pages = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "index.html") {
        const rel = path.relative(DIST_DIR, dir).split(path.sep).join("/");
        pages.push({ urlPath: rel ? `/${rel}` : "/", file: full });
      }
    }
  })(DIST_DIR);

  const decodeEntities = (value) =>
    value
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  const controlChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

  const encodingProblems = [];
  const structureProblems = [];
  const hrefProblems = [];
  const lemmaProblems = [];
  const htmlByPath = new Map();
  let anchorCount = 0;
  let checkedLemmaLinks = 0;

  for (const { urlPath, file } of pages) {
    const bytes = fs.readFileSync(file);
    let html;
    try {
      html = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      encodingProblems.push(`${urlPath}: invalid UTF-8`);
      html = bytes.toString("utf8");
    }
    htmlByPath.set(urlPath, html);
    const nul = html.split("\0").length - 1;
    if (nul > 0) encodingProblems.push(`${urlPath}: ${nul} NUL byte(s), first near ${JSON.stringify(html.slice(Math.max(0, html.indexOf("\0") - 40), html.indexOf("\0") + 20))}`);
    else if (controlChars.test(html)) encodingProblems.push(`${urlPath}: C0 control character`);
    if (html.includes("�")) encodingProblems.push(`${urlPath}: U+FFFD replacement character`);

    const rootStart = html.indexOf('<div id="root">');
    const bodyEnd = html.indexOf("</body>");
    const rootChars = rootStart < 0 || bodyEnd < 0 ? -1 : html.lastIndexOf("</div>", bodyEnd) - rootStart;
    if (!/<html lang="[a-z]{2}">/.test(html) || !/<title>[^<]+<\/title>/.test(html) || !html.trimEnd().endsWith("</html>")) {
      structureProblems.push(`${urlPath}: incomplete document (html lang/title/closing tag)`);
    }
    const minRoot = sitemapPaths.has(urlPath) ? MIN_SITEMAP_ROOT_CHARS : MIN_ROOT_CHARS;
    if (rootChars < minRoot) structureProblems.push(`${urlPath}: #root has ${rootChars} chars (< ${minRoot})`);

    const body = html.slice(html.indexOf("<body"));
    // CEFR level pages (".../{lang}-a1-...") and word-index pages
    // ("/{ui}/{index-root}/{target}-…/…") label every word link with its lemma.
    const labelsWordLinksWithLemma =
      (sitemapPaths.has(urlPath) && /-(a1|a2|b1|b2|c1|c2)-/.test(urlPath)) ||
      (!sitemapPaths.has(urlPath) && urlPath.split("/").length >= 4 && !urlPath.startsWith("/languages/"));
    for (const match of body.matchAll(/<a\b[^>]*?\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)) {
      anchorCount += 1;
      const rawHref = decodeEntities(match[1]);
      if (controlChars.test(rawHref) || rawHref.includes("�") || /\s/.test(rawHref)) {
        hrefProblems.push(`${urlPath} -> ${JSON.stringify(rawHref)}: control/replacement/whitespace character`);
        continue;
      }
      if (/^(#|mailto:|tel:)/.test(rawHref)) continue;
      let pathname;
      try {
        const url = new URL(rawHref, `${SITE_ORIGIN}/`);
        if (url.origin !== SITE_ORIGIN) continue;
        pathname = decodeURIComponent(url.pathname);
      } catch {
        hrefProblems.push(`${urlPath} -> ${JSON.stringify(rawHref)}: unparseable URL`);
        continue;
      }
      if (!pathname.includes("-word-") || /-word-pages(\/|$)/.test(pathname)) continue;
      const parsed = parseWordRoutePathname(pathname);
      if (parsed.kind === "legacy-slug-format" || parsed.kind === "legacy-single-hyphen") {
        hrefProblems.push(`${urlPath} -> ${pathname}: non-canonical word slug (${parsed.kind})`);
        continue;
      }
      if (!labelsWordLinksWithLemma || parsed.kind !== "canonical") continue;
      // The href must be exactly what the shared builder produces for the
      // visible lemma — catches corruption in either the href or the text.
      const text = decodeEntities(match[2].replace(/<!-- -->/g, "")).trim();
      const expected = buildWordPath(parsed.uiLang, parsed.targetLanguage, text, parsed.conceptId);
      if (expected !== pathname) {
        lemmaProblems.push(`${urlPath}: "${text}" -> ${pathname} (expected ${expected})`);
      } else {
        checkedLemmaLinks += 1;
      }
    }
  }

  console.log(`\n=== dist/ byte integrity (${pages.length} pages) ===\n`);
  test("every page is strict UTF-8 with no NUL, C0 control, or U+FFFD characters", () => {
    assert.deepEqual(encodingProblems, [], report(encodingProblems));
  });
  test("every page is a complete document with non-trivial #root; sitemap pages keep substantial content", () => {
    assert.deepEqual(structureProblems, [], report(structureProblems));
  });

  console.log(`\n=== internal links (${anchorCount} anchors) ===\n`);
  test("no internal href contains control, replacement or whitespace characters, and word links use canonical slugs", () => {
    assert.deepEqual(hrefProblems, [], report(hrefProblems));
  });
  test(`word links whose anchor text is the lemma match buildWordPath (${checkedLemmaLinks} checked)`, () => {
    assert.ok(checkedLemmaLinks > 100_000, `only ${checkedLemmaLinks} lemma-labelled word links found — selector drifted?`);
    assert.deepEqual(lemmaProblems, [], report(lemmaProblems));
  });

  console.log("\n=== multilingual fixtures (previously NUL-corrupted) ===\n");
  const fixtures = [
    ["/de/seo-seiten/deutsche-wortseiten/a1", "/de/german-word-ängstlich--A1-00009", "ängstlich"],
    ["/en/seo-pages/french-word-pages/b2/page/9", "/en/french-word-réseauter--B2-03277", "réseauter"],
    ["/de/seo-seiten/russische-wortseiten/a2", "/de/russian-word-приключение--A2-00024", "приключение"],
  ];
  for (const [page, href, text] of fixtures) {
    test(`${page} links ${href}`, () => {
      const html = htmlByPath.get(page);
      assert.ok(html, `${page} was not prerendered`);
      assert.ok(html.includes(`href="${href}"`), `${page} does not contain href="${href}"`);
      assert.ok(html.includes(`>${text}</a>`), `${page} does not render the anchor text "${text}"`);
    });
  }
} finally {
  compiled.cleanup();
}

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("\nprerendered HTML integrity tests passed");
}
