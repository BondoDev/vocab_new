// Pure daily-streak computation for the Learning page's Daily Streak card:
// which days of the current week met the daily new-word goal, the current
// consecutive-day streak, and the best streak on record. Import-free (like
// wordReviewSchedule.ts) so it stays loadable directly via
// `node --experimental-strip-types` for
// scripts/tests/learning/test-daily-streak.mjs.
//
// A day "counts" toward the streak when that day's new_words_completed
// (from user_daily_stats) is >= the goal applicable to that day: the row's
// own Streak Phase 1 snapshot (dailyGoal) when one is stored, falling back
// to the current profile goal only for legacy rows written before that
// snapshot existed (dailyGoal null). See
// supabase/migrations/20260806190000_add_daily_goal_snapshot_and_update_rpc.sql
// and this module's buildCompletionMap below. Reviews and Custom Practice
// are deliberately not included — the streak is specifically "did you meet
// your new-word goal that day," matching Today's Progress's own scope.
export interface DailyStreakDayStat {
  // Authoritative learning date (YYYY-MM-DD), derived by the database from
  // server time and the profile timezone before this pure helper receives it.
  dateISO: string;
  newWordsCompleted: number;
  // This row's own frozen goal snapshot, or null for a legacy
  // (pre-Streak-Phase-1) row with no stored value — see buildCompletionMap.
  dailyGoal: number | null;
}

export interface DailyStreakWeekDay {
  dateISO: string;
  isComplete: boolean;
}

export interface DailyStreakSummary {
  currentStreakDays: number;
  bestStreakDays: number;
  // Monday through Sunday of the week containing `todayISO`, in that order
  // — matches DailyStreakCard.tsx's WEEK_DAYS order. A day with no matching
  // stat row (no activity yet, or a future day later this week) is simply
  // not complete; nothing is special-cased for "hasn't happened yet."
  currentWeek: DailyStreakWeekDay[];
}

// Exported so lib/newWordProgress.ts can compute the streak lookback
// window's start date without duplicating this date arithmetic.
function parseDateOnlyUTC(dateISO: string): Date {
  const [year, month, day] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnlyUTC(date: Date): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addDaysISO(dateISO: string, days: number): string {
  const date = parseDateOnlyUTC(dateISO);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnlyUTC(date);
}

// Date.getUTCDay() is 0=Sunday..6=Saturday; WEEK_DAYS is Monday-first, so
// Sunday needs a -6 offset instead of the usual 1-dayOfWeek.
function mondayOfWeek(dateISO: string): string {
  const date = parseDateOnlyUTC(dateISO);
  const dayOfWeek = date.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDaysISO(dateISO, diffToMonday);
}

// Resolves the goal a single row is judged against: its own stored
// snapshot when present, otherwise currentProfileDailyGoal (the legacy
// fallback for rows written before Streak Phase 1). Returns null when
// neither source is a usable positive goal, so callers can treat that day
// as never completable rather than dividing by (or comparing against) a
// bad value.
function resolveEffectiveGoal(rowDailyGoal: number | null, currentProfileDailyGoal: number): number | null {
  const candidate = rowDailyGoal ?? currentProfileDailyGoal;
  return Number.isFinite(candidate) && candidate > 0 ? candidate : null;
}

function buildCompletionMap(
  stats: readonly DailyStreakDayStat[],
  currentProfileDailyGoal: number,
): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const stat of stats) {
    const effectiveGoal = resolveEffectiveGoal(stat.dailyGoal, currentProfileDailyGoal);
    map.set(stat.dateISO, effectiveGoal !== null && stat.newWordsCompleted >= effectiveGoal);
  }
  return map;
}

export function computeDailyStreakSummary(
  stats: readonly DailyStreakDayStat[],
  // The signed-in user's current user_profiles.daily_goal — used only as
  // the fallback for rows with no stored per-row snapshot (dailyGoal
  // null). A row with its own stored goal always uses that instead,
  // regardless of what the current profile goal is today. See
  // resolveEffectiveGoal/buildCompletionMap above.
  currentProfileDailyGoal: number,
  todayISO: string,
): DailyStreakSummary {
  const completionByDate = buildCompletionMap(stats, currentProfileDailyGoal);

  // Current streak: walk backward from today. An incomplete "today" does
  // not break the streak on its own (the day isn't over) — it just means
  // the walk starts from yesterday instead, so a learner who hasn't
  // studied yet today still sees yesterday's streak intact.
  let currentStreakDays = 0;
  let cursor = completionByDate.get(todayISO) ? todayISO : addDaysISO(todayISO, -1);
  while (completionByDate.get(cursor)) {
    currentStreakDays += 1;
    cursor = addDaysISO(cursor, -1);
  }

  // Best streak: longest run of date-consecutive complete days anywhere in
  // the supplied stats (bounded by however far back the caller queried —
  // see readDailyStreakStats's lookback window).
  const completeDatesAscending = [...completionByDate.entries()]
    .filter(([, isComplete]) => isComplete)
    .map(([dateISO]) => dateISO)
    .sort();

  let bestStreakDays = 0;
  let runLength = 0;
  let previousDateISO: string | null = null;
  for (const dateISO of completeDatesAscending) {
    runLength = previousDateISO && addDaysISO(previousDateISO, 1) === dateISO ? runLength + 1 : 1;
    bestStreakDays = Math.max(bestStreakDays, runLength);
    previousDateISO = dateISO;
  }
  // The current streak can exceed whatever best streak the (possibly
  // bounded) stats window captured — a streak in progress is still a real
  // streak even if it's the longest one on record so far.
  bestStreakDays = Math.max(bestStreakDays, currentStreakDays);

  const monday = mondayOfWeek(todayISO);
  const currentWeek: DailyStreakWeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const dateISO = addDaysISO(monday, index);
    return { dateISO, isComplete: completionByDate.get(dateISO) === true };
  });

  return { currentStreakDays, bestStreakDays, currentWeek };
}
