// Pure aggregation for the Dashboard's Study Activity card: turns a flat
// list of per-day (newWordStudySeconds, reviewSeconds, customPracticeSeconds)
// stat rows into display-ready buckets for one of four ranges
// (7d/30d/90d/all), filling missing dates with a genuine zero bucket rather
// than leaving gaps. Deterministic and import-free except for addDaysISO
// (see below), so it stays loadable directly via
// `node --experimental-strip-types` for
// scripts/tests/learning/test-study-activity.mjs.
//
// STUDY ACTIVITY PHASE 1 — this module previously aggregated QUANTITIES
// (new words completed, reviews completed). It now aggregates ACTIVE STUDY
// TIME per learning mode instead — the quantity chart moved entirely to
// the separate "Words Learned" card (src/data/learning/
// wordsLearnedSummary.ts), which already owned new-word quantities on its
// own. See src/lib/learningTimeStats.ts for where the three per-mode
// second counts come from and why totalSeconds is always derived (summed)
// here rather than trusted from a stored column.
//
// HISTORICAL DATA — every user_daily_stats row already carries full
// per-mode fidelity (see supabase/migrations/
// 20260811120000_add_new_word_study_time_and_repurpose_total.sql's own
// header): mode-tracking has been the only write path since corrective
// migration 5 shipped, so there is no "Uncategorized" bucket anywhere in
// this module or its consumers — a bucket with zero seconds in every mode
// genuinely had zero tracked activity, never an unattributed one.
//
// Aggregation policy (unchanged from the quantity-era module):
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
// established by milestoneStreak.ts. computeTotalTimeSeconds is reused from
// learningTimeStats.ts so this module never re-derives the sum-of-three-
// modes logic on its own.
import { addDaysISO } from "./dailyStreak.ts";
import { computeTotalTimeSeconds, type LearningModeTimeSeconds } from "../../lib/learningTimeStats.ts";

export type StudyActivityRange = "7d" | "30d" | "90d" | "all";
export type StudyActivityBucketKind = "day" | "week" | "month";

export interface StudyActivityDailyStat extends LearningModeTimeSeconds {
  // YYYY-MM-DD, matching user_daily_stats.stat_date.
  dateISO: string;
}

export interface StudyActivityBucket extends LearningModeTimeSeconds {
  // Stable, sortable identifier: the bucket's own start date (day/week) or
  // "YYYY-MM" (month).
  key: string;
  kind: StudyActivityBucketKind;
  startDateISO: string;
  endDateISO: string;
  totalSeconds: number;
}

type ModeSeconds = LearningModeTimeSeconds;

const ZERO_MODE_SECONDS: ModeSeconds = {
  newWordStudyTimeSeconds: 0,
  reviewTimeSeconds: 0,
  customPracticeTimeSeconds: 0,
};

function addModeSeconds(a: ModeSeconds, b: ModeSeconds): ModeSeconds {
  return {
    newWordStudyTimeSeconds: a.newWordStudyTimeSeconds + b.newWordStudyTimeSeconds,
    reviewTimeSeconds: a.reviewTimeSeconds + b.reviewTimeSeconds,
    customPracticeTimeSeconds: a.customPracticeTimeSeconds + b.customPracticeTimeSeconds,
  };
}

function toBucket(
  key: string,
  kind: StudyActivityBucketKind,
  startDateISO: string,
  endDateISO: string,
  modeSeconds: ModeSeconds,
): StudyActivityBucket {
  return {
    key,
    kind,
    startDateISO,
    endDateISO,
    ...modeSeconds,
    totalSeconds: computeTotalTimeSeconds(modeSeconds),
  };
}

function buildStatsByDate(stats: readonly StudyActivityDailyStat[]): Map<string, ModeSeconds> {
  const map = new Map<string, ModeSeconds>();
  for (const stat of stats) {
    map.set(stat.dateISO, {
      newWordStudyTimeSeconds: stat.newWordStudyTimeSeconds,
      reviewTimeSeconds: stat.reviewTimeSeconds,
      customPracticeTimeSeconds: stat.customPracticeTimeSeconds,
    });
  }
  return map;
}

// Inclusive sum over [startISO, endISO] — missing dates contribute zero
// rather than being skipped, so a bucket's totals never silently omit a
// day just because user_daily_stats has no row for it.
function sumRange(statsByDate: Map<string, ModeSeconds>, startISO: string, endISO: string): ModeSeconds {
  let sum = ZERO_MODE_SECONDS;
  let cursor = startISO;
  while (cursor <= endISO) {
    const stat = statsByDate.get(cursor);
    if (stat) {
      sum = addModeSeconds(sum, stat);
    }
    cursor = addDaysISO(cursor, 1);
  }
  return sum;
}

function buildDailyBuckets(
  statsByDate: Map<string, ModeSeconds>,
  todayISO: string,
  days: number,
): StudyActivityBucket[] {
  const buckets: StudyActivityBucket[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const dateISO = addDaysISO(todayISO, -i);
    const stat = statsByDate.get(dateISO) ?? ZERO_MODE_SECONDS;
    buckets.push(toBucket(dateISO, "day", dateISO, dateISO, stat));
  }
  return buckets;
}

// Chunks `days` calendar days ending at todayISO into 7-day weeks, working
// backward from today so the most recent bucket always ends exactly on
// todayISO; only the oldest bucket may be shorter than 7 days (when `days`
// isn't a multiple of 7). Returned oldest-first.
function buildWeeklyBuckets(
  statsByDate: Map<string, ModeSeconds>,
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
    return toBucket(startISO, "week", startISO, chunkEndISO, sum);
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
function buildMonthlyBuckets(stats: readonly StudyActivityDailyStat[], todayISO: string): StudyActivityBucket[] {
  const todayMonthKey = getMonthKey(todayISO);

  if (stats.length === 0) {
    return [toBucket(todayMonthKey, "month", firstOfMonthISO(todayMonthKey), todayISO, ZERO_MODE_SECONDS)];
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

    buckets.push(toBucket(cursorMonthKey, "month", startDateISO, endDateISO, sum));

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
