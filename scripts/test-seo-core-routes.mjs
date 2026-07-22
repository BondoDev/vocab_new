/**
 * robots.txt + platform-level route policy regression tests.
 *
 * Coverage: public/robots.txt content; the shared route-metadata policy's
 * classification of restricted routes (/profile and practice sessions must
 * stay non-indexable — on Cloudflare the enforcement mechanism is the
 * noindex <meta> baked into the prerendered HTML, checked build-dependently
 * by scripts/test-homepage-visibility.mjs; this script guards the policy
 * source itself with no build required); and the Cloudflare canonical-host /
 * legacy-redirect contract. The apex→www and HTTP→HTTPS 301s are zone-level
 * Cloudflare dashboard rules (verified live 2026-07-14) that cannot be read
 * from the repo, so docs/deployment.md is asserted as the frozen record of
 * that behavior; the legacy word-URL 308 lives in the Worker source (runtime
 * behavior is exercised end-to-end by scripts/test-word-ssr-http.mjs and the
 * route parsing by scripts/test-word-route-manifest.mjs).
 *
 * Run: node scripts/test-seo-core-routes.mjs
 * No build required.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileTsToCommonJs } from "./lib/compileTs.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

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

function readFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

async function main() {
  console.log("\n[1] robots.txt content");
  {
    const robotsTxt = readFile("public/robots.txt");

    test("robots.txt allows all user agents", () => {
      assert.match(robotsTxt, /User-agent:\s*\*/i);
      assert.match(robotsTxt, /Allow:\s*\//i);
    });

    test("robots.txt catch-all group has no blanket Disallow (search engines stay allowed)", () => {
      // Per-bot Disallow groups are an intentional crawl policy for
      // non-search commercial crawlers (2026-07-10 Worker-quota incident;
      // see scripts/test-crawler-policy.mjs for the full policy guards).
      // What must never happen is the catch-all `User-agent: *` group —
      // the one Googlebot/Bingbot fall into — gaining a `Disallow: /`.
      const catchAllGroup = robotsTxt
        .split(/\n(?=User-agent:)/i)
        .find((group) => /^User-agent:\s*\*/im.test(group));
      assert.ok(catchAllGroup, "robots.txt is missing the catch-all User-agent: * group");
      assert.ok(
        !/Disallow:\s*\/\s*$/im.test(catchAllGroup),
        "the catch-all User-agent: * group contains a blanket Disallow: /",
      );
    });

    test("robots.txt references the production sitemap index", () => {
      assert.match(robotsTxt, /Sitemap:\s*https:\/\/www\.fluentstellar\.com\/sitemap\.xml/i);
    });
  }

  const compiled = compileTsToCommonJs(".tmp-seo-core-routes-test", [
    path.join(rootDir, "src", "seo", "routeMetadataPolicy.ts"),
  ]);
  const { require: requireCompiled, cleanup } = compiled;
  const routeMetadataPolicy = requireCompiled("src/seo/routeMetadataPolicy");

  console.log("\n[2] routeMetadataPolicy.ts keeps restricted routes non-indexable");
  {
    test("/profile is classified private-account", () => {
      assert.equal(routeMetadataPolicy.classifyRouteMetadata("/profile"), "private-account");
    });

    test("base practice route is classified practice-session", () => {
      assert.ok(
        routeMetadataPolicy.isPracticeSessionPath("/languages/filters/exercises/practice"),
        "routeMetadataPolicy.ts no longer classifies the base practice route as a practice session",
      );
      assert.equal(
        routeMetadataPolicy.classifyRouteMetadata("/languages/filters/exercises/practice"),
        "practice-session",
      );
    });

    test("language-pair practice route is classified practice-session", () => {
      assert.equal(
        routeMetadataPolicy.classifyRouteMetadata("/languages/filters/exercises/en-es/practice"),
        "practice-session",
      );
    });

    for (const restrictedPath of [
      "/profile",
      "/languages/filters/exercises/practice",
      "/languages/filters/exercises/en-es/practice",
    ]) {
      test(`buildRouteMetadata emits noindex for "${restrictedPath}"`, () => {
        const metadata = routeMetadataPolicy.buildRouteMetadata(
          restrictedPath,
          "https://www.fluentstellar.com",
        );
        assert.match(metadata.robots ?? "", /noindex/i);
      });
    }
  }

  console.log("\n[3] canonical-host and legacy-URL redirect contract (Cloudflare)");
  {
    const wranglerProduction = readFile("workers/word-ssr/wrangler.production.toml");
    const workerSource = readFile("workers/word-ssr/src/index.full.ts");
    const deploymentDoc = readFile("docs/deployment.md");

    test("production Worker config pins the canonical www origin", () => {
      assert.match(wranglerProduction, /SITE_ORIGIN\s*=\s*"https:\/\/www\.fluentstellar\.com"/);
      assert.match(wranglerProduction, /CANONICAL_HOST\s*=\s*"www\.fluentstellar\.com"/);
    });

    test("apex→www + HTTP→HTTPS 301 stays documented as live zone-level behavior", () => {
      // The redirect itself is a Cloudflare zone rule (dashboard-managed,
      // verified live 2026-07-14) and cannot be asserted from the repo;
      // docs/deployment.md is the frozen record of that contract. If the
      // dashboard rule is ever changed, re-probe and update the doc — this
      // test exists so the doc cannot silently drift or be deleted.
      assert.match(deploymentDoc, /apex-to-www and HTTP-to-HTTPS redirects/i);
      assert.match(deploymentDoc, /\b301\b/);
    });

    test("Worker redirects legacy word URL formats with a permanent 308", () => {
      // Runtime behavior (308 + Location) is exercised end-to-end by
      // scripts/test-word-ssr-http.mjs; this freezes the Worker source paths.
      assert.match(workerSource, /legacy-single-hyphen/);
      assert.match(workerSource, /legacy-slug-format/);
      assert.match(workerSource, /status:\s*308/);
    });
  }

  console.log("\n[4] sitemap-core.xml must not submit noindex-classified app routes");
  {
    // Regression guard for the 2026-07-18 finding: scripts/generate-sitemap.mjs's
    // CORE_ROUTES previously included /languages, /languages/filters,
    // /languages/filters/exercises, /languages/level-test, and /explore even
    // though routeMetadataPolicy.ts classifies all of them "public-app" and
    // always emits `robots: noindex, follow`. This reads the actual generated
    // artifact and cross-checks every entry against the real policy module
    // (compiled here, not hand-duplicated), so it fails on this exact class
    // of drift in either direction — a new noindex route added to the
    // sitemap, or an indexable route silently reclassified while still
    // submitted — without hard-coding today's route list into the assertion.
    //
    // Scope note: routeMetadataPolicy.ts only governs the general app-shell
    // routes (homepage/public-seo/public-app/private-account/practice-session
    // — see its RouteMetadataClass union). SEO hub landing pages such as
    // /en/seo-pages are deliberately excluded from it (src/app/App.tsx's
    // routeMetadata switch returns null for resolvedPage "seoHub" and
    // siblings, and those pages get their metadata from src/seo/hubPages/hubMetadata.ts
    // instead). classifyRouteMetadata() falls back to "invalid" for anything
    // it doesn't recognize, which would misreport those hub routes as
    // noindex — so this check only applies to routes the policy explicitly
    // classifies into one of its own noindex classes, not to "invalid".
    const NOINDEX_CLASSES = new Set(["public-app", "private-account", "practice-session"]);
    const coreXml = readFile("public/sitemaps/sitemap-core.xml");
    const corePathnames = Array.from(coreXml.matchAll(/<loc>([^<]+)<\/loc>/g)).map(
      ([, loc]) => new URL(loc).pathname,
    );

    test("sitemap-core.xml is non-empty", () => assert.ok(corePathnames.length > 0));

    test("no sitemap-core.xml entry is classified into one of routeMetadataPolicy's noindex classes", () => {
      const offenders = corePathnames
        .map((pathname) => ({
          pathname,
          routeClass: routeMetadataPolicy.classifyRouteMetadata(pathname),
        }))
        .filter(({ routeClass }) => NOINDEX_CLASSES.has(routeClass));
      assert.deepEqual(
        offenders,
        [],
        `sitemap-core.xml submits route(s) routeMetadataPolicy.ts marks noindex: ${offenders
          .map(({ pathname, routeClass }) => `${pathname} (${routeClass})`)
          .join(", ")}`,
      );
    });
  }

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────────\n`);

  cleanup();

  if (failed > 0) {
    process.exitCode = 1;
  } else {
    console.log("seo core-route tests passed");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
