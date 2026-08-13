// Centralized, SSR-safe storage access for the anonymous "account intro"
// popup's frequency policy (see accountIntroPolicy.ts for the pure 24-hour
// cooldown decision this feeds): a single global rolling cooldown, keyed off
// the last time ANY account-intro popup (any of the three trigger contexts)
// was genuinely shown.
//
// One localStorage key, one value: an epoch-millisecond timestamp string.
// localStorage (not sessionStorage) specifically because the cooldown must
// survive page refresh, tab close, and browser restart.
//
// Superseded by this cooldown (do not resurrect): a sessionStorage "shown
// this browser session" flag (a once-per-session cap - the 24h cooldown
// already covers that case, since a session obviously can't outlast 24
// hours' worth of browsing in the way this product cares about), and a
// localStorage per-context "shown forever" record (permanent suppression,
// which is exactly what this change replaces). Neither legacy key is read
// by anything below anymore, so they can no longer suppress any trigger
// even if still present in a returning visitor's browser; markAccountIntroShown
// also best-effort deletes them so they don't linger forever once this
// module runs again for that browser.
const LAST_SHOWN_AT_KEY = "fluentstellar.accountIntro.lastShownAt";

// Legacy keys from the superseded session-cap / permanent-per-context-flag
// policy - see header above. Intentionally never read.
const LEGACY_SESSION_SHOWN_KEY = "fluentstellar.accountIntro.session";
const LEGACY_SHOWN_RECORD_KEY = "fluentstellar.accountIntro.shown.v1";

function canUseLocalStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function canUseSessionStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.sessionStorage !== "undefined"
  );
}

// Parsing/validation is centralized here: returns a finite epoch-millisecond
// number, or null for "never shown" - covers missing, empty, non-numeric,
// and non-finite (NaN/Infinity) stored values alike, so a corrupt value can
// never crash the app and always fails safe toward "eligible" (see
// accountIntroPolicy.ts's isWithinAccountIntroCooldown, the sole consumer of
// this return value, for how null and out-of-range timestamps are handled).
export function readAccountIntroLastShownAtMs(): number | null {
  if (!canUseLocalStorage()) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(LAST_SHOWN_AT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// The single write path for this feature's storage - called exactly once,
// at the moment the popup is genuinely shown (see useAccountIntroPopup.ts),
// never merely because a trigger became eligible.
export function markAccountIntroShown(nowMs: number): void {
  if (canUseLocalStorage()) {
    try {
      window.localStorage.setItem(LAST_SHOWN_AT_KEY, String(nowMs));
    } catch {
      // Best-effort only - a write failure here must not break the popup.
    }
    try {
      window.localStorage.removeItem(LEGACY_SHOWN_RECORD_KEY);
    } catch {
      // Best-effort only.
    }
  }
  if (canUseSessionStorage()) {
    try {
      window.sessionStorage.removeItem(LEGACY_SESSION_SHOWN_KEY);
    } catch {
      // Best-effort only.
    }
  }
}
