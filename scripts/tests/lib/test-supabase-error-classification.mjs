// Unit tests for src/lib/supabaseError.ts — the shared Supabase/PostgREST
// error-classification layer introduced by "Frontend Cleanup 3" to replace
// three hand-copied `/jwt|session|unauthorized|401/i` message-regex checks
// (src/lib/newWordProgress.ts) plus several call sites with no
// classification at all.
//
// This module has no Vite-only imports (no import.meta.env), so — unlike
// newWordProgress.ts/userProfile.ts, which transitively import
// supabaseAuth.ts — it loads directly here via Node's native TypeScript
// stripping, matching test-vocabulary-category.mjs's own precedent.
//
// Run: node --experimental-strip-types scripts/tests/lib/test-supabase-error-classification.mjs
import assert from "node:assert/strict";
import {
  classifySupabaseError,
  describeSupabaseError,
  resolveSupabaseErrorMessageKey,
  ClassifiedSupabaseError,
  SHARED_ERROR_MESSAGE_KEYS,
} from "../../../src/lib/supabaseError.ts";

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

// A minimal stand-in for SupabaseRequestError (supabaseAuth.ts) — the
// classifier only depends on the SupabaseErrorLike shape (message/code/
// details/hint/status), not the concrete class, so plain objects are
// enough here.
function supabaseError({ message, code = null, status = null, details = null, hint = null }) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  error.hint = hint;
  return error;
}

console.log("\n=== classifySupabaseError ===\n");

test("1a. unauthenticated: HTTP 401 status classifies as unauthenticated", () => {
  const error = supabaseError({ message: "Unauthorized", status: 401 });
  assert.equal(classifySupabaseError(error), "unauthenticated");
});

test("1b. unauthenticated: GoTrue-style 'invalid JWT' message (no code/status) classifies as unauthenticated", () => {
  const error = new Error("invalid JWT: unable to parse or verify signature");
  assert.equal(classifySupabaseError(error), "unauthenticated");
});

test("1c. unauthenticated: expired-refresh-token message classifies as unauthenticated", () => {
  const error = new Error("Invalid Refresh Token: Refresh Token Not Found");
  assert.equal(classifySupabaseError(error), "unauthenticated");
});

test("2a. forbidden: HTTP 403 status classifies as forbidden", () => {
  const error = supabaseError({ message: "Forbidden", status: 403 });
  assert.equal(classifySupabaseError(error), "forbidden");
});

test("2b. forbidden: Postgres code 42501 (insufficient_privilege) classifies as forbidden, taking priority over an unrelated status", () => {
  const error = supabaseError({ message: "permission denied for table user_word_progress", code: "42501", status: 400 });
  assert.equal(classifySupabaseError(error), "forbidden");
});

test("3a. missing_rpc: PostgREST code PGRST202 classifies as missing_rpc", () => {
  const error = supabaseError({
    message: "Could not find the function public.set_word_progress_favorite without parameters in the schema cache",
    code: "PGRST202",
  });
  assert.equal(classifySupabaseError(error), "missing_rpc");
});

test("3b. missing_rpc: 'schema cache' message (no code) still classifies as missing_rpc", () => {
  const error = new Error("Could not find the function in the schema cache");
  assert.equal(classifySupabaseError(error), "missing_rpc");
});

test("4a. network: a bare TypeError with no status/code/response (fetch() itself failing) classifies as network", () => {
  const error = new TypeError("Failed to fetch");
  assert.equal(classifySupabaseError(error), "network");
});

test("4b. network: a SupabaseRequestError (has a real HTTP status) is never misclassified as network even if its message resembles a fetch failure", () => {
  const error = supabaseError({ message: "Load failed", status: 500 });
  // 500 has no dedicated category, so it falls through to unknown — but
  // must NOT be "network", since a response WAS received.
  assert.notEqual(classifySupabaseError(error), "network");
});

test("5a. validation: Postgres 23xxx class other than 23505 (e.g. 23502 not_null_violation) classifies as validation", () => {
  const error = supabaseError({ message: "null value in column violates not-null constraint", code: "23502" });
  assert.equal(classifySupabaseError(error), "validation");
});

test("5b. validation: HTTP 400/422 with no recognized code classifies as validation", () => {
  assert.equal(classifySupabaseError(supabaseError({ message: "Bad Request", status: 400 })), "validation");
  assert.equal(classifySupabaseError(supabaseError({ message: "Unprocessable", status: 422 })), "validation");
});

test("6a. conflict: Postgres code 23505 (unique_violation) classifies as conflict, not validation", () => {
  const error = supabaseError({ message: "duplicate key value violates unique constraint", code: "23505" });
  assert.equal(classifySupabaseError(error), "conflict");
});

test("6b. conflict: HTTP 409 status classifies as conflict", () => {
  const error = supabaseError({ message: "Conflict", status: 409 });
  assert.equal(classifySupabaseError(error), "conflict");
});

