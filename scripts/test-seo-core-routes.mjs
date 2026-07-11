/**
 * robots.txt + platform-level redirect/header configuration regression tests.
 *
 * NEW coverage: no existing script asserts on public/robots.txt content, and
 * nothing cross-checks that vercel.json's noindex/no-store header routes stay
 * in sync with src/seo/routeMetadataPolicy.ts's own classification of which
 * routes are "practice-session" / "private-account" (public-app / noindex).
 * A future edit to either file alone, without the other, would silently
 * desync the platform-level header contract from the in-app metadata policy.
 *
 * Also freezes the current host/legacy-URL redirect rules declared in
 * vercel.json (host normalization + the accented 5-digit legacy word-ID
 * redirect), since Vercel's routing layer runs before any of our own code and
 * isn't otherwise exercised by scripts/test-word-ssr-http.mjs's in-process
 * server.
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

  console.log("\n[2] vercel.json noindex/no-store header routes stay in sync with routeMetadataPolicy.ts");
  {
    const vercelConfig = JSON.parse(readFile("vercel.json"));
    const routeMetadataPolicy = compileRouteMetadataPolicy();

    const noindexHeaderRules = (vercelConfig.headers ?? []).filter((rule) =>
      (rule.headers ?? []).some((h) => h.key === "X-Robots-Tag" && /noindex/i.test(h.value)),
    );

    test("vercel.json has at least one noindex header rule", () => assert.ok(noindexHeaderRules.length > 0));

    for (const rule of noindexHeaderRules) {
      // vercel.json path patterns use :param placeholders; translate the ones
      // we know about into a concrete sample path routeMetadataPolicy.ts can
      // classify, so the two configs can be compared on the same input.
      const samplePath = rule.source
        .replace(":source([a-z]{2})", "en")
        .replace(":target([a-z]{2})", "es");

      test(`vercel.json noindex rule "${rule.source}" matches a route routeMetadataPolicy.ts also treats as non-indexable`, () => {
        const routeClass = routeMetadataPolicy.classifyRouteMetadata(samplePath);
        assert.ok(
          routeClass === "private-account" || routeClass === "practice-session",
          `routeMetadataPolicy.ts classifies "${samplePath}" as "${routeClass}", not private-account/practice-session`,
        );
      });
    }

    test("routeMetadataPolicy.ts's practice-session path is covered by a vercel.json noindex rule", () => {
      assert.ok(
        routeMetadataPolicy.isPracticeSessionPath("/languages/filters/exercises/practice"),
        "sanity check: routeMetadataPolicy.ts no longer classifies the base practice route as a practice session",
      );
      const covered = noindexHeaderRules.some(
        (rule) => rule.source === "/languages/filters/exercises/practice",
      );
      assert.ok(covered, "vercel.json is missing a noindex rule for /languages/filters/exercises/practice");
    });
  }

  console.log("\n[3] vercel.json host-normalization redirects");
  {
    const vercelConfig = JSON.parse(readFile("vercel.json"));
    const redirects = vercelConfig.redirects ?? [];

    test("apex-domain (non-www) redirect exists and is permanent", () => {
      const rule = redirects.find((r) => r.has?.some((h) => h.value === "fluentstellar.com"));
      assert.ok(rule, "no redirect rule for host fluentstellar.com");
      assert.equal(rule.permanent, true);
      assert.equal(rule.destination, "https://www.fluentstellar.com/:path*");
    });

    test("vercel.app preview-domain redirect exists and is permanent", () => {
      const rule = redirects.find((r) => r.has?.some((h) => h.value === "fluentstellar.vercel.app"));
      assert.ok(rule, "no redirect rule for host fluentstellar.vercel.app");
      assert.equal(rule.permanent, true);
      assert.equal(rule.destination, "https://www.fluentstellar.com/:path*");
    });

    test("legacy 5-digit accented-ID word URL redirect exists and is permanent", () => {
      const rule = redirects.find(
        (r) => /\(A1\|A2\|B1\|B2\|C1\|C2\)/.test(r.source ?? "") && /\[0-9\]\{5\}/.test(r.source ?? ""),
      );
      assert.ok(rule, "no redirect rule for the legacy 5-digit concept-ID word URL format");
      assert.equal(rule.permanent, true);
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
