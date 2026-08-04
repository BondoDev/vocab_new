// Architecture guard for corrective migration 1 (see supabase/README.md and
// supabase/migrations/20260805100000_restrict_learning_writes_and_add_favorite_rpc.sql):
// after that migration, `authenticated` only has direct SELECT access to
// public.user_word_progress and public.user_daily_stats — every protected
// write goes through a SECURITY DEFINER RPC. This guard sweeps the whole
// frontend source tree and fails if any direct REST PATCH/POST/PUT/DELETE
// against either table's row-level endpoint (as opposed to its
// /rest/v1/rpc/* function endpoint) still exists anywhere.
//
// Direct reads (GET) remain allowed and expected — this guard only forbids
// direct *writes*.
//
// Run: node scripts/tests/architecture/test-protected-learning-writes-boundary.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const SRC_DIR = path.join(ROOT_DIR, "src");

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

function walkFiles(dir, extensions, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(abs, extensions, out);
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(abs);
    }
  }
  return out;
}

const PROTECTED_TABLES = ["user_word_progress", "user_daily_stats"];
// A direct row-level REST call against one of the two tables, e.g.
// `/rest/v1/user_word_progress?id=eq...` — deliberately excludes
// `/rest/v1/rpc/...` (RPC calls are the sanctioned write path).
const DIRECT_TABLE_PATH_RE = new RegExp(
  `/rest/v1/(?:${PROTECTED_TABLES.join("|")})\\b(?!/rpc)`,
  "g",
);
const MUTATING_METHODS = ["PATCH", "POST", "PUT", "DELETE"];

const sourceFiles = walkFiles(SRC_DIR, [".ts", ".tsx"]);

console.log("\n=== protected learning table write-boundary guards ===\n");

test("1. Only src/lib/newWordProgress.ts references the direct user_word_progress / user_daily_stats REST endpoints at all", () => {
  const offenders = [];
  for (const file of sourceFiles) {
    const relPath = path.relative(ROOT_DIR, file).replace(/\\/g, "/");
    if (relPath === "src/lib/newWordProgress.ts") continue;
    const content = fs.readFileSync(file, "utf8");
    if (DIRECT_TABLE_PATH_RE.test(content)) {
      offenders.push(relPath);
    }
    DIRECT_TABLE_PATH_RE.lastIndex = 0;
  }
  assert.deepEqual(
    offenders,
    [],
    `unexpected direct user_word_progress/user_daily_stats REST reference(s) outside newWordProgress.ts: ${offenders.join(", ")}`,
  );
});

const newWordProgressSource = fs.readFileSync(path.join(SRC_DIR, "lib", "newWordProgress.ts"), "utf8");

test("2. Every direct-table REST call in newWordProgress.ts is issued through the GET-only helper (supabaseProgressRequest), never the mutation helper", () => {
  // supabaseProgressMutationRequest is the only helper in this module capable
  // of sending PATCH/POST — assert it is never called with a direct table
  // path, only with /rest/v1/rpc/* paths.
  const mutationCalls = [
    ...newWordProgressSource.matchAll(/supabaseProgressMutationRequest<[^>]*>\(\s*session,\s*(`[^`]*`|"[^"]*")/g),
  ];
  assert.ok(mutationCalls.length > 0, "expected at least one supabaseProgressMutationRequest call site");

  const offenders = mutationCalls
    .map((match) => match[1])
    .filter((pathArg) => !pathArg.includes("/rest/v1/rpc/"));

  assert.deepEqual(
    offenders,
    [],
    `supabaseProgressMutationRequest must only ever target an RPC path, found: ${offenders.join(", ")}`,
  );
});

test("3. No mutating HTTP method (PATCH/POST/PUT/DELETE) appears within 5 lines of a direct table REST path anywhere in src/", () => {
  const offenders = [];
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!DIRECT_TABLE_PATH_RE.test(line)) {
        DIRECT_TABLE_PATH_RE.lastIndex = 0;
        return;
      }
      DIRECT_TABLE_PATH_RE.lastIndex = 0;
      const windowStart = Math.max(0, index - 2);
      const windowEnd = Math.min(lines.length, index + 3);
      const window = lines.slice(windowStart, windowEnd).join("\n");
      for (const method of MUTATING_METHODS) {
        if (new RegExp(`["']${method}["']`).test(window)) {
          offenders.push(`${path.relative(ROOT_DIR, file).replace(/\\/g, "/")}:${index + 1} (${method})`);
        }
      }
    });
  }
  assert.deepEqual(offenders, [], `mutating method found near a direct table path: ${offenders.join(", ")}`);
});

test("4. The favorite-toggle RPC path (/rest/v1/rpc/set_word_progress_favorite) is referenced exactly once, in updateWordProgressFavorite", () => {
  const occurrences = [...newWordProgressSource.matchAll(/\/rest\/v1\/rpc\/set_word_progress_favorite/g)];
  assert.equal(occurrences.length, 1, "set_word_progress_favorite RPC path must appear exactly once");

  const fnMatch = newWordProgressSource.match(/export async function updateWordProgressFavorite\(([\s\S]*?)\n\}/);
  assert.ok(fnMatch, "updateWordProgressFavorite must exist");
  assert.match(fnMatch[1], /\/rest\/v1\/rpc\/set_word_progress_favorite/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("protected-learning-writes-boundary guard passed");
}
