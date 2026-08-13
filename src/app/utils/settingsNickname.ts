// Pure nickname-input validator for Settings' inline nickname edit row —
// no React, Node-testable directly (scripts/tests/account/
// test-settings-nickname.mjs), same precedent as settingsConfirmation.ts.
//
// Reuses onboarding's own canonical constraints instead of inventing a
// second, potentially-diverging set of rules:
//   * startsWithLetter — the same Unicode "starts with a letter" check
//     accountOnboarding.ts's prepareAccountOnboardingSubmit already applies
//     to a nickname at signup time. Imported from accountProfileCompleteness.ts
//     (not userProfile.ts, which re-exports it) — that module's own header
//     explains why: userProfile.ts pulls in supabaseAuth.ts's extensionless
//     import chain and can't be loaded directly by this file's Node test,
//     while accountProfileCompleteness.ts can.
//   * NICKNAME_MAX_LENGTH (40) — the same cap user_profiles_nickname_
//     length_check (supabase/migrations/20260806200000...sql) and
//     complete_user_profile_onboarding both already enforce server-side,
//     and the same length fromSupabaseProfileRow already truncates to on
//     read (src/lib/userProfile.ts's `.trim().slice(0, 40)`).
//
// Normalization: trims surrounding whitespace only. Internal spacing,
// casing, and Unicode are preserved exactly as typed — never lowercased or
// slugified (this task's own brief, section 5).
import { startsWithLetter } from "./accountProfileCompleteness.ts";

export const NICKNAME_MAX_LENGTH = 40;

export type NicknameValidationFailureReason = "empty" | "invalid" | "tooLong";

export type NicknameValidationResult =
  | { ok: true; value: string }
  | { ok: false; reason: NicknameValidationFailureReason };

export function normalizeNicknameInput(raw: string): NicknameValidationResult {
  const value = raw.trim();

  if (!value) {
    return { ok: false, reason: "empty" };
  }

  if (value.length > NICKNAME_MAX_LENGTH) {
    return { ok: false, reason: "tooLong" };
  }

  if (!startsWithLetter(value)) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true, value };
}
