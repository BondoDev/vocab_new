// Dashboard Phase 1's pure greeting helpers — kept free of React and of the
// project's t() lookup so the hour-range logic can be unit tested directly
// (see scripts/tests/learning/test-dashboard-greeting-period.mjs) without
// rendering a component or loading a locale file.
//
// Time-of-day is device-local only (Date#getHours()) for this first version
// — there is no per-user timezone-aware "local time of day" concept yet.
// user_profiles.timezone (see src/lib/userProfile.ts) exists and is already
// used for the Learning/Progress sections' "today" boundary, but wiring the
// dashboard greeting to it is left for a later phase per the Phase 1 brief.
export type DashboardGreetingPeriod = "morning" | "afternoon" | "evening";

// Morning   05:00–11:59
// Afternoon 12:00–17:59
// Evening   18:00–04:59 (wraps past midnight)
export function getDashboardGreetingPeriod(hour: number): DashboardGreetingPeriod {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

// Minimal {token} substitution for the one dynamic value the dashboard
// greeting needs (the user's nickname). The project's t() function
// (src/contexts/LanguageContext.tsx) does plain flat-key lookup only and
// has no interpolation support of its own, so this stays a tiny standalone
// helper rather than a change to LanguageContextType's signature. A token
// with no matching value is left in place rather than silently dropped.
export function interpolateTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}
