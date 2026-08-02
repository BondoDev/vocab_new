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
  computeRemainingDailyTarget,
  parseArrangedVocabulary,
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
  return Array.from({ length: count }, (_, index) => ({
    learningOrder: index + 1,
    conceptId: `C-${String(index + 1).padStart(4, "0")}`,
  }));
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

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("new-word-study-queue guard passed");
}
