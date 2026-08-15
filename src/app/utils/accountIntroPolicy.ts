// Deliberately import-free at runtime (the one `import type { PageKey }`
// below is erased entirely by Node's native TypeScript stripping, so it
// carries no runtime dependency): scripts/tests/account/test-account-intro-popup.mjs loads
// this file directly that way (see storedLanguagePreferencePolicy.ts for why
// extensionless relative imports block that path for this project's other
// .ts modules). Keeping this file free of *runtime* dependencies is what
// lets the regression test exercise the real decision logic instead of a
// reimplementation of it.
//
// Owns the pure decisions behind the anonymous "account intro" popup, shared
// across its four trigger contexts:
//   1. shouldSignalAccountIntro - on the Languages page's Continue click,
//      should the one-time navigation signal be attached to the Filters
//      navigation at all? (language-setup only - the other contexts don't
//      navigate to trigger, see requestAccountIntro in
//      useAccountIntroPopup.ts.)
//   2. shouldShowAccountIntro - given a trigger has arrived for a given
//      context, and auth status is known, should the popup actually open
//      right now? Centralizes the frequency policy: a single global rolling
//      24-hour cooldown, shared across all four contexts (see
//      isWithinAccountIntroCooldown below) - not a permanent per-trigger
//      flag, and not a once-per-browser-session cap. Once any account-intro
//      popup has actually been shown, every trigger (including the same one
//      again) is suppressed until 24 hours have passed; after that, any
//      eligible trigger may show it again.
//   3. isAccountIntroSeoEligibleRoute / computeAccountIntroSeoActiveTotalMs /
//      foldAccountIntroSeoActiveSegment - the seo-engagement trigger's own
//      pure decisions (which routes count, and how cumulative active time
//      folds/resets), consumed by useAccountIntroSeoEngagement.ts. Kept
//      here rather than a separate module so there is exactly one place
//      that reasons about this feature's frequency policy end to end.
//
// "First-time" for language-setup is decided from whether a *complete*
// language pair was already in localStorage before this Continue click
// saved anything - deliberately captured before that save (see
// useStoredAppPreferences.ts's mount effect), never re-derived afterward,
// since by then localStorage is never empty. This is the trigger's only
// special-cased eligibility rule - it still goes through the same cooldown
// as the others once signaled.
import type { PageKey } from "./pageRouting";

export type AccountIntroContext =
  | "language-setup"
  | "practice-complete"
  | "level-test-complete"
  | "seo-engagement";

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

// --- seo-engagement trigger ------------------------------------------------
//
// Reuses the app's single canonical route classification (PageKey, computed
// by pageFromPath in pageRouting.ts) instead of re-deriving "is this an SEO
// page" from URL patterns a second time. The eligible set is exactly the
// PageKey values that exist ONLY for vocabulary-learning SEO content pages -
// every PageKey that is NOT part of the interactive RouteKey map (Languages,
// Filters, Exercises, practice, exam, About, Help, profile, Explore, ...)
// and is NOT the dev-only placeholder route or notFound:
//   - "vocabularyLevel"   CEFR-level vocabulary browse pages
//   - "levelTestSeo"      the Level Test's own SEO content page
//   - "verbListSeo"       common-100-verbs list pages
//   - "pastVerbFormsSeo"  verb past-forms pages
//   - "conjugatedVerbFormsSeo"  verb conjugation-by-pronoun pages
//   - "seoHub"            the SEO hub/index page
//   - "wordSeoHub"        the word-page hub/index
//   - "wordPage"          individual word detail pages
// Adding a future SEO route family only means adding its PageKey to this one
// set - nothing else in the trigger needs to change.
const ACCOUNT_INTRO_SEO_ELIGIBLE_PAGE_KEYS: ReadonlySet<PageKey> = new Set([
  "vocabularyLevel",
  "levelTestSeo",
  "verbListSeo",
  "pastVerbFormsSeo",
  "conjugatedVerbFormsSeo",
  "seoHub",
  "wordSeoHub",
  "wordPage",
] satisfies PageKey[]);

export function isAccountIntroSeoEligibleRoute(resolvedPage: PageKey): boolean {
  return ACCOUNT_INTRO_SEO_ELIGIBLE_PAGE_KEYS.has(resolvedPage);
}

// Named constant instead of a magic `60000` scattered through the codebase -
// the single source of truth for how much cumulative active SEO-page time
// triggers the popup.
export const ACCOUNT_INTRO_SEO_ACTIVE_TIME_THRESHOLD_MS = 60 * 1000;

export function hasAccountIntroSeoActiveTimeReachedThreshold(
  totalActiveMs: number,
): boolean {
  return totalActiveMs >= ACCOUNT_INTRO_SEO_ACTIVE_TIME_THRESHOLD_MS;
}

export interface ComputeAccountIntroSeoActiveTotalMsInput {
  // Cumulative active time already folded in from prior completed segments
  // (see foldAccountIntroSeoActiveSegment below) - what's currently persisted
  // in sessionStorage.
  accumulatedMs: number;
  // Epoch ms the currently-running active segment (eligible route, visible
  // tab) started, or null if no segment is currently running.
  activeSegmentStartedAtMs: number | null;
  nowMs: number;
}

// Pure timestamp math for "what would the total be right now if I ended the
// running segment this instant" - used both by the periodic threshold check
// (while a single long visit is still ongoing, with no route/visibility
// change to naturally end the segment) and is the same arithmetic
// foldAccountIntroSeoActiveSegment performs when a segment genuinely ends.
// Never assumes a timer tick equals exact elapsed wall-clock time - always
// derived from real timestamps.
export function computeAccountIntroSeoActiveTotalMs(
  input: ComputeAccountIntroSeoActiveTotalMsInput,
): number {
  const runningMs =
    input.activeSegmentStartedAtMs === null
      ? 0
      : Math.max(0, input.nowMs - input.activeSegmentStartedAtMs);
  return Math.max(0, input.accumulatedMs) + runningMs;
}

export interface FoldAccountIntroSeoActiveSegmentInput {
  previousAccumulatedMs: number;
  elapsedSegmentMs: number;
  // Whether the account-intro cooldown (see isWithinAccountIntroCooldown) is
  // currently active. Per the product requirement: engagement built up
  // during an active cooldown must not silently carry over and fire the
  // popup the instant the cooldown expires - so folding a segment while in
  // cooldown resets the accumulator to 0 instead of adding to it, and a
  // fresh 60 seconds is required once the cooldown has actually expired.
  isWithinCooldown: boolean;
}

export interface FoldAccountIntroSeoActiveSegmentResult {
  nextAccumulatedMs: number;
  hasReachedThreshold: boolean;
}

// Folds one just-ended active segment into the running total - the
// segment-end counterpart to computeAccountIntroSeoActiveTotalMs above.
export function foldAccountIntroSeoActiveSegment(
  input: FoldAccountIntroSeoActiveSegmentInput,
): FoldAccountIntroSeoActiveSegmentResult {
  if (input.isWithinCooldown) {
    return { nextAccumulatedMs: 0, hasReachedThreshold: false };
  }

  const nextAccumulatedMs =
    Math.max(0, input.previousAccumulatedMs) +
    Math.max(0, input.elapsedSegmentMs);

  return {
    nextAccumulatedMs,
    hasReachedThreshold: hasAccountIntroSeoActiveTimeReachedThreshold(nextAccumulatedMs),
  };
}
