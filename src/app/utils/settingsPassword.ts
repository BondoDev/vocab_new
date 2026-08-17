// Pure new-password validator for Settings' inline password change row — no
// React, Node-testable directly (scripts/tests/account/
// test-settings-password.mjs), same precedent as settingsEmail.ts/
// settingsNickname.ts.
//
// PASSWORD_MIN_LENGTH is FluentStellar's single source of truth for the live
// Supabase Auth minimum password length — raised from the platform default
// of 6 to 8 (2026-08-18, confirmed live in the Supabase dashboard; never
// inferred from supabase/config.toml's local-dev-only template, which still
// says 6). PasswordRecoveryDialog.tsx imports this constant directly rather
// than declaring its own copy: a plain, React-free module like this one is
// safe for a component to import — the module-loadability constraint runs
// only the other way (this file, loaded directly by Node in
// test-settings-password.mjs, can't itself import a .tsx component without a
// bundler, the same reasoning settingsNickname.ts's own header documents for
// accountOnboarding.ts). GoTrue itself remains authoritative for anything
// stricter the backend may ever enforce.
//
// Deliberately never trims: unlike an email or nickname, a password's exact
// characters — including any leading/trailing whitespace the user
// intentionally typed — are significant. GoTrue receives exactly what the
// user typed, byte for byte.
export const PASSWORD_MIN_LENGTH = 8;

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
