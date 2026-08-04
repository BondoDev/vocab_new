// Focused guard for the pure Review Words queue-selection engine:
// src/data/learning/reviewQueue.ts, reviewQueueConfig.ts, and
// reviewQueueWeights.ts. All three are deliberately import-free of
// Supabase/React/vocabulary data (see reviewQueue.ts's own header comment),
// so — like test-new-word-study-queue.mjs and test-word-review-schedule.mjs
// — they can be loaded directly here via Node's native TypeScript stripping.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-review-queue.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeDeadlineApproachFactor,
  computeOverduePriority,
  computeRecencyFactor,
  parseDateSafe,
  selectReviewQueue,
  selectReviewQueueWithResolution,
} from "../../../src/data/learning/reviewQueue.ts";
import { REVIEW_STATE_WEIGHT } from "../../../src/data/learning/reviewQueueConfig.ts";
import { shuffleWithRandomFn, weightedSampleWithoutReplacement } from "../../../src/data/learning/reviewQueueWeights.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

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

const NOW = new Date("2026-08-04T12:00:00.000Z");
const NOW_MS = NOW.getTime();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

function isoHoursAgo(hours) {
  return new Date(NOW_MS - hours * ONE_HOUR_MS).toISOString();
}

function isoDaysAgo(days) {
  return new Date(NOW_MS - days * ONE_DAY_MS).toISOString();
}

let rowCounter = 0;
function makeRow(overrides = {}) {
  rowCounter += 1;
  return {
    id: `row-${rowCounter}`,
    wordId: `word-${rowCounter}`,
    wordState: "seen",
    correctStreak: 0,
    lastPracticedAt: null,
    nextReviewAt: null,
    createdAt: null,
    ...overrides,
  };
}

// A "fully eligible, non-overdue" row: practiced long enough ago that the
// recency cooldown no longer applies, with no scheduled deadline (so
// deadlineApproachFactor stays neutral).
function eligibleRow(overrides = {}) {
  return makeRow({ lastPracticedAt: isoHoursAgo(200), ...overrides });
}

// Pads a pool up to (at least) REVIEW_SMALL_LIBRARY_WORD_COUNT_THRESHOLD
// (100) total valid rows so tests that rely on the *normal* (large-library)
// cooldown behavior aren't accidentally flipped into small-library-bypass
// mode. Each filler row is itself very-recently-practiced and not overdue,
// so — once the pool is >=100 and the bypass is off — it also gets weight 0
// and is filtered out of weighted sampling, exactly like it would have been
// before REVIEW_SMALL_LIBRARY_WORD_COUNT_THRESHOLD existed. It only ever
// inflates totalLearnedWordsConsidered; it never competes for a slot.
function makeInertVeryRecentFillerRows(existingCount, targetTotal = 100) {
  const fillerCount = Math.max(targetTotal - existingCount, 0);
  return Array.from({ length: fillerCount }, () => makeRow({ lastPracticedAt: isoHoursAgo(0.5) }));
}

console.log("\n=== selectReviewQueue: empty/degenerate input ===\n");

test("1. Empty progress returns an empty queue and flags no reviewable vocabulary", () => {
  const result = selectReviewQueue({ progressRows: [], now: NOW });
  assert.deepEqual(result.selections, []);
  assert.equal(result.metadata.totalLearnedWordsConsidered, 0);
  assert.equal(result.metadata.hasNoReviewableVocabulary, true);
  assert.equal(result.metadata.actualQueueSize, 0);
});

console.log("\n=== selectReviewQueue: session size, uniqueness ===\n");

test("2. Target session size is respected when enough eligible words exist", () => {
  const states = ["seen", "learning", "familiar", "strong", "mastered"];
  const rows = Array.from({ length: 30 }, (_, i) => eligibleRow({ wordState: states[i % states.length] }));
  const result = selectReviewQueue({ progressRows: rows, sessionSize: 20, now: NOW });
  assert.equal(result.selections.length, 20);
  assert.equal(result.metadata.actualQueueSize, 20);
  assert.equal(result.metadata.requestedSessionSize, 20);
});

