// Analytics consent, backed entirely by Cloudflare Zaraz's Consent API.
//
// Ownership: Zaraz is the only consent record. Its first-party cookie
// (`zaraz-consent`, JSON `{ "<purposeId>": true | false }`) is written by
// `zaraz.consent.set()`, and Zaraz's edge reads it to decide whether GA4 may
// run for each event. Nothing here keeps a parallel flag in localStorage or
// Supabase, so the banner can never disagree with what Zaraz enforces.
//
// Framework-free and SSR-safe: every browser global is guarded, so importing
// this module during server rendering is harmless. The React UI is
// src/app/components/layout/AnalyticsConsentBanner.tsx.

// The Analytics purpose configured in the Cloudflare dashboard (Zaraz >
// Consent > Purposes). GA4 is assigned to it. Discovered from the live Zaraz
// bundle (`zaraz.consent.purposes`); if the purpose is ever recreated in the
// dashboard its id changes and this constant must be updated —
// isAnalyticsPurposeConfigured() keeps the banner hidden instead of throwing.
export const ANALYTICS_PURPOSE_ID = "pUVR";

// Custom cookie name set in the Zaraz consent settings (the Zaraz default
// would be `cf_consent`).
export const ZARAZ_CONSENT_COOKIE = "zaraz-consent";

// Dispatched on `document` by the footer's "Cookie Preferences" control and
// handled by the single banner instance mounted in App.tsx.
export const OPEN_COOKIE_PREFERENCES_EVENT = "fluentstellar:open-cookie-preferences";

// "unset" (no recorded choice) must stay distinct from "denied": only
// "unset" shows the first-visit banner. Neither ever implies consent.
export type AnalyticsConsentState = "granted" | "denied" | "unset";

interface ZarazConsentApi {
  APIReady?: boolean;
  purposes?: Record<string, unknown>;
  set: (preferences: Record<string, boolean>) => void;
  sendQueuedEvents?: () => void;
}

function getZarazConsentApi(): ZarazConsentApi | null {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (window as Window & { zaraz?: { consent?: ZarazConsentApi } }).zaraz?.consent;
  return api && api.APIReady === true && typeof api.set === "function" ? api : null;
}

export function isAnalyticsPurposeConfigured(): boolean {
  const api = getZarazConsentApi();
  // `purposes` is documented but optional in our typing; when present it is
  // authoritative, and set() throws for an unknown purpose id.
  return !!api && (!api.purposes || ANALYTICS_PURPOSE_ID in api.purposes);
}

const currentCookieString = (): string =>
  typeof document === "undefined" ? "" : document.cookie;

interface ConsentRecord {
  state: AnalyticsConsentState;
  // The cookie exists but is not a JSON object. Zaraz's own set() parses
  // the existing cookie before merging and throws on such a value, so a
  // malformed record would block every save until it is removed.
  malformed: boolean;
}

// Reads the choice straight from Zaraz's cookie. zaraz.consent.get() cannot
// be used for this: the live implementation fills every missing purpose
// with `false`, so it reports "declined" for a visitor who never chose.
//
// Only a literal boolean counts as a decision. A missing cookie, a record
// without this purpose (other purposes only, `{}`), or a non-boolean value
// is "unset": the visitor is asked again and consent is never assumed. The
// first matching cookie wins, the same rule Zaraz's script uses.
export function parseConsentRecord(cookieString: string): ConsentRecord {
  const prefix = `${ZARAZ_CONSENT_COOKIE}=`;
  const entry = cookieString
    .split(/;\s*/)
    .find((part) => part.startsWith(prefix));
  if (!entry) {
    return { state: "unset", malformed: false };
  }

  try {
    const raw = entry.slice(prefix.length);
    // Zaraz writes raw JSON; tolerate an encoded value as well.
    const parsed: unknown = JSON.parse(raw.startsWith("%7B") ? decodeURIComponent(raw) : raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { state: "unset", malformed: true };
    }
    const value = (parsed as Record<string, unknown>)[ANALYTICS_PURPOSE_ID];
    if (value === true) return { state: "granted", malformed: false };
    if (value === false) return { state: "denied", malformed: false };
    return { state: "unset", malformed: false };
  } catch {
    return { state: "unset", malformed: true };
  }
}

