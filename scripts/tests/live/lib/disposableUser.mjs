// Disposable test-user lifecycle: create (service-role Admin API,
// pre-confirmed), sign in (normal password grant, anon key), delete
// (service-role Admin API).
//
// Chosen strategy: "service-role admin creates a disposable confirmed
// user" (email_confirm: true) rather than a plain self-service signup.
// This suite cannot assume the live project's email-confirmation setting —
// supabase/config.toml's `auth.email.enable_confirmations = false` is the
// Supabase CLI's *local development* template default, not a record of
// what the live project actually has configured (supabase/README.md
// documents this exact "local template vs. live state" gap for several
// other settings). Admin-creating a pre-confirmed user sidesteps that
// uncertainty entirely: the disposable account is usable immediately, no
// real mailbox is ever involved, and the suite's behavior does not depend
// on a setting this repository cannot observe.
import crypto from "node:crypto";
import { restMutate } from "./liveHttp.mjs";

// A syntactically valid but non-routable address space (RFC 2606-style,
// `.invalid` is reserved by IANA for exactly this purpose) — no real
// mailbox is ever expected to receive anything at this domain, and nothing
// in this suite ever tries to send it mail (email_confirm: true skips
// Supabase's own confirmation email too).
const DISPOSABLE_EMAIL_DOMAIN = "fluentstellar-e2e-live-test.invalid";

export class DisposableUserError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "DisposableUserError";
    this.details = details;
  }
}

function generateDisposableCredentials(label) {
  const suffix = crypto.randomUUID();
  return {
    email: `e2e-${label}-${suffix}@${DISPOSABLE_EMAIL_DOMAIN}`,
    password: `E2e!${crypto.randomBytes(24).toString("hex")}`,
  };
}

export async function createDisposableUser(config, label) {
  const { email, password } = generateDisposableCredentials(label);

  const response = await restMutate(
    config,
    "/auth/v1/admin/users",
    "POST",
    { email, password, email_confirm: true },
    { useServiceRole: true },
  );

  if (!response.ok || typeof response.json?.id !== "string") {
    throw new DisposableUserError(
      `Failed to create disposable "${label}" user via the Admin API (status ${response.status}). ` +
        "Check that SUPABASE_SERVICE_ROLE_KEY is correct for SUPABASE_URL and that the project allows Admin API user creation.",
      response.json ?? response.raw,
    );
  }

  return { id: response.json.id, email, password };
}

export async function signInDisposableUser(config, credentials) {
  const response = await restMutate(
    config,
    "/auth/v1/token?grant_type=password",
    "POST",
    { email: credentials.email, password: credentials.password },
    {},
  );

  if (!response.ok || !response.json?.access_token || !response.json?.user?.id) {
    throw new DisposableUserError(
      `Failed to sign in disposable user ${credentials.email} (status ${response.status}).`,
      response.json ?? response.raw,
    );
  }

  return {
    accessToken: response.json.access_token,
    refreshToken: response.json.refresh_token ?? null,
    userId: response.json.user.id,
  };
}

// Deletes the Auth user itself — exercising the live FK-cascade
// architecture documented in supabase/README.md's "Account Deletion"
// section (every user-owned table's foreign key to auth.users(id), direct
// or transitive, is authored ON DELETE CASCADE). Deliberately never calls
// the delete-account Edge Function: that function's own
// ACCOUNT_DELETION_ENABLED gate must stay off in production (see this
// suite's top-level entry-point header), and this cleanup path has no
// relationship to it — it is this Node process's own privileged
// service-role client, the same kind of direct Admin API access the Edge
// Function itself uses internally, just invoked here for test cleanup
// instead of via that function's HTTP endpoint.
export async function deleteDisposableUser(config, userId) {
  const response = await restMutate(
    config,
    `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    "DELETE",
    undefined,
    { useServiceRole: true },
  );

  if (!response.ok) {
    throw new DisposableUserError(
      `Failed to delete disposable user ${userId} (status ${response.status}). MANUAL CLEANUP REQUIRED.`,
      response.json ?? response.raw,
    );
  }
}
