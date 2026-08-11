// Pure aggregation for the Dashboard's Study Activity card: turns a flat
// list of per-day (newWordStudySeconds, reviewSeconds, customPracticeSeconds)
// stat rows into display-ready buckets for one of four ranges
// (7d/30d/90d/all), filling missing dates inside the visible range with a
// genuine zero bucket rather than leaving gaps. Deterministic and import-free except for addDaysISO
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
// Aggregation policy:
//   7d        -> one bucket per calendar day, always the last seven days.
//   30d       -> one bucket per calendar day, clamped to first tracked
//                activity when the user's real history is shorter.
//   90d       -> one bucket per 7-day week, clamped to first tracked
//                activity when the user's real history is shorter; most
//                recent week is computed first but returned oldest-first,
//                and the oldest bucket may cover fewer than 7 days.
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

function getFirstActivityDateISO(stats: readonly StudyActivityDailyStat[]): string | null {
  let firstDateISO: string | null = null;
  for (const stat of stats) {
    if (computeTotalTimeSeconds(stat) <= 0) {
      continue;
    }
    if (firstDateISO === null || stat.dateISO < firstDateISO) {
      firstDateISO = stat.dateISO;
    }
  }
  return firstDateISO;
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
  firstActivityDateISO: string | null = null,
): StudyActivityBucket[] {
  const buckets: StudyActivityBucket[] = [];
  const rangeStartISO = addDaysISO(todayISO, -(days - 1));
  const startISO =
    firstActivityDateISO && firstActivityDateISO > rangeStartISO ? firstActivityDateISO : rangeStartISO;
  for (let dateISO = startISO; dateISO <= todayISO; dateISO = addDaysISO(dateISO, 1)) {
    const stat = statsByDate.get(dateISO) ?? ZERO_MODE_SECONDS;
    buckets.push(toBucket(dateISO, "day", dateISO, dateISO, stat));
  }
  return buckets;
}

function buildDailyBucketsFromStart(
  statsByDate: Map<string, ModeSeconds>,
  startISO: string,
  todayISO: string,
): StudyActivityBucket[] {
  const buckets: StudyActivityBucket[] = [];
  for (let dateISO = startISO; dateISO <= todayISO; dateISO = addDaysISO(dateISO, 1)) {
    const stat = statsByDate.get(dateISO) ?? ZERO_MODE_SECONDS;
    buckets.push(toBucket(dateISO, "day", dateISO, dateISO, stat));
  }
  return buckets;
}

function daysInclusive(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00.000Z`).getTime();
  const end = new Date(`${endISO}T00:00:00.000Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }
  return Math.floor((end - start) / 86_400_000) + 1;
}

// Chunks the requested calendar window ending at todayISO into 7-day weeks,
// clamped to firstActivityDateISO when supplied. Works backward from today
// so the most recent bucket always ends exactly on todayISO; only the oldest
// bucket may be shorter than 7 days. Returned oldest-first.
function buildWeeklyBuckets(
  statsByDate: Map<string, ModeSeconds>,
  todayISO: string,
  days: number,
  firstActivityDateISO: string | null = null,
): StudyActivityBucket[] {
  const chunks: Array<{ startISO: string; endISO: string }> = [];
  let endISO = todayISO;
  const rangeStartISO = addDaysISO(todayISO, -(days - 1));
  const startBoundaryISO =
    firstActivityDateISO && firstActivityDateISO > rangeStartISO ? firstActivityDateISO : rangeStartISO;

  while (endISO >= startBoundaryISO) {
    const chunkLength = 7;
    const startISO = addDaysISO(endISO, -(chunkLength - 1));
    const chunkStartISO = startISO < startBoundaryISO ? startBoundaryISO : startISO;
    chunks.push({ startISO: chunkStartISO, endISO });
    endISO = addDaysISO(chunkStartISO, -1);
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

// One bucket per calendar month from the first tracked activity date through
// today's month (inclusive). With no history at all, returns a single
// current-month bucket with zero totals rather than an empty array, so the
// "All time" view always has at least one (honestly zero) point to render.
function buildMonthlyBuckets(
  stats: readonly StudyActivityDailyStat[],
  todayISO: string,
  firstActivityDateISO: string | null,
): StudyActivityBucket[] {
  const todayMonthKey = getMonthKey(todayISO);

  if (firstActivityDateISO === null) {
    return [toBucket(todayMonthKey, "month", firstOfMonthISO(todayMonthKey), todayISO, ZERO_MODE_SECONDS)];
  }

  const statsByDate = buildStatsByDate(stats);

  const buckets: StudyActivityBucket[] = [];
  let cursorMonthKey = getMonthKey(firstActivityDateISO);

  // Bounded by construction: cursorMonthKey strictly advances by one month
  // each iteration and the loop stops the instant it reaches todayMonthKey.
  while (true) {
    const isCurrentMonth = cursorMonthKey === todayMonthKey;
    const monthStartISO = firstOfMonthISO(cursorMonthKey);
    const startDateISO = cursorMonthKey === getMonthKey(firstActivityDateISO) ? firstActivityDateISO : monthStartISO;
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
  const firstActivityDateISO = getFirstActivityDateISO(stats);

  if (range === "all") {
    if (firstActivityDateISO !== null && daysInclusive(firstActivityDateISO, todayISO) <= RANGE_DAY_COUNTS["30d"]) {
      return buildDailyBucketsFromStart(statsByDate, firstActivityDateISO, todayISO);
    }
    return buildMonthlyBuckets(stats, todayISO, firstActivityDateISO);
  }
  if (range === "90d") {
    const rangeStartISO = addDaysISO(todayISO, -(RANGE_DAY_COUNTS[range] - 1));
    const startBoundaryISO =
      firstActivityDateISO && firstActivityDateISO > rangeStartISO ? firstActivityDateISO : rangeStartISO;
    if (daysInclusive(startBoundaryISO, todayISO) <= RANGE_DAY_COUNTS["30d"]) {
      return buildDailyBucketsFromStart(statsByDate, startBoundaryISO, todayISO);
    }
    return buildWeeklyBuckets(statsByDate, todayISO, RANGE_DAY_COUNTS[range], firstActivityDateISO);
  }
  return buildDailyBuckets(
    statsByDate,
    todayISO,
    RANGE_DAY_COUNTS[range],
    range === "7d" ? null : firstActivityDateISO,
  );
}
