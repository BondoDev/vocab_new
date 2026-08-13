// Focused guard for the pure "Study New Words" queue-selection logic in
// src/data/learning/newWordStudyQueue.ts. That module is deliberately
// import-free (see its own header comment), so — like exerciseIds.ts in
// scripts/tests/practice/test-exercise-id-contract.mjs — it can be loaded
// directly here via Node's native TypeScript stripping, with no Supabase,
// React, or dynamic vocabulary-file dependency.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-new-word-study-queue.mjs
import assert from "node:assert/strict";
import {
  CEFR_LEVEL_RANK,
  computeRemainingDailyTarget,
  filterEligibleArrangedEntries,
  parseArrangedVocabulary,
  resolveConceptLevelFromId,
  selectNewWordStudyQueue,
} from "../../../src/data/learning/newWordStudyQueue.ts";

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

// Small, deterministic resolver stand-in: every concept resolves except the
// ids listed in `unresolvableIds`, so tests can exercise the skip-and-
// continue path without touching real vocabulary.json data.
function makeResolver(unresolvableIds = new Set()) {
  return (conceptId) => {
    if (unresolvableIds.has(conceptId)) {
      return null;
    }
    return { targetWord: `word-${conceptId}`, translation: `translation-${conceptId}` };
  };
}

function makeArrangedEntries(count) {
  return Array.from({ length: count }, (_, index) => {
    const conceptId = `C-${String(index + 1).padStart(4, "0")}`;
    return { learningOrder: index + 1, conceptId, level: resolveConceptLevelFromId(conceptId) };
  });
}

// Current-level (current_level task) fixtures below: a small hand-built
// arranged sequence spanning all six CEFR levels, preserving the same
// "existing arranged order" invariant selectNewWordStudyQueue must never
// reorder — built via parseArrangedVocabulary (not hand-set `level` fields)
// so these tests exercise the real conceptId-prefix resolution path, not a
// second hand-maintained mapping.
function makeCefrArrangedEntries() {
  const { entries } = parseArrangedVocabulary([
    { id: 1, concept_id: "A1-00001" },
    { id: 2, concept_id: "A1-00002" },
    { id: 3, concept_id: "A2-00001" },
    { id: 4, concept_id: "A2-00002" },
    { id: 5, concept_id: "B1-00001" },
    { id: 6, concept_id: "B1-00002" },
    { id: 7, concept_id: "B2-00001" },
    { id: 8, concept_id: "B2-00002" },
    { id: 9, concept_id: "C1-00001" },
    { id: 10, concept_id: "C1-00002" },
    { id: 11, concept_id: "C2-00001" },
    { id: 12, concept_id: "C2-00002" },
  ]);
  return entries;
}

function makeCefrResolver() {
  return (conceptId) => ({ targetWord: `word-${conceptId}`, translation: `translation-${conceptId}` });
}

console.log("\n=== parseArrangedVocabulary ===\n");

test("sorts by id ascending even when the raw input is out of order", () => {
  const { entries, warnings } = parseArrangedVocabulary([
    { id: 3, concept_id: "A1-0003" },
    { id: 1, concept_id: "A1-0001" },
    { id: 2, concept_id: "A1-0002" },
  ]);
  assert.deepEqual(
    entries.map((e) => e.learningOrder),
    [1, 2, 3],
  );
  assert.deepEqual(warnings, []);
});

test("drops malformed entries (non-finite id, empty/non-string concept_id) and warns", () => {
  const { entries, warnings } = parseArrangedVocabulary([
    { id: 1, concept_id: "A1-0001" },
    { id: "not-a-number", concept_id: "A1-0002" },
    { id: 3, concept_id: "" },
    { id: 4, concept_id: 12345 },
    { id: NaN, concept_id: "A1-0005" },
  ]);
  assert.deepEqual(
    entries.map((e) => e.conceptId),
    ["A1-0001"],
  );
  assert.equal(warnings.length, 4);
});

test("deduplicates repeated concept_id, keeping the earliest learningOrder occurrence, and warns", () => {
  const { entries, warnings } = parseArrangedVocabulary([
    { id: 1, concept_id: "A1-0001" },
    { id: 5, concept_id: "A1-0001" },
    { id: 2, concept_id: "A1-0002" },
  ]);
  assert.deepEqual(
    entries.map((e) => ({ learningOrder: e.learningOrder, conceptId: e.conceptId })),
    [
      { learningOrder: 1, conceptId: "A1-0001" },
      { learningOrder: 2, conceptId: "A1-0002" },
    ],
  );
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /duplicate concept_id/);
});

