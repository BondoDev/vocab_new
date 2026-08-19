// Account-deletion primitive — Supabase Edge Function.
//
// Called by the frontend account-deletion flow: the client wrapper is
// deleteAccount() in src/lib/accountDeletion.ts, invoked from Settings'
// Delete Account dialog (DeleteAccountDialog.tsx) once the user confirms —
// see supabase/README.md's "Account Deletion" section (and its "Built"
// follow-up) for the full audit/decision record this function implements.
// That frontend flow is never trusted on its own, though: this function
// independently re-verifies the caller's bearer token and recent-
// authentication state itself on every call, regardless of what the client
// already did — see "Identity model" and "Reauthentication" below. Runs on
// Supabase's own Edge Runtime, the only place in this repository that may
// legitimately hold a Supabase privileged server credential: as of the
// 2026-08-19 credential-source migration this is the platform-auto-injected
// `SUPABASE_SECRET_KEYS` JSON (its `"default"` entry, an `sb_secret_...`
// key) rather than the legacy `SUPABASE_SERVICE_ROLE_KEY` JWT this function
// used to read directly — see resolveSecretKey() below. Never set as a
// `VITE_`-prefixed build-time variable, so it can never end up in
// a browser bundle. The Cloudflare Worker (workers/word-ssr/) was
// deliberately NOT used for this: it is a public, unauthenticated word-SSR
// renderer with its own tight bundle-size budget and no auth/session
// handling of any kind today (docs/architecture.md, docs/deployment.md) —
// bolting a privileged, security-sensitive operation onto it would cross an
// ownership boundary for no benefit, when Supabase Edge Functions are the
// purpose-built alternative.
//
// Identity model — the single security-critical property of this function:
//   * The target user is derived EXCLUSIVELY from the caller's own bearer
//     token (`Authorization: Bearer <access_token>`), via
//     `adminClient.auth.getUser(token)`. This both validates the JWT and
//     confirms the backing auth.users row still exists (a merely
//     signature-valid-but-already-deleted token is rejected here, not
//     treated as identifying a live user).
//   * The request body is never parsed for identity. There is no
//     `user_id`/`target_user_id`/`email` parameter anywhere in this
//     function — not "validated and rejected if mismatched", structurally
//     absent, the same shape every narrow Postgres RPC in this repository
//     already uses (complete_user_profile_onboarding,
//     update_user_profile_languages, update_daily_goal,
//     initialize_user_timezone — none accept a caller-supplied id either).
//   * Only `auth.admin.deleteUser(callerId)` is ever called, with the id
//     this function itself derived — never a value that arrived over the
//     wire.
//
// Cascade — deliberately no manual per-table deletes. Every user-owned
// table's FK to auth.users(id) (directly or, for review_events/
// custom_practice_events, transitively through user_word_progress) is
// `ON DELETE CASCADE` as authored in this repo's migrations (see
// supabase/README.md's "Account Deletion" section for the full table-by-
// table audit) — `auth.admin.deleteUser` performs one DELETE against
// auth.users, and Postgres's own foreign-key cascade removes every
// dependent row transactionally. Foreign-key cascade actions are executed
// by the privileged connection Supabase Auth (GoTrue) uses, not through
// PostgREST/RLS — so the ownership-scoped SELECT-only grants this repo's
// other migrations added to these tables (Profile Phase 1, Corrective
// Migration 1, etc.) have no bearing on whether the cascade itself
// succeeds. If this single DELETE fails for any reason, Postgres rolls the
// whole cascade back — there is no multi-step manual deletion here that
// could leave a partially-deleted account behind.
//
// Reauthentication — ENFORCED (2026-08-13). See "Recent-authentication
// requirement" further below for the full design: this function now reads
// the `amr` (Authentication Methods Reference) claim off the caller's own
// already-validated bearer token and rejects the request
// (`reauthentication_required`, 403) unless a genuine authentication event
// happened within the last few minutes. A merely valid-but-old session is
// no longer sufficient on its own. The frontend (Settings' Delete Account
// dialog, src/lib/accountDeletion.ts) re-establishes this for password
// accounts by re-verifying the current password through Supabase Auth
// immediately before calling this function; this function's own check
// never trusts that the frontend actually did so — it independently
// re-derives recency from the token itself every time.
//
// Idempotency — a retried call after a successful deletion re-sends the
// same (now-stale) access token. `auth.getUser(token)` looks the user up by
// id on every call, so it correctly reports "not found" for an
// already-deleted account instead of a false success; the retry is
// rejected the same way an unauthenticated call is, not treated specially.
//
// Production deployment gate — ACCOUNT_DELETION_ENABLED. This function is
// safe to deploy today only because actual deletion is off by default: the
// destructive path requires a server-side Edge Function secret,
// `ACCOUNT_DELETION_ENABLED`, to be the exact string "true". Missing,
// "false", or any other value (wrong case, whitespace, "1", ...) all
// disable deletion identically — there is exactly one value that enables
// it, not a set of "truthy" ones. Read only from `Deno.env.get` (never from
// the request), so nothing a caller sends can ever override it. Checked
// AFTER identity is resolved (an unauthenticated caller still gets a plain
// 401, learning nothing about whether deletion is enabled) but BEFORE
// `auth.admin.deleteUser` is ever called — see supabase/README.md's
// "Account Deletion" section for the full deployment procedure this gate
// exists to support. Independent of, and checked before, the
// recent-authentication requirement below — a disabled deployment never
// leaks whether the caller's authentication was otherwise recent enough.

