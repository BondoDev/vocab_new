// Pure aggregation for the Dashboard's Words Learned card: the last-7-day
// total (with a per-day breakdown for the compact bar chart) plus a
// previous-7-day comparison, computed from the same already-loaded
// user_daily_stats rows the Study Activity card uses — never a second
// fetch or a duplicated read. Deliberately narrower than
// studyActivity.ts's StudyActivityDailyStat: this card only ever needs
// new_words_completed (reviews are explicitly out of scope — see the
// Phase brief's "Do NOT include reviews in this card").
//
// Only addDaysISO is reused from dailyStreak.ts, same precedent as
// studyActivity.ts/milestoneStreak.ts, so this stays loadable directly via
// `node --experimental-strip-types` for
// scripts/tests/learning/test-words-learned-summary.mjs.
import { addDaysISO } from "./dailyStreak.ts";

export interface WordsLearnedDailyStat {
  // YYYY-MM-DD, matching user_daily_stats.stat_date.
  dateISO: string;
  newWordsCompleted: number;
}

export interface WordsLearnedDayPoint {
  dateISO: string;
  count: number;
}

export interface WordsLearnedSummary {
  // Sum of the last 7 calendar days (today and the 6 before it). The real,
  // unclamped total — never derived from `days` by re-summing at render
  // time.
  total: number;
  // Oldest-first, always exactly 7 entries — one per day in `total`'s
  // window, missing dates counted as zero.
  days: readonly WordsLearnedDayPoint[];
  // Sum of the 7 calendar days immediately before that window (days 8–14
  // back). A real number even for a brand-new account (correctly 0, not
  // omitted) — no second request is needed since the caller already has
  // the full history loaded.
  previousTotal: number;
  // total - previousTotal. Positive, negative, or zero are all valid,
  // real outcomes; never clamped or hidden.
  difference: number;
}

export function computeWordsLearnedSummary(
  stats: readonly WordsLearnedDailyStat[],
  todayISO: string,
): WordsLearnedSummary {
  const countByDate = new Map(stats.map((stat) => [stat.dateISO, stat.newWordsCompleted]));

  const days: WordsLearnedDayPoint[] = [];
  let total = 0;
  for (let i = 6; i >= 0; i -= 1) {
    const dateISO = addDaysISO(todayISO, -i);
    const count = countByDate.get(dateISO) ?? 0;
    days.push({ dateISO, count });
    total += count;
  }

  let previousTotal = 0;
  for (let i = 13; i >= 7; i -= 1) {
    const dateISO = addDaysISO(todayISO, -i);
    previousTotal += countByDate.get(dateISO) ?? 0;
  }

  return { total, days, previousTotal, difference: total - previousTotal };
}
