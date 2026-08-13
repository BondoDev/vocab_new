// Pure email-input validator for Settings' inline email change row — no
// React, Node-testable directly (scripts/tests/account/
// test-settings-email.mjs), same precedent as settingsNickname.ts/
// settingsConfirmation.ts.
//
// No existing email-format validator exists anywhere in this repository
// (grep-confirmed against the login/signup dialog in Header.tsx, which
// validates only "non-empty" before calling signInWithPassword/
// signUpWithPassword and lets GoTrue itself reject a malformed address) —
// this is the first one, deliberately minimal per this task's own brief
// ("do not create an overly restrictive email regex"). Backend/Auth (GoTrue)
// remains authoritative; this only catches the "clearly not an email"
// case before ever making a network request.
//
// Normalization: trims surrounding whitespace only. Casing is preserved
// exactly as typed — GoTrue's own email-handling normalization (if any) is
// authoritative; this never invents its own.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailValidationFailureReason = "empty" | "invalid";

export type EmailValidationResult =
  | { ok: true; value: string }
  | { ok: false; reason: EmailValidationFailureReason };

export function normalizeEmailInput(raw: string): EmailValidationResult {
  const value = raw.trim();

  if (!value) {
    return { ok: false, reason: "empty" };
  }

  if (!EMAIL_PATTERN.test(value)) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, value };
}

// ============================================================================
// Duplicate-email / pending-email-change parsing
// ============================================================================
// Kept here (not in src/lib/accountEmailChange.ts, which does the actual
// network call) specifically so this logic stays Node-testable directly via
// scripts/tests/account/test-settings-email.mjs — accountEmailChange.ts
// imports src/lib/supabaseAuth.ts, which reads import.meta.env at module
// load and therefore can't be loaded by a bundler-free Node script (same
// documented constraint as src/lib/accountDeletion.ts). Both functions below
// take a structurally-typed `unknown` on purpose (duck-typed, not
// `instanceof SupabaseRequestError`/a `SupabaseAuthUser` import) so neither
// one needs to import supabaseAuth.ts either.

// GoTrue's own stable, machine-readable error identifier for "this email is
// already registered to a user" on PUT /auth/v1/user (Auth API error-codes
// reference) — supabaseRequest (src/lib/supabaseAuth.ts) surfaces this as
// SupabaseRequestError.code (via the response body's own `error_code`
// field). Checked first, before any message-text fallback, matching this
// repository's own established "stable code first, message-substring only
// as a fallback" convention (see src/lib/supabaseError.ts's
// classifyByCodeAndStatus).
const DUPLICATE_EMAIL_ERROR_CODE = "email_exists";

// Defensive fallback only, for the case GoTrue's response doesn't carry a
// recognized error_code (an older GoTrue version, or a message shape this
// project hasn't seen) — matches GoTrue's actual historical wording for
// this rejection ("... already been registered ...") plus a couple of
// close variants, never a broad "exists" pattern that could misclassify an
// unrelated validation error as a duplicate.
const DUPLICATE_EMAIL_MESSAGE_PATTERN = /already\s+(?:been\s+)?registered|already\s+in\s+use|already\s+associated/i;

export function isDuplicateEmailError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === DUPLICATE_EMAIL_ERROR_CODE) {
    return true;
  }

  return typeof candidate.message === "string" && DUPLICATE_EMAIL_MESSAGE_PATTERN.test(candidate.message);
}

// GoTrue's User JSON exposes a `new_email` field holding the still-pending,
// unconfirmed new address whenever a `double_confirm_changes`-gated email
// change is in flight for that user (Auth API reference) — absent/empty
// once there is no pending change (either none was ever requested, or both
// confirmations already completed and the change applied). Reading this
// real, server-owned field is what task section 9 asks for ("use the
// actual fields returned by Supabase; do not invent local persistent state
// that can become stale") — Settings never stores its own separate
// "is a change pending" flag.
export function getPendingEmailFromUser(user: unknown): string | null {
  if (!user || typeof user !== "object") {
    return null;
  }

  const value = (user as { new_email?: unknown }).new_email;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