// @ts-nocheck -- Deno Edge Function: resolved by Supabase's Deno runtime via
// URL/npm specifiers, not this repo's Node/tsc toolchain (which does not
// know the `Deno` global or `npm:`/`https://esm.sh` specifiers). Excluded
// from `npx tsc --noEmit` the same way workers/word-ssr's own Wrangler
// build is a separate toolchain from the main app's tsc run.
import { createClient } from "npm:@supabase/supabase-js@2";
import { hasRecentAuthentication, isCurrentSessionGoogleAuthenticated } from "./recentAuth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

// Credential-source migration (2026-08-19): the legacy `service_role` JWT
// was exposed to tool/transcript output during a prior audit, so every
// legitimate consumer is being moved off it. Supabase's own Edge Function
// runtime auto-injects `SUPABASE_SECRET_KEYS` — a JSON object mapping named
// server-side secret keys (`sb_secret_...`, the platform's replacement for
// `service_role`) — into every function's environment already, regardless
// of this function's code; this reads the `"default"` entry from it instead
// of the old single-string `SUPABASE_SERVICE_ROLE_KEY` var. Deliberately
// defensive: a missing var, invalid JSON, a non-object payload, or a
// missing/empty `"default"` entry all resolve to `null` here rather than
// throwing, so every failure mode collapses into the same
// `!SECRET_KEY` fail-closed branch below that the old `!SERVICE_ROLE_KEY`
// check already used — never a partially-configured or silently-degraded
// privileged client. Never logs the raw env value, the parsed object, or
// the resolved key (including no prefix/partial logging) — a parse failure
// is reported to the caller only as the same generic `server_misconfigured`
// 500 every other missing-config case already produces.
function resolveSecretKey(): string | null {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const value = (parsed as Record<string, unknown>).default;
  return typeof value === "string" && value.length > 0 ? value : null;
}

const SECRET_KEY = resolveSecretKey();
// Exact-match only — see the header comment above. Deliberately not
// lower-cased/trimmed/coerced before comparison: normalizing the value
// would turn "True"/" true "/"TRUE" into accepted spellings, which is
// exactly the ambiguity this gate exists to avoid for a destructive
// operation.
const ACCOUNT_DELETION_ENABLED = Deno.env.get("ACCOUNT_DELETION_ENABLED");

