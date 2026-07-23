// Production Worker bundle-safety test. Fails the build/CI signal if the
// full-corpus Worker's compiled output (workers/word-ssr/
// worker-dist-full/) ever regresses back toward the bundle bloat this task
// fixed — see the project's bundle-size migration report for the full
// root-cause writeup (WordSeoPage.tsx's full-vocabulary fallback loader and
// browse-search-shard loader pulling multi-megabyte vocabulary-*.js chunks
// into the Worker upload, plus Vite's default publicDir behavior copying
// public/ into the SSR build output).
//
// Run after: node build/build-worker-full.mjs (or at least the plain
// `vite build --config build/vite.worker.config.mjs --ssr src/index.full.ts
// --outDir worker-dist-full` step within it).
//
// Run: node workers/word-ssr/tests/test-worker-bundle-size.mjs
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(workerDir, "..", "..");
const DIST_DIR = path.join(workerDir, "worker-dist-full");

// Preferred target from the migration task; the hard Cloudflare Workers
// Free-plan ceiling is 3 MB gzip — this threshold intentionally leaves
// headroom under that ceiling rather than testing right up against it.
const MAX_TOTAL_GZIP_BYTES = 2.5 * 1024 * 1024;

// A single large vocabulary chunk was ~500-660KB gzip before the fix; 50KB
// is generously above anything a legitimate small server-side data file
// should need, while still catching a reintroduced multi-hundred-KB chunk.
const MAX_SINGLE_VOCAB_LIKE_CHUNK_GZIP_BYTES = 50 * 1024;

// The SSR build should produce exactly one JS entry file and nothing else —
// no code-split chunks, no copied public/ assets. Any additional file is
// either a reintroduced import-graph leak (e.g. a lazy vocabulary/browse-
// search chunk) or a publicDir regression.
const EXPECTED_FILES = ["index.full.js"];

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

function walk(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(abs));
    } else {
      results.push(abs);
    }
  }
  return results;
}

function gzipSize(absPath) {
  return zlib.gzipSync(fs.readFileSync(absPath), { level: 9 }).length;
}

if (!fs.existsSync(DIST_DIR)) {
  console.log(`\nSKIPPED: ${path.relative(process.cwd(), DIST_DIR)} not found.`);
  console.log("Run `node build/build-worker-full.mjs` (or its vite --ssr build step) first.\n");
  process.exit(0);
}

const files = walk(DIST_DIR).map((abs) => path.relative(DIST_DIR, abs).replace(/\\/g, "/"));
const gzipSizes = Object.fromEntries(files.map((relPath) => [relPath, gzipSize(path.join(DIST_DIR, relPath))]));
const totalGzipBytes = Object.values(gzipSizes).reduce((sum, n) => sum + n, 0);

console.log(`\n=== Worker bundle composition (${path.relative(process.cwd(), DIST_DIR)}) ===\n`);
for (const relPath of files) {
  console.log(`  ${relPath}: ${(gzipSizes[relPath] / 1024).toFixed(1)}KB gzip`);
}
console.log(`  TOTAL: ${(totalGzipBytes / 1024 / 1024).toFixed(2)}MB gzip (${files.length} file(s))\n`);

test("no vocabulary-*.js modules present at all", () => {
  const vocabFiles = files.filter((f) => /(^|\/)vocabulary-[^/]+\.js$/i.test(f));
  if (vocabFiles.length > 0) {
    throw new Error(`Found ${vocabFiles.length} vocabulary-*.js module(s): ${vocabFiles.join(", ")}`);
  }
});

test("no non-entry chunk file exceeds the single-vocab-like-chunk gzip threshold", () => {
  // The entry file itself (the whole app's SSR-relevant code) is expected
  // to be larger than this threshold — it's checked against the total
  // budget separately below. This check exists to catch any ADDITIONAL
  // chunk (a reintroduced lazy vocabulary/browse-search/route chunk)
  // sneaking back in alongside the entry.
  const oversized = files.filter(
    (f) => !EXPECTED_FILES.includes(f) && gzipSizes[f] > MAX_SINGLE_VOCAB_LIKE_CHUNK_GZIP_BYTES,
  );
  if (oversized.length > 0) {
    throw new Error(
      `${oversized.length} file(s) exceed ${(MAX_SINGLE_VOCAB_LIKE_CHUNK_GZIP_BYTES / 1024).toFixed(0)}KB gzip: ` +
        oversized.map((f) => `${f} (${(gzipSizes[f] / 1024).toFixed(1)}KB)`).join(", "),
    );
  }
});

