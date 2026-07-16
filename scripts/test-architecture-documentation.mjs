// Deterministic guard proving docs/architecture.md stays wired to the real
// repository: the paths, docs, and package scripts it references actually
// exist, README/CLAUDE.md point to it, and a couple of specific stale
// claims (GitHub Pages deployment, guard-count drift) can't silently creep
// back in. See docs/architecture.md (2026-07-16 documentation audit).
//
// Read-only. No network. No browser. Node standard library only.
// Run: node scripts/test-architecture-documentation.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), "..");
const DOCS_DIR = path.join(ROOT_DIR, "docs");
const ARCHITECTURE_DOC = path.join(DOCS_DIR, "architecture.md");

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

console.log("\n=== architecture documentation ===\n");

test("docs/architecture.md exists and is non-empty", () => {
  assert.ok(fs.existsSync(ARCHITECTURE_DOC), "docs/architecture.md is missing");
  const content = fs.readFileSync(ARCHITECTURE_DOC, "utf8");
  assert.ok(content.trim().length > 500, "docs/architecture.md looks empty or too short");
});

const architectureContent = fs.existsSync(ARCHITECTURE_DOC)
  ? fs.readFileSync(ARCHITECTURE_DOC, "utf8")
  : "";

// Key authoritative source/build paths the document depends on staying real.
const KEY_PATHS = [
  "src/app/App.tsx",
  "src/entry-client.tsx",
  "src/entry-server.tsx",
  "src/main.tsx",
  "src/seo/routeMetadataPolicy.ts",
  "src/seo/SeoContext.tsx",
  "src/seo/site.ts",
  "scripts/prerender.mjs",
  "scripts/generate-sitemap.mjs",
  "scripts/generate-word-hub-data.mjs",
  "workers/word-ssr/src/index.full.ts",
  "workers/word-ssr/route-ownership.md",
  "docs/generated-data.md",
  "docs/import-boundaries.md",
  "docs/deployment.md",
  "docs/brand-asset-ownership.md",
  "docs/google-indexing-operations.md",
  "docs/dependency-ownership.md",
  "docs/ui-component-ownership.md",
  "docs/non-seo-regression-checklist.md",
];

// Docs deleted or renamed away during the 2026-07-16 docs/ pruning pass —
// their durable content was folded into docs/architecture.md and the
// specialized docs above (or the guards that used to require them). A
// reference to one of these filenames elsewhere in the tree means either a
// broken link was left behind or the file silently reappeared.
const RETIRED_DOC_NAMES = [
  "agent-tool-folders.md",
  "guidelines-folder-ownership.md",
  "legacy-cloudflare-poc-removal.md",
  "dependency-audit.md",
  "ui-component-audit.md",
];

const EXCLUDED_WALK_DIRS = new Set([
  "node_modules", ".git", "dist", "server-build", "worker-dist",
  "worker-dist-full", "assets-full", "full-corpus", ".wrangler", ".vercel",
]);

function walkTrackedish(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDED_WALK_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".github") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTrackedish(abs, results);
    } else if (/\.(md|mjs|ts|tsx|json)$/.test(entry.name)) {
      results.push(abs);
    }
  }
  return results;
}

test("key authoritative paths referenced in docs/architecture.md exist on disk", () => {
  const missing = KEY_PATHS.filter((rel) => !fs.existsSync(path.join(ROOT_DIR, rel)));
  assert.deepEqual(missing, [], `missing path(s): ${missing.join(", ")}`);
});

test("every markdown link target in docs/architecture.md resolves to a real file", () => {
  const linkPattern = /\]\(([^)]+\.md)\)/g;
  const missing = [];
  for (const match of architectureContent.matchAll(linkPattern)) {
    const target = match[1].split("#")[0];
    if (/^https?:\/\//.test(target)) continue;
    const resolved = path.resolve(DOCS_DIR, target);
    if (!fs.existsSync(resolved)) {
      missing.push(target);
    }
  }
  assert.deepEqual(missing, [], `broken doc link(s): ${missing.join(", ")}`);
});

