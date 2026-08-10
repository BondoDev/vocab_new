// Dashboard Phase 1's pure greeting helper — kept free of React, the app's
// t() lookup, and any other module import (like dailyStreak.ts/
// todayProgressDisplay.ts) so it stays loadable directly via
// `node --experimental-strip-types` for
// scripts/tests/learning/test-dashboard-greeting-period.mjs without
// rendering a component, loading a locale file, or requiring the raw Node
// ESM loader to resolve a second relative import.
//
// Time-of-day is device-local only (Date#getHours()) for this first version
// — there is no per-user timezone-aware "local time of day" concept yet.
// user_profiles.timezone (see src/lib/userProfile.ts) exists and is already
// used for the Learning/Progress sections' "today" boundary, but wiring the
// dashboard greeting to it is left for a later phase per the Phase 1 brief.
//
// The {name} interpolation this greeting also needs lives in
// src/lib/interpolateTemplate.ts (shared with the Dashboard hero card's
// {count} messages, added in a later phase) — imported directly by
// DashboardSection.tsx rather than re-exported from here, for the same
// import-free reason.
export type DashboardGreetingPeriod = "morning" | "afternoon" | "evening";

// Morning   05:00–11:59
// Afternoon 12:00–17:59
// Evening   18:00–04:59 (wraps past midnight)
export function getDashboardGreetingPeriod(hour: number): DashboardGreetingPeriod {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}
