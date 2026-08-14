// Focused guard for the pure daily-streak computation in
// src/data/learning/dailyStreak.ts.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-daily-streak.mjs
import assert from "node:assert/strict";
import { addDaysISO, computeDailyStreakSummary, LEGACY_DAILY_GOAL } from "../../../src/data/learning/dailyStreak.ts";

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

// Deliberately derived from the module's own exported constant, not a
// hard-coded literal that would just happen to match — GOAL stands in for
// "the goal every legacy (dailyGoal: null) row in these tests resolves to"
// wherever it's used against a stat() with no explicit stored goal.
// LEGACY_DAILY_GOAL is 10 (the minimum supported preset), not the
// table-default 15 — see dailyStreak.ts's own header for why: real
// production history has legacy rows that plainly met their real goal
// (e.g. exactly 10 new words) but would misread as failed under a
// default-15 fallback.
const GOAL = LEGACY_DAILY_GOAL;
// Wednesday, 2026-08-19 (2026-08-17 is a Monday).
const TODAY = "2026-08-19";

// dailyGoal defaults to null (no stored per-row snapshot) so every existing
// call site below exercises the fixed LEGACY_DAILY_GOAL fallback path
// unchanged — matching every row's real state before Streak Phase 1's
// migration stamped a goal onto a new row. Pass an explicit dailyGoal to
// exercise the stored-snapshot override path instead (see the "per-row
// goal snapshot" suite below).
function stat(dateISO, newWordsCompleted, dailyGoal = null) {
  return { dateISO, newWordsCompleted, dailyGoal };
}

function findDay(summary, dateISO) {
  return summary.currentWeek.find((day) => day.dateISO === dateISO);
}

console.log("\n=== computeDailyStreakSummary signature ===\n");

test("0. computeDailyStreakSummary takes exactly two parameters (stats, todayISO) — no current-goal input", () => {
  // A regression guard against silently reintroducing a currentProfileDailyGoal
  // parameter: the live, mutable user_profiles.daily_goal must never be able
  // to reach this function again, and Function.prototype.length is a cheap,
  // reliable way to pin the declared arity.
  assert.equal(computeDailyStreakSummary.length, 2);
});

console.log("\n=== current week activity / day-status classification ===\n");

test("1. Completing today's goal fills today's weekday square as completed", () => {
  const summary = computeDailyStreakSummary([stat(TODAY, GOAL)], TODAY);
  assert.equal(findDay(summary, TODAY).status, "completed");
});

test("2. Under-goal activity on today is in-progress (neutral), never failed — the day isn't over", () => {
  const summary = computeDailyStreakSummary([stat(TODAY, GOAL - 1)], TODAY);
  assert.equal(findDay(summary, TODAY).status, "inProgress");
});

test("3. Week is Monday-first and spans exactly the 7 days containing today", () => {
  const summary = computeDailyStreakSummary([], TODAY);
  assert.deepEqual(
    summary.currentWeek.map((d) => d.dateISO),
    ["2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23"],
  );
});

test("4. A future day later this week (no stat row yet) is future, never failed", () => {
  const summary = computeDailyStreakSummary([], TODAY);
  assert.equal(findDay(summary, "2026-08-21").status, "future");
});

test("5. A day from last week does not leak into this week's view", () => {
  const summary = computeDailyStreakSummary([stat("2026-08-10", GOAL)], TODAY);
  assert.equal(summary.currentWeek.some((d) => d.dateISO === "2026-08-10"), false);
});

console.log("\n=== current streak ===\n");

test("6. No activity at all -> current streak is 0", () => {
  assert.equal(computeDailyStreakSummary([], TODAY).currentStreakDays, 0);
});

test("7. Today complete, no prior days -> current streak is 1", () => {
  assert.equal(computeDailyStreakSummary([stat(TODAY, GOAL)], TODAY).currentStreakDays, 1);
});

test("8. Today complete + 3 consecutive prior days complete -> current streak is 4", () => {
  const stats = [
    stat(TODAY, GOAL),
    stat("2026-08-18", GOAL),
    stat("2026-08-17", GOAL),
    stat("2026-08-16", GOAL),
  ];
  assert.equal(computeDailyStreakSummary(stats, TODAY).currentStreakDays, 4);
});