test("3. No duplicate words are selected", () => {
  const rows = Array.from({ length: 40 }, () => eligibleRow());
  const result = selectReviewQueue({ progressRows: rows, sessionSize: 20, now: NOW });
  const ids = result.selections.map((s) => s.row.id);
  assert.equal(new Set(ids).size, ids.length);
});

console.log("\n=== selectReviewQueue: overdue pool ===\n");

test("4. Overdue words are selected before weighted sampling", () => {
  const overdueRow = makeRow({ wordState: "mastered", nextReviewAt: isoDaysAgo(1) });
  const seenRows = Array.from({ length: 25 }, () => eligibleRow({ wordState: "seen" }));
  const result = selectReviewQueue({ progressRows: [overdueRow, ...seenRows], sessionSize: 5, now: NOW });
  const match = result.selections.find((s) => s.row.id === overdueRow.id);
  assert.ok(match, "overdue row must be present in the final queue");
  assert.equal(match.source, "overdue");
});

test("5. Normal overdue share targets approximately 40% of the session", () => {
  const overdueRows = Array.from({ length: 30 }, (_, i) => makeRow({ nextReviewAt: isoDaysAgo(1 + i) }));
  const randomRows = Array.from({ length: 30 }, () => eligibleRow({ wordState: "learning" }));
  const result = selectReviewQueue({ progressRows: [...overdueRows, ...randomRows], sessionSize: 20, now: NOW });
  assert.equal(result.metadata.overdueSelectedCount, 8);
  assert.equal(result.metadata.randomSelectedCount, 12);
  assert.equal(result.metadata.actualQueueSize, 20);
});

test("6. Overdue selection expands when random candidates are insufficient", () => {
  // lastPracticedAt is set very recently on purpose: it keeps these rows'
  // *fallback* weighted-random weight at 0 (cooldown), so any leftover
  // overdue candidate beyond the initial target-share take can only reach
  // the final queue through the explicit expansion pass below — not by
  // being swept up into the random pool first. Padded to a 100+ row pool
  // (see makeInertVeryRecentFillerRows) so the small-library cooldown
  // bypass doesn't kick in and neutralize that setup — this test is
  // specifically about the normal, large-library cooldown behavior; the
  // bypass itself has its own dedicated tests below.
  const overdueRows = Array.from({ length: 15 }, (_, i) =>
    makeRow({ nextReviewAt: isoDaysAgo(1 + i), lastPracticedAt: isoHoursAgo(0.5) }),
  );
  const randomRows = Array.from({ length: 2 }, () => eligibleRow({ wordState: "learning" }));
  const fillerRows = makeInertVeryRecentFillerRows(overdueRows.length + randomRows.length);
  const result = selectReviewQueue({
    progressRows: [...overdueRows, ...randomRows, ...fillerRows],
    sessionSize: 20,
    now: NOW,
  });
  // Target would be 8, but only 2 random candidates exist, so overdue
  // expands to fill all remaining capacity (all 15 overdue candidates).
  assert.equal(result.metadata.overdueSelectedCount, 15);
  assert.equal(result.metadata.randomSelectedCount, 2);
  assert.equal(result.metadata.actualQueueSize, 17);
  assert.equal(result.metadata.hasFewerWordsThanRequested, true);
});

console.log("\n=== selectReviewQueue: weighted random pool ===\n");

test("7. Weighted random selection respects state weights under deterministic randomness", () => {
  const highWeightRow = eligibleRow({ wordState: "seen" }); // weight 12
  const lowWeightRow = eligibleRow({ wordState: "mastered" }); // weight 0.35
  const result = selectReviewQueue({
    progressRows: [highWeightRow, lowWeightRow],
    sessionSize: 1,
    now: NOW,
    randomFn: () => 0.5, // identical draw for both -> higher weight must win
  });
  assert.equal(result.selections.length, 1);
  assert.equal(result.selections[0].row.id, highWeightRow.id);
  assert.equal(result.selections[0].source, "weighted_random");
});

