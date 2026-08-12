// Client caller for the delete-account Edge Function
// (supabase/functions/delete-account/index.ts) — see that file's own header
// for the full identity/security audit. No frontend caller existed before
// this (supabase/README.md's Account Deletion section explicitly deferred
// it to "a future Settings task"); this is that task's client wrapper.
//
// Identity — mirrors every narrow RPC caller in this file's sibling modules:
// the ONLY thing sent is the caller's own bearer token (Authorization
// header, from the caller's already-authenticated session). There is no
// user id/email in the request body — the Edge Function itself derives the
// target exclusively from that token (adminClient.auth.getUser(token)), so
// there is nothing for this client wrapper to get wrong or spoof.
//
// Reuses supabaseRequest (src/lib/supabaseAuth.ts) — the same fetch+JSON+
// error-shape helper every other Supabase call in this app goes through —
// pointed at the Edge Functions path instead of /rest/v1 or /auth/v1.
import {
  getAuthHeaders,
  reauthenticateWithPassword,
  adoptSupabaseSession,
  supabaseRequest,
  SupabaseRequestError,
  type StoredSupabaseSession,
} from "./supabaseAuth";
import { ClassifiedSupabaseError } from "./supabaseError";

interface DeleteAccountResponseBody {
  deleted?: unknown;
}

// Deployment gate (ACCOUNT_DELETION_ENABLED) and identity/idempotency are
// fully documented in the Edge Function's own header — this wrapper does not
// re-implement or second-guess any of that; it only shapes the one request
// and validates the one successful response shape.
//
// Reauthentication phase: the Edge Function now also enforces a recent-
// authentication requirement (see that file's own header) and rejects a
// stale-but-valid session with `403 { error: "reauthentication_required" }`.
// That specific rejection is re-thrown here as a ReauthenticationError
// (reason "backend_rejected") so the UI can show its own dedicated message
// — "the frontend thought reauth was fresh enough but the server
// disagreed" is a distinct, real outcome (see task brief section 17), never
// silently retried and never conflated with an ordinary delete failure.
export async function deleteAccount(session: StoredSupabaseSession): Promise<void> {
  if (!session.access_token) {
    throw new ClassifiedSupabaseError("deleteAccount: missing access token.", "unauthenticated");
  }

  let body: DeleteAccountResponseBody;
  try {
    body = await supabaseRequest<DeleteAccountResponseBody>("/functions/v1/delete-account", {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.code === "reauthentication_required") {
      throw new ReauthenticationError(
        "backend_rejected",
        "delete-account rejected the request: reauthentication required.",
      );
    }
    throw error;
  }

  if (body?.deleted !== true) {
    throw new ClassifiedSupabaseError(
      "delete-account returned an unexpected response.",
      "unexpected_response",
    );
  }
}

// ============================================================================
// Reauthentication — password-account path
// ============================================================================
//
// FluentStellar supports exactly two sign-in methods (src/lib/
// supabaseAuth.ts): email/password and Google OAuth (see
// supabase/README.md's "Reauthentication" section for the full provider
// audit). Only the password path is reauthenticated here in-dialog: a
// password account must re-prove its password immediately before the
// delete call, verified through this function below. Google-OAuth accounts
// need no such step (product policy, 2026-08-14) — SettingsSection.tsx
// sends the current session to deleteAccount() as-is for them, and the
// Edge Function independently determines, from trusted server-side data
// only, whether that session is genuinely a currently-Google-authenticated
// one before it skips its own recent-auth check (see recentAuth.ts's
// isCurrentSessionGoogleAuthenticated for the exact signals).
export type ReauthenticationErrorReason =
  | "invalid_credentials"
  | "identity_mismatch"
  | "network"
  | "backend_rejected";

export class ReauthenticationError extends Error {
  readonly reason: ReauthenticationErrorReason;

  constructor(reason: ReauthenticationErrorReason, message: string) {
    super(message);
    this.name = "ReauthenticationError";
    this.reason = reason;
  }
}

// "email" is GoTrue's own app_metadata.provider value for a password
// account (confirmed against this project's actual stored session shape —
// see StoredSupabaseSession.user.app_metadata). Never assumes a password
// exists just because one isn't explicitly ruled out; an account with no
// recognized password provider is treated as non-password.
export function isPasswordAccount(session: StoredSupabaseSession | null | undefined): boolean {
  return session?.user?.app_metadata?.provider === "email";
}

// Re-authenticates the CURRENT account with a freshly entered password and,
// only once identity is confirmed, adopts the resulting session as the
// app's own. Never accepts an email parameter — the email verified is
// always the current session's own trusted address, never anything the
// caller could substitute, which is what makes the identity-mismatch check
// below a pure defense-in-depth backstop rather than the only thing
// preventing a cross-account mix-up (see this module's own header and the
// task brief's own section on this exact risk).
export async function reauthenticateForAccountDeletion(
  currentSession: StoredSupabaseSession,
  password: string,
): Promise<StoredSupabaseSession> {
  const currentUserId = currentSession.user?.id;
  const email = currentSession.user?.email;
  if (!currentUserId || !email) {
    throw new ReauthenticationError("identity_mismatch", "No authenticated account to reauthenticate.");
  }

  let freshSession: StoredSupabaseSession;
  try {
    freshSession = await reauthenticateWithPassword(email, password);
  } catch (error) {
    if (error instanceof SupabaseRequestError) {
      // GoTrue returns 400 "Invalid login credentials" for a wrong
      // password — the only realistic reason this specific call fails with
      // a real (if unsuccessful) HTTP response, since the email itself is
      // always the current account's own, never user-editable.
      throw new ReauthenticationError("invalid_credentials", "Incorrect password.");
    }
    throw new ReauthenticationError("network", "Could not verify your identity.");
  }

  // Defense in depth (see this function's own header): the email sent was
  // always the current account's own, so this should never actually
  // mismatch — but the account is never deleted, and the returned session
  // is never adopted, unless this equality genuinely holds.
  if (freshSession.user?.id !== currentUserId) {
    throw new ReauthenticationError("identity_mismatch", "Could not verify your identity.");
  }

  adoptSupabaseSession(freshSession);
  return freshSession;
}
