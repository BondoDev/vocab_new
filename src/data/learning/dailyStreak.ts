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
// to a fixed legacy default (LEGACY_DAILY_GOAL below) only for legacy rows
// written before that snapshot existed (dailyGoal null). See
// supabase/migrations/20260806190000_add_daily_goal_snapshot_and_update_rpc.sql
// and this module's buildCompletionMap below. Reviews and Custom Practice
// are deliberately not included — the streak is specifically "did you meet
// your new-word goal that day," matching Today's Progress's own scope.
//
// Historical completion must never depend on the current, mutable
// user_profiles.daily_goal — that value can change at any time and must
// only ever affect *today* (see update_daily_goal in the migration above).
// This module therefore takes no "current profile goal" input at all:
// every row is judged solely against its own stored snapshot, or against
// LEGACY_DAILY_GOAL when it has none.
export interface DailyStreakDayStat {
  // Authoritative learning date (YYYY-MM-DD), derived by the database from
  // server time and the profile timezone before this pure helper receives it.
  dateISO: string;
  newWordsCompleted: number;
  // This row's own frozen goal snapshot, or null for a legacy
  // (pre-Streak-Phase-1) row with no stored value — see buildCompletionMap.
  dailyGoal: number | null;
}

// The single source of truth for "how does one calendar day render" — both
// the current/best streak math below and DailyStreakCard.tsx's weekly strip
// derive from this same classification, so the two can never disagree about
// what counts as a good/bad/neutral day.
//
//   completed  — met its effective goal (today or any past date).
//   failed     — a *past* date (dateISO < todayISO) that did not meet its
//                effective goal, including a past date with no
//                user_daily_stats row at all. A missing row is not
//                "unknown" — no recorded new-word completion on a day that
//                has already ended is exactly a day the goal wasn't met.
//   inProgress — today, not yet (or not ever, if no activity happens)
//                meeting its goal. Never "failed": the day isn't over.
//   future     — a date later than todayISO. Always neutral.
export type DailyStreakDayStatus = "completed" | "failed" | "inProgress" | "future";

export interface DailyStreakWeekDay {
  dateISO: string;
  status: DailyStreakDayStatus;
}