console.log("\n=== computeRemainingDailyTarget ===\n");

test("goal 15, completed 0 -> 15 remaining", () => {
  assert.equal(computeRemainingDailyTarget(15, 0), 15);
});
test("goal 15, completed 6 -> 9 remaining", () => {
  assert.equal(computeRemainingDailyTarget(15, 6), 9);
});
test("goal 15, completed 15 -> 0 remaining", () => {
  assert.equal(computeRemainingDailyTarget(15, 15), 0);
});
test("goal 15, completed 18 (over-completed) -> 0 remaining, never negative", () => {
  assert.equal(computeRemainingDailyTarget(15, 18), 0);
});

console.log("\n=== selectNewWordStudyQueue ===\n");

test("1. selects the first unseen concepts in learningOrder order", () => {
  const result = selectNewWordStudyQueue({
    arrangedEntries: makeArrangedEntries(10),
    studiedConceptIds: new Set(),
    dailyGoal: 5,
    wordsCompletedToday: 0,
    resolveConcept: makeResolver(),
  });
  assert.deepEqual(
    result.selectedQueue.map((item) => item.learningOrder),
    [1, 2, 3, 4, 5],
  );
});

test("2. excludes already-studied concepts, including gaps mid-sequence", () => {
  // Studied positions 1, 2, 4, and 8 — selector must skip them and preserve
  // the remaining order.
  const studied = new Set(["C-0001", "C-0002", "C-0004", "C-0008"]);
  const result = selectNewWordStudyQueue({
    arrangedEntries: makeArrangedEntries(10),
    studiedConceptIds: studied,
    dailyGoal: 5,
    wordsCompletedToday: 0,
    resolveConcept: makeResolver(),
  });
  assert.deepEqual(
    result.selectedQueue.map((item) => item.learningOrder),
    [3, 5, 6, 7, 9],
  );
});

test("3. keeps progress isolated per target language through the supplied studied-id set", () => {
  const arrangedEntries = makeArrangedEntries(3);
  // Same concept ("C-0002") studied in one language's set but not another —
  // the function itself is language-agnostic; isolation is entirely a
  // property of which set the caller passes in.
  const germanStudied = new Set(["C-0002"]);
  const spanishStudied = new Set();

  const germanResult = selectNewWordStudyQueue({
    arrangedEntries,
    studiedConceptIds: germanStudied,
    dailyGoal: 3,
    wordsCompletedToday: 0,
    resolveConcept: makeResolver(),
  });
  const spanishResult = selectNewWordStudyQueue({
    arrangedEntries,
    studiedConceptIds: spanishStudied,
    dailyGoal: 3,
    wordsCompletedToday: 0,
    resolveConcept: makeResolver(),
  });

  assert.ok(!germanResult.selectedQueue.some((item) => item.conceptId === "C-0002"));
  assert.ok(spanishResult.selectedQueue.some((item) => item.conceptId === "C-0002"));
});

test("4. respects the remaining daily target (goal 15, completed 6 -> 9 selected)", () => {
  const result = selectNewWordStudyQueue({
    arrangedEntries: makeArrangedEntries(20),
    studiedConceptIds: new Set(),
    dailyGoal: 15,
    wordsCompletedToday: 6,
    resolveConcept: makeResolver(),
  });
  assert.equal(result.remainingToday, 9);
  assert.equal(result.selectedQueueLength, 9);
});

test("5. returns an empty queue when the daily goal is already complete", () => {
  const result = selectNewWordStudyQueue({
    arrangedEntries: makeArrangedEntries(20),
    studiedConceptIds: new Set(),
    dailyGoal: 15,
    wordsCompletedToday: 15,
    resolveConcept: makeResolver(),
  });
  assert.equal(result.remainingToday, 0);
  assert.deepEqual(result.selectedQueue, []);
});

test("6. handles a fully exhausted arranged sequence for this language", () => {
  const arrangedEntries = makeArrangedEntries(5);
  const allStudied = new Set(arrangedEntries.map((e) => e.conceptId));
  const result = selectNewWordStudyQueue({
    arrangedEntries,
    studiedConceptIds: allStudied,
    dailyGoal: 15,
    wordsCompletedToday: 0,
    resolveConcept: makeResolver(),
  });
  assert.equal(result.isArrangedVocabularyExhausted, true);
  assert.equal(result.eligibleUnseenConceptsRemaining, 0);
  assert.deepEqual(result.selectedQueue, []);
});

