// Focused guard for Custom Practice's active-time persistence: the
// complete_custom_practice_word RPC contract on the frontend side
// (src/lib/customPracticeProgress.ts) and its wiring into
// src/features/practice/VocabularyPractice.tsx. Same source-text-guard
// precedent as test-complete-new-word-study-contract.mjs / test-complete-
// word-review-contract.mjs — src/lib/customPracticeProgress.ts transitively
// imports src/lib/supabaseAuth.ts, which reads
// import.meta.env.VITE_SUPABASE_URL, unavailable under plain
// `node --experimental-strip-types`.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-complete-custom-practice-word-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

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

const libSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "customPracticeProgress.ts"), "utf8");
const practiceSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "practice", "VocabularyPractice.tsx"),
  "utf8",
);

console.log("\n=== complete_custom_practice_word RPC contract ===\n");

test("1. The RPC request body sends exactly p_event_id, p_target_language, p_stat_date, p_custom_practice_time_seconds", () => {
  const bodyMatch = libSource.match(/"\/rest\/v1\/rpc\/complete_custom_practice_word",\s*\{([\s\S]*?)\}\)/);
  assert.ok(bodyMatch, "the complete_custom_practice_word RPC call body must be found");
  const body = bodyMatch[1];

  assert.match(body, /p_event_id\s*:\s*eventId/, "must send p_event_id");
  assert.match(body, /p_target_language\s*:\s*targetLanguage/, "must send p_target_language");
  assert.match(body, /p_stat_date\s*:\s*statDateISO/, "must send p_stat_date");
  assert.match(
    body,
    /p_custom_practice_time_seconds\s*:\s*customPracticeTimeSeconds/,
    "must send p_custom_practice_time_seconds",
  );

  const sentKeys = [...body.matchAll(/(\w+)\s*:/g)].map((match) => match[1]);
  assert.deepEqual(
    sentKeys.sort(),
    ["p_custom_practice_time_seconds", "p_event_id", "p_stat_date", "p_target_language"].sort(),
    "must send exactly these four keys — no word/concept id, exercise type, or correctness outcome",
  );
});

test("2. customPracticeTimeSeconds is validated via isValidWordTimeSeconds before ever reaching the request body", () => {
  assert.match(
    libSource,
    /isValidWordTimeSeconds\(customPracticeTimeSeconds\)/,
    "completeCustomPracticeWord must validate customPracticeTimeSeconds client-side before sending it",
  );
});

test("3. CustomPracticePersistenceError is thrown instead of a raw Supabase/PostgreSQL error reaching a caller", () => {
  assert.match(libSource, /class CustomPracticePersistenceError extends Error/);
});

test("4. No word/concept id, wordProgressId, exercise type, or correctness result is ever a parameter of completeCustomPracticeWord", () => {
  const paramsBlockMatch = libSource.match(/export interface CompleteCustomPracticeWordParams \{([\s\S]*?)\n\}/);
  assert.ok(paramsBlockMatch, "CompleteCustomPracticeWordParams interface must exist");
  assert.doesNotMatch(
    paramsBlockMatch[1],
    /conceptId|wordId|wordProgressId|exerciseType|result\s*:/i,
    "Custom Practice's persistence call must never carry word identity or a correctness outcome",
  );
});

console.log("\n=== VocabularyPractice.tsx wiring ===\n");

test("5. VocabularyPractice.tsx uses the shared ActiveWordTimer, not a bespoke clock", () => {
  assert.match(practiceSource, /createActiveWordTimer/, "must import/use createActiveWordTimer");
});

test("6. The timer is only started for single-word exercises — gated by !isFourWordExercise(currentExerciseType)", () => {
  assert.match(
    practiceSource,
    /isFourWordExercise\(currentExerciseType\)\)\s*\{\s*return;\s*\}\s*customPracticeTimerRef\.current\?\.reset\(\)/,
    "the timer-start effect must skip four-word group exercises",
  );
});

test("7. freeze() is called inside runNextStep before advancing, gated on !isFourWordExercise", () => {
  assert.match(
    practiceSource,
    /if \(currentWord && !isFourWordExercise\(currentExerciseType\)\)\s*\{\s*const customPracticeTimeSeconds = customPracticeTimerRef\.current\?\.freeze\(\)/,
    "must freeze the timer for single-word exercises only, before persisting",
  );
});

test("8. connectWords/listening (four-word group exercises) never call completeCustomPracticeWord", () => {
  // The only call site is inside the `!isFourWordExercise` guard verified by
  // test 7 above — assert there is exactly one call site in the whole file.
  const callSites = [...practiceSource.matchAll(/completeCustomPracticeWord\(/g)];
  assert.equal(callSites.length, 1, "expected exactly one completeCustomPracticeWord(...) call site");
});

test("9. A fresh event id is minted per exercise presentation via crypto.randomUUID()", () => {
  assert.match(
    practiceSource,
    /customPracticeEventIdRef\.current = crypto\.randomUUID\(\)/,
    "must mint a fresh event id when a new single-word exercise becomes current",
  );
});

test("10. The timer is disposed on unmount (no leaked visibility listener)", () => {
  assert.match(practiceSource, /customPracticeTimerRef\.current\?\.dispose\(\)/, "VocabularyPractice.tsx must dispose its timer on unmount");
});

test("11. A save failure never blocks advancing to the next exercise (fire-and-forget .catch, not awaited before continuing)", () => {
  const callBlockMatch = practiceSource.match(/void completeCustomPracticeWord\(\{[\s\S]*?\}\)\.catch\(/);
  assert.ok(callBlockMatch, "the call must be fire-and-forget (void ... .catch(...)), never awaited synchronously in the render path");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("complete-custom-practice-word-contract guard passed");
}