test("every `npm run <script>` referenced in docs/architecture.md is a real package.json script", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const scripts = new Set(Object.keys(pkg.scripts || {}));
  const runPattern = /npm run (?:-s )?([a-zA-Z0-9:_-]+)/g;
  const missing = new Set();
  for (const match of architectureContent.matchAll(runPattern)) {
    if (!scripts.has(match[1])) {
      missing.add(match[1]);
    }
  }
  assert.deepEqual([...missing], [], `unknown package script(s): ${[...missing].join(", ")}`);
});

test("architecture-guard table row count matches the real test:architecture-guards chain", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8"));
  const chain = pkg.scripts["test:architecture-guards"];
  assert.ok(chain, "package.json is missing the test:architecture-guards script");
  const realGuardCount = chain.split("&&").filter((part) => /npm run -s test:/.test(part)).length;

  const sectionMatch = architectureContent.match(
    /## Architecture guards\n[\s\S]*?\n\n(?=## )/,
  );
  assert.ok(sectionMatch, "docs/architecture.md is missing an '## Architecture guards' section");
  const documentedGuardCount = (sectionMatch[0].match(/^\| `test:/gm) || []).length;

  assert.equal(
    documentedGuardCount,
    realGuardCount,
    `docs/architecture.md documents ${documentedGuardCount} guard(s) but test:architecture-guards chains ${realGuardCount}`,
  );
});

test("README.md links to docs/architecture.md", () => {
  const readme = fs.readFileSync(path.join(ROOT_DIR, "README.md"), "utf8");
  assert.ok(
    readme.includes("docs/architecture.md"),
    "README.md does not reference docs/architecture.md",
  );
});

test("CLAUDE.md links to docs/architecture.md and does not claim a GitHub Pages deployment", () => {
  const claudeMd = fs.readFileSync(path.join(ROOT_DIR, "CLAUDE.md"), "utf8");
  assert.ok(
    claudeMd.includes("docs/architecture.md"),
    "CLAUDE.md does not reference docs/architecture.md",
  );
  assert.ok(
    !/Deployed to GitHub Pages/i.test(claudeMd),
    "CLAUDE.md still claims the site is deployed to GitHub Pages (Cloudflare is authoritative — see docs/deployment.md)",
  );
});

test("docs/architecture.md does not describe removed/legacy systems as active", () => {
  // A bare mention of a removed path is fine if the same line marks it as
  // removed/historical (e.g. the architecture-guards table row for
  // test:legacy-poc-ownership); only flag mentions with no such marker.
  const REMOVED_MARKER = /\b(removed|retired|historical|legacy|old)\b/i;
  const staleClaims = [
    { pattern: /Deployed to GitHub Pages/i, label: "GitHub Pages as an active deployment target" },
    { pattern: /poc\/cloudflare-word-renderer/i, label: "the removed poc/cloudflare-word-renderer path" },
    { pattern: /staging\/cloudflare-word-worker/i, label: "the old staging/cloudflare-word-worker path" },
    { pattern: /root-level `?google-index\.js`?/i, label: "the old root-level google-index.js path" },
    {
      pattern: /public\/favicon\.png[^\n]{0,40}(master|authoritative source)/i,
      label: "public/favicon.png described as the master asset",
    },
  ];
  const lines = architectureContent.split("\n");
  const offenders = staleClaims
    .filter(({ pattern }) =>
      lines.some((line) => pattern.test(line) && !REMOVED_MARKER.test(line)),
    )
    .map(({ label }) => label);
  assert.deepEqual(offenders, [], `stale claim(s) found: ${offenders.join("; ")}`);
});

test("retired documentation files stay deleted and unreferenced", () => {
  const stillPresent = RETIRED_DOC_NAMES.filter((name) =>
    fs.existsSync(path.join(DOCS_DIR, name)),
  );
  assert.deepEqual(stillPresent, [], `retired doc(s) have reappeared: ${stillPresent.join(", ")}`);

  const selfPath = __filename;
  const offenders = [];
  for (const file of walkTrackedish(ROOT_DIR)) {
    if (file === selfPath) continue;
    const content = fs.readFileSync(file, "utf8");
    for (const name of RETIRED_DOC_NAMES) {
      if (content.includes(name)) {
        offenders.push(`${path.relative(ROOT_DIR, file)} references "${name}"`);
      }
    }
  }
  assert.deepEqual(offenders, [], `stale reference(s) to retired doc(s): ${offenders.join("; ")}`);
});

console.log(`\n───────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`───────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("architecture documentation guard passed");
}
