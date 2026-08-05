// Focused guard for the complete_word_review RPC contract on the frontend
// side: exactly four arguments (p_event_id, p_word_progress_id, p_result,
// p_stat_date), and no client-supplied user id/previous state/streak/next
// state/completion timestamp anywhere in the call path. Same rationale as
// test-complete-new-word-study-contract.mjs for why this is a source-text
// guard rather than a runtime unit test: src/lib/newWordProgress.ts
// transitively imports src/lib/supabaseAuth.ts, which reads
// import.meta.env.VITE_SUPABASE_URL — a Vite-only global unavailable under
// plain `node --experimental-strip-types`.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-complete-word-review-contract.mjs
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

const libSource = fs.readFileSync(path.join(ROOT_DIR, "src", "lib", "newWordProgress.ts"), "utf8");
const sessionSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "review-words", "ReviewSession.tsx"),
  "utf8",
);
const planSource = fs.readFileSync(
  path.join(ROOT_DIR, "src", "features", "review-words", "reviewSessionPlan.ts"),
  "utf8",
);

console.log("\n=== complete_word_review RPC contract ===\n");

test("1. CompleteWordReviewParams has no previousState/currentStreak/newState/completion-timestamp field", () => {
  const paramsBlockMatch = libSource.match(/export interface CompleteWordReviewParams \{([\s\S]*?)\n\}/);
  assert.ok(paramsBlockMatch, "CompleteWordReviewParams interface must exist");
  const body = paramsBlockMatch[1];
  assert.doesNotMatch(body, /previousState|currentStreak|newState|completedAt|userId/i);
});

test("2. The RPC request body sends exactly p_event_id, p_word_progress_id, p_result, p_stat_date, p_review_time_seconds", () => {
  const bodyMatch = libSource.match(/"\/rest\/v1\/rpc\/complete_word_review",\s*\{([\s\S]*?)\},\s*\);/);
  assert.ok(bodyMatch, "the complete_word_review RPC call body must be found");
  const body = bodyMatch[1];

  assert.match(body, /p_event_id\s*:\s*eventId/, "must send p_event_id");
  assert.match(body, /p_word_progress_id\s*:\s*wordProgressId/, "must send p_word_progress_id");
  assert.match(body, /p_result\s*:\s*result/, "must send p_result");
  assert.match(body, /p_stat_date\s*:\s*statDateISO/, "must send p_stat_date");
  assert.match(body, /p_review_time_seconds\s*:\s*reviewTimeSeconds/, "must send p_review_time_seconds");

  const sentKeys = [...body.matchAll(/(\w+)\s*:/g)].map((match) => match[1]);
  assert.deepEqual(
    sentKeys.sort(),
    ["p_event_id", "p_result", "p_review_time_seconds", "p_stat_date", "p_word_progress_id"].sort(),
    "must send exactly these five keys — nothing else",
  );
});

test("3. No client-supplied user id, previous state, streak, or completion timestamp reaches the RPC call", () => {
  assert.doesNotMatch(libSource, /p_user_id/, "p_user_id must not appear anywhere in newWordProgress.ts");
  assert.doesNotMatch(libSource, /p_previous_state/, "p_previous_state must not appear anywhere");
  assert.doesNotMatch(libSource, /p_current_streak/, "p_current_streak must not appear anywhere");
  assert.doesNotMatch(libSource, /p_new_state/, "p_new_state must not appear anywhere");
  assert.doesNotMatch(libSource, /p_completed_at|p_reviewed_at/, "no client completion timestamp field must appear");
});

test("4. completeWordReview's call site in ReviewSession.tsx passes only session/eventId/wordProgressId/result/statDateISO/reviewTimeSeconds", () => {
  const callMatch = sessionSource.match(/completeWordReview\(\{([\s\S]*?)\}\)/);
  assert.ok(callMatch, "the completeWordReview(...) call site must be found in ReviewSession.tsx");
  const callBody = callMatch[1];
  const passedKeys = [...callBody.matchAll(/^\s*(\w+)\s*[,:]/gm)].map((match) => match[1]);
  assert.deepEqual(
    passedKeys.sort(),
    ["eventId", "result", "reviewTimeSeconds", "session", "statDateISO", "wordProgressId"].sort(),
    "must pass exactly these six fields",
  );
});

test("9. reviewTimeSeconds is validated via isValidWordTimeSeconds before ever reaching the request body", () => {
  assert.match(
    libSource,
    /isValidWordTimeSeconds\(reviewTimeSeconds\)/,
    "completeWordReview must validate reviewTimeSeconds client-side before sending it",
  );
});

test("10. reviewTimeSeconds is the frozen output of an ActiveWordTimer, timed only during word_exercise (never group_exercise)", () => {
  assert.match(sessionSource, /createActiveWordTimer/, "ReviewSession.tsx must use the shared timer utility");
  assert.match(sessionSource, /wordTimerRef\.current\?\.freeze\(\)/, "must freeze the timer to obtain reviewTimeSeconds");
  const timerStartEffectMatch = sessionSource.match(
    /useEffect\(\(\) => \{\s*if \(state\.currentStep !== "word_exercise"\) \{[\s\S]*?wordTimerRef\.current\?\.start\(\);\s*\}, \[[\s\S]*?\]\);/,
  );
  assert.ok(timerStartEffectMatch, "the timer must only start/reset while entering word_exercise, not group_exercise");
});

test("11. The timer is disposed on unmount (no leaked visibility listener)", () => {
  assert.match(sessionSource, /wordTimerRef\.current\?\.dispose\(\)/, "ReviewSession.tsx must dispose its timer on unmount");
});

test("5. The event id is read from wordResults (already generated at plan-build time), never freshly generated at save time", () => {
  assert.doesNotMatch(
    sessionSource,
    /crypto\.randomUUID/,
    "ReviewSession.tsx must not mint a new event id itself — reviewSessionPlan.ts owns that, once per encounter",
  );
  assert.match(sessionSource, /wordResult\.eventId/, "must read the eventId from the already-built word result");
});

test("6. The event id is generated exactly once per word encounter, when the plan is built", () => {
  assert.match(planSource, /crypto\.randomUUID/, "reviewSessionPlan.ts must generate the default event id");
  assert.match(
    planSource,
    /eventId:\s*generateEventId\(\)/,
    "each word assignment must call generateEventId() exactly at plan-build time",
  );
});

test("7. ReviewPersistenceError is thrown instead of a raw Supabase/PostgreSQL error reaching the UI", () => {
  assert.match(libSource, /class ReviewPersistenceError extends Error/);
  assert.match(libSource, /Never surface the raw Supabase\/PostgreSQL message/);
});

test("8. Database time is documented as the source of the review timestamp, not the browser", () => {
  assert.match(
    libSource,
    /database.*now\(\)|now\(\).*database|database's own clock/is,
    "newWordProgress.ts must document that the database generates the review timestamp, not the browser",
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("complete-word-review-contract guard passed");
}