export interface DailyStreakSummary {
  currentStreakDays: number;
  bestStreakDays: number;
  // Monday through Sunday of the week containing `todayISO`, in that order
  // — matches DailyStreakCard.tsx's WEEK_DAYS order. Every day gets a
  // DailyStreakDayStatus (see above) — a future day or an in-progress
  // today is never conflated with a past day that actually failed to meet
  // its goal, including one with no stat row at all.
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

// Fetch-audit Phase 1: today's new-word count used to be its own dedicated
// read (readTodayNewWordsCompleted, src/lib/newWordProgress.ts) — Dashboard
// and Learning now derive it locally from the same shared, unbounded
// user_daily_stats rows the streak/milestone computations already use
// (useProfileSharedDailyStats.ts), rather than issuing a second, narrower
// request for a value that row set already contains. Structurally typed
// (not tied to DailyStreakDayStat or MilestoneDailyStatRow specifically) so
// either row shape satisfies it without a conversion step. A missing row
// for todayISO is 0 completed, not an error — matching
// readTodayNewWordsCompleted's own "no row yet today" contract.
export function findTodayNewWordsCompleted(
  stats: readonly { dateISO: string; newWordsCompleted: number }[],
  todayISO: string,
): number {
  const todayStat = stats.find((stat) => stat.dateISO === todayISO);
  return todayStat?.newWordsCompleted ?? 0;
}

// Date.getUTCDay() is 0=Sunday..6=Saturday; WEEK_DAYS is Monday-first, so
// Sunday needs a -6 offset instead of the usual 1-dayOfWeek.
function mondayOfWeek(dateISO: string): string {
  const date = parseDateOnlyUTC(dateISO);
  const dayOfWeek = date.getUTCDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDaysISO(dateISO, diffToMonday);
}

// Fixed fallback for a legacy row with no stored Streak Phase 1 snapshot
// (dailyGoal null) — the minimum of the five supported daily-goal presets
// (10, 15, 20, 30, 50; see SUPPORTED_DAILY_GOAL_VALUES in
// src/lib/dailyGoalUpdate.ts), not the table's own default of 15. Picking
// the minimum, rather than the default, is a deliberate correction: real
// production history has legacy rows that plainly met whatever goal was
// active on their date (e.g. 10 new words on a day the user confirms they
// completed) but would read as *failed* under a default-15 fallback,
// wrongly erasing an earned streak day. Using the minimum supported value
// instead means a legacy row is never misclassified as failed merely for
// meeting the lowest goal any user could have had — at the cost of
// possibly *over*-crediting a legacy row whose real goal was actually
// higher than 10, which would have made it genuinely incomplete. Neither
// direction is recoverable exactly: the original per-day goal for these
// rows was simply never recorded, and this constant does not claim
// otherwise — it is the least-wrong fixed approximation available, not a
// reconstruction. New rows (written by any of the three learning RPCs
// after Streak Phase 1) always carry their own exact stamped goal and
// never fall back to this constant at all.
//
// Intentionally a separate, hard-coded constant here rather than an import
// of SUPPORTED_DAILY_GOAL_VALUES[0] or user_profiles.daily_goal's default:
// this module stays deliberately import-free (see the file header) so it
// keeps loading directly under `node --experimental-strip-types` for
// scripts/tests/learning/test-daily-streak.mjs, and — more importantly —
// LEGACY_DAILY_GOAL must never be able to track a *live* value the way
// importing today's default would risk inviting later.
export const LEGACY_DAILY_GOAL = 10;

// Resolves the goal a single row is judged against: its own stored
// snapshot when present, otherwise the fixed LEGACY_DAILY_GOAL (for rows
// written before Streak Phase 1). Returns null when neither source is a
// usable positive goal, so callers can treat that day as never completable
// rather than dividing by (or comparing against) a bad value.
function resolveEffectiveGoal(rowDailyGoal: number | null): number | null {
  const candidate = rowDailyGoal ?? LEGACY_DAILY_GOAL;
  return Number.isFinite(candidate) && candidate > 0 ? candidate : null;
}

function buildCompletionMap(stats: readonly DailyStreakDayStat[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const stat of stats) {
    const effectiveGoal = resolveEffectiveGoal(stat.dailyGoal);
    map.set(stat.dateISO, effectiveGoal !== null && stat.newWordsCompleted >= effectiveGoal);
  }
  return map;
}

// The single classification DailyStreakCard.tsx renders from directly —
// see DailyStreakDayStatus's own header for what each of the four values
// means. `isComplete` is `completionByDate.get(dateISO) === true`: false
// both for a present-but-under-goal row and for a date with no row at all,
// which is exactly why a missing past row and a failed past row are
// indistinguishable here, on purpose — both mean "no recorded goal
// completion for a day that has already ended."
//
// dateISO/todayISO are both YYYY-MM-DD strings, so a plain string
// comparison is a valid chronological comparison — no Date parsing needed
// to tell a future date from a past one.
function classifyDayStatus(dateISO: string, todayISO: string, isComplete: boolean): DailyStreakDayStatus {
  if (dateISO > todayISO) {
    return "future";
  }
  if (dateISO === todayISO) {
    return isComplete ? "completed" : "inProgress";
  }
  return isComplete ? "completed" : "failed";
}

// No currentProfileDailyGoal parameter, deliberately: the live, mutable
// user_profiles.daily_goal must never influence whether a past day reads
// as complete (see resolveEffectiveGoal/LEGACY_DAILY_GOAL above). Callers
// that also need today's live goal for other purposes (e.g. Today's
// Progress) read it separately — it has no place in this computation.
export function computeDailyStreakSummary(
  stats: readonly DailyStreakDayStat[],
  todayISO: string,
): DailyStreakSummary {
  const completionByDate = buildCompletionMap(stats);

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
    const isComplete = completionByDate.get(dateISO) === true;
    return { dateISO, status: classifyDayStatus(dateISO, todayISO, isComplete) };
  });

  return { currentStreakDays, bestStreakDays, currentWeek };
}