test("9. A gap breaks the streak at the gap, not before it", () => {
  const stats = [
    stat(TODAY, GOAL), // today
    stat("2026-08-18", GOAL), // yesterday
    // 2026-08-17 missing — gap here
    stat("2026-08-16", GOAL),
  ];
  assert.equal(computeDailyStreakSummary(stats, TODAY).currentStreakDays, 2);
});

test("10. Today not yet complete does not zero out an intact streak through yesterday", () => {
  const stats = [stat("2026-08-18", GOAL), stat("2026-08-17", GOAL)];
  assert.equal(computeDailyStreakSummary(stats, TODAY).currentStreakDays, 2);
});

test("11. Today not complete AND yesterday not complete -> current streak is 0", () => {
  const stats = [stat("2026-08-17", GOAL)]; // two days back, with a gap at yesterday
  assert.equal(computeDailyStreakSummary(stats, TODAY).currentStreakDays, 0);
});

console.log("\n=== best streak ===\n");

test("12. Best streak is at least the current streak", () => {
  const stats = [stat(TODAY, GOAL), stat("2026-08-18", GOAL)];
  const summary = computeDailyStreakSummary(stats, TODAY);
  assert.equal(summary.bestStreakDays, summary.currentStreakDays);
});

test("13. An older, longer run outranks the current (shorter) streak", () => {
  const stats = [
    // Current streak: just today (1 day).
    stat(TODAY, GOAL),
    // An older 5-day run, with a gap separating it from today.
    stat("2026-08-10", GOAL),
    stat("2026-08-09", GOAL),
    stat("2026-08-08", GOAL),
    stat("2026-08-07", GOAL),
    stat("2026-08-06", GOAL),
  ];
  const summary = computeDailyStreakSummary(stats, TODAY);
  assert.equal(summary.currentStreakDays, 1);
  assert.equal(summary.bestStreakDays, 5);
});

test("14. Non-consecutive complete days never combine into one run", () => {
  const stats = [stat("2026-08-01", GOAL), stat("2026-08-03", GOAL), stat("2026-08-05", GOAL)];
  const summary = computeDailyStreakSummary(stats, TODAY);
  assert.equal(summary.bestStreakDays, 1);
});

console.log("\n=== deterministic date-only arithmetic ===\n");

test("15. addDaysISO subtracts across month end using UTC date-only arithmetic", () => {
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28");
});

test("16. addDaysISO subtracts across year end using UTC date-only arithmetic", () => {
  assert.equal(addDaysISO("2026-01-01", -1), "2025-12-31");
});

test("17. addDaysISO handles leap day", () => {
  assert.equal(addDaysISO("2024-03-01", -1), "2024-02-29");
  assert.equal(addDaysISO("2024-02-29", 1), "2024-03-01");
});

test("18. Week-start calculation remains Monday-first across month boundaries", () => {
  const summary = computeDailyStreakSummary([], "2026-03-01");
  assert.deepEqual(
    summary.currentWeek.map((d) => d.dateISO),
    ["2026-02-23", "2026-02-24", "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28", "2026-03-01"],
  );
});

test("19. DST transition-adjacent dates do not shift the date-only result", () => {
  assert.equal(addDaysISO("2026-03-08", 1), "2026-03-09");
  assert.equal(addDaysISO("2026-11-01", 1), "2026-11-02");
});

test("20. Date arithmetic is independent of host-timezone assumptions", () => {
  const dates = ["2026-03-08", "2026-11-01", "2024-02-29", "2026-01-01"];
  const results = dates.map((dateISO) => [addDaysISO(dateISO, -1), addDaysISO(dateISO, 1)]);
  assert.deepEqual(results, [
    ["2026-03-07", "2026-03-09"],
    ["2026-10-31", "2026-11-02"],
    ["2024-02-28", "2024-03-01"],
    ["2025-12-31", "2026-01-02"],
  ]);
});

console.log("\n=== per-row goal snapshot (Streak Phase 1) ===\n");

