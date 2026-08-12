// Regression guard for the Google-OAuth reauthentication exemption
// (product policy, 2026-08-14): password accounts must still complete a
// recent password reauthentication (unchanged — see
// test-recent-auth-token-refresh-bypass.mjs); Google OAuth accounts may
// delete using their CURRENT valid authenticated Google session, without
// the 5-minute recent-authentication window.
//
// See supabase/functions/delete-account/recentAuth.ts's own header
// (isCurrentSessionGoogleAuthenticated) for the full design: two
// independent, server-trusted signals must BOTH agree —
//   1. app_metadata.provider === "google" (from adminClient.auth.getUser,
//      never from anything the client sent), and
//   2. the SAME already-validated token's own `amr` claim contains an
//      actual "oauth" entry (reflecting how THIS session was established,
//      not merely the account's historical/linked-provider list).
// Fails CLOSED into the stricter password-reauthentication path whenever
// either signal is missing, unexpected, or ambiguous.
//
// Like test-recent-auth-token-refresh-bypass.mjs, this imports the REAL
// algorithm directly (recentAuth.ts is pure and dependency-free) rather
// than pattern-matching source text, so every assertion here exercises the
// actual decision logic on constructed inputs.
//
// Run: node --experimental-strip-types scripts/tests/account/test-google-reauth-exemption.mjs
import assert from "node:assert/strict";
import {
  hasRecentAuthentication,
  isCurrentSessionGoogleAuthenticated,
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

// Same fake-JWT builder as test-recent-auth-token-refresh-bypass.mjs —
// unsigned, but decodeJwtPayload never verifies signatures (safe only
// because getUser(token) already did, upstream — see recentAuth.ts).
function buildFakeJwt(payload) {
  const base64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${base64url({ alg: "HS256", typ: "JWT" })}.${base64url(payload)}.fake-signature`;
}

const googleUser = { app_metadata: { provider: "google", providers: ["google"] } };
const passwordUser = { app_metadata: { provider: "email", providers: ["email"] } };

console.log("\n=== isCurrentSessionGoogleAuthenticated: the exemption's own decision logic ===\n");

test("1. A Google account with a genuine oauth amr entry is recognized as a current Google session", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "oauth", timestamp: now - 60 }] });
  assert.equal(isCurrentSessionGoogleAuthenticated(googleUser, token), true);
});

test("2. A STALE oauth amr entry (well outside the 5-minute window) is STILL recognized — the exemption has no recency requirement at all", () => {
  const now = 1_700_000_000;
  const staleOauthAt = now - 6 * 3600; // 6 hours ago
  const token = buildFakeJwt({ amr: [{ method: "oauth", timestamp: staleOauthAt }] });
  assert.equal(isCurrentSessionGoogleAuthenticated(googleUser, token), true);
  // Cross-check against the OTHER function: hasRecentAuthentication would
  // reject this exact token for staleness — proving the exemption really
  // is bypassing that check, not coincidentally passing it anyway.
  assert.equal(hasRecentAuthentication(token, now), false);
});

test("3. A password account (provider 'email') is never treated as a Google session, however its amr looks", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "oauth", timestamp: now - 60 }] });
  assert.equal(isCurrentSessionGoogleAuthenticated(passwordUser, token), false);
});

test("4. THE key guard: an account with app_metadata.provider 'google' but whose CURRENT session's amr shows only 'password' (no 'oauth' entry) is REJECTED — a Google-linked account signing in this specific session via password must not get the exemption", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "password", timestamp: now - 60 }] });
  assert.equal(isCurrentSessionGoogleAuthenticated(googleUser, token), false);
});

test("5. A password account whose token somehow carries an 'oauth' amr entry is still rejected — provider metadata alone is not sufficient without the matching account provider, and vice versa (both signals required)", () => {
  const now = 1_700_000_000;
  // supabaseUser says "email", token amr says "oauth" — must fail closed.
  const token = buildFakeJwt({ amr: [{ method: "oauth", timestamp: now - 60 }] });
  assert.equal(isCurrentSessionGoogleAuthenticated(passwordUser, token), false);
});

test("6. A recent token_refresh entry alone (no genuine 'oauth' entry) does NOT satisfy the Google-session signal, for a Google account", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "token_refresh", timestamp: now - 30 }] });
  assert.equal(isCurrentSessionGoogleAuthenticated(googleUser, token), false);
});

test("7. supabaseUser being null/undefined fails closed (never throws, never treated as Google)", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "oauth", timestamp: now - 60 }] });
  assert.doesNotThrow(() => isCurrentSessionGoogleAuthenticated(null, token));
  assert.doesNotThrow(() => isCurrentSessionGoogleAuthenticated(undefined, token));
  assert.equal(isCurrentSessionGoogleAuthenticated(null, token), false);
  assert.equal(isCurrentSessionGoogleAuthenticated(undefined, token), false);
});

test("8. app_metadata missing entirely, or provider missing/blank/mistyped ('Google', ' google', 'GOOGLE'), all fail closed — exact-match only, no case/whitespace normalization", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "oauth", timestamp: now - 60 }] });
  assert.equal(isCurrentSessionGoogleAuthenticated({}, token), false);
  assert.equal(isCurrentSessionGoogleAuthenticated({ app_metadata: null }, token), false);
  assert.equal(isCurrentSessionGoogleAuthenticated({ app_metadata: {} }, token), false);
  assert.equal(isCurrentSessionGoogleAuthenticated({ app_metadata: { provider: "Google" } }, token), false);
  assert.equal(isCurrentSessionGoogleAuthenticated({ app_metadata: { provider: " google" } }, token), false);
  assert.equal(isCurrentSessionGoogleAuthenticated({ app_metadata: { provider: "GOOGLE" } }, token), false);
});

test("9. A malformed/undecodable token fails closed for the Google-session check too, never crashes", () => {
  assert.doesNotThrow(() => isCurrentSessionGoogleAuthenticated(googleUser, "not.a.jwt"));
  assert.equal(isCurrentSessionGoogleAuthenticated(googleUser, "not.a.jwt"), false);
});

test("10. A missing or non-array amr claim fails closed even for an account with provider 'google'", () => {
  const noAmrToken = buildFakeJwt({ sub: "user-1" });
  const nonArrayAmrToken = buildFakeJwt({ amr: "oauth" });
  assert.equal(isCurrentSessionGoogleAuthenticated(googleUser, noAmrToken), false);
  assert.equal(isCurrentSessionGoogleAuthenticated(googleUser, nonArrayAmrToken), false);
});

console.log("\n=== Combined index.ts decision (isGoogleSession replicated inline, mirroring the real handler) ===\n");

// Mirrors index.ts's own gate exactly:
//   const isGoogleSession = isCurrentSessionGoogleAuthenticated(user, token);
//   if (!isGoogleSession && !hasRecentAuthentication(token)) { reject }
function wouldBeRejected(user, token, now) {
  const isGoogleSession = isCurrentSessionGoogleAuthenticated(user, token);
  return !isGoogleSession && !hasRecentAuthentication(token, now);
}

test("11. Google session with stale (or absent) recent-auth AMR still passes the combined gate — deletion proceeds", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "oauth", timestamp: now - 6 * 3600 }] });
  assert.equal(wouldBeRejected(googleUser, token, now), false);
});

test("12. Password account with stale password AMR is rejected by the combined gate (unchanged behavior)", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "password", timestamp: now - 3600 }] });
  assert.equal(wouldBeRejected(passwordUser, token, now), true);
});

test("13. Password account with RECENT password AMR is accepted by the combined gate (unchanged behavior)", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "password", timestamp: now - 30 }] });
  assert.equal(wouldBeRejected(passwordUser, token, now), false);
});

test("14. Password account with only a recent token_refresh (no genuine reauth) is rejected — the token-refresh-bypass fix is unaffected by this exemption", () => {
  const now = 1_700_000_000;
  const token = buildFakeJwt({ amr: [{ method: "token_refresh", timestamp: now - 30 }] });
  assert.equal(wouldBeRejected(passwordUser, token, now), true);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  console.error("google-reauth-exemption guard failed");
  process.exit(1);
}

console.log("google-reauth-exemption guard passed");