test("8. Recently practised words receive cooldown reduction", () => {
  const veryRecentMs = parseDateSafe(isoHoursAgo(1));
  const midDayMs = parseDateSafe(isoHoursAgo(50));
  const distantMs = parseDateSafe(isoHoursAgo(200));
  const veryRecentFactor = computeRecencyFactor(veryRecentMs, NOW_MS);
  const midDayFactor = computeRecencyFactor(midDayMs, NOW_MS);
  const distantFactor = computeRecencyFactor(distantMs, NOW_MS);
  assert.ok(veryRecentFactor < midDayFactor, "recently practised must score lower than a mid-day-old practice");
  assert.ok(midDayFactor < distantFactor, "a mid-day-old practice must score lower than a distant one");
  assert.equal(distantFactor, 1);
});

test("9. Words practised under two hours ago are excluded from normal random selection (library >= 100 words)", () => {
  const veryRecentRow = eligibleRow({ wordState: "seen", lastPracticedAt: isoHoursAgo(0.5) });
  const decoyRow = eligibleRow({ wordState: "mastered" }); // distant practice, low weight but eligible
  // Padded to >= 100 total rows so the small-library bypass (see test 9b)
  // doesn't apply — this test is specifically about the normal cooldown.
  const fillerRows = makeInertVeryRecentFillerRows(2);
  const result = selectReviewQueue({
    progressRows: [veryRecentRow, decoyRow, ...fillerRows],
    sessionSize: 1,
    now: NOW,
  });
  assert.equal(result.metadata.randomCandidateCount, 1, "the very-recent row must not count as an eligible candidate");
  assert.equal(result.selections.length, 1);
  assert.equal(result.selections[0].row.id, decoyRow.id);
});

console.log("\n=== small-library cooldown bypass (< 100 learned words) ===\n");

test("9b. computeRecencyFactor: bypassVeryRecentCooldown treats a <2h reference as fully eligible (factor 1) instead of 0", () => {
  const veryRecentMs = parseDateSafe(isoHoursAgo(0.5));
  assert.equal(computeRecencyFactor(veryRecentMs, NOW_MS), 0, "default (no bypass) stays a hard 0");
  assert.equal(computeRecencyFactor(veryRecentMs, NOW_MS, false), 0, "explicit false behaves the same as the default");
  assert.equal(computeRecencyFactor(veryRecentMs, NOW_MS, true), 1, "bypass treats it as fully eligible");
});

test("9c. computeRecencyFactor: bypassVeryRecentCooldown does not affect the recent/sameDay/extended tiers", () => {
  const recentMs = parseDateSafe(isoHoursAgo(6));
  const sameDayMs = parseDateSafe(isoHoursAgo(20));
  const extendedMs = parseDateSafe(isoHoursAgo(50));
  for (const bypass of [false, true]) {
    assert.equal(computeRecencyFactor(recentMs, NOW_MS, bypass), 0.1, `recent tier, bypass=${bypass}`);
    assert.equal(computeRecencyFactor(sameDayMs, NOW_MS, bypass), 0.3, `sameDay tier, bypass=${bypass}`);
    assert.equal(computeRecencyFactor(extendedMs, NOW_MS, bypass), 0.7, `extended tier, bypass=${bypass}`);
  }
});

test("9d. Small library (< 100 learned words): a word practised under two hours ago IS selectable", () => {
  const veryRecentRow = eligibleRow({ wordState: "seen", lastPracticedAt: isoHoursAgo(0.5) });
  // 3 total rows — well under the 100-word threshold, so the bypass applies.
  const otherRows = Array.from({ length: 2 }, () => eligibleRow({ wordState: "learning" }));
  const result = selectReviewQueue({
    progressRows: [veryRecentRow, ...otherRows],
    sessionSize: 3,
    now: NOW,
  });
  assert.equal(result.metadata.randomCandidateCount, 3, "all three rows must count as eligible, including the recent one");
  assert.equal(result.metadata.actualQueueSize, 3);
  assert.ok(
    result.selections.some((s) => s.row.id === veryRecentRow.id),
    "the recently-practised word must be reachable when the library is small",
  );
});

