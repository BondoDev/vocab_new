// Pure aggregation for the Dashboard's Study Activity card: turns a flat
// list of per-day (new_words_completed, reviews_completed) stat rows into
// display-ready buckets for one of four ranges (7d/30d/90d/all), filling
// missing dates with zero rather than leaving gaps. Deterministic and
// import-free except for addDaysISO (see below), so it stays loadable
// directly via `node --experimental-strip-types` for
// scripts/tests/learning/test-study-activity.mjs.
//
// Aggregation policy (see the Dashboard Phase 3 brief):
//   7d / 30d  -> one bucket per calendar day (no aggregation).
//   90d       -> one bucket per 7-day week, most recent week first-computed
//                but returned oldest-first; the oldest bucket may cover
//                fewer than 7 days only if 90 isn't a multiple of 7 (it
//                isn't: 90 = 12*7 + 6, so the oldest bucket covers 6 days).
//   all       -> one bucket per calendar month, from the earliest stat
//                row's month (or today's month, if there is no history at
//                all) through the current month.
//
// Only addDaysISO is reused from dailyStreak.ts (plain UTC date-only
// arithmetic on a YYYY-MM-DD string) — same "one pure sibling import is
// fine, everything else stays free of imports" precedent already
// established by milestoneStreak.ts.
import { addDaysISO } from "./dailyStreak.ts";

export type StudyActivityRange = "7d" | "30d" | "90d" | "all";
export type StudyActivityBucketKind = "day" | "week" | "month";

export interface StudyActivityDailyStat {
  // YYYY-MM-DD, matching user_daily_stats.stat_date.
  dateISO: string;
  newWordsCompleted: number;
  reviewsCompleted: number;
}

export interface StudyActivityBucket {
  // Stable, sortable identifier: the bucket's own start date (day/week) or
  // "YYYY-MM" (month).
  key: string;
  kind: StudyActivityBucketKind;
  startDateISO: string;
  endDateISO: string;
  newWords: number;
  reviews: number;
}

function buildStatsByDate(
  stats: readonly StudyActivityDailyStat[],
): Map<string, { newWords: number; reviews: number }> {
  const map = new Map<string, { newWords: number; reviews: number }>();
  for (const stat of stats) {
    map.set(stat.dateISO, { newWords: stat.newWordsCompleted, reviews: stat.reviewsCompleted });
  }
  return map;
}

// Inclusive sum over [startISO, endISO] — missing dates contribute zero
// rather than being skipped, so a bucket's totals never silently omit a
// day just because user_daily_stats has no row for it.
function sumRange(
  statsByDate: Map<string, { newWords: number; reviews: number }>,
  startISO: string,
  endISO: string,
): { newWords: number; reviews: number } {
  let newWords = 0;
  let reviews = 0;
  let cursor = startISO;
  while (cursor <= endISO) {
    const stat = statsByDate.get(cursor);
    if (stat) {
      newWords += stat.newWords;
      reviews += stat.reviews;
    }
    cursor = addDaysISO(cursor, 1);
  }
  return { newWords, reviews };
}

function buildDailyBuckets(
  statsByDate: Map<string, { newWords: number; reviews: number }>,
  todayISO: string,
  days: number,
): StudyActivityBucket[] {
  const buckets: StudyActivityBucket[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dateISO = addDaysISO(todayISO, -i);
    const stat = statsByDate.get(dateISO);
    buckets.push({
      key: dateISO,
      kind: "day",
      startDateISO: dateISO,
      endDateISO: dateISO,
      newWords: stat?.newWords ?? 0,
      reviews: stat?.reviews ?? 0,
    });
  }
  return buckets;
}