test("no unexpected route/data chunk files (only the entry file is present)", () => {
  const unexpected = files.filter((f) => !EXPECTED_FILES.includes(f));
  if (unexpected.length > 0) {
    throw new Error(`Unexpected file(s) in Worker output: ${unexpected.join(", ")}`);
  }
});

test("the expected entry file is present", () => {
  for (const expected of EXPECTED_FILES) {
    if (!files.includes(expected)) {
      throw new Error(`Missing expected file: ${expected}`);
    }
  }
});

test(`total gzip upload size is under ${(MAX_TOTAL_GZIP_BYTES / 1024 / 1024).toFixed(1)}MB`, () => {
  if (totalGzipBytes > MAX_TOTAL_GZIP_BYTES) {
    throw new Error(
      `Total gzip size ${(totalGzipBytes / 1024 / 1024).toFixed(2)}MB exceeds the ${(MAX_TOTAL_GZIP_BYTES / 1024 / 1024).toFixed(1)}MB threshold`,
    );
  }
});

test("total gzip upload size is under the Cloudflare Workers Free-plan 3MB hard limit", () => {
  const FREE_PLAN_LIMIT_BYTES = 3 * 1024 * 1024;
  if (totalGzipBytes > FREE_PLAN_LIMIT_BYTES) {
    throw new Error(`Total gzip size ${(totalGzipBytes / 1024 / 1024).toFixed(2)}MB exceeds the Free-plan 3MB limit`);
  }
});

// Belt-and-suspenders source-level check: confirm render-entry.tsx (the
// Worker's SSR entry) does not itself reintroduce a direct import of
// WordSeoPage.tsx (the client wrapper that owns the heavy loaders) or an
// import.meta.glob targeting the full vocabulary dataset.
test("render-entry.tsx does not import the client WordSeoPage wrapper", () => {
  const source = fs.readFileSync(path.join(workerDir, "src", "render-entry.tsx"), "utf8");
  if (/from\s+["'].*\/WordSeoPage["']/.test(source)) {
    throw new Error("render-entry.tsx imports WordSeoPage.tsx directly — this reintroduces the heavy client loaders");
  }
  if (/import\.meta\.glob\(\s*["'][^"']*vocabulary\/\*/.test(source)) {
    throw new Error("render-entry.tsx contains a direct full-vocabulary import.meta.glob");
  }
});

test("WordSeoPageView.tsx contains no vocabulary or browse-search-shard glob imports", () => {
  const viewPath = path.join(repoRoot, "src", "app", "pages", "word-pages", "detail", "WordSeoPageView.tsx");
  const source = fs.readFileSync(viewPath, "utf8");
  if (/import\.meta\.glob\s*\(/.test(source)) {
    throw new Error("WordSeoPageView.tsx contains an import.meta.glob(...) call — it must stay import-light for the SSR bundle");
  }
  if (/getWordBrowseSearchData\b/.test(source)) {
    throw new Error("WordSeoPageView.tsx imports/uses getWordBrowseSearchData — that loader must stay client-only (in WordSeoPage.tsx)");
  }
});

test("compiled Worker bundle contains no staging hostname literal", () => {
  const bundle = fs.readFileSync(path.join(DIST_DIR, "index.full.js"), "utf8");
  if (bundle.includes("fluentstellar-word-staging.bondoasanidze95.workers.dev")) {
    throw new Error("Compiled Worker bundle still contains the staging hostname literal");
  }
});

test("generate-full-corpus.mjs mints a neutral full- DATA_VERSION, not staging-full-", () => {
  const source = fs.readFileSync(path.join(workerDir, "generation", "generate-full-corpus.mjs"), "utf8");
  if (!/const DATA_VERSION = `full-/.test(source)) {
    throw new Error("generate-full-corpus.mjs no longer mints a `full-`-prefixed DATA_VERSION");
  }
  if (/const DATA_VERSION = `staging-full-/.test(source)) {
    throw new Error("generate-full-corpus.mjs still mints a staging-full- DATA_VERSION");
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("Worker bundle size architecture test passed");
}