test("9e. Threshold boundary: exactly 100 learned words keeps the cooldown active; 99 engages the bypass", () => {
  // Distant (not very-recent) filler, so only `veryRecentRow` itself is
  // affected by the bypass decision — the filler exists purely to move
  // totalLearnedWordsConsidered across the 100-word line.
  const buildPool = (totalCount) => {
    const veryRecentRow = eligibleRow({
      id: "boundary-recent-row",
      wordState: "seen",
      lastPracticedAt: isoHoursAgo(0.5),
    });
    const filler = Array.from({ length: totalCount - 1 }, () => eligibleRow({ wordState: "learning" }));
    return { veryRecentRow, pool: [veryRecentRow, ...filler] };
  };

  const at99 = buildPool(99);
  const resultAt99 = selectReviewQueue({ progressRows: at99.pool, sessionSize: at99.pool.length, now: NOW });
  assert.ok(
    resultAt99.selections.some((s) => s.row.id === at99.veryRecentRow.id),
    "below the threshold (99 words): the recent row must be selectable",
  );

  const at100 = buildPool(100);
  const resultAt100 = selectReviewQueue({ progressRows: at100.pool, sessionSize: at100.pool.length, now: NOW });
  assert.ok(
    !resultAt100.selections.some((s) => s.row.id === at100.veryRecentRow.id),
    "at the threshold (100 words): the recent row must be excluded again",
  );
});

test("10. Deadline approach increases random weight as the deadline gets closer", () => {
  const lastPracticedAtMs = NOW_MS - 100_000;
  const nextReviewAtMs = NOW_MS + 0; // interval is defined relative to "now" below per-case
  // Build three points in time along a fixed 100_000ms interval.
  const intervalStart = 1_000_000;
  const intervalEnd = intervalStart + 100_000;
  const atStart = computeDeadlineApproachFactor(intervalStart, intervalEnd, intervalStart);
  const atHalfway = computeDeadlineApproachFactor(intervalStart, intervalEnd, intervalStart + 50_000);
  const atDeadline = computeDeadlineApproachFactor(intervalStart, intervalEnd, intervalEnd);
  assert.equal(atStart, 0.5);
  assert.equal(atHalfway, 1.25);
  assert.equal(atDeadline, 2);
  assert.ok(atStart < atHalfway && atHalfway < atDeadline);
  // Silence unused-variable lint concerns for the illustrative constants above.
  void lastPracticedAtMs;
  void nextReviewAtMs;
});

console.log("\n=== overdue priority formula ===\n");

test("11. Overdue priority considers both overdue duration and state urgency", () => {
  const sameDurationSeen = computeOverduePriority({ nextReviewAt: isoDaysAgo(2), wordState: "seen" }, NOW_MS);
  const sameDurationMastered = computeOverduePriority({ nextReviewAt: isoDaysAgo(2), wordState: "mastered" }, NOW_MS);
  assert.ok(sameDurationSeen.priority > sameDurationMastered.priority);
  assert.equal(sameDurationSeen.priority, 2 * 5);
  assert.equal(sameDurationMastered.priority, 2 * 1);

  const shortOverdue = computeOverduePriority({ nextReviewAt: isoDaysAgo(1), wordState: "learning" }, NOW_MS);
  const longOverdue = computeOverduePriority({ nextReviewAt: isoDaysAgo(5), wordState: "learning" }, NOW_MS);
  assert.ok(longOverdue.priority > shortOverdue.priority);
  assert.equal(shortOverdue.priority, 1 * 4);
  assert.equal(longOverdue.priority, 5 * 4);
});

test("11b. A safe minimum urgency applies to words overdue by only moments", () => {
  const justOverdue = computeOverduePriority(
    { nextReviewAt: new Date(NOW_MS - 60 * 1000).toISOString(), wordState: "learning" },
    NOW_MS,
  );
  assert.ok(justOverdue !== null);
  // Floored to REVIEW_MIN_OVERDUE_DAYS (1/24 day) rather than ~0.
  assert.ok(Math.abs(justOverdue.priority - (1 / 24) * 4) < 1e-9);
});