// Chunks `days` calendar days ending at todayISO into 7-day weeks, working
// backward from today so the most recent bucket always ends exactly on
// todayISO; only the oldest bucket may be shorter than 7 days (when `days`
// isn't a multiple of 7). Returned oldest-first.
function buildWeeklyBuckets(
  statsByDate: Map<string, { newWords: number; reviews: number }>,
  todayISO: string,
  days: number,
): StudyActivityBucket[] {
  const chunks: Array<{ startISO: string; endISO: string }> = [];
  let endISO = todayISO;
  let remaining = days;

  while (remaining > 0) {
    const chunkLength = Math.min(7, remaining);
    const startISO = addDaysISO(endISO, -(chunkLength - 1));
    chunks.push({ startISO, endISO });
    remaining -= chunkLength;
    endISO = addDaysISO(startISO, -1);
  }

  chunks.reverse();

  return chunks.map(({ startISO, endISO: chunkEndISO }) => {
    const sum = sumRange(statsByDate, startISO, chunkEndISO);
    return {
      key: startISO,
      kind: "week" as const,
      startDateISO: startISO,
      endDateISO: chunkEndISO,
      newWords: sum.newWords,
      reviews: sum.reviews,
    };
  });
}

function getMonthKey(dateISO: string): string {
  return dateISO.slice(0, 7);
}

function firstOfMonthISO(monthKey: string): string {
  return `${monthKey}-01`;
}

function addMonths(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) + delta;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
}

// One bucket per calendar month from the earliest stat row's month through
// today's month (inclusive). With no history at all, returns a single
// current-month bucket with zero totals rather than an empty array, so the
// "All time" view always has at least one (honestly zero) point to render.
function buildMonthlyBuckets(
  stats: readonly StudyActivityDailyStat[],
  todayISO: string,
): StudyActivityBucket[] {
  const todayMonthKey = getMonthKey(todayISO);

  if (stats.length === 0) {
    return [
      {
        key: todayMonthKey,
        kind: "month",
        startDateISO: firstOfMonthISO(todayMonthKey),
        endDateISO: todayISO,
        newWords: 0,
        reviews: 0,
      },
    ];
  }

  const statsByDate = buildStatsByDate(stats);
  const earliestDateISO = stats.reduce(
    (earliest, stat) => (stat.dateISO < earliest ? stat.dateISO : earliest),
    stats[0].dateISO,
  );

  const buckets: StudyActivityBucket[] = [];
  let cursorMonthKey = getMonthKey(earliestDateISO);

  // Bounded by construction: cursorMonthKey strictly advances by one month
  // each iteration and the loop stops the instant it reaches todayMonthKey.
  while (true) {
    const isCurrentMonth = cursorMonthKey === todayMonthKey;
    const startDateISO = firstOfMonthISO(cursorMonthKey);
    const endDateISO = isCurrentMonth ? todayISO : addDaysISO(firstOfMonthISO(addMonths(cursorMonthKey, 1)), -1);
    const sum = sumRange(statsByDate, startDateISO, endDateISO);

    buckets.push({
      key: cursorMonthKey,
      kind: "month",
      startDateISO,
      endDateISO,
      newWords: sum.newWords,
      reviews: sum.reviews,
    });

    if (isCurrentMonth) break;
    cursorMonthKey = addMonths(cursorMonthKey, 1);
  }

  return buckets;
}

const RANGE_DAY_COUNTS: Record<"7d" | "30d" | "90d", number> = { "7d": 7, "30d": 30, "90d": 90 };

export function computeStudyActivityBuckets(
  stats: readonly StudyActivityDailyStat[],
  todayISO: string,
  range: StudyActivityRange,
): StudyActivityBucket[] {
  const statsByDate = buildStatsByDate(stats);

  if (range === "all") {
    return buildMonthlyBuckets(stats, todayISO);
  }
  if (range === "90d") {
    return buildWeeklyBuckets(statsByDate, todayISO, RANGE_DAY_COUNTS[range]);
  }
  return buildDailyBuckets(statsByDate, todayISO, RANGE_DAY_COUNTS[range]);
}
