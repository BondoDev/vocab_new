// Pure age-control helpers for AccountOnboardingDialog.tsx, split out for
// the same reason accountOnboarding.ts/accountProfileCompleteness.ts already
// are (see those files' own headers): AccountOnboardingDialog.tsx is a .tsx
// component (JSX + React hooks), which Node's native TypeScript stripping
// cannot load directly, so any logic that needs a real executable
// regression test - not just a source-text regex assertion - has to live in
// a plain, JSX-free .ts module like this one instead.
//
// Introduced by the age default-state fix (2026-08-13): the age control
// always *displays* 18 the moment it mounts with no age recorded yet, but
// the form's authoritative profile.age used to stay null until onChange
// fired, so a brand-new user who left the control untouched failed "Please
// set your age" despite the field visibly showing 18.
// resolveOnboardingAgeDefault is the single source of truth for that
// default, used by AccountOnboardingDialog.tsx both for the input's initial
// display string and for the effect that pushes it into the form's
// authoritative state on open - so the two can never drift apart again.
// clampOnboardingAge is the min/max range clamp used by the step buttons.
//
// Minimum registration age (2026-11-05): new registrations and age edits
// must be 16-100. The backend enforces the same bound in
// complete_user_profile_onboarding / update_user_profile_demographics
// (supabase/migrations/20261105120000_enforce_minimum_registration_age_16.sql).
// Accounts created under the earlier 10-100 rule keep their stored age:
// the user_profiles CHECK constraint and normalizeAge
// (accountProfileCompleteness.ts) still accept 10-100, so those accounts
// are never treated as incomplete or blocked from signing in, and Settings
// may save their unchanged legacy age (isAllowedProfileAge).

export const ONBOARDING_MIN_AGE = 16;
export const ONBOARDING_MAX_AGE = 100;
export const DEFAULT_ONBOARDING_AGE = 18;

export function clampOnboardingAge(value: number): number {
  return Math.min(
    ONBOARDING_MAX_AGE,
    Math.max(ONBOARDING_MIN_AGE, Math.round(value)),
  );
}

export type OnboardingAgeIssue = "belowMinimum" | "aboveMaximum" | "notWholeNumber";

// Typed values are validated, never silently clamped: clamping 12 up to 16
// would register an under-age visitor without telling them why.
export function getOnboardingAgeIssue(age: number): OnboardingAgeIssue | null {
  if (!Number.isFinite(age) || !Number.isInteger(age)) return "notWholeNumber";
  if (age < ONBOARDING_MIN_AGE) return "belowMinimum";
  if (age > ONBOARDING_MAX_AGE) return "aboveMaximum";
  return null;
}

// Settings variant: an age within 16-100, or the caller's own unchanged
// stored age (a pre-16-rule account editing only its birth date). Mirrors
// update_user_profile_demographics' server-side rule exactly.
export function isAllowedProfileAge(age: number, storedAge: number | null): boolean {
  return getOnboardingAgeIssue(age) === null || (storedAge !== null && age === storedAge);
}

export function resolveOnboardingAgeDefault(age: number | null): number {
  return age ?? DEFAULT_ONBOARDING_AGE;
}