test("11c. A future next_review_at is not an overdue candidate", () => {
  const notYetDue = computeOverduePriority(
    { nextReviewAt: new Date(NOW_MS + ONE_DAY_MS).toISOString(), wordState: "seen" },
    NOW_MS,
  );
  assert.equal(notYetDue, null);
});

console.log("\n=== weighted sampling & shuffle helpers ===\n");

test("12. Weighted sampling happens without replacement", () => {
  const candidates = [1, 2, 3, 4, 5].map((n) => ({ id: n, weight: n }));
  let call = 0;
  const sequence = [0.9, 0.1, 0.8, 0.2, 0.7];
  const randomFn = () => sequence[call++ % sequence.length];
  const result = weightedSampleWithoutReplacement(candidates, (c) => c.weight, 5, randomFn);
  assert.equal(result.length, 5);
  assert.equal(new Set(result.map((c) => c.id)).size, 5);
});

test("12b. Weighted sampling ignores non-finite/non-positive weights", () => {
  const candidates = [
    { id: "a", weight: 5 },
    { id: "b", weight: 0 },
    { id: "c", weight: -3 },
    { id: "d", weight: NaN },
    { id: "e", weight: 2 },
  ];
  const result = weightedSampleWithoutReplacement(candidates, (c) => c.weight, 10, () => 0.5);
  assert.equal(result.length, 2);
  assert.deepEqual(
    new Set(result.map((c) => c.id)),
    new Set(["a", "e"]),
  );
});

test("12c. Weighted sampling handles an empty candidate list and non-positive counts", () => {
  assert.deepEqual(weightedSampleWithoutReplacement([], (c) => c, 5, () => 0.5), []);
  assert.deepEqual(weightedSampleWithoutReplacement([{ weight: 1 }], (c) => c.weight, 0, () => 0.5), []);
});

test("13. Final shuffle does not lose or duplicate items", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: i }));
  const shuffled = shuffleWithRandomFn(items, Math.random);
  assert.equal(shuffled.length, items.length);
  assert.deepEqual(
    shuffled.map((i) => i.id).sort((a, b) => a - b),
    items.map((i) => i.id),
  );
});

console.log("\n=== availability edge cases ===\n");

test("14. Queue works when fewer words exist than requested", () => {
  const rows = Array.from({ length: 5 }, () => eligibleRow());
  const result = selectReviewQueue({ progressRows: rows, sessionSize: 20, now: NOW });
  assert.equal(result.metadata.actualQueueSize, 5);
  assert.equal(result.metadata.hasFewerWordsThanRequested, true);
  assert.equal(new Set(result.selections.map((s) => s.row.id)).size, 5);
});

test("15. Invalid/missing dates are handled safely", () => {
  const row = makeRow({ nextReviewAt: "not-a-real-date", lastPracticedAt: null, createdAt: null });
  assert.doesNotThrow(() => {
    const result = selectReviewQueue({ progressRows: [row], sessionSize: 1, now: NOW });
    assert.equal(result.selections.length, 1);
    assert.equal(result.selections[0].source, "weighted_random");
  });
});

test("16. Invalid states and malformed rows are skipped rather than crashing selection", () => {
  const rows = [
    makeRow({ wordState: "not_a_real_state" }),
    makeRow({ id: "" }),
    makeRow({ wordId: "" }),
    eligibleRow({ wordState: "familiar" }),
  ];
  const result = selectReviewQueue({ progressRows: rows, sessionSize: 5, now: NOW });
  assert.equal(result.metadata.totalLearnedWordsConsidered, 1);
  assert.equal(result.selections.length, 1);
  assert.equal(result.selections[0].row.wordState, "familiar");
});

console.log("\n=== selectReviewQueueWithResolution ===\n");

