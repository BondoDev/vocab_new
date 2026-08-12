// Contract guard for the reset_learning_language_progress activation
// migration (Settings backend follow-up —
// supabase/migrations/20260812130000_activate_learning_progress_reset_rpc.sql).
//
// Deliberately narrow: this migration is supposed to do exactly one thing.
// Everything about the function's OWN definition (identity, validation,
// deletion scope/order) is already guarded by
// test-learning-progress-reset-migration-contract.mjs against the original,
// untouched migration file — this file only guards the activation step
// itself.
//
// Run: node scripts/tests/learning/test-activate-learning-progress-reset-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const ACTIVATION_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260812130000_activate_learning_progress_reset_rpc.sql",
);
const ORIGINAL_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260808120000_add_learning_language_progress_reset_rpc.sql",
);

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

function stripLineComments(source) {
  return source
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .trim();
}

assert.ok(fs.existsSync(ACTIVATION_MIGRATION_PATH), "the activation migration file is missing");
const source = fs.readFileSync(ACTIVATION_MIGRATION_PATH, "utf8");
const codeOnly = stripLineComments(source);
const originalSource = fs.readFileSync(ORIGINAL_MIGRATION_PATH, "utf8");

console.log("\n=== reset-progress activation: the grant itself ===\n");

test("1. Grants EXECUTE on reset_learning_language_progress(text) to authenticated, using the exact Postgres signature", () => {
  assert.match(source, /grant execute on function public\.reset_learning_language_progress\(text\) to authenticated;/i);
});

test("2. This is the ONLY executable statement in the migration — one line of SQL, nothing else", () => {
  const statements = codeOnly
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  assert.deepEqual(statements, [
    "grant execute on function public.reset_learning_language_progress(text) to authenticated;",
  ]);
});

console.log("\n=== reset-progress activation: no scope creep ===\n");

test("3. No table grant/revoke of any kind appears in this migration", () => {
  assert.doesNotMatch(codeOnly, /revoke /i);
  assert.doesNotMatch(codeOnly, /grant (insert|select|update|delete|truncate|references|trigger|maintain)/i);
});

test("4. No policy is created or dropped", () => {
  assert.doesNotMatch(codeOnly, /create policy/i);
  assert.doesNotMatch(codeOnly, /drop policy/i);
});

test("5. No function is created, replaced, or altered — the function's own definition is untouched by this migration", () => {
  assert.doesNotMatch(codeOnly, /create or replace function/i);
  assert.doesNotMatch(codeOnly, /alter function/i);
});

test("6. No other function's EXECUTE grant is touched (only reset_learning_language_progress appears)", () => {
  const grantedFunctions = [
    ...codeOnly.matchAll(/grant execute on function public\.(\w+)\(/gi),
  ].map((m) => m[1]);
  assert.deepEqual([...new Set(grantedFunctions)], ["reset_learning_language_progress"]);
});

test("7. No table is created, altered, or dropped", () => {
  assert.doesNotMatch(codeOnly, /create table|alter table|drop table/i);
});

console.log("\n=== reset-progress activation: original migration is untouched ===\n");

test("8. The original migration file still defines reset_learning_language_progress and still revokes EXECUTE from public/anon/authenticated (this migration does not edit it)", () => {
  assert.match(originalSource, /create or replace function public\.reset_learning_language_progress\(/i);
  assert.match(originalSource, /revoke execute on function public\.reset_learning_language_progress\(text\) from public;/i);
  assert.match(originalSource, /revoke execute on function public\.reset_learning_language_progress\(text\) from anon;/i);
  assert.match(originalSource, /revoke execute on function public\.reset_learning_language_progress\(text\) from authenticated;/i);
});

test("9. The original migration still grants EXECUTE only to postgres/service_role in its own text (this activation migration is what changes reachability, additively, in a later-applied file)", () => {
  const grantLines = [
    ...originalSource.matchAll(/^\s*grant execute on function public\.reset_learning_language_progress\(text\) to (\w+);/gim),
  ].map((m) => m[1]);
  assert.deepEqual(grantLines.sort(), ["postgres", "service_role"].sort());
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("activate-learning-progress-reset-migration-contract tests failed");
  process.exit(1);
}

console.log("activate-learning-progress-reset-migration-contract tests passed");
