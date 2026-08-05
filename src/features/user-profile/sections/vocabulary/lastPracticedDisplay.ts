// Pure relative-date classification for user_word_progress.last_practiced_at,
// used by the Vocabulary table/mobile-card "Last practised" column. Kept
// import-free (only the Date global) so it stays loadable directly via
// `node --experimental-strip-types` for
// scripts/tests/learning/test-last-practiced-display.mjs.
//
// Deliberately coarse (today/yesterday/N days ago/never) rather than a full
// date-formatting library â€” nothing here needs more precision than that.
export type LastPracticedDisplay =
  | { kind: "never" }
  | { kind: "today" }
  | { kind: "yesterday" }
  | { kind: "daysAgo"; days: number };

// Compares local calendar dates, not raw millisecond deltas — otherwise a
// word practiced at 11pm yesterday and viewed at 1am today could read as
// "0 days ago" instead of "Yesterday" depending on time-of-day, not calendar
// day.
function toLocalCalendarDateOnly(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function computeLastPracticedDisplay(
  lastPracticedAtISO: string | null | undefined,
  now: Date = new Date(),
): LastPracticedDisplay {
  if (!lastPracticedAtISO) {
    return { kind: "never" };
  }

  const lastPracticedAt = new Date(lastPracticedAtISO);
  if (Number.isNaN(lastPracticedAt.getTime())) {
    return { kind: "never" };
  }

  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round(
    (toLocalCalendarDateOnly(now).getTime() - toLocalCalendarDateOnly(lastPracticedAt).getTime()) / dayMs,
  );

  // A future/clock-skew timestamp defensively reads as "Today" rather than
  // a nonsensical negative day count.
  if (diffDays <= 0) {
    return { kind: "today" };
  }
  if (diffDays === 1) {
    return { kind: "yesterday" };
  }
  return { kind: "daysAgo", days: diffDays };
}