test("17. Unresolved vocabulary items are skipped and later candidates fill the queue", () => {
  const rows = [
    makeRow({ id: "r1", wordId: "w1" }),
    makeRow({ id: "r2", wordId: "w2" }),
    makeRow({ id: "r3", wordId: "w3" }),
    makeRow({ id: "r4", wordId: "w4" }),
    makeRow({ id: "r5", wordId: "w5" }),
  ].map((row) => ({ ...row, lastPracticedAt: isoHoursAgo(200) }));

  const unresolvable = new Set(["w2", "w4"]);
  const unresolvedRowIds = [];
  const result = selectReviewQueueWithResolution({
    progressRows: rows,
    sessionSize: 3,
    now: NOW,
    randomFn: () => 0, // deterministic: ties keep original pool order
    resolveConcept: (wordId) => (unresolvable.has(wordId) ? null : { word: wordId }),
    onUnresolvedRow: (row) => unresolvedRowIds.push(row.id),
  });

  assert.equal(result.items.length, 3);
  assert.deepEqual(unresolvedRowIds.sort(), ["r2", "r4"]);
  assert.deepEqual(
    result.items.map((item) => item.row.id).sort(),
    ["r1", "r3", "r5"],
  );
  assert.equal(result.metadata.actualQueueSize, 3);
});

test("17b. Resolution rounds stop once candidates are exhausted (no unbounded loop)", () => {
  const rows = [makeRow({ id: "only", wordId: "w-only", lastPracticedAt: isoHoursAgo(200) })];
  const result = selectReviewQueueWithResolution({
    progressRows: rows,
    sessionSize: 5,
    now: NOW,
    resolveConcept: () => null, // never resolves
  });
  assert.equal(result.items.length, 0);
  assert.equal(result.metadata.actualQueueSize, 0);
});

console.log("\n=== isolation & state-weight coverage ===\n");

test("18. selectReviewQueue is a pure function of its input rows (no cross-call contamination)", () => {
  const germanRows = Array.from({ length: 6 }, (_, i) => eligibleRow({ id: `de-${i}`, wordId: `de-word-${i}` }));
  const spanishRows = Array.from({ length: 6 }, (_, i) => eligibleRow({ id: `es-${i}`, wordId: `es-word-${i}` }));

  const germanResult = selectReviewQueue({ progressRows: germanRows, sessionSize: 6, now: NOW });
  const spanishResult = selectReviewQueue({ progressRows: spanishRows, sessionSize: 6, now: NOW });

  const germanIds = new Set(germanRows.map((r) => r.id));
  const spanishIds = new Set(spanishRows.map((r) => r.id));

  assert.ok(germanResult.selections.every((s) => germanIds.has(s.row.id)));
  assert.ok(spanishResult.selections.every((s) => spanishIds.has(s.row.id)));
  assert.ok(germanResult.selections.every((s) => !spanishIds.has(s.row.id)));
});

test("19. Strong and Mastered words remain selectable with their low nonzero weights", () => {
  assert.ok(REVIEW_STATE_WEIGHT.strong > 0);
  assert.ok(REVIEW_STATE_WEIGHT.mastered > 0);

  const rows = [
    eligibleRow({ wordState: "strong" }),
    eligibleRow({ wordState: "mastered" }),
    eligibleRow({ wordState: "mastered" }),
  ];
  const result = selectReviewQueue({ progressRows: rows, sessionSize: 3, now: NOW });
  assert.equal(result.selections.length, 3);
});

console.log("\n=== architectural purity ===\n");

test("20. The pure engine files never import Supabase, React, or a .tsx component", () => {
  const files = ["reviewQueue.ts", "reviewQueueConfig.ts", "reviewQueueWeights.ts"].map((name) =>
    fs.readFileSync(path.join(ROOT_DIR, "src", "data", "learning", name), "utf8"),
  );
  for (const source of files) {
    // Checks actual import statements only (not doc-comment prose that
    // merely explains what this module deliberately avoids importing).
    const importLines = source.split("\n").filter((line) => /^\s*import\s/.test(line));
    for (const line of importLines) {
      assert.ok(!/supabase/i.test(line), `must not import Supabase: "${line.trim()}"`);
      assert.ok(!/from ["']react/i.test(line), `must not import React: "${line.trim()}"`);
      assert.ok(!/\.tsx["']/.test(line), `must not import a .tsx component: "${line.trim()}"`);
    }
  }
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("review-queue guard passed");
}
