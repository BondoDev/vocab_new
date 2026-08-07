// Account-deletion primitive — Supabase Edge Function.
//
// Backend-only piece of the account-deletion capability (no frontend UI is
// wired to this yet — see supabase/README.md's "Account Deletion" section
// for the full audit/decision record this function implements). Runs on
// Supabase's own Edge Runtime, the only place in this repository that may
// legitimately hold the Supabase `service_role` key: it is set as an Edge
// Function secret (`supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`),
// never as a `VITE_`-prefixed build-time variable, so it can never end up in
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
// Reauthentication — deliberately NOT enforced here yet. A Supabase JWT's
// `amr` claim carries a timestamp per authentication factor, which could in
// principle back a "was the caller recently authenticated" check, but nothing
// in this repository decodes/validates JWT claims anywhere today, and a
// session-age check alone is a weak proxy for actual reauthentication (a
// long-lived, silently-refreshed session can look "old" at the token layer
// while the user never re-proved their password, and vice versa). Building
// that check now, with no UI that ever forces a fresh sign-in before calling
// this function, would be exactly the kind of invented pseudo-reauth this
// task was told not to add. This function is therefore authenticated-only
// (any currently-valid session may call it) and intentionally not wired into
// any frontend code path — seeing this comment in a future Settings task is
// the reminder to revisit reauthentication before ever exposing a "Delete
// account" button.
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
// exists to support. Flipping this to "true" is a deliberate future step,
// gated on a real Settings UI and genuine reauthentication existing first —
// not something this task does.

// @ts-nocheck -- Deno Edge Function: resolved by Supabase's Deno runtime via
// URL/npm specifiers, not this repo's Node/tsc toolchain (which does not
// know the `Deno` global or `npm:`/`https://esm.sh` specifiers). Excluded
// from `npx tsc --noEmit` the same way workers/word-ssr's own Wrangler
// build is a separate toolchain from the main app's tsc run.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
// Exact-match only — see the header comment above. Deliberately not
// lower-cased/trimmed/coerced before comparison: normalizing the value
// would turn "True"/" true "/"TRUE" into accepted spellings, which is
// exactly the ambiguity this gate exists to avoid for a destructive
// operation.
const ACCOUNT_DELETION_ENABLED = Deno.env.get("ACCOUNT_DELETION_ENABLED");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  // Fail closed: without both values this function cannot safely identify
  // or delete anyone, and must never fall back to an unprivileged client.
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "server_misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  if (!bearerMatch) {
    return jsonResponse({ error: "unauthenticated" }, 401);
  }
  const callerToken = bearerMatch[1];

  // service_role client — used only to (a) resolve the token to a live
  // user via the Admin API and (b) perform the Admin API deletion itself.
  // Never constructed from or exposed to the request in any other way.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // The ONLY source of the deletion target. getUser(token) both verifies
  // the JWT and confirms the user it names still exists — an expired,
  // malformed, or already-deleted-user token is rejected right here.
  const { data: userResult, error: userError } = await adminClient.auth.getUser(callerToken);
  if (userError || !userResult?.user?.id) {
    return jsonResponse({ error: "unauthenticated" }, 401);
  }
  const callerId = userResult.user.id;

  // Production deployment gate — see the header comment above. Checked
  // after identity is resolved (so an unauthenticated caller only ever
  // sees 401, never a hint about deployment state) and unconditionally
  // before the destructive call below. The response is deliberately narrow
  // — no reason, no configuration state, nothing beyond the machine-
  // readable error code.
  if (ACCOUNT_DELETION_ENABLED !== "true") {
    return jsonResponse({ error: "account_deletion_disabled" }, 403);
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(callerId);
  if (deleteError) {
    // Never report success on a failed deletion — the caller must be able
    // to trust a 200 response as ground truth.
    return jsonResponse({ error: "delete_failed" }, 502);
  }

  // Minimal response — no echoed id/email, nothing beyond confirmation.
  return jsonResponse({ deleted: true }, 200);
});
