// This project's tsconfig targets ES2020 lib (see tsconfig.json), which has
// no ambient type for Intl.supportedValuesOf (an ES2022 API) even though the
// runtimes this app actually ships to support it. Narrow augmentation here
// instead of widening the project-wide `lib` target for one optional,
// already runtime-guarded call (see getSupportedTimezones below).
declare global {
  namespace Intl {
    function supportedValuesOf(key: string): string[];
  }
}

// Pure timezone-list logic for the Settings "Time & Region" section — no
// React, no Supabase — kept Node-testable the same way
// languageProfileSyncPolicy.ts/accountProfile.ts are (this file is imported
// directly by scripts/tests/account/test-timezone-options.mjs).
//
// Source of truth for "every selectable IANA timezone" is the platform
// itself (Intl.supportedValuesOf("timeZone")), not a hand-maintained list —
// per this task's own instruction to prefer a runtime-supplied source over a
// manually maintained database. FALLBACK_TIMEZONES below only exists for the
// (today, rare) runtime that lacks Intl.supportedValuesOf — Node 18+ and
// every evergreen browser this app already targets (Vite's default
// browserslist) support it, but older WebViews/Safari-before-15.4 do not.

// Deliberately small: one representative, well-known city per broad
// UTC-offset band, so the timezone selector still has *something* useful to
// search/pick from on a runtime without Intl.supportedValuesOf, without
// trying to hand-maintain the platform's own ~400-zone IANA database. Every
// entry here is also a real, valid IANA identifier on its own.
const FALLBACK_TIMEZONES: readonly string[] = [
  "Pacific/Midway",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Argentina/Buenos_Aires",
  "Atlantic/Azores",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Athens",
  "Europe/Moscow",
  "Asia/Tbilisi",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

// Runtime support check, per this task's own instruction to verify before
// relying on Intl.supportedValuesOf. Wrapped in try/catch: the call itself
// (not just the property lookup) is what can throw on an engine that
// declares the method but rejects the "timeZone" key.
export function getSupportedTimezones(): string[] {
  if (typeof Intl !== "undefined" && typeof Intl.supportedValuesOf === "function") {
    try {
      const values = Intl.supportedValuesOf("timeZone");
      if (Array.isArray(values) && values.length > 0) {
        // "UTC" is a valid IANA zone in its own right, but at least one
        // real ICU build this app runs on (Node's bundled ICU) omits it
        // (and its "Etc/UTC" alias) from supportedValuesOf entirely —
        // confirmed by this file's own test suite. Always keep it
        // selectable rather than depending on a particular build's
        // link-inclusion policy.
        return values.includes("UTC") ? values : [...values, "UTC"];
      }
    } catch {
      // fall through to the static fallback below
    }
  }

  return [...FALLBACK_TIMEZONES];
}

// "Asia/Tbilisi" -> "Tbilisi"; "America/Argentina/Buenos_Aires" -> "Buenos
// Aires"; "UTC" -> "UTC". Underscores are IANA's own space-encoding, not
// meaningful punctuation, so they're always rendered as spaces.
export function getTimezoneCityLabel(timezone: string): string {
  const segments = timezone.split("/");
  const city = segments[segments.length - 1] ?? timezone;
  return city.replace(/_/g, " ");
}

// Everything before the final "/" ("Asia", "America/Argentina"), or "" for a
// bare identifier like "UTC" that has no region segment.
export function getTimezoneRegionLabel(timezone: string): string {
  const lastSlash = timezone.lastIndexOf("/");
  if (lastSlash === -1) {
    return "";
  }
  return timezone.slice(0, lastSlash).replace(/_/g, " ");
}

// Computes this specific zone's own UTC offset for the given instant (default
// now) — never the browser's own local offset reused for an arbitrary
// selected zone. Date-sensitive on purpose: "Europe/Berlin" is UTC+1 in
// January and UTC+2 in July (DST), and formatting against the supplied date
// is what keeps this correct instead of hardcoding a single offset per zone.
// Returns a normalized "UTC+4" / "UTC-5" / "UTC+5:30" string, or null if this
// runtime/zone combination can't be formatted (unsupported zone id, ancient
// engine with no timeZoneName support).
export function formatTimezoneOffset(timezone: string, referenceDate: Date = new Date()): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    }).formatToParts(referenceDate);

    const offsetPart = parts.find((part) => part.type === "timeZoneName")?.value;
    if (!offsetPart) {
      return null;
    }

    // Intl yields "GMT+4" / "GMT+5:30" / "GMT" (for UTC itself) — normalized
    // to this app's own "UTC±" wording rather than echoing "GMT" verbatim.
    if (offsetPart === "GMT" || offsetPart === "UTC") {
      return "UTC+0";
    }

    const match = /^GMT([+-]\d+(?::\d{2})?)$/.exec(offsetPart);
    if (!match) {
      return null;
    }

    return `UTC${match[1]}`;
  } catch {
    return null;
  }
}

export interface TimezoneOption {
  id: string;
  city: string;
  region: string;
  offsetLabel: string | null;
}

// Builds the full selectable option list, sorted alphabetically by id so the
// result is deterministic (and easy to assert against in tests) rather than
// depending on Intl.supportedValuesOf's own (already-sorted, but
// unspecified-by-contract) ordering.
export function buildTimezoneOptions(referenceDate: Date = new Date()): TimezoneOption[] {
  return getSupportedTimezones()
    .map((id) => ({
      id,
      city: getTimezoneCityLabel(id),
      region: getTimezoneRegionLabel(id),
      offsetLabel: formatTimezoneOffset(id, referenceDate),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

// Case-insensitive substring match against the identifier, the city name, the
// region, and the offset label — a search for "tbil", "asia", "georgia"'s
// capital, or "+4" should all be able to find "Asia/Tbilisi".
export function filterTimezoneOptions(options: TimezoneOption[], query: string): TimezoneOption[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return options;
  }

  return options.filter((option) => {
    const haystack = `${option.id} ${option.city} ${option.region} ${option.offsetLabel ?? ""}`.toLowerCase();
    return haystack.includes(normalizedQuery);
  });
}