test("21. A stored row goal below LEGACY_DAILY_GOAL is still honored, never clamped up to it", () => {
  // The DB CHECK constraint makes a real stored value below 10 (the lowest
  // supported preset) unreachable in practice, but the pure function itself
  // does not special-case this — a stored value always wins. 6 completed
  // words meets a stored goal of 5, so this must read complete under that
  // *stored* goal — even though 6 would fall short of the legacy fallback
  // (10) if the fallback were wrongly applied here instead.
  const summary = computeDailyStreakSummary([stat(TODAY, 6, 5)], TODAY);
  assert.equal(findDay(summary, TODAY).status, "completed");
});

test("22. A stored row goal above LEGACY_DAILY_GOAL is still honored, never relaxed down to it", () => {
  // Stored goal was 30 the day this row was written. 12 words falls short
  // of that row's own frozen goal, so the day is not complete, even though
  // 12 would exceed the fixed legacy fallback (10) a null row would use.
  const summary = computeDailyStreakSummary([stat(TODAY, 12, 30)], TODAY);
  assert.equal(findDay(summary, TODAY).status, "inProgress");
});

test("23. Legacy boundary: 9 with dailyGoal null is a failed historical day (below LEGACY_DAILY_GOAL)", () => {
  const summary = computeDailyStreakSummary([stat("2026-08-18", 9, null)], TODAY);
  assert.equal(findDay(summary, "2026-08-18").status, "failed");
});

test("24. Legacy boundary: exactly LEGACY_DAILY_GOAL (10) with dailyGoal null is a completed historical day", () => {
  const summary = computeDailyStreakSummary([stat("2026-08-18", LEGACY_DAILY_GOAL, null)], TODAY);
  assert.equal(findDay(summary, "2026-08-18").status, "completed");
});

test("25. Legacy boundary: 15 with dailyGoal null is a completed historical day (above LEGACY_DAILY_GOAL)", () => {
  const summary = computeDailyStreakSummary([stat("2026-08-18", 15, null)], TODAY);
  assert.equal(findDay(summary, "2026-08-18").status, "completed");
});

test("26. All-legacy history: three consecutive dailyGoal-null rows each meeting LEGACY_DAILY_GOAL form a 3-day streak", () => {
  const stats = [
    stat(TODAY, LEGACY_DAILY_GOAL, null),
    stat("2026-08-18", LEGACY_DAILY_GOAL, null),
    stat("2026-08-17", LEGACY_DAILY_GOAL, null),
  ];
  const summary = computeDailyStreakSummary(stats, TODAY);
  assert.equal(summary.currentStreakDays, 3);
  assert.equal(summary.bestStreakDays, 3);
});

test("27. Mixed legacy (null) and snapshotted (stored) history both resolve correctly in the same streak", () => {
  const stats = [
    stat(TODAY, 20, 20), // today: stored goal 20, met
    stat("2026-08-18", 20, null), // yesterday: legacy row, meets the fixed legacy fallback (10)
    stat("2026-08-17", 10, 10), // stored goal 10 — same value as the legacy fallback, but read from the row itself, not the fallback
  ];
  const summary = computeDailyStreakSummary(stats, TODAY);
  assert.equal(summary.currentStreakDays, 3);
  assert.equal(summary.bestStreakDays, 3);
});

test("28. A row's own invalid stored goal (non-positive or non-finite) is never completable — and, on today, that reads as in-progress, never failed", () => {
  // `??` (nullish coalescing) only falls back on null/undefined, never on a
  // falsy-but-present 0 (or any other non-null number) — so a stored value
  // is always used as-is. The DB CHECK forbids any of these from ever being
  // stored in practice; this only pins the defensive behavior if one
  // appeared anyway. Using TODAY also confirms the today-in-progress rule
  // holds even for a malformed row: never colored as failed before the day
  // is over, no matter how broken the stored goal is.
  for (const badGoal of [0, -5, NaN, Infinity, -Infinity]) {
    const summary = computeDailyStreakSummary([stat(TODAY, 100, badGoal)], TODAY);
    assert.equal(findDay(summary, TODAY).status, "inProgress", `dailyGoal=${badGoal} must never be completable`);
  }
});

console.log("\n=== calendar day-status classification ===\n");

test("29. A completed historical row renders as completed", () => {
  const summary = computeDailyStreakSummary([stat("2026-08-18", 10, 10)], TODAY);
  assert.equal(findDay(summary, "2026-08-18").status, "completed");
});

