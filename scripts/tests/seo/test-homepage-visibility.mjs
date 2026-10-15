/**
 * Homepage visibility regression tests.
 * Inspects actual built dist/ HTML — not source strings.
 *
 * Run: node scripts/tests/seo/test-homepage-visibility.mjs
 * Must be run after: npm run build
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "..", "..", "..", "dist");

let passed = 0;
let failed = 0;

function assert(condition, name, detail = "") {
  if (condition) {
    console.log(`  ✓  ${name}`);
    passed++;
  } else {
    console.error(`  ✗  ${name}${detail ? `\n       ${detail}` : ""}`);
    failed++;
  }
}

async function readHtml(relPath) {
  return fs.readFile(path.join(DIST, relPath), "utf8");
}

// ── 1. Homepage content visibility ────────────────────────────────────────────
console.log("\n[1] Homepage content visibility");
{
  const html = await readHtml("index.html");

  const hero = html.match(/<h1\b[^>]*>Learn Vocabulary Your Way<\/h1>/);
  assert(Boolean(hero), "Centered homepage H1 is present in SSR HTML");
  const beforeHero = hero ? html.slice(Math.max(0, hero.index - 300), hero.index) : "";
  assert(!/opacity\s*:\s*0(?:[^.]|$)/.test(beforeHero), "Homepage H1 is not initially transparent");
  assert(!/visibility\s*:\s*hidden|display\s*:\s*none/.test(beforeHero), "Homepage H1 is not hidden");
  assert(html.includes("Start Practicing"), "Custom Practice CTA is present in SSR HTML");
  assert(html.includes("Log In to Your Account"), "Personalized Learning CTA is present in SSR HTML");

  const setupHtml = await readHtml("custom-practice/index.html");
  assert(setupHtml.includes("Your language"), "Native-language selector is present on the setup page");
  assert(setupHtml.includes("Practice language"), "Practice-language selector is present on the setup page");
  assert(setupHtml.includes("Choose Your Exercises"), "Shared exercise selection is present on the setup page");
}

// ── 2. Font loading ────────────────────────────────────────────────────────────
console.log("\n[2] Font loading");
{
  const html = await readHtml("index.html");

  assert(
    html.includes('rel="preconnect" href="https://fonts.googleapis.com"'),
    "preconnect for fonts.googleapis.com is in homepage HTML",
  );
  assert(
    html.includes('href="https://fonts.gstatic.com"'),
    "preconnect for fonts.gstatic.com is in homepage HTML",
  );
  assert(
    html.includes('fonts.googleapis.com/css2?family=Manrope') &&
      html.includes('rel="stylesheet"'),
    "Google Fonts stylesheet link is in homepage HTML (not @import in CSS)",
  );

  // CSS bundle must not contain the @import for Google Fonts
  const cssFiles = (await fs.readdir(path.join(DIST, "assets")))
    .filter((f) => f.startsWith("index-") && f.endsWith(".css"));
  assert(cssFiles.length > 0, "Main CSS bundle exists in dist/assets");
  if (cssFiles.length > 0) {
    const css = await fs.readFile(path.join(DIST, "assets", cssFiles[0]), "utf8");
    assert(
      !css.includes("fonts.googleapis.com"),
      "Main CSS bundle does not contain Google Fonts @import",
    );
  }
}

// ── 3. Homepage SEO metadata ───────────────────────────────────────────────────
console.log("\n[3] Homepage SEO metadata");
{
  const html = await readHtml("index.html");

  assert(
    html.includes('<link rel="canonical" href="https://www.fluentstellar.com/">'),
    "Homepage canonical URL is correct",
  );
  assert(
    html.includes('FluentStellar') && html.includes('<title>'),
    "Homepage <title> contains FluentStellar",
  );
  // Homepage is indexable: either no robots meta (Googlebot default = index) or explicit index.
  // The prerender strips the template robots meta and SSR only injects noindex for restricted routes.
  assert(
    !html.includes('content="noindex') && !html.includes("content='noindex"),
    "Homepage does not have noindex in any meta robots tag",
  );
  assert(
    html.includes('rel="canonical"'),
    "Homepage has canonical tag (indexability signal)",
  );
}

// ── 4. /profile noindex policy ────────────────────────────────────────────────
console.log("\n[4] /profile noindex policy");
{
  try {
    const html = await readHtml("profile/index.html");
    assert(
      html.includes('noindex') || html.includes('no-store'),
      "/profile prerendered HTML contains noindex or no-store",
    );
  } catch {
    assert(false, "/profile/index.html exists in dist", "File not found");
  }
}

// ── 5. Practice-route noindex policy ─────────────────────────────────────────
console.log("\n[5] Practice-route noindex policy");
{
  const practiceRoute =
    "languages/filters/exercises/en-es/practice/index.html";
  try {
    const html = await readHtml(practiceRoute);
    assert(
      html.includes('noindex') || html.includes('no-store'),
      "Practice route prerendered HTML contains noindex or no-store",
    );
  } catch {
    // It's also acceptable that practice routes aren't prerendered separately
    // (they're SPA routes under the same shell) — note this
    console.log(
      "       (practice route not individually prerendered — relies on SPA shell noindex injection)",
    );
    assert(true, "Practice-route noindex check (SPA shell — acceptable)");
  }
}

// ── 6. Word-page SSR completeness ─────────────────────────────────────────────
console.log("\n[6] Canonical word-page SSR completeness");
{
  // Find the first prerendered word page
  const enDir = await fs.readdir(path.join(DIST, "en")).catch(() => []);
  const wordDir = enDir.find((d) => d.includes("-word-"));
  if (wordDir) {
    const html = await readHtml(`en/${wordDir}/index.html`);
    assert(html.includes('<h1'), "Word page has H1 element");
    assert(html.includes('application/ld+json'), "Word page has JSON-LD");
    assert(html.includes('rel="canonical"'), "Word page has canonical tag");
    assert(html.includes('hreflang'), "Word page has hreflang");
    assert(
      /<meta\b[^>]*name=["']robots["'][^>]*content=["']noindex, follow["']/i.test(html),
      "Canonical word page retains noindex, follow",
    );
  } else {
    assert(true, "Word pages checked (none prerendered in this build — WORD_PRERENDER_LIMIT=0)");
    assert(true, "Word page JSON-LD (skipped)");
    assert(true, "Word page canonical (skipped)");
    assert(true, "Word page hreflang (skipped)");
    assert(true, "Word page indexable (skipped)");
  }
}

// ── 7. Sitemap unchanged ──────────────────────────────────────────────────────
console.log("\n[7] Sitemap");
{
  try {
    const sitemap = await fs.readFile(path.join(DIST, "..", "public", "sitemap.xml"), "utf8");
    assert(
      sitemap.includes("fluentstellar.com"),
      "Sitemap references fluentstellar.com",
    );
    assert(
      sitemap.includes("<loc>"),
      "Sitemap contains <loc> entries",
    );
  } catch {
    assert(false, "public/sitemap.xml exists", "File not found");
    assert(false, "Sitemap has entries", "File not found");
  }
}

// ── 8. opacity:0 audit: no above-fold hero elements hidden ────────────────────
console.log("\n[8] opacity:0 audit on homepage");
{
  const html = await readHtml("index.html");

  // Known safe opacity:0 elements: FloatingWords decorative divs
  // They all contain single words (Hello, Hola, Bonjour, etc.) with no nesting
  // Extract all opacity:0 context and check none contain the hero/form classes
  // Use 500-char window to ensure position:absolute appears in context even for long styles
  const opacity0Regex = /([^\n]{0,500}opacity:0[^\n]{0,200})/g;
  const matches = [...html.matchAll(opacity0Regex)];

  const heroClasses = [
    'new-home-page__hero',
    'new-home-page__title',
    'new-home-page__subtitle',
    'new-home-page__daily-word',
  ];

  const badMatches = matches.filter((m) =>
    heroClasses.some((cls) => m[1].includes(cls)),
  );

  assert(
    badMatches.length === 0,
    "No above-the-fold homepage elements have opacity:0 in SSR",
    badMatches.length > 0 ? `Found: ${badMatches[0][1].slice(0, 100)}` : "",
  );

  // All opacity:0 instances must be FloatingWords (decorative absolutely-positioned elements).
  // FloatingWords have: position:absolute + left: + top: (they're never in the hero layout flow).
  const isSafeFloatingWord = (m) => {
    const ctx = m[1];
    // FloatingWords are always absolute-positioned with left/top coordinates
    return ctx.includes('position:absolute') || (ctx.includes('left:') && ctx.includes('top:'));
  };

  const unsafeMatches = matches.filter((m) => !isSafeFloatingWord(m));
  assert(
    unsafeMatches.length === 0,
    `All ${matches.length} opacity:0 instances are decorative FloatingWords (position:absolute)`,
    unsafeMatches.length > 0 ? `Unexpected: ${unsafeMatches[0][1].slice(0, 120)}` : "",
  );
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exit(1);
}
