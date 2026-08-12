// Regression guard for the account-deletion recent-authentication
// token-refresh-bypass vulnerability, and its fix.
//
// Root cause: an earlier version of hasRecentAuthentication
// (supabase/functions/delete-account/recentAuth.ts) took the newest
// timestamp across EVERY `amr` (Authentication Methods Reference) entry,
// unfiltered by method. Supabase's own JWT Claims Reference documents
// `token_refresh` as a real, distinct `amr` method written on every silent
// background token refresh — a passive event that never requires the user
// to re-enter credentials. Taking the newest timestamp unconditionally let
// a purely passive refresh silently and indefinitely extend the 5-minute
// account-deletion window, without the user ever proving their identity
// again.
//
// Unlike this repo's other Edge-Function-adjacent tests, this one imports
// the REAL algorithm directly (recentAuth.ts is a pure, dependency-free
// module with no Deno-only globals — see its own header) rather than
// pattern-matching source text, so these assertions exercise the actual
// decision logic on constructed inputs, not just its presence in the file.
//
// Run: node --experimental-strip-types scripts/tests/account/test-recent-auth-token-refresh-bypass.mjs
import assert from "node:assert/strict";
import {
  RECENT_AUTH_METHODS,
  RECENT_AUTH_WINDOW_SECONDS,
  getMostRecentAuthTimestamp,
  hasRecentAuthentication,
} from "../../../supabase/functions/delete-account/recentAuth.ts";

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

