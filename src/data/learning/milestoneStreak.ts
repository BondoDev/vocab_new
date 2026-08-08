// Pure "activity day" streak computation for the Milestones Consistency
// track. Deliberately separate from computeDailyStreakSummary in
// dailyStreak.ts: that function judges a day against its *goal* (met the
// daily new-word target, whatever that was on that date) for the Daily
// Streak card. This module judges a day purely by whether any learning
// activity happened at all — new_words_completed > 0 OR
// reviews_completed > 0 — independent of any daily goal, past or present.
// The two streak numbers are allowed to differ and must never be conflated.
//
// Only addDaysISO is reused from dailyStreak.ts (plain UTC date-only
// arithmetic on a YYYY-MM-DD string — no timezone system of its own); the
// day-status classification and week/best-streak logic there aren't
// applicable here, since Milestones only need one number: the current
// streak.
//
// Like dailyStreak.ts, this stays free of every import except that one pure
// helper, so it keeps loading directly via `node --experimental-strip-types`
// for scripts/tests/learning/test-milestone-streak.mjs.
//
// Known limitation (see the task brief): `todayISO` is whatever the caller
// supplies — Phase 1 callers pass the server-derived current learning date
// from getCurrentLearningDate() (src/lib/learningDate.ts), which is itself
// only as accurate as the profile's stored timezone (device-local until a
// full profile-timezone system exists). This module does not attempt to
// correct for that; it is purely date-arithmetic over whatever "today" it's
// given.
import { addDaysISO } from "./dailyStreak.ts";

export interface MilestoneActivityDayStat {
  // YYYY-MM-DD, matching user_daily_stats.stat_date.
  dateISO: string;
  newWordsCompleted: number;
  reviewsCompleted: number;
}

function isQualifyingDay(stat: MilestoneActivityDayStat | undefined): boolean {
  return stat !== undefined && (stat.newWordsCompleted > 0 || stat.reviewsCompleted > 0);
}

// Walks backward from today exactly like computeDailyStreakSummary's
// current-streak loop: an incomplete/inactive "today" does not itself break
// the streak (the day isn't over yet) — the walk simply starts from
// yesterday instead, so a learner who hasn't studied yet today still keeps
// yesterday's streak intact. Any missing or inactive day found while
// walking backward stops the count there.
export function computeMilestoneStreak(
  stats: readonly MilestoneActivityDayStat[],
  todayISO: string,
): number {
  const statsByDate = new Map<string, MilestoneActivityDayStat>();
  for (const stat of stats) {
    statsByDate.set(stat.dateISO, stat);
  }

  let currentStreakDays = 0;
  let cursor = isQualifyingDay(statsByDate.get(todayISO)) ? todayISO : addDaysISO(todayISO, -1);
  while (isQualifyingDay(statsByDate.get(cursor))) {
    currentStreakDays += 1;
    cursor = addDaysISO(cursor, -1);
  }

  return currentStreakDays;
}
