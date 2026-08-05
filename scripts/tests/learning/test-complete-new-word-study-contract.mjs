// Focused guard for the finalized complete_new_word_study RPC contract:
// exactly three arguments (p_word_id, p_target_language, p_study_time_seconds), and
// no client-supplied completion timestamp anywhere in the call path. This
// can't be exercised as a runtime unit test because src/lib/newWordProgress.ts
// transitively imports src/lib/supabaseAuth.ts, which reads
// import.meta.env.VITE_SUPABASE_URL — a Vite-only global that doesn't exist
// under plain `node --experimental-strip-types` (see how every other Phase
// 1-3 test script deliberately only imports Supabase-free pure modules).
// So, like test 10 and test 22 in test-new-word-study-session.mjs, this is a
// precise source-text guard rather than a behavioral one.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-complete-new-word-study-contract.mjs
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

const libSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "lib", "newWordProgress.ts"),
  "utf8",
);
const sessionSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "study-new-words", "NewWordStudySession.tsx"),
  "utf8",
);

console.log("\n=== complete_new_word_study RPC contract ===\n");

test("1. CompleteNewWordStudyParams no longer has a completion-timestamp field", () => {
  const paramsBlockMatch = libSource.match(/export interface CompleteNewWordStudyParams \{([\s\S]*?)\n\}/);
  assert.ok(paramsBlockMatch, "CompleteNewWordStudyParams interface must exist");
  assert.doesNotMatch(paramsBlockMatch[1], /completedAt/i, "must not declare a completedAt/completedAtISO field");
});

test("2. The RPC request body sends exactly p_word_id, p_target_language, p_study_time_seconds", () => {
  const bodyMatch = libSource.match(
    /"\/rest\/v1\/rpc\/complete_new_word_study",\s*\{([\s\S]*?)\},\s*\);/,
  );
  assert.ok(bodyMatch, "the complete_new_word_study RPC call body must be found");
  const body = bodyMatch[1];

  assert.match(body, /p_word_id\s*:\s*conceptId/, "must send p_word_id");
  assert.match(body, /p_target_language\s*:\s*targetLanguage/, "must send p_target_language");
  assert.match(body, /p_study_time_seconds\s*:\s*studyTimeSeconds/, "must send p_study_time_seconds");

  const sentKeys = [...body.matchAll(/(\w+)\s*:/g)].map((match) => match[1]);
  assert.deepEqual(
    sentKeys.sort(),
    ["p_study_time_seconds", "p_target_language", "p_word_id"].sort(),
    "must send exactly these three keys — no p_completed_at or anything else",
  );
});

test("3. No client completion timestamp (Date.now/toISOString/completed_at) reaches the RPC call", () => {
  assert.doesNotMatch(libSource, /p_completed_at/, "p_completed_at must not appear anywhere in newWordProgress.ts");
  assert.doesNotMatch(
    sessionSource,
    /completedAtISO/,
    "NewWordStudySession.tsx must not pass a completedAtISO field to completeNewWordStudy",
  );
});

test("4. Database time is documented as the source of completion timestamps", () => {
  assert.match(
    libSource,
    /database.*now\(\)|now\(\).*database/is,
    "newWordProgress.ts must document that the database (now()) generates the completion timestamp, not the browser",
  );
});

test("5. completeNewWordStudy's call site passes only session/conceptId/targetLanguage/studyTimeSeconds", () => {
  const callMatch = sessionSource.match(/completeNewWordStudy\(\{([\s\S]*?)\}\)/);
  assert.ok(callMatch, "the completeNewWordStudy(...) call site must be found in NewWordStudySession.tsx");
  const callBody = callMatch[1];
  // Matches both `key: value,` and shorthand `key,` object properties —
  // `session` is passed as a shorthand property, not `session: session`.
  const passedKeys = [...callBody.matchAll(/^\s*(\w+)\s*[,:]/gm)].map((match) => match[1]);
  assert.deepEqual(
    passedKeys.sort(),
    ["conceptId", "session", "studyTimeSeconds", "targetLanguage"].sort(),
    "must pass exactly these four fields — no completedAtISO",
  );
});

test("6. studyTimeSeconds is validated via isValidWordTimeSeconds before ever reaching the request body", () => {
  assert.match(
    libSource,
    /isValidWordTimeSeconds\(studyTimeSeconds\)/,
    "completeNewWordStudy must validate studyTimeSeconds client-side before sending it",
  );
});

test("7. studyTimeSeconds is the frozen output of an ActiveWordTimer, not a per-exercise duration", () => {
  assert.match(sessionSource, /createActiveWordTimer/, "NewWordStudySession.tsx must use the shared timer utility");
  assert.match(sessionSource, /wordTimerRef\.current\?\.freeze\(\)/, "must freeze the timer to obtain studyTimeSeconds");
});

test("8. The timer is disposed on unmount (no leaked visibility listener)", () => {
  assert.match(sessionSource, /wordTimerRef\.current\?\.dispose\(\)/, "NewWordStudySession.tsx must dispose its timer on unmount");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("complete-new-word-study-contract guard passed");
}
