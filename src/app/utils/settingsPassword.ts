// Pure new-password validator for Settings' inline password change row — no
// React, Node-testable directly (scripts/tests/account/
// test-settings-password.mjs), same precedent as settingsEmail.ts/
// settingsNickname.ts.
//
// PASSWORD_MIN_LENGTH reuses, rather than reinvents, the canonical policy
// already established for password entry in this app: the exact same value
// (and the same "matches Supabase Auth's default minimum" rationale)
// PasswordRecoveryDialog.tsx's own MIN_PASSWORD_LENGTH already applies to
// its new-password field. Not imported directly — PasswordRecoveryDialog.tsx
// is a React component (its own module graph isn't Node-loadable without a
// bundler, same constraint settingsNickname.ts's own header documents for
// accountOnboarding.ts) — so the value is kept in sync here as a literal
// instead of a second, independently-invented number. GoTrue itself remains
// authoritative for anything stricter the backend may ever enforce.
//
// Deliberately never trims: unlike an email or nickname, a password's exact
// characters — including any leading/trailing whitespace the user
// intentionally typed — are significant. GoTrue receives exactly what the
// user typed, byte for byte.
export const PASSWORD_MIN_LENGTH = 6;

export type NewPasswordValidationFailureReason = "empty" | "tooShort";

export type NewPasswordValidationResult =
  | { ok: true; value: string }
  | { ok: false; reason: NewPasswordValidationFailureReason };

export function normalizeNewPasswordInput(raw: string): NewPasswordValidationResult {
  if (!raw) {
    return { ok: false, reason: "empty" };
  }

  if (raw.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, reason: "tooShort" };
  }

  return { ok: true, value: raw };
}
