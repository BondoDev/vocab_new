// "Stay on this page after signing in" across a Google OAuth round-trip.
//
// Login normally ends on the profile dashboard (Header's password/signup
// success path, and App's useSupabaseAuthRedirect onSessionEstablished).
// Pages that open the login dialog to finish an in-page action (e.g. the
// full vocabulary list's "Add to list") ask Header to stay put instead.
// Password/signup logins happen in place, so Header just skips the
// redirect; Google OAuth reloads the page, so the request is parked here
// and consumed once by the redirect handler. Scoped to the exact pathname
// and short-lived, so an abandoned attempt can't redirect-suppress a later,
// unrelated login.
const STORAGE_KEY = "auth.stayOnPageAfterLogin";
const MAX_AGE_MS = 15 * 60 * 1000;

interface StayOnPageRecord {
  pathname: string;
  savedAt: number;
}

export function markStayOnPageAfterOAuth(pathname: string): void {
  try {
    const record: StayOnPageRecord = { pathname, savedAt: Date.now() };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable (private mode, quota): the login still works, it
    // just ends on the dashboard as usual.
  }
}

// True (and clears the record) when a stay-on-page request exists for this
// pathname and hasn't expired.
export function consumeStayOnPageAfterOAuth(pathname: string): boolean {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }
    window.sessionStorage.removeItem(STORAGE_KEY);
    const record = JSON.parse(raw) as Partial<StayOnPageRecord>;
    return record.pathname === pathname && typeof record.savedAt === "number" && Date.now() - record.savedAt < MAX_AGE_MS;
  } catch {
    return false;
  }
}
