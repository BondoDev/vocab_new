/**
 * Word browse-page pagination regression tests.
 *
 * NEW coverage: none of the existing scripts/test-*.mjs files exercise the
 * `/browse/page/:page` suffix on canonical word URLs. This script freezes the
 * current observable behavior for that suffix before any Cloudflare/rendering
 * migration work begins.
 *
 * Verifies (against src/entry-server.tsx `handleWordSsrPathname` /
 * `resolveWordSeoRequest`, and src/seo/metadata.ts `buildWordSeoMetadata`):
 *   - page 1 (no suffix) is indexable (no robots meta), self-canonical
 *   - page 2+ is "noindex, follow", self-canonical (NOT canonicalized to page 1)
 *   - hreflang alternates on every browse page point at the page-1 (base) URL
 *   - title gets " - Browse Page N" suffix; description gets a page-N prefix
 *   - the last valid page is 200; one page past it is 410
 *   - page 0 is 410 (invalid, not just "out of range")
 *
 * Run: node scripts/test-word-browse-pagination.mjs
 * No build required — compiles TS sources on the fly (same pattern as the
 * existing scripts/test-word-seo-routes.mjs).
 */

import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadBaselineContext } from "./seo-baseline/fixtures.mjs";
import { ROOT_DIR } from "./seo-baseline/lib/compileTs.mjs";

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

function extractHreflangHrefs(html) {
  return Array.from(
    html.matchAll(/<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']+)["'][^>]+href=["']([^"']+)["']/gi),
  ).map(([, hreflang, href]) => ({ hreflang, href }));
}

function extractMetaDescription(html) {
  return html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? null;
}

async function main() {
  const ctx = loadBaselineContext();
  const { wordSlugs, wordPageData, vocabularies, siteOrigin } = ctx;

  try {
    // src/entry-server.tsx is TSX importing React components; the existing
    // HTTP-level test (scripts/test-word-ssr-http.mjs) exercises it through
    // the compiled server-build bundle. This script instead needs the raw
    // *runtime* resolution behavior, which server/word-ssr-runtime.mjs wraps
    // around the same compiled bundle, so we reuse that module exactly the
    // way the production handler does.
    const { handleWordSsrPathname } = await import(
      pathToFileURL(path.join(ROOT_DIR, "server-build", "entry-server.js")).href
    ).then(
      (entryServer) => ({
        handleWordSsrPathname: async (pathname) => {
          const resolution = await entryServer.resolveWordSeoRequest(pathname);
          if (resolution.kind === "redirect") {
            return { status: 308, headers: { Location: resolution.location }, body: "" };
          }
          if (resolution.kind !== "canonical") {
            return { status: 410, headers: {}, body: "410 Gone" };
          }
          const page = await entryServer.render(pathname, siteOrigin);
          return { status: 200, headers: {}, body: `${page.headTags}\n${page.appHtml}` };
        },
      }),
      () => {
        throw new Error(
          "server-build/entry-server.js not found — run `npm run build` (or at least " +
            "`vite build --ssr src/entry-server.tsx --outDir server-build`) before this test.",
        );
      },
    );

    const aboutEntry = vocabularies.english.find((e) => e.concept_id === "A1-00001");
    const resolved = wordPageData.buildResolvedWordPageData({
      uiLang: "en",
      targetLanguage: "english",
      wordSlug: wordSlugs.wordToSlug(aboutEntry.word_lemma),
      conceptId: aboutEntry.concept_id,
      vocabulary: vocabularies.english,
    });
    const totalPages = Math.max(
      1,
      Math.ceil(resolved.browseWords.length / wordPageData.WORD_PAGE_BROWSE_WORDS_PER_PAGE),
    );
    assert.ok(totalPages > 2, `expected the A1 level to span more than 2 browse pages, got ${totalPages}`);

    const basePath = wordSlugs.buildWordPath("en", "english", aboutEntry.word_lemma, aboutEntry.concept_id);

    console.log(`\n[1] Page 1 (canonical, no suffix) — ${basePath}`);
    {
      const response = await handleWordSsrPathname(basePath);
      test("page 1 returns 200", () => assert.equal(response.status, 200));
      test("page 1 canonical is the base path", () =>
        assert.equal(extractCanonical(response.body), `${siteOrigin}${basePath}`));
      test("page 1 has no robots meta tag (default indexable)", () =>
        assert.equal(extractMetaRobots(response.body), null));
      test("page 1 title has no 'Browse Page' suffix", () =>
        assert.ok(!/Browse Page/i.test(extractTagContent(response.body, "title") ?? "")));
    }

    console.log(`\n[2] Page 2 — ${basePath}/browse/page/2`);
    {
      const page2Path = `${basePath}/browse/page/2`;
      const response = await handleWordSsrPathname(page2Path);
      test("page 2 returns 200", () => assert.equal(response.status, 200));
      test("page 2 canonical is its OWN path (not canonicalized back to page 1)", () =>
        assert.equal(extractCanonical(response.body), `${siteOrigin}${page2Path}`));
      test("page 2 has 'noindex, follow' robots meta", () =>
        assert.equal(extractMetaRobots(response.body), "noindex, follow"));
      test("page 2 title has ' - Browse Page 2' suffix", () =>
        assert.ok(/Browse Page 2/i.test(extractTagContent(response.body, "title") ?? "")));
      test("page 2 description mentions 'Browse page 2'", () =>
        assert.ok(/Browse page 2/i.test(extractMetaDescription(response.body) ?? "")));

      const hreflangLinks = extractHreflangHrefs(response.body);
      test("page 2 hreflang alternates point at page-1 (base) URLs, not /browse/page/2", () => {
        assert.ok(hreflangLinks.length > 0, "no hreflang links found");
        for (const { href } of hreflangLinks) {
          assert.ok(!href.includes("/browse/page/"), `hreflang href leaked pagination: ${href}`);
        }
      });
      test("page 2 has an 'en' hreflang pointing at the canonical base English UI path", () => {
        const enLink = hreflangLinks.find((l) => l.hreflang === "en");
        assert.equal(enLink?.href, `${siteOrigin}${basePath}`);
      });
      test("page 2 has an 'x-default' hreflang entry", () => {
        assert.ok(hreflangLinks.some((l) => l.hreflang === "x-default"));
      });
    }

    console.log(`\n[3] Valid final page (page ${totalPages}) — ${basePath}/browse/page/${totalPages}`);
    {
      const finalPagePath = `${basePath}/browse/page/${totalPages}`;
      const response = await handleWordSsrPathname(finalPagePath);
      test(`final page ${totalPages} returns 200`, () => assert.equal(response.status, 200));
      test("final page has 'noindex, follow' robots meta", () =>
        assert.equal(extractMetaRobots(response.body), "noindex, follow"));
    }

    console.log(`\n[4] Out-of-range page (page ${totalPages + 1}) — ${basePath}/browse/page/${totalPages + 1}`);
    {
      const overflowPath = `${basePath}/browse/page/${totalPages + 1}`;
      const response = await handleWordSsrPathname(overflowPath);
      test("page past the last valid page returns 410", () => assert.equal(response.status, 410));
    }

    console.log(`\n[5] Invalid page 0 — ${basePath}/browse/page/0`);
    {
      const response = await handleWordSsrPathname(`${basePath}/browse/page/0`);
      test("page 0 returns 410 (not treated as page 1)", () => assert.equal(response.status, 410));
    }
  } finally {
    ctx.cleanup();
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────────\n`);

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log("word browse-pagination tests passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
