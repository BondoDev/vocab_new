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
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const tempDir = path.join(rootDir, ".tmp-seo-core-routes-test");
const require = createRequire(import.meta.url);

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

function compileRouteMetadataPolicy() {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const program = ts.createProgram({
    rootNames: [path.join(rootDir, "src", "seo", "routeMetadataPolicy.ts")],
    options: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
      rootDir,
      outDir: tempDir,
      noEmit: false,
    },
  });

  const emitResult = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (f) => f,
      getCurrentDirectory: () => rootDir,
      getNewLine: () => "\n",
    });
    throw new Error(`TypeScript compile failed:\n${formatted}`);
  }

  fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ type: "commonjs" }));
  return require(path.join(tempDir, "src", "seo", "routeMetadataPolicy.js"));
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

  console.log("\n[2] routeMetadataPolicy.ts keeps restricted routes non-indexable");
  {
    const routeMetadataPolicy = compileRouteMetadataPolicy();

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

  console.log(`\n─────────────────────────────────────────`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`─────────────────────────────────────────\n`);

  fs.rmSync(tempDir, { recursive: true, force: true });

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