// CORS incident, 2026-08-13: this list must name every header the real
// frontend caller (deleteAccount in src/lib/accountDeletion.ts, via
// getAuthHeaders() in src/lib/supabaseAuth.ts) actually sends —
// `authorization` (the bearer token) and `content-type` were already
// listed, but `apikey` (sent on every request through getAuthHeaders(),
// required by Supabase's own gateway to route the request at all) was
// missing. A missing entry here fails the browser's preflight check the
// same way a missing Access-Control-Allow-Origin does — "header apikey is
// not allowed by Access-Control-Allow-Headers" — even once verify_jwt
// (supabase/config.toml) stops blocking the preflight itself. Kept to
// exactly these three: this repo's frontend never uses the official
// @supabase/supabase-js client (which would additionally send
// x-client-info), so listing that header here would only be unnecessary
// surface area.
const BASE_CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// CORS hardening, 2026-08-18: the Auth security audit flagged this
// function's prior `Access-Control-Allow-Origin: "*"` as unnecessarily
// permissive for a destructive, authenticated endpoint — not an
// authentication bypass (adminClient.auth.getUser(callerToken) below
// remains the actual authorization boundary; CORS is a browser-only
// control, never a substitute for it), but wildcard access is more surface
// than this function needs. Replaced with an explicit allow-list of the
// real FluentStellar browser origins:
//   * "https://www.fluentstellar.com" — the canonical production host
//     (docs/deployment.md "Domain, redirects, and status behavior";
//     src/seo/site.ts's DEFAULT_SITE_ORIGIN).
//   * "http://localhost:5173" — Vite's default dev-server origin
//     (`npm run dev`, vite.config.ts), so local development against this
//     function keeps working.
// The bare apex, "https://fluentstellar.com", is deliberately NOT listed:
// docs/deployment.md confirms the apex-to-www redirect is a verified-live
// Cloudflare zone-edge 301 that fires before any page or Worker JS ever
// runs, so a browser page is never actually served from the apex origin —
// there is no legitimate `Origin: https://fluentstellar.com` fetch to
// allow for. No wildcard subdomain pattern is used; every entry here is an
// exact string this repo's own deployment/config already commits to.
const ALLOWED_ORIGINS = new Set([
  "https://www.fluentstellar.com",
  "http://localhost:5173",
]);

function isAllowedOrigin(origin: string | null): origin is string {
  return origin !== null && ALLOWED_ORIGINS.has(origin);
}