test("7. never produces duplicate concept ids in one resulting queue", () => {
  // Feed selectNewWordStudyQueue the deduped output of parseArrangedVocabulary
  // (its own dedup is tested above) plus a resolver, and confirm no
  // downstream duplication is introduced.
  const { entries } = parseArrangedVocabulary([
    { id: 1, concept_id: "A1-0001" },
    { id: 2, concept_id: "A1-0001" },
    { id: 3, concept_id: "A1-0002" },
  ]);
  const result = selectNewWordStudyQueue({
    arrangedEntries: entries,
    studiedConceptIds: new Set(),
    dailyGoal: 10,
    wordsCompletedToday: 0,
    resolveConcept: makeResolver(),
  });
  const conceptIds = result.selectedQueue.map((item) => item.conceptId);
  assert.equal(new Set(conceptIds).size, conceptIds.length);
});

test("8. ignores malformed arranged entries upstream of selection", () => {
  const { entries } = parseArrangedVocabulary([
    { id: 1, concept_id: "A1-0001" },
    { id: "bad", concept_id: "A1-0002" },
    { id: 2, concept_id: "" },
  ]);
  const result = selectNewWordStudyQueue({
    arrangedEntries: entries,
    studiedConceptIds: new Set(),
    dailyGoal: 10,
    wordsCompletedToday: 0,
    resolveConcept: makeResolver(),
  });
  assert.deepEqual(
    result.selectedQueue.map((item) => item.conceptId),
    ["A1-0001"],
  );
});

test("9. continues past unresolved concepts to fill the usable queue", () => {
  const arrangedEntries = makeArrangedEntries(6);
  const unresolvable = new Set(["C-0002", "C-0004"]);
  const unresolvedSeen = [];
  const result = selectNewWordStudyQueue({
    arrangedEntries,
    studiedConceptIds: new Set(),
    dailyGoal: 4,
    wordsCompletedToday: 0,
    resolveConcept: makeResolver(unresolvable),
    onUnresolvedConcept: (entry) => unresolvedSeen.push(entry.conceptId),
  });
  // Wants 4 usable words; C-0002 and C-0004 are skipped, so the next
  // resolvable entries (C-0005, C-0006) fill their place.
  assert.deepEqual(
    result.selectedQueue.map((item) => item.conceptId),
    ["C-0001", "C-0003", "C-0005", "C-0006"],
  );
  assert.deepEqual(unresolvedSeen, ["C-0002", "C-0004"]);
});

test("10. does not select more than requested, even with far more eligible words available", () => {
  const result = selectNewWordStudyQueue({
    arrangedEntries: makeArrangedEntries(500),
    studiedConceptIds: new Set(),
    dailyGoal: 15,
    wordsCompletedToday: 0,
    resolveConcept: makeResolver(),
  });
  assert.equal(result.selectedQueueLength, 15);
  assert.equal(result.selectedQueue.length, 15);
});

test("handles remaining target larger than available vocabulary (selects only what's available)", () => {
  const result = selectNewWordStudyQueue({
    arrangedEntries: makeArrangedEntries(3),
    studiedConceptIds: new Set(),
    dailyGoal: 50,
    wordsCompletedToday: 0,
    resolveConcept: makeResolver(),
  });
  // Exactly the 3 available words are selected — fewer than the daily
  // target, but eligibleUnseenConceptsRemaining still reports the 3 that
  // existed *before* this selection (exhaustion describes "nothing left to
  // ever queue," not "this call happened to take all of them").
  assert.equal(result.selectedQueueLength, 3);
  assert.equal(result.eligibleUnseenConceptsRemaining, 3);
  assert.equal(result.isArrangedVocabularyExhausted, false);
});

test("reports metadata: first/last selected learningOrder and daily-goal fields", () => {
  const result = selectNewWordStudyQueue({
    arrangedEntries: makeArrangedEntries(10),
    studiedConceptIds: new Set(),
    dailyGoal: 4,
    wordsCompletedToday: 1,
    resolveConcept: makeResolver(),
  });
  assert.equal(result.dailyGoal, 4);
  assert.equal(result.wordsCompletedToday, 1);
  assert.equal(result.remainingToday, 3);
  assert.equal(result.firstSelectedLearningOrder, 1);
  assert.equal(result.lastSelectedLearningOrder, 3);
});

console.log("\n=== resolveConceptLevelFromId / CEFR_LEVEL_RANK ===\n");

test("resolves the CEFR prefix off a concept id", () => {
  assert.equal(resolveConceptLevelFromId("A1-00497"), "A1");
  assert.equal(resolveConceptLevelFromId("C2-00002"), "C2");
});