test("7. unexpected_response: an explicitly classified ClassifiedSupabaseError (e.g. 'RPC returned no row') is trusted as-is, never re-derived", () => {
  const error = new ClassifiedSupabaseError("complete_word_review returned no row.", "unexpected_response");
  assert.equal(classifySupabaseError(error), "unexpected_response");
  // Even if the message would otherwise look like a network failure, the
  // explicit category always wins.
  const misleading = new ClassifiedSupabaseError("Failed to fetch the resolved row.", "unexpected_response");
  assert.equal(classifySupabaseError(misleading), "unexpected_response");
});

test("8a. unknown: a plain Error with no code/status and no recognizable message classifies as unknown", () => {
  const error = new Error("something went wrong");
  assert.equal(classifySupabaseError(error), "unknown");
});

test("8b. unknown: non-Error thrown values (string, undefined, plain object, null) are handled safely and classify as unknown", () => {
  assert.equal(classifySupabaseError("a raw string was thrown"), "unknown");
  assert.equal(classifySupabaseError(undefined), "unknown");
  assert.equal(classifySupabaseError(null), "unknown");
  assert.equal(classifySupabaseError({}), "unknown");
  assert.equal(classifySupabaseError(42), "unknown");
});

console.log("\n=== describeSupabaseError: safe diagnostics ===\n");

test("9a. diagnostics never include an access_token/refresh_token/session object even if present on the thrown error", () => {
  const error = supabaseError({ message: "Unauthorized", status: 401 });
  // Simulate an error object that also happens to carry session-shaped
  // fields (defensive: describeSupabaseError must not just spread `error`).
  error.access_token = "should-never-appear";
  error.refresh_token = "should-never-appear";
  error.session = { user: { email: "user@example.com" } };

  const diagnostics = describeSupabaseError("testOperation", error);
  const serialized = JSON.stringify(diagnostics);
  assert.ok(!("access_token" in diagnostics));
  assert.ok(!("refresh_token" in diagnostics));
  assert.ok(!("session" in diagnostics));
  assert.ok(!serialized.includes("should-never-appear"));
  assert.deepEqual(Object.keys(diagnostics).sort(), [
    "category",
    "code",
    "details",
    "hint",
    "message",
    "operation",
    "status",
  ]);
});

test("9b. a JWT-shaped substring embedded in a message/details/hint field is redacted, not logged verbatim", () => {
  const fakeJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
  const error = supabaseError({
    message: `Unauthorized: token ${fakeJwt} rejected`,
    status: 401,
    details: `see token ${fakeJwt}`,
  });
  const diagnostics = describeSupabaseError("testOperation", error);
  assert.ok(!diagnostics.message.includes(fakeJwt), "message must not contain the raw token");
  assert.ok(!diagnostics.details.includes(fakeJwt), "details must not contain the raw token");
  assert.ok(diagnostics.message.includes("[redacted-token]"));
});

test("9c. an email-shaped substring embedded in a message field is redacted, not logged verbatim", () => {
  const error = supabaseError({ message: "duplicate key: user user@example.com already exists", code: "23505" });
  const diagnostics = describeSupabaseError("testOperation", error);
  assert.ok(!diagnostics.message.includes("user@example.com"));
  assert.ok(diagnostics.message.includes("[redacted-email]"));
});

test("9d. diagnostics carry the operation name and the classified category alongside code/status", () => {
  const error = supabaseError({ message: "Could not find the function", code: "PGRST202" });
  const diagnostics = describeSupabaseError("updateWordProgressFavorite", error);
  assert.equal(diagnostics.operation, "updateWordProgressFavorite");
  assert.equal(diagnostics.category, "missing_rpc");
  assert.equal(diagnostics.code, "PGRST202");
});

console.log("\n=== resolveSupabaseErrorMessageKey ===\n");

test("10a. the four shared/universal categories resolve to the shared supabaseErrors.* key, ignoring the operation's own fallback", () => {
  assert.equal(resolveSupabaseErrorMessageKey("unauthenticated", "studyNewWords.saveErrorMessage"), "supabaseErrors.sessionExpired");
  assert.equal(resolveSupabaseErrorMessageKey("forbidden", "studyNewWords.saveErrorMessage"), "supabaseErrors.forbidden");
  assert.equal(resolveSupabaseErrorMessageKey("missing_rpc", "studyNewWords.saveErrorMessage"), "supabaseErrors.temporarilyUnavailable");
  assert.equal(resolveSupabaseErrorMessageKey("network", "studyNewWords.saveErrorMessage"), "supabaseErrors.network");
});

test("10b. every other category preserves the caller's own operation-specific fallback key — never one universal message for every operation", () => {
  for (const category of ["validation", "conflict", "unexpected_response", "unknown"]) {
    assert.equal(
      resolveSupabaseErrorMessageKey(category, "userProfile.vocabularySection.favoriteError"),
      "userProfile.vocabularySection.favoriteError",
    );
  }
});

test("10c. SHARED_ERROR_MESSAGE_KEYS contains exactly the four universal categories — a fifth entry would silently override an operation's own fallback message", () => {
  assert.deepEqual(Object.keys(SHARED_ERROR_MESSAGE_KEYS).sort(), [
    "forbidden",
    "missing_rpc",
    "network",
    "unauthenticated",
  ]);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("supabase-error-classification guard passed");
}