// Builds a syntactically valid (but unsigned — decodeJwtPayload never
// verifies signatures, see its own header for why that's safe here) JWT
// string carrying the given payload, so hasRecentAuthentication's own
// token-splitting/base64url-decoding path is exercised exactly as it would
// be against a real GoTrue token, not bypassed via a shortcut.
function buildFakeJwt(payload) {
  const base64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(payload)}.fake-signature`;
}

console.log("\n=== Token-refresh bypass: the exact scenarios from the incident report ===\n");

test("1. Recent password authentication is accepted", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "password", timestamp: now - 60 }] });
  assert.equal(hasRecentAuthentication(token, now), true);
});

test("2. Recent oauth authentication is accepted", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "oauth", timestamp: now - 60 }] });
  assert.equal(hasRecentAuthentication(token, now), true);
});

test("3. Old password (61 minutes ago) + recent token_refresh (1 minute ago) is REJECTED — the exact incident scenario", () => {
  // password @ 10:00, token_refresh @ 11:30, now @ 11:31 (per the task's
  // own worked example) — expressed here as seconds-from-an-arbitrary-epoch
  // for a self-contained, deterministic test.
  const passwordAt = 1_700_000_000; // 10:00
  const tokenRefreshAt = passwordAt + 90 * 60; // 11:30 (90 minutes later)
  const now = tokenRefreshAt + 60; // 11:31
  const token = buildFakeJwt({
    amr: [
      { method: "password", timestamp: passwordAt },
      { method: "token_refresh", timestamp: tokenRefreshAt },
    ],
  });
  assert.equal(hasRecentAuthentication(token, now), false, "a stale password + fresh token_refresh must NOT pass");
});

test("4. Old oauth (61 minutes ago) + recent token_refresh (1 minute ago) is REJECTED", () => {
  const oauthAt = 1_700_000_000;
  const tokenRefreshAt = oauthAt + 61 * 60;
  const now = tokenRefreshAt + 60;
  const token = buildFakeJwt({
    amr: [
      { method: "oauth", timestamp: oauthAt },
      { method: "token_refresh", timestamp: tokenRefreshAt },
    ],
  });
  assert.equal(hasRecentAuthentication(token, now), false);
});

test("5. Only token_refresh entries (no password/oauth at all) is REJECTED, however recent", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "token_refresh", timestamp: now - 1 }] });
  assert.equal(hasRecentAuthentication(token, now), false);
});

test("6. No amr claim at all is REJECTED", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ sub: "user-1" });
  assert.equal(hasRecentAuthentication(token, now), false);
});

test("7. A malformed amr (not an array, or entries missing method/timestamp) is REJECTED, never crashes", () => {
  const now = 1_700_000_000;
  assert.equal(hasRecentAuthentication(buildFakeJwt({ amr: "not-an-array" }), now), false);
  assert.equal(hasRecentAuthentication(buildFakeJwt({ amr: [{ method: "password" }] }), now), false);
  assert.equal(hasRecentAuthentication(buildFakeJwt({ amr: [{ timestamp: now }] }), now), false);
  assert.equal(hasRecentAuthentication(buildFakeJwt({ amr: [null, 42, "x"] }), now), false);
  assert.doesNotThrow(() => hasRecentAuthentication("not.a.jwt", now));
  assert.equal(hasRecentAuthentication("not.a.jwt", now), false);
});

test("8. A future/implausible timestamp is treated as NOT recent, never as 'extra fresh'", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "password", timestamp: now + 3600 }] });
  assert.equal(hasRecentAuthentication(token, now), false, "a future timestamp must not pass the recency check");
});

test("9. A recent qualifying method alongside an older token_refresh is ACCEPTED (the qualifying entry alone is sufficient)", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({
    amr: [
      { method: "token_refresh", timestamp: now - 3600 },
      { method: "password", timestamp: now - 30 },
    ],
  });
  assert.equal(hasRecentAuthentication(token, now), true);
});

test("10. An unknown/unsupported amr method alone is REJECTED (allow-list, not a deny-list — an unrecognized future Supabase method never silently passes)", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "sso", timestamp: now - 1 }] });
  assert.equal(hasRecentAuthentication(token, now), false);
});

console.log("\n=== Exact boundary and the task's own two worked examples ===\n");

test("11. Exactly at the 300-second boundary is accepted; 1 second past it is rejected", () => {
  const now = 1_700_000_000;
  const atBoundary = buildFakeJwt({ amr: [{ method: "password", timestamp: now - RECENT_AUTH_WINDOW_SECONDS }] });
  const pastBoundary = buildFakeJwt({
    amr: [{ method: "password", timestamp: now - RECENT_AUTH_WINDOW_SECONDS - 1 }],
  });
  assert.equal(hasRecentAuthentication(atBoundary, now), true);
  assert.equal(hasRecentAuthentication(pastBoundary, now), false);
});

test("12. Worked example A (task's own): password @ 10:00, token_refresh @ 11:30, now 11:31 -> stale", () => {
  const baseline = 1_700_000_000;
  const now = baseline; // 11:31
  const token = buildFakeJwt({
    amr: [
      { method: "password", timestamp: baseline - 91 * 60 }, // 10:00
      { method: "token_refresh", timestamp: baseline - 60 }, // 11:30
    ],
  });
  assert.equal(hasRecentAuthentication(token, now), false);
});

test("13. Worked example B (task's own): password @ 11:29, token_refresh @ 11:30, now 11:31 -> recently authenticated", () => {
  const now = 1_700_000_000; // 11:31
  const token = buildFakeJwt({
    amr: [
      { method: "password", timestamp: now - 2 * 60 }, // 11:29
      { method: "token_refresh", timestamp: now - 60 }, // 11:30
    ],
  });
  assert.equal(hasRecentAuthentication(token, now), true);
});

console.log("\n=== The allow-list itself ===\n");

test("14. RECENT_AUTH_METHODS is exactly {password, oauth} — no more, no fewer", () => {
  assert.deepEqual([...RECENT_AUTH_METHODS].sort(), ["oauth", "password"]);
});

test("15. getMostRecentAuthTimestamp ignores non-qualifying entries entirely when computing the max, rather than merely down-ranking them", () => {
  const now = 1_700_000_000;
  const payload = {
    amr: [
      { method: "token_refresh", timestamp: now }, // newest overall, but must be ignored
      { method: "password", timestamp: now - 200 },
    ],
  };
  assert.equal(getMostRecentAuthTimestamp(payload), now - 200);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("recent-auth-token-refresh-bypass guard failed");
  process.exit(1);
}

console.log("recent-auth-token-refresh-bypass guard passed");