export function readAnalyticsConsent(
  cookieString: string = currentCookieString(),
): AnalyticsConsentState {
  return parseConsentRecord(cookieString).state;
}

// Runs `callback` once the Consent API exists — immediately if Zaraz has
// already loaded, otherwise on `zarazConsentAPIReady`. If Zaraz never loads
// (blocked, local dev, preview hosts outside the zone) the callback never
// runs, which is safe: without Zaraz no analytics run at all.
export function onZarazConsentReady(callback: () => void): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }
  if (getZarazConsentApi()) {
    callback();
    return () => {};
  }
  const handleReady = () => callback();
  document.addEventListener("zarazConsentAPIReady", handleReady, { once: true });
  return () => document.removeEventListener("zarazConsentAPIReady", handleReady);
}

// Saves the visitor's choice through Zaraz. Only ever called for an explicit
// click; no code path writes consent on the visitor's behalf. Returns true
// only once the cookie reads back as the requested value, so callers (the
// withdrawal reload in particular) never act on an unsaved choice. Returns
// false when the API is unavailable or the save did not take.
export function saveAnalyticsConsent(granted: boolean): boolean {
  const api = getZarazConsentApi();
  if (!api || !isAnalyticsPurposeConfigured()) {
    return false;
  }
  const expected: AnalyticsConsentState = granted ? "granted" : "denied";

  try {
    try {
      api.set({ [ANALYTICS_PURPOSE_ID]: granted });
    } catch (error) {
      // Recover only from an unparseable record (see ConsentRecord). A
      // parseable record — including a valid rejection — is never removed.
      if (!parseConsentRecord(currentCookieString()).malformed) {
        throw error;
      }
      expireCookie(ZARAZ_CONSENT_COOKIE);
      api.set({ [ANALYTICS_PURPOSE_ID]: granted });
    }
    if (readAnalyticsConsent() !== expected) {
      return false;
    }
    if (granted) {
      // Zaraz holds back the current page's pageview while consent is
      // missing; this releases it so GA4 records the page the visitor
      // accepted on. Its own default modal does this on close.
      api.sendQueuedEvents?.();
    } else {
      clearGoogleAnalyticsCookies();
    }
    return true;
  } catch {
    return false;
  }
}

// Best-effort removal of GA client-id cookies on withdrawal. Zaraz stops
// sending GA4 events as soon as the consent cookie says `false`; this only
// removes identifiers left over from an earlier acceptance. Cookies marked
// HttpOnly, or set on a domain we don't try here, cannot be removed from JS.
function clearGoogleAnalyticsCookies(): void {
  if (typeof document === "undefined" || typeof location === "undefined") {
    return;
  }
  document.cookie
    .split(/;\s*/)
    .map((part) => part.split("=")[0])
    .filter((name) => name === "_ga" || name.startsWith("_ga_"))
    .forEach(expireCookie);
}

// Expires a cookie for the current host and every parent domain (e.g.
// www.fluentstellar.com and fluentstellar.com, where Zaraz scopes its
// consent cookie), since JS cannot tell which domain a cookie was set on.
function expireCookie(name: string): void {
  if (typeof document === "undefined" || typeof location === "undefined") {
    return;
  }
  const hostParts = location.hostname.split(".");
  const domains = [""];
  for (let index = 0; index < hostParts.length - 1; index += 1) {
    domains.push(`; domain=.${hostParts.slice(index).join(".")}`);
  }
  for (const domain of domains) {
    document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
  }
}

export function openCookiePreferences(): void {
  if (typeof document !== "undefined") {
    document.dispatchEvent(new Event(OPEN_COOKIE_PREFERENCES_EVENT));
  }
}