test("30. An incomplete (present but under-goal) historical row renders as failed", () => {
  const summary = computeDailyStreakSummary([stat("2026-08-18", 4, 10)], TODAY);
  assert.equal(findDay(summary, "2026-08-18").status, "failed");
});

test("31. A missing historical date (no user_daily_stats row at all) renders as failed", () => {
  // No stat() for 2026-08-18 at all — readDailyStreakStats simply never
  // returned a row for it, exactly like a day with no recorded activity.
  const summary = computeDailyStreakSummary([stat(TODAY, GOAL)], TODAY);
  assert.equal(findDay(summary, "2026-08-18").status, "failed");
});

test("32. An incomplete today renders as in-progress (neutral), not failed", () => {
  const summary = computeDailyStreakSummary([stat(TODAY, GOAL - 1)], TODAY);
  assert.equal(findDay(summary, TODAY).status, "inProgress");
});

test("33. A completed today renders as completed", () => {
  const summary = computeDailyStreakSummary([stat(TODAY, GOAL)], TODAY);
  assert.equal(findDay(summary, TODAY).status, "completed");
});

test("34. A future date (even with no row, since it hasn't happened) renders as future, never failed", () => {
  const summary = computeDailyStreakSummary([], TODAY);
  assert.equal(findDay(summary, "2026-08-20").status, "future");
});

console.log("\n=== real production example ===\n");

// The exact scenario that motivated the LEGACY_DAILY_GOAL correction from
// 15 to 10: a real user's confirmed-complete August 3rd/4th (10-15 new
// words on dailyGoal-null legacy rows) must resolve as complete, not
// failed. TODAY is deliberately 2026-08-09 (a Sunday, so the Monday of its
// own week is 2026-08-03) so this single dataset also exercises every
// calendar day-status in one real-shaped week: two genuinely completed
// legacy days, two present-but-under-goal days (one legacy, one
// snapshotted), two entirely missing past days, and an also-missing but
// still-in-progress today.
test("35. Real production example: Aug 3-6 resolve to the confirmed-correct completion states", () => {
  const stats = [
    stat("2026-08-03", 15, null), // confirmed complete by the user; legacy row
    stat("2026-08-04", 10, null), // confirmed complete by the user; legacy row
    stat("2026-08-05", 9, null), // present, under LEGACY_DAILY_GOAL (10)
    stat("2026-08-06", 5, 10), // present, under its own stored goal (10)
    // 2026-08-07 and 2026-08-08: no row at all — genuinely missing, past dates.
    // 2026-08-09 (today): no row either, but today — never "failed".
  ];
  const summary = computeDailyStreakSummary(stats, "2026-08-09");

  assert.equal(findDay(summary, "2026-08-03").status, "completed", "Aug 3");
  assert.equal(findDay(summary, "2026-08-04").status, "completed", "Aug 4");
  assert.equal(findDay(summary, "2026-08-05").status, "failed", "Aug 5");
  assert.equal(findDay(summary, "2026-08-06").status, "failed", "Aug 6");
  assert.equal(findDay(summary, "2026-08-07").status, "failed", "Aug 7 (missing past row)");
  assert.equal(findDay(summary, "2026-08-08").status, "failed", "Aug 8 (missing past row)");
  assert.equal(findDay(summary, "2026-08-09").status, "inProgress", "Aug 9 (today, missing row)");

  assert.equal(summary.bestStreakDays, 2, "Aug 3-4 is the longest consecutive completed run");
  assert.equal(summary.currentStreakDays, 0, "the streak is broken by Aug 5 onward, all failed or missing");
});

console.log("\n=== goal-change stability ===\n");

