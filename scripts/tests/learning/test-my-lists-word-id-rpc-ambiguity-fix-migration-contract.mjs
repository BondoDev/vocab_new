// Static contract guard for
// supabase/migrations/20260811180000_fix_my_lists_word_id_rpc_ambiguity.sql
// — fixes the live 42702 "column reference word_id is ambiguous" error in
// add_words_to_vocabulary_list. Deliberately a source-text guard, not a
// live-database test — matching every other migration-contract test in
// this repo (the migration is never applied to Supabase as part of this
// test suite).
//
// Run: node scripts/tests/learning/test-my-lists-word-id-rpc-ambiguity-fix-migration-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

const CORRECTIVE_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260811170000_my_lists_corrective_word_id_membership.sql",
);
const FIX_MIGRATION_PATH = path.join(
  ROOT_DIR,
  "supabase",
  "migrations",
  "20260811180000_fix_my_lists_word_id_rpc_ambiguity.sql",
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

function stripSqlLineComments(source) {
  return source
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

test("0. Both migrations exist, and the fix sorts after the corrective migration it fixes", () => {
  assert.ok(fs.existsSync(CORRECTIVE_MIGRATION_PATH), "the corrective migration must still exist");
  assert.ok(fs.existsSync(FIX_MIGRATION_PATH), "the ambiguity-fix migration must exist");
  assert.ok(path.basename(FIX_MIGRATION_PATH) > path.basename(CORRECTIVE_MIGRATION_PATH));
});

console.log("\n=== 6. The corrective migration this fixes stays byte-for-byte untouched ===\n");

test("6. 20260811170000...sql still contains its ORIGINAL (bare column-list) ON CONFLICT clause — proof it was not edited to apply this fix", () => {
  const correctiveSource = fs.readFileSync(CORRECTIVE_MIGRATION_PATH, "utf8");
  assert.match(correctiveSource, /on conflict \(list_id, word_id\) do nothing;/);
  assert.doesNotMatch(correctiveSource, /on conflict on constraint user_vocabulary_list_words_list_word_id_key/);
});

// This migration is checked in with CRLF line endings. Normalize once at
// the read site so stripSqlLineComments' per-line `--.*$` (whose `$`
// without the `m` flag only matches true end-of-string, not "immediately
// before a lone trailing \r") actually strips every comment line, and so
// every `\n`-anchored regex/indexOf below can assume LF without needing
// "\r?\n" sprinkled through each pattern. Normalizing only changes
// line-ending bytes, never the SQL text itself, so it can't change what
// these assertions prove.
const fixSource = fs.readFileSync(FIX_MIGRATION_PATH, "utf8").replace(/\r\n/g, "\n");
const sqlOnly = stripSqlLineComments(fixSource);

console.log("\n=== 5. No table/schema/RLS/grant changes — CREATE OR REPLACE FUNCTION only ===\n");

test("5. This migration contains no ALTER/CREATE TABLE, index, policy, or grant/revoke statement — a single CREATE OR REPLACE FUNCTION only", () => {
  assert.doesNotMatch(sqlOnly, /alter table|create table|drop table|create index|drop index|create policy|drop policy|^\s*grant\s|^\s*revoke\s/im);
  const createFunctionMatches = [...sqlOnly.matchAll(/create or replace function/gi)];
  assert.equal(createFunctionMatches.length, 1, "exactly one CREATE OR REPLACE FUNCTION statement");
});

console.log("\n=== 4. Signature unchanged ===\n");

test("4. add_words_to_vocabulary_list keeps its exact existing signature (uuid, text[]) and RETURNS TABLE shape", () => {
  assert.match(fixSource, /create or replace function public\.add_words_to_vocabulary_list\(\s*\n\s*p_list_id uuid,\s*\n\s*p_word_ids text\[\]\s*\n\)/);
  assert.match(fixSource, /returns table \(\s*\n\s*word_id text,\s*\n\s*already_added boolean\s*\n\)/);
});

console.log("\n=== 1/2. No ambiguous bare word_id references; every table/CTE reference alias-qualified ===\n");

const addRpcMatch = fixSource.match(/create or replace function public\.add_words_to_vocabulary_list\(([\s\S]*?)\$function\$;/);

test("Exists, SECURITY DEFINER, empty search_path, no p_user_id (unchanged shape)", () => {
  assert.ok(addRpcMatch, "add_words_to_vocabulary_list must exist");
  assert.match(addRpcMatch[0], /security definer/i);
  assert.match(addRpcMatch[0], /set search_path to ''/i);
  assert.doesNotMatch(addRpcMatch[0], /p_user_id/);
});

test("1. Every bare 'word_id' token in the function body is either the RETURNS TABLE declaration, table-alias-qualified (uvlw.word_id), or the unavoidable INSERT target column list — never a genuinely ambiguous bare reference", () => {
  const bodyWithoutComments = stripSqlLineComments(addRpcMatch[0]);
  // Every line containing the bare token "word_id" (not preceded by a
  // qualifying alias/prefix like uvlw./p_/v_/requested_/already_) must be
  // one of the two known-safe shapes.
  const lines = bodyWithoutComments.split("\n");
  const bareWordIdLines = lines.filter((line) => {
    // Strip every qualified/prefixed occurrence first, then check if a
    // bare "word_id" token remains.
    const withoutQualified = line
      .replace(/uvlw\.word_id/g, "")
      .replace(/p_word_ids/g, "")
      .replace(/v_already_added_ids/g, "")
      .replace(/already_added/g, "")
      .replace(/requested_word_id/g, "");
    return /\bword_id\b/.test(withoutQualified);
  });
  const allowedShapes = [
    /returns table \($/, // the declaration line itself (word_id text, on the next line — matched separately below)
    /^\s*word_id text,\s*$/, // RETURNS TABLE column declaration
    /insert into public\.user_vocabulary_list_words as uvlw \(list_id, word_id\)/, // INSERT target column list — not a ColumnRef context, see this file's own header
  ];
  const unexplained = bareWordIdLines.filter((line) => !allowedShapes.some((pattern) => pattern.test(line.trim()) || pattern.test(line)));
  assert.deepEqual(unexplained, [], `unexplained bare word_id reference(s): ${JSON.stringify(unexplained)}`);
});

test("2. Every table reference is alias-qualified: uvl for lists, uvlw for memberships, candidate for the requested-id relation", () => {
  assert.match(addRpcMatch[0], /from public\.user_vocabulary_lists as uvl/);
  assert.match(addRpcMatch[0], /from public\.user_vocabulary_list_words as uvlw/);
  assert.match(addRpcMatch[0], /insert into public\.user_vocabulary_list_words as uvlw/);
  // Every unnest(...) of the requested ids is aliased candidate(requested_word_id),
  // never a bare "requested_id" (the pre-fix alias name).
  const unnestMatches = [...addRpcMatch[0].matchAll(/unnest\([^)]*\) as (\w+)(\([^)]*\))?/g)];
  assert.ok(unnestMatches.length > 0, "at least one unnest(...) as ... must exist");
  for (const match of unnestMatches) {
    assert.equal(match[1], "candidate", `unnest(...) must always be aliased "candidate", found "${match[1]}"`);
  }
  assert.doesNotMatch(addRpcMatch[0], /\brequested_id\b/, "the pre-fix bare alias 'requested_id' must not remain anywhere");
});

console.log("\n=== ON CONFLICT targets the constraint by name, not a bare column list ===\n");

test("The arbiter is ON CONFLICT ON CONSTRAINT — no column-name token remains in that clause", () => {
  assert.match(addRpcMatch[0], /on conflict on constraint user_vocabulary_list_words_list_word_id_key do nothing;/);
  assert.doesNotMatch(addRpcMatch[0], /on conflict \(list_id, word_id\)/);
});

console.log("\n=== Behavioral guarantees preserved ===\n");

test("List ownership is verified before any word validation (42501 if not found/not owned)", () => {
  const ownershipIndex = addRpcMatch[0].indexOf("if not exists (");
  const blankCheckIndex = addRpcMatch[0].indexOf("must not contain null or blank entries");
  assert.ok(ownershipIndex > -1 && blankCheckIndex > -1 && ownershipIndex < blankCheckIndex);
});

test("Null/blank/oversized word ids are rejected before the INSERT — no partial writes", () => {
  const blankCheckIndex = addRpcMatch[0].indexOf("must not contain null or blank entries");
  const oversizedCheckIndex = addRpcMatch[0].indexOf("exceed the maximum allowed length");
  const insertIndex = addRpcMatch[0].indexOf("insert into public.user_vocabulary_list_words");
  assert.ok(blankCheckIndex > -1 && oversizedCheckIndex > -1 && insertIndex > -1);
  assert.ok(blankCheckIndex < insertIndex && oversizedCheckIndex < insertIndex);
});

test("Already-added ids are captured before the INSERT runs, and already_added is reported per requested id", () => {
  const capturedIndex = addRpcMatch[0].indexOf("into v_already_added_ids");
  const insertIndex = addRpcMatch[0].indexOf("insert into public.user_vocabulary_list_words");
  assert.ok(capturedIndex > -1 && capturedIndex < insertIndex);
  assert.match(addRpcMatch[0], /coalesce\(candidate\.requested_word_id = any\(v_already_added_ids\), false\)/);
});

test("Never touches user_word_progress or user_daily_stats; only INSERTs into user_vocabulary_list_words", () => {
  const bodyWithoutComments = stripSqlLineComments(addRpcMatch[0]);
  assert.doesNotMatch(bodyWithoutComments, /user_word_progress|user_daily_stats/i);
  const insertTargets = [...bodyWithoutComments.matchAll(/insert into public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(insertTargets, ["user_vocabulary_list_words"]);
});

console.log("\n=== 3. remove_word_from_vocabulary_list audited: untouched, already safe ===\n");

test("3. This migration does not redefine remove_word_from_vocabulary_list at all (audited and found already safe — see this file's own header)", () => {
  assert.doesNotMatch(fixSource, /create or replace function public\.remove_word_from_vocabulary_list/);
});

test("remove_word_from_vocabulary_list (as it stands in the corrective migration) declares returns void — no RETURNS TABLE output variables, so it cannot suffer this bug class", () => {
  const correctiveSource = fs.readFileSync(CORRECTIVE_MIGRATION_PATH, "utf8");
  const removeRpcMatch = correctiveSource.match(/create or replace function public\.remove_word_from_vocabulary_list\(([\s\S]*?)\$function\$;/);
  assert.ok(removeRpcMatch, "remove_word_from_vocabulary_list must still exist in the corrective migration");
  assert.match(removeRpcMatch[0], /returns void/);
  assert.doesNotMatch(removeRpcMatch[0], /returns table/i);
  // Every reference to list_id/word_id inside it is already alias-qualified.
  assert.match(removeRpcMatch[0], /uvlw\.list_id = p_list_id\s*\n\s*and uvlw\.word_id = btrim\(p_word_id\);/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("my-lists-word-id-rpc-ambiguity-fix-migration-contract guard passed");
}
