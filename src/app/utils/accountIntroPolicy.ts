// Deliberately import-free: scripts/tests/account/test-account-intro-popup.mjs loads this
// file directly via Node's native TypeScript stripping (see
// storedLanguagePreferencePolicy.ts for why extensionless relative imports
// block that path). Keeping this file dependency-free is what lets the
// regression test exercise the real decision logic instead of a
// reimplementation of it.
//
// Owns the pure decisions behind the anonymous "account intro" popup, shared
// across its three trigger contexts:
//   1. shouldSignalAccountIntro - on the Languages page's Continue click,
//      should the one-time navigation signal be attached to the Filters
//      navigation at all? (language-setup only - the other two contexts
//      don't navigate to trigger, see requestAccountIntro in
//      useAccountIntroPopup.ts.)
//   2. shouldShowAccountIntro - given a trigger has arrived for a given
//      context, and auth status is known, should the popup actually open
//      right now? Centralizes the frequency policy: a single global rolling
//      24-hour cooldown, shared across all three contexts (see
//      isWithinAccountIntroCooldown below) - not a permanent per-trigger
//      flag, and not a once-per-browser-session cap. Once any account-intro
//      popup has actually been shown, every trigger (including the same one
//      again) is suppressed until 24 hours have passed; after that, any
//      eligible trigger may show it again.
//
// "First-time" for language-setup is decided from whether a *complete*
// language pair was already in localStorage before this Continue click
// saved anything - deliberately captured before that save (see
// useStoredAppPreferences.ts's mount effect), never re-derived afterward,
// since by then localStorage is never empty. This is the trigger's only
// special-cased eligibility rule - it still goes through the same cooldown
// as the other two once signaled.

export type AccountIntroContext =
  | "language-setup"
  | "practice-complete"
  | "level-test-complete";

// The contexts that can be requested imperatively via useAccountIntroPopup's
// requestAccountIntro() - i.e. every context except "language-setup", which
// only ever arrives via the Languages page's router-state signal (see
// shouldSignalAccountIntro below).
export type RequestableAccountIntroContext = Exclude<
  AccountIntroContext,
  "language-setup"
>;

export interface ShouldSignalAccountIntroInput {
  isAuthenticated: boolean;
  // Whether a complete native+learning language pair was already stored in
  // localStorage before this Continue click's save - i.e. hasCompleteLanguagePair
  // (see languageProfileSyncPolicy.ts) applied to the *pre-save* stored pair.
  hadCompleteStoredLanguagePairBeforeSetup: boolean;
}

export function shouldSignalAccountIntro(
  input: ShouldSignalAccountIntroInput,
): boolean {
  return (
    !input.isAuthenticated && !input.hadCompleteStoredLanguagePairBeforeSetup
  );
}

// Named constant instead of a magic `24 * 60 * 60 * 1000` scattered through
// the codebase - the single source of truth for how long the popup stays
// suppressed after actually being shown.
export const ACCOUNT_INTRO_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export interface IsWithinAccountIntroCooldownInput {
  // Epoch milliseconds the account-intro popup (any context) was last
  // genuinely shown, or null if it has never been shown / the stored value
  // is missing or unparsable - see accountIntroStorage.ts's
  // readAccountIntroLastShownAtMs, the sole producer of this value.
  lastShownAtMs: number | null;
  // Caller-supplied "now" (Date.now() in production) rather than read here,
  // so this stays pure and tests can use controllable timestamps instead of
  // real waiting/timeouts.
  nowMs: number;
}

// Pure cooldown-window check, kept separate from shouldShowAccountIntro
// below so it's directly testable against every boundary (just under 24h,
// exactly 24h, just over) without also having to thread auth state through.
export function isWithinAccountIntroCooldown(
  input: IsWithinAccountIntroCooldownInput,
): boolean {
  if (input.lastShownAtMs === null) {
    return false;
  }

  const elapsedMs = input.nowMs - input.lastShownAtMs;
  // A negative elapsed time means the stored timestamp is in the future -
  // impossible from a genuine write (see markAccountIntroShown, which always
  // writes the current time), so this can only be a corrupted/clock-skewed
  // value. Treating it as "not in cooldown" is what stops a corrupted future
  // timestamp from suppressing the popup indefinitely, per the product
  // requirement.
  if (elapsedMs < 0) {
    return false;
  }

  return elapsedMs < ACCOUNT_INTRO_COOLDOWN_MS;
}

export interface ShouldShowAccountIntroInput {
  context: AccountIntroContext;
  // False while auth status has not been read from storage yet - the popup
  // must never open (even for a moment) until this is true, so a signed-in
  // user is never shown it, not even for a single frame.
  isAuthResolved: boolean;
  isAuthenticated: boolean;
  lastShownAtMs: number | null;
  nowMs: number;
}

export function shouldShowAccountIntro(
  input: ShouldShowAccountIntroInput,
): boolean {
  if (!input.isAuthResolved || input.isAuthenticated) {
    return false;
  }
  return !isWithinAccountIntroCooldown({
    lastShownAtMs: input.lastShownAtMs,
    nowMs: input.nowMs,
  });
}
