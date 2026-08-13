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
// clampOnboardingAge is the pre-existing min/max range clamp, moved here
// unchanged (still 10-100, still rounds) so this fix doesn't touch its
// behavior at all.

export const ONBOARDING_MIN_AGE = 10;
export const ONBOARDING_MAX_AGE = 100;
export const DEFAULT_ONBOARDING_AGE = 18;

export function clampOnboardingAge(value: number): number {
  return Math.min(
    ONBOARDING_MAX_AGE,
    Math.max(ONBOARDING_MIN_AGE, Math.round(value)),
  );
}

export function resolveOnboardingAgeDefault(age: number | null): number {
  return age ?? DEFAULT_ONBOARDING_AGE;
}