// DailyStreakCard.tsx's own comments and the architecture guards
// (test-daily-goal-narrow-write-boundary.mjs) already prove no current-goal
// value can even be *passed* to computeDailyStreakSummary anymore (see
// test 0's arity guard above). This models the practical consequence for a
// realistic before/after refetch pair: only today's own row's stored
// snapshot may ever change; every historical row's status is byte-for-byte
// identical across both calls, regardless of what today's goal becomes.
test("36. Changing today's stored goal across a refetch never alters any historical day's status", () => {
  const beforeGoalChange = [
    stat(TODAY, 15, 15),
    stat("2026-08-18", 20, 20),
    stat("2026-08-17", 20, null),
  ];
  const afterGoalChange = [
    stat(TODAY, 15, 30), // same activity, only today's stored goal changed
    stat("2026-08-18", 20, 20), // byte-for-byte identical
    stat("2026-08-17", 20, null), // byte-for-byte identical
  ];

  const before = computeDailyStreakSummary(beforeGoalChange, TODAY);
  const after = computeDailyStreakSummary(afterGoalChange, TODAY);

  assert.equal(findDay(before, "2026-08-18").status, findDay(after, "2026-08-18").status);
  assert.equal(findDay(before, "2026-08-17").status, findDay(after, "2026-08-17").status);
  assert.equal(findDay(after, "2026-08-18").status, "completed");
  assert.equal(findDay(after, "2026-08-17").status, "completed");

  // Only today is allowed to differ — and does, because its own stored
  // snapshot genuinely changed (15 -> 30, no longer met by 15 completed).
  assert.equal(findDay(before, TODAY).status, "completed");
  assert.equal(findDay(after, TODAY).status, "inProgress");
});

console.log("\n=== streak refresh after a successful goal-change (data-flow model) ===\n");

// DailyStreakCard.tsx never fetches user_daily_stats itself at all — it
// only recomputes computeDailyStreakSummary from whatever shared
// dailyStatsRows it's handed (see that component's own comments). The
// actual refresh is driven by the shared daily-stats resource
// (useProfileSharedDailyStats.ts) refetching after DailyGoalSelector.tsx
// fires notifyDailyStatsChanged() on a successful update_daily_goal save
// (see test-daily-goal-narrow-write-boundary.mjs's source-text guards for
// that wiring). What matters *here*, at the pure-function level this suite
// can actually exercise, is that feeding computeDailyStreakSummary the
// "before" vs. "after" stats arrays a real refresh would produce behaves
// exactly as required: only today's completion may change, and only
// because today's own row now carries a different stored goal — never
// because any goal value was threaded into the computation directly.
test("37. Before a refresh: today's cached row (goal 15, 15 completed) reads completed, historical days intact", () => {
  const beforeRefresh = [
    stat(TODAY, 15, 15), // today, as originally fetched: stored goal 15
    stat("2026-08-18", 20, 20), // yesterday: unrelated stored snapshot
    stat("2026-08-17", 20, null), // day before: legacy row, uses LEGACY_DAILY_GOAL
  ];
  const summary = computeDailyStreakSummary(beforeRefresh, TODAY);
  assert.equal(findDay(summary, TODAY).status, "completed");
  assert.equal(summary.currentStreakDays, 3);
});

test("38. After a successful goal save to 30 and a refetch: today's row (now goal 30, still 15 completed) reads in-progress, historical days unchanged", () => {
  // Same 15 completed words as before — nothing about today's own activity
  // changed, only its stored goal, exactly as update_daily_goal's
  // server-side UPDATE ... WHERE stat_date = today would produce. Yesterday
  // and the day before are byte-for-byte the same rows as the "before"
  // case: update_daily_goal's WHERE clause never reaches a prior date.
  const afterRefresh = [
    stat(TODAY, 15, 30), // today, refetched: stored goal now 30
    stat("2026-08-18", 20, 20), // yesterday: identical to before the refresh
    stat("2026-08-17", 20, null), // day before: identical to before the refresh
  ];
  const summary = computeDailyStreakSummary(afterRefresh, TODAY);
  assert.equal(findDay(summary, TODAY).status, "inProgress", "today must not read completed against the refreshed goal of 30, but must not read failed either");
  assert.equal(findDay(summary, "2026-08-18").status, "completed", "yesterday's completion must be untouched by today's goal change");
  assert.equal(findDay(summary, "2026-08-17").status, "completed", "the legacy day's completion must be untouched by today's goal change");
  // Today not (yet) being complete doesn't zero the streak on its own — the
  // walk starts from yesterday instead (see computeDailyStreakSummary's own
  // "today not yet complete" comment) — so the still-intact two-day run
  // through yesterday and the day before remains the current streak, and
  // is also the best streak on record here.
  assert.equal(summary.currentStreakDays, 2);
  assert.equal(summary.bestStreakDays, 2);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("daily-streak guard passed");
}