// Computes the full CORS header set for one request's own Origin. An
// allowed origin gets back that EXACT incoming value (never a wildcard,
// never a comma-joined list of every allowed origin — the Fetch/CORS spec
// only ever permits a single origin or none in this header). A
// disallowed or missing origin gets the method/header headers with no
// Access-Control-Allow-Origin at all, rather than reflecting it or falling
// back to "*" — the browser itself then blocks script access to the
// response for that origin. This is deliberately NOT a rejection of the
// request server-side: CORS headers only ever control whether a *browser*
// lets its own page's script read the response, not whether the server
// processes it, so a same-origin curl/server-to-server caller (which never
// sends Origin at all, and never enforces CORS response headers on itself)
// is completely unaffected — this function's real authorization boundary
// stays the bearer-token check inside the handler below, unconditionally,
// regardless of what this header ends up being.
function corsHeadersForOrigin(origin: string | null): Record<string, string> {
  if (isAllowedOrigin(origin)) {
    return { ...BASE_CORS_HEADERS, "Access-Control-Allow-Origin": origin };
  }
  return { ...BASE_CORS_HEADERS };
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ============================================================================
// Recent-authentication requirement (2026-08-13, corrected 2026-08-14)
// ============================================================================
//
// Possessing a valid-but-old session must not be enough to permanently
// delete an account. hasRecentAuthentication (./recentAuth.ts — a pure,
// dependency-free module shared with this repo's own Node test suite, see
// that file's own header) reads the `amr` (Authentication Methods
// Reference) claim off the caller's own bearer token and reports false
// unless a QUALIFYING authentication event (`password` or `oauth` —
// FluentStellar's two supported sign-in flows; deliberately NOT
// `token_refresh`, which Supabase's own JWT Claims Reference documents as
// a real, distinct `amr` method written on every silent background token
// refresh) happened within the last 5 minutes.
//
// CORRECTION (2026-08-14): an earlier version of this check took the
// newest timestamp across EVERY `amr` entry, unfiltered by method, on the
// mistaken assumption that GoTrue only ever appends an `amr` entry on a
// genuine authentication event. That let a purely passive token refresh
// silently and indefinitely extend the 5-minute deletion window, without
// the user ever proving their identity again — defeating the entire point
// of this check. recentAuth.ts's own header has the full incident record.
//
// Trust boundary: decodeJwtPayload (inside recentAuth.ts) reads the
// token's payload WITHOUT independently re-verifying its signature — safe
// only because this is always called after
// adminClient.auth.getUser(callerToken) below has already round-tripped to
// GoTrue and confirmed this exact token's signature, expiry, and backing
// user are valid. hasRecentAuthentication never becomes the sole
// authenticity check — getUser(callerToken) remains mandatory and runs
// first.
//
// PRODUCT POLICY (2026-08-14): this recent-`password`-AMR check now applies
// only to password accounts. Google OAuth accounts are exempted by
// isCurrentSessionGoogleAuthenticated (recentAuth.ts) — a deliberate
// product decision, not a security gap: their bearer token was already
// independently verified above via getUser(callerToken), so "a valid
// authenticated Google session" is sufficient on its own for this account
// type. See that function's own header for the exact trusted signals this
// determination requires.

Deno.serve(async (req: Request) => {
  // Computed once per request, from this request's own Origin header — see
  // corsHeadersForOrigin's own comment above for exactly what an
  // allowed/disallowed/missing origin each get back. Every response below
  // (OPTIONS and every jsonResponse call alike) reuses this same value, so
  // there is exactly one CORS decision per request, never a second one that
  // could drift from it.
  const corsHeaders = corsHeadersForOrigin(req.headers.get("Origin"));

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, corsHeaders);
  }

  // Fail closed: without both values this function cannot safely identify
  // or delete anyone, and must never fall back to an unprivileged client.
  if (!SUPABASE_URL || !SECRET_KEY) {
    return jsonResponse({ error: "server_misconfigured" }, 500, corsHeaders);
  }

  // The caller's OWN user access token — always a real Supabase Auth JWT,
  // completely independent of SECRET_KEY above. Never conflated with the
  // privileged server credential: this is what identifies the caller,
  // SECRET_KEY is only ever used to construct adminClient below.
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!bearerMatch) {
    return jsonResponse({ error: "unauthenticated" }, 401, corsHeaders);
  }
  const callerToken = bearerMatch[1];

  // Privileged admin client — used only to (a) resolve the caller's own
  // token to a live user via the Admin API and (b) perform the Admin API
  // deletion itself. Never constructed from or exposed to the request in
  // any other way. Authenticated with SECRET_KEY (the new sb_secret_...
  // server credential, resolved above) — @supabase/supabase-js@2 accepts it
  // here exactly as it did the legacy service_role JWT; no other call in
  // this function changes shape.
  const adminClient = createClient(SUPABASE_URL, SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The ONLY source of the deletion target. getUser(token) both verifies
  // the JWT and confirms the user it names still exists — an expired,
  // malformed, or already-deleted-user token is rejected right here.
  const { data: userResult, error: userError } = await adminClient.auth.getUser(callerToken);
  if (userError || !userResult?.user?.id) {
    return jsonResponse({ error: "unauthenticated" }, 401, corsHeaders);
  }
  const callerId = userResult.user.id;

  // Production deployment gate — see the header comment above. Checked
  // after identity is resolved (so an unauthenticated caller only ever
  // sees 401, never a hint about deployment state) and unconditionally
  // before the destructive call below. The response is deliberately narrow
  // — no reason, no configuration state, nothing beyond the machine-
  // readable error code.
  if (ACCOUNT_DELETION_ENABLED !== "true") {
    return jsonResponse({ error: "account_deletion_disabled" }, 403, corsHeaders);
  }

  // Product policy (2026-08-14): Google OAuth accounts may delete using
  // their current valid authenticated session, without the 5-minute
  // recent-authentication requirement below — see
  // isCurrentSessionGoogleAuthenticated's own header (recentAuth.ts) for
  // the exact two server-trusted signals this determination requires, both
  // derived from data this function already independently verified
  // (userResult.user came from GoTrue's own Admin API response, never from
  // anything the client sent in this request). Password accounts are
  // completely unaffected by this branch — isCurrentSessionGoogleAuthenticated
  // returns false for them, and they fall through to the unchanged
  // recent-`password`-AMR check exactly as before.
  const isGoogleSession = isCurrentSessionGoogleAuthenticated(userResult.user, callerToken);

  // Recent-authentication requirement — see this file's own section above
  // for the full design. Checked last, immediately before the destructive
  // call, and independently of whatever the frontend believes it already
  // did: a password-account caller with an ordinary valid-but-stale
  // session (correct identity, deletion enabled, but no sufficiently
  // recent authentication event) is rejected here every time, with no way
  // for a client-supplied value of any kind to satisfy this check. Skipped
  // entirely for a confirmed Google session, per the product policy above.
  if (!isGoogleSession && !hasRecentAuthentication(callerToken)) {
    return jsonResponse({ error: "reauthentication_required" }, 403, corsHeaders);
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(callerId);
  if (deleteError) {
    // Never report success on a failed deletion — the caller must be able
    // to trust a 200 response as ground truth.
    return jsonResponse({ error: "delete_failed" }, 502, corsHeaders);
  }

  // Minimal response — no echoed id/email, nothing beyond confirmation.
  return jsonResponse({ deleted: true }, 200, corsHeaders);
});
