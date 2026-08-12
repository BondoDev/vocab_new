// Pure recent-authentication decision logic for delete-account's own
// server-side reauthentication requirement — see index.ts's own header for
// the full design/incident record. Deliberately dependency-free (no Deno
// globals beyond `atob`, which Node also provides) so this exact file can
// be imported both by the live Deno Edge Function (relative import,
// index.ts) and directly by this repo's own Node test suite
// (scripts/tests/account/test-recent-auth-token-refresh-bypass.mjs, via
// `node --experimental-strip-types`) — one algorithm, never a second
// hand-copied version that could silently drift from what's actually
// deployed.
//
// CORRECTION (2026-08-14): an earlier version of this logic took the
// newest timestamp across EVERY `amr` entry, on the mistaken assumption
// that GoTrue only ever appends an `amr` entry on a genuine authentication
// event. Supabase's own JWT Claims Reference documents `token_refresh` as
// a real, distinct `amr` method — written on every silent background token
// refresh (ensureFreshSupabaseSession/refreshSupabaseSession, src/lib/
// supabaseAuth.ts), which never requires the user to re-enter credentials.
// Taking the newest timestamp unconditionally meant a purely passive
// refresh could silently and indefinitely extend the 5-minute deletion
// window, without the user ever proving their identity again — defeating
// the entire point of this check.

// Only `password` (email/password sign-in) and `oauth` (Google OAuth,
// FluentStellar's only other supported provider — see
// supabase/README.md's "Reauthentication" section) count as genuine
// identity re-verification for this destructive action. `token_refresh` is
// deliberately, explicitly absent, and so is every other Supabase `amr`
// method this project doesn't otherwise use — this is an ALLOW-list, not a
// deny-list, so a future Supabase-added method never silently starts
// counting as "recent" without a deliberate code change here.
export const RECENT_AUTH_METHODS = new Set(["password", "oauth"]);

// 5 minutes — see index.ts's own header for why this exact window.
export const RECENT_AUTH_WINDOW_SECONDS = 5 * 60;

// Decodes a JWT's payload (base64url) WITHOUT independently re-verifying
// its signature — safe to call this way only because the caller (index.ts)
// always does so after adminClient.auth.getUser(token) has already
// round-tripped to GoTrue and confirmed this exact token's signature,
// expiry, and backing user are valid. This function only ever reads
// additional claims off a token whose authenticity was already established
// by the authority itself.
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const json = atob(padded);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    // A malformed/undecodable payload is treated as "no recent
    // authentication evidence" by the caller below, never as a crash and
    // never as an implicit pass.
    return null;
  }
}

// The most recent `timestamp` among the token's `amr` entries whose
// `method` is in RECENT_AUTH_METHODS — every other entry (token_refresh,
// or any method not on the allow-list) is skipped entirely, regardless of
// how recent its own timestamp is. A token can carry more than one
// qualifying factor; any one of them being recent enough is sufficient.
export function getMostRecentAuthTimestamp(payload: Record<string, unknown>): number | null {
  const amr = payload.amr;
  if (!Array.isArray(amr)) return null;

  let latest: number | null = null;
  for (const entry of amr) {
    if (!entry || typeof entry !== "object") continue;

    const method = (entry as { method?: unknown }).method;
    if (typeof method !== "string" || !RECENT_AUTH_METHODS.has(method)) {
      continue;
    }

    const timestamp =
      typeof (entry as { timestamp?: unknown }).timestamp === "number"
        ? (entry as { timestamp: number }).timestamp
        : null;
    if (timestamp !== null && (latest === null || timestamp > latest)) {
      latest = timestamp;
    }
  }
  return latest;
}

// Server-side-only determination — the caller (index.ts) never passes a
// client-supplied timestamp or boolean of any kind; `nowSeconds` defaults
// to the real current time and is only ever overridden by this module's
// own test suite, never by request data.
export function hasRecentAuthentication(
  callerToken: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  const payload = decodeJwtPayload(callerToken);
  if (!payload) return false;

  const mostRecentTimestamp = getMostRecentAuthTimestamp(payload);
  if (mostRecentTimestamp === null) return false;

  const ageSeconds = nowSeconds - mostRecentTimestamp;
  // ageSeconds < 0 means the claimed timestamp is in the future (clock
  // skew, or a malformed/implausible value) — never treated as "extra
  // fresh"; only a non-negative age within the window counts.
  return ageSeconds >= 0 && ageSeconds <= RECENT_AUTH_WINDOW_SECONDS;
}

// ============================================================================
// Google-account exemption (product decision, 2026-08-14)
// ============================================================================
//
// Password accounts must still complete a recent password reauthentication
// (hasRecentAuthentication above, unchanged). Google OAuth accounts may
// delete using their current valid authenticated Google session, without
// the 5-minute recent-authentication window — a deliberate product
// decision, not a security gap: index.ts's own adminClient.auth.getUser
// call already independently verified this exact bearer token is valid and
// names a real, currently-existing user before this function is ever
// consulted, so "a valid authenticated Google session" is never merely
// "possession of any string."
//
// Minimal type for the User object adminClient.auth.getUser(...) returns —
// only the one field this function actually reads.
export interface SupabaseUserLike {
  app_metadata?: {
    provider?: string;
    providers?: string[];
    [key: string]: unknown;
  } | null;
}

// Determines whether the CURRENT session was established via Google OAuth,
// using two independent, server-trusted signals that must BOTH agree —
// fail CLOSED (into the stricter password-account path) if either is
// missing, unexpected, or ambiguous; never fail open into skipping
// reauthentication:
//
//   1. `supabaseUser.app_metadata.provider` — the account's own provider,
//      exactly as GoTrue itself returned it from
//      adminClient.auth.getUser(callerToken) (an Admin API call the
//      caller already made, authenticated by service_role — this is never
//      decoded from the client's own token, unlike everything else in
//      this module).
//   2. The SAME already-validated token's own `amr` claim: whether any
//      entry has method "oauth" (token_refresh entries are irrelevant
//      here — they describe token lifecycle, never authentication
//      identity, so they're neither required nor excluded by name; only
//      an actual "oauth" entry counts). This reflects how THIS SPECIFIC
//      SESSION was actually established, not merely the account's
//      historical/linked-provider list — guarding against exactly the
//      scenario this project's own task history calls out: an account
//      that happens to have Google linked at some point must not get the
//      exemption for a session that was actually established by password.
//      FluentStellar's own sign-up flows never expose a "link another
//      provider" UI (src/lib/supabaseAuth.ts: password and Google OAuth
//      are two independent, non-linked flows), so in practice this second
//      signal should always agree with the first — it is checked anyway,
//      defensively, as the "strongest reliable current-session signal"
//      this task calls for, not merely the account-level one.
export function isCurrentSessionGoogleAuthenticated(
  supabaseUser: SupabaseUserLike | null | undefined,
  callerToken: string,
): boolean {
  if (supabaseUser?.app_metadata?.provider !== "google") {
    return false;
  }

  const payload = decodeJwtPayload(callerToken);
  if (!payload) return false;

  const amr = payload.amr;
  if (!Array.isArray(amr)) return false;

  return amr.some(
    (entry) => entry !== null && typeof entry === "object" && (entry as { method?: unknown }).method === "oauth",
  );
}