test("returns null for a concept id with no recognizable CEFR prefix", () => {
  assert.equal(resolveConceptLevelFromId("C-0001"), null);
  assert.equal(resolveConceptLevelFromId(""), null);
});

test("CEFR_LEVEL_RANK is ascending A1..C2, never compared alphabetically", () => {
  assert.deepEqual(CEFR_LEVEL_RANK, { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 });
});

console.log("\n=== current-level CEFR threshold: filterEligibleArrangedEntries ===\n");

test("1. A1 current level: every level remains eligible (no threshold)", () => {
  const eligible = filterEligibleArrangedEntries(makeCefrArrangedEntries(), new Set(), "A1");
  assert.deepEqual(
    eligible.map((e) => e.conceptId),
    [
      "A1-00001", "A1-00002", "A2-00001", "A2-00002", "B1-00001", "B1-00002",
      "B2-00001", "B2-00002", "C1-00001", "C1-00002", "C2-00001", "C2-00002",
    ],
  );
});

test("2. A2 current level: A1 words never eligible", () => {
  const eligible = filterEligibleArrangedEntries(makeCefrArrangedEntries(), new Set(), "A2");
  assert.ok(!eligible.some((e) => e.conceptId.startsWith("A1-")));
  assert.ok(eligible.some((e) => e.conceptId.startsWith("A2-")));
});

test("3. B1 current level: A1/A2 words never eligible", () => {
  const eligible = filterEligibleArrangedEntries(makeCefrArrangedEntries(), new Set(), "B1");
  assert.ok(!eligible.some((e) => e.conceptId.startsWith("A1-") || e.conceptId.startsWith("A2-")));
  assert.ok(eligible.some((e) => e.conceptId.startsWith("B1-")));
});

test("4. B2 current level: A1/A2/B1 words never eligible", () => {
  const eligible = filterEligibleArrangedEntries(makeCefrArrangedEntries(), new Set(), "B2");
  assert.deepEqual(
    eligible.map((e) => e.conceptId),
    ["B2-00001", "B2-00002", "C1-00001", "C1-00002", "C2-00001", "C2-00002"],
  );
});

test("5. C1 current level: only C1/C2 words eligible", () => {
  const eligible = filterEligibleArrangedEntries(makeCefrArrangedEntries(), new Set(), "C1");
  assert.deepEqual(
    eligible.map((e) => e.conceptId),
    ["C1-00001", "C1-00002", "C2-00001", "C2-00002"],
  );
});

test("6. C2 current level: only C2 words eligible", () => {
  const eligible = filterEligibleArrangedEntries(makeCefrArrangedEntries(), new Set(), "C2");
  assert.deepEqual(
    eligible.map((e) => e.conceptId),
    ["C2-00001", "C2-00002"],
  );
});

test("7. the selected level itself is included, not just levels strictly above it", () => {
  const eligible = filterEligibleArrangedEntries(makeCefrArrangedEntries(), new Set(), "B2");
  assert.ok(eligible.some((e) => e.conceptId === "B2-00001"));
});

test("9. relative arranged order of eligible words is preserved (not regrouped)", () => {
  const eligible = filterEligibleArrangedEntries(makeCefrArrangedEntries(), new Set(), "B1");
  const learningOrders = eligible.map((e) => e.learningOrder);
  const sorted = [...learningOrders].sort((a, b) => a - b);
  assert.deepEqual(learningOrders, sorted);
});

test("10. already-studied words stay excluded even when their level is above the threshold", () => {
  const studied = new Set(["B2-00001", "C1-00001"]);
  const eligible = filterEligibleArrangedEntries(makeCefrArrangedEntries(), studied, "B2");
  assert.deepEqual(
    eligible.map((e) => e.conceptId),
    ["B2-00002", "C1-00002", "C2-00001", "C2-00002"],
  );
});

test("11. existing lower-level progress is not modified or inspected beyond membership", () => {
  // A2/B1 concepts a learner already has real progress on are excluded via
  // studiedConceptIds — the same pre-existing mechanism, untouched by this
  // threshold — not by the CEFR filter. The input set itself is never
  // mutated by filtering.
  const studied = new Set(["A2-00001", "B1-00001"]);
  const studiedSnapshot = new Set(studied);
  filterEligibleArrangedEntries(makeCefrArrangedEntries(), studied, "B2");
  assert.deepEqual(studied, studiedSnapshot);
});

