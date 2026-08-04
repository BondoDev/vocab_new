// Architecture guard for corrective migration 2's non-negative CHECK
// constraints (see supabase/README.md and
// supabase/migrations/20260805130000_add_learning_non_negative_constraints_and_revoke_anon_rpc.sql).
//
// The CHECK constraints themselves are defense-in-depth: this guard is the
// other half of that story — confirming the *application* side never
// intentionally produces a negative value for correct_streak,
// new_words_completed, reviews_completed, or study_time_seconds, and that no
// negative number is used anywhere as a sentinel (e.g. "-1 means no data
// yet") for any of these four fields. If either were true, the new CHECK
// constraints would break a legitimate, currently-working code path instead
// of only ever catching a bug.
//
// This is a static source guard, not a live-database test — it never
// connects to Supabase.
//
// Run: node scripts/tests/architecture/test-learning-non-negative-values-contract.mjs
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

const sourceFiles = walkFiles(SRC_DIR, [".ts", ".tsx"]);

// The four camelCase/snake_case identifier spellings these fields go by
// across the frontend (see src/lib/newWordProgress.ts and
// src/data/learning/reviewOutcomeTransition.ts).
const GUARDED_FIELDS = [
  "correct_streak",
  "correctStreak",
  "newStreak",
  "new_words_completed",
  "newWordsCompleted",
  "newWordsCompletedToday",
  "reviews_completed",
  "reviewsCompleted",
  "reviewsCompletedToday",
  "study_time_seconds",
  "studyTimeSeconds",
];

console.log("\n=== learning non-negative values: no negative literal assigned to a guarded field ===\n");

test("1. No source file assigns a negative numeric literal to any correct_streak / daily-counter field", () => {
  // Matches e.g. `correctStreak: -1`, `correct_streak = -3`, `newStreak = -1,`
  // — an identifier from GUARDED_FIELDS, then `:`/`=`, then a negative
  // number. Deliberately not global across the whole line so multi-field
  // object literals are each checked independently.
  const fieldAlternation = GUARDED_FIELDS.join("|");
  const negativeAssignmentRe = new RegExp(`\\b(?:${fieldAlternation})\\b\\s*[:=]\\s*-\\d`, "g");

  const offenders = [];
  for (const file of sourceFiles) {
    const content = fs.readFileSync(file, "utf8");
    const matches = [...content.matchAll(negativeAssignmentRe)];
    if (matches.length > 0) {
      offenders.push(`${path.relative(ROOT_DIR, file).replace(/\\/g, "/")}: ${matches.map((m) => m[0]).join(", ")}`);
    }
  }
  assert.deepEqual(offenders, [], `negative literal assigned to a guarded field: ${offenders.join("; ")}`);
});

console.log("\n=== learning non-negative values: computeReviewStateTransition never yields a negative streak ===\n");

const transitionSource = fs.readFileSync(
  path.join(SRC_DIR, "data", "learning", "reviewOutcomeTransition.ts"),
  "utf8",
);

test("2. Every newStreak in computeReviewStateTransition is either 0, currentStreak (unchanged), or currentStreak + 1 (incremented) — never decremented or negated", () => {
  // computeReviewStateTransition is the last export in this file, and its
  // own destructured-params clause contains an earlier, unbalanced `}` (the
  // parameter object literal's close) before the function body even starts
  // — a naive non-greedy `[\s\S]*?\n\}` match stops there instead of at the
  // function's real end. Since this is the final declaration in the file,
  // slicing from its start to EOF reliably captures the whole body instead.
  const startIndex = transitionSource.indexOf("export function computeReviewStateTransition");
  assert.ok(startIndex !== -1, "computeReviewStateTransition must exist");
  const body = transitionSource.slice(startIndex);

  const newStreakAssignments = [...body.matchAll(/newStreak:\s*([^,}]+)/g)].map((m) => m[1].trim());
  assert.ok(newStreakAssignments.length > 0, "expected at least one newStreak: ... assignment");

  const ALLOWED = new Set(["0", "currentStreak", "incrementedStreak"]);
  const offenders = newStreakAssignments.filter((expr) => !ALLOWED.has(expr));
  assert.deepEqual(offenders, [], `unexpected newStreak expression(s): ${offenders.join(", ")}`);

  // incrementedStreak itself must be defined as currentStreak + 1, never
  // currentStreak - 1 or a standalone negative.
  assert.match(body, /const incrementedStreak = currentStreak \+ 1;/);
});

console.log("\n=== learning non-negative values: RPC response parsing never falls back to a negative sentinel ===\n");

const newWordProgressSource = fs.readFileSync(path.join(SRC_DIR, "lib", "newWordProgress.ts"), "utf8");

test("3. Every guarded-field fallback in newWordProgress.ts's RPC row parsers defaults to 0, not a negative sentinel", () => {
  // Pattern used throughout this file:
  //   typeof x === "number" && Number.isFinite(x) ? x : <fallback>
  // Assert every such ternary's fallback for a guarded field is exactly `0`.
  const ternaryRe = /typeof\s+\w+\s*===\s*"number"\s*&&\s*Number\.isFinite\(\w+\)\s*\?\s*\w+\s*:\s*([^,;\n]+)/g;
  const fallbacks = [...newWordProgressSource.matchAll(ternaryRe)].map((m) => m[1].trim());
  assert.ok(fallbacks.length > 0, "expected at least one Number.isFinite fallback ternary");
  const offenders = fallbacks.filter((fallback) => fallback !== "0");
  assert.deepEqual(offenders, [], `non-zero fallback found for a numeric RPC field: ${offenders.join(", ")}`);
});

test("4. No numeric field in newWordProgress.ts uses a negative number as a client-side 'no value yet' sentinel", () => {
  const offenders = [...newWordProgressSource.matchAll(/-\d+/g)].map((m) => m[0]);
  assert.deepEqual(offenders, [], `unexpected negative numeric literal(s) in newWordProgress.ts: ${offenders.join(", ")}`);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("learning-non-negative-values-contract guard passed");
}