test("14. lowering the threshold (B2 -> A2) makes unstudied A2/B1 words eligible again, without touching progress", () => {
  const studied = new Set(["A1-00001"]); // pre-existing progress, untouched throughout
  const arranged = makeCefrArrangedEntries();

  const atB2 = filterEligibleArrangedEntries(arranged, studied, "B2");
  assert.ok(!atB2.some((e) => e.conceptId.startsWith("A2-") || e.conceptId.startsWith("B1-")));

  const atA2 = filterEligibleArrangedEntries(arranged, studied, "A2");
  assert.ok(atA2.some((e) => e.conceptId === "A2-00001"));
  assert.ok(atA2.some((e) => e.conceptId === "B1-00001"));
  // The already-studied A1 concept remains excluded regardless of threshold,
  // and studiedConceptIds itself is never rewritten by lowering the level.
  assert.ok(!atA2.some((e) => e.conceptId === "A1-00001"));
  assert.deepEqual(studied, new Set(["A1-00001"]));
});

test("missing/empty current level fails safe to no threshold (equivalent to A1)", () => {
  const withUndefined = filterEligibleArrangedEntries(makeCefrArrangedEntries(), new Set());
  const withNull = filterEligibleArrangedEntries(makeCefrArrangedEntries(), new Set(), null);
  const withEmptyString = filterEligibleArrangedEntries(makeCefrArrangedEntries(), new Set(), "");
  assert.equal(withUndefined.length, 12);
  assert.equal(withNull.length, 12);
  assert.equal(withEmptyString.length, 12);
});

console.log("\n=== current-level CEFR threshold: selectNewWordStudyQueue integration ===\n");

test("8. higher levels remain eligible after the selected level itself is exhausted", () => {
  // B2 current level, daily goal larger than B2's own 2 words — must
  // naturally continue into C1 without stopping early.
  const result = selectNewWordStudyQueue({
    arrangedEntries: makeCefrArrangedEntries(),
    studiedConceptIds: new Set(),
    dailyGoal: 4,
    wordsCompletedToday: 0,
    currentLevel: "B2",
    resolveConcept: makeCefrResolver(),
  });
  assert.deepEqual(
    result.selectedQueue.map((item) => item.conceptId),
    ["B2-00001", "B2-00002", "C1-00001", "C1-00002"],
  );
});

test("12. no rows/queue entries are produced merely because words are below the threshold", () => {
  // C2 current level: only the 2 C2 words are ever considered, even though
  // the daily goal (15) and the arranged data (12 words) could otherwise
  // supply more — the 10 below-threshold words are never selected, counted,
  // or otherwise surfaced.
  const result = selectNewWordStudyQueue({
    arrangedEntries: makeCefrArrangedEntries(),
    studiedConceptIds: new Set(),
    dailyGoal: 15,
    wordsCompletedToday: 0,
    currentLevel: "C2",
    resolveConcept: makeCefrResolver(),
  });
  assert.equal(result.selectedQueueLength, 2);
  assert.deepEqual(
    result.selectedQueue.map((item) => item.conceptId),
    ["C2-00001", "C2-00002"],
  );
});

test("13. daily quantity behavior is unchanged by the CEFR threshold (still caps at remainingToday)", () => {
  const result = selectNewWordStudyQueue({
    arrangedEntries: makeCefrArrangedEntries(),
    studiedConceptIds: new Set(),
    dailyGoal: 5,
    wordsCompletedToday: 2,
    currentLevel: "A1",
    resolveConcept: makeCefrResolver(),
  });
  assert.equal(result.remainingToday, 3);
  assert.equal(result.selectedQueueLength, 3);
});

test("existing progress example (spec item 13): A2/B1 progress untouched, B2 continues into C1", () => {
  // User level = B2; progress already exists for one A2 word, one B1 word,
  // and two B2 words (both of B2's own words in this fixture).
  const studied = new Set(["A2-00001", "B1-00001", "B2-00001", "B2-00002"]);
  const result = selectNewWordStudyQueue({
    arrangedEntries: makeCefrArrangedEntries(),
    studiedConceptIds: studied,
    dailyGoal: 2,
    wordsCompletedToday: 0,
    currentLevel: "B2",
    resolveConcept: makeCefrResolver(),
  });
  // Both B2 words are already studied, so the queue continues into C1 —
  // never resurrecting the studied B2 words, never touching A2/B1 rows.
  assert.deepEqual(
    result.selectedQueue.map((item) => item.conceptId),
    ["C1-00001", "C1-00002"],
  );
  assert.deepEqual(studied, new Set(["A2-00001", "B1-00001", "B2-00001", "B2-00002"]));
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("new-word-study-queue guard passed");
}
