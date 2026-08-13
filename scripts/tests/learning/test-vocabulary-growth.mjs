// Focused guard for the pure Vocabulary Growth history-reconstruction and
// aggregation engine in src/data/learning/vocabularyGrowth.ts. These tests
// exercise the pure functions directly against synthetic (word, event)
// inputs — already-resolved YYYY-MM-DD dates, matching what the real
// loader (loadVocabularyGrowthHistory.ts) and the new
// read_vocabulary_growth_events RPC actually hand this module.
//
// Run: node --experimental-strip-types scripts/tests/learning/test-vocabulary-growth.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  computeVocabularyGrowthHistory,
  filterVocabularyGrowthByRange,
  applyCurrentDayOverride,
  resolveWordCreatedDateISO,
} from "../../../src/data/learning/vocabularyGrowth.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");

// Strips `// ...` line-comment text from source, so a source-text guard can
// check live code only. CRLF-safe: `\r\n` is normalized to `\n` before
// splitting, so no line retains a trailing `\r`. That normalization matters
// because `.` never matches `\r` (it's a line terminator per the regex
// spec) and, without the `/m` flag, `$` only matches the true end of the
// string being tested — so on an un-normalized CRLF line, `/\/\/.*$/` could
// never reach `$` past the trailing `\r` and silently stripped nothing,
// letting comment prose leak through as a false positive on this repo's
// Windows/CRLF checkout. Line-comment-only source is assumed (matches this
// module's own style, and every current caller) — a block-comment opener
// would not be recognized by this helper.
function stripLineComments(source) {
  return source
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

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

function word(id, createdDateISO) {
  return { wordProgressId: id, createdDateISO };
}

function event(id, previousState, newState, eventDateISO) {
  return { wordProgressId: id, previousState, newState, eventDateISO };
}

function dayFor(history, dateISO) {
  return history.find((d) => d.dateISO === dateISO);
}

const D1 = "2026-06-01";
const D3 = "2026-06-03";
const D10 = "2026-06-10";
const D25 = "2026-06-25";
const TODAY = "2026-06-25";

console.log("\n=== resolveWordCreatedDateISO ===\n");

test("A valid first_studied_stat_date is used as-is, ignoring created_at entirely", () => {
  assert.equal(resolveWordCreatedDateISO("2026-06-05", "2026-06-09T23:59:00.000Z"), "2026-06-05");
});

test("A null first_studied_stat_date (legacy row) falls back to a UTC slice of created_at", () => {
  assert.equal(resolveWordCreatedDateISO(null, "2026-06-09T23:59:00.000Z"), "2026-06-09");
});

test("An undefined first_studied_stat_date also falls back to created_at", () => {
  assert.equal(resolveWordCreatedDateISO(undefined, "2026-06-01T00:00:00.000Z"), "2026-06-01");
});

test("An unparseable created_at with no first_studied_stat_date returns null rather than crashing", () => {
  assert.equal(resolveWordCreatedDateISO(null, "not-a-date"), null);
});

console.log("\n=== 1. Newly learned word starts in Learning ===\n");

test("A word with no events at all is Learning on its own creation day", () => {
  const history = computeVocabularyGrowthHistory([word("w1", D1)], [], "2026-06-01");
  assert.equal(history.length, 1);
  assert.deepEqual(history[0], { dateISO: "2026-06-01", learning: 1, known: 0, mastered: 0, total: 1 });
});

console.log("\n=== 2. seen -> learning stays Learning ===\n");

test("seen -> learning does not move the word out of Learning", () => {
  const history = computeVocabularyGrowthHistory(
    [word("w1", D1)],
    [event("w1", "seen", "learning", D3)],
    "2026-06-05",
  );
  assert.equal(dayFor(history, "2026-06-05").learning, 1);
  assert.equal(dayFor(history, "2026-06-05").known, 0);
});

console.log("\n=== 3. learning -> familiar moves Learning -> Known ===\n");

test("learning -> familiar moves the word from Learning into Known from that date forward", () => {
  const history = computeVocabularyGrowthHistory(
    [word("w1", D1)],
    [event("w1", "learning", "familiar", D10)],
    "2026-06-15",
  );
  assert.equal(dayFor(history, "2026-06-09").learning, 1);
  assert.equal(dayFor(history, "2026-06-09").known, 0);
  assert.equal(dayFor(history, "2026-06-10").learning, 0);
  assert.equal(dayFor(history, "2026-06-10").known, 1);
  assert.equal(dayFor(history, "2026-06-15").known, 1);
});

console.log("\n=== 4. familiar -> strong stays Known ===\n");

test("familiar -> strong does not move the word out of Known", () => {
  const history = computeVocabularyGrowthHistory(
    [word("w1", D1)],
    [event("w1", "learning", "familiar", D10), event("w1", "familiar", "strong", D25)],
    TODAY,
  );
  assert.equal(dayFor(history, TODAY).known, 1);
  assert.equal(dayFor(history, TODAY).mastered, 0);
});

console.log("\n=== 5. strong -> mastered moves Known -> Mastered ===\n");

test("strong -> mastered moves the word from Known into Mastered from that date forward", () => {
  const history = computeVocabularyGrowthHistory(
    [word("w1", D1)],
    [
      event("w1", "learning", "familiar", D10),
      event("w1", "familiar", "strong", "2026-06-20"),
      event("w1", "strong", "mastered", D25),
    ],
    TODAY,
  );
  assert.equal(dayFor(history, "2026-06-24").known, 1);
  assert.equal(dayFor(history, "2026-06-24").mastered, 0);
  assert.equal(dayFor(history, TODAY).known, 0);
  assert.equal(dayFor(history, TODAY).mastered, 1);
});

console.log("\n=== 6. Incorrect demotion updates the historical category ===\n");

test("familiar -> learning (an incorrect-review demotion) moves the word back from Known to Learning", () => {
  const history = computeVocabularyGrowthHistory(
    [word("w1", D1)],
    [event("w1", "learning", "familiar", D10), event("w1", "familiar", "learning", D25)],
    TODAY,
  );
  assert.equal(dayFor(history, "2026-06-24").known, 1);
  assert.equal(dayFor(history, TODAY).known, 0);
  assert.equal(dayFor(history, TODAY).learning, 1);
});

console.log("\n=== 7. Skipped / no-state-change review does not change category ===\n");

test("A review_events row with previousState === newState (skipped, or a no-op correct at the ceiling) never creates a transition", () => {
  const history = computeVocabularyGrowthHistory(
    [word("w1", D1)],
    [event("w1", "learning", "familiar", D10), event("w1", "familiar", "familiar", D25)],
    TODAY,
  );
  assert.equal(dayFor(history, TODAY).known, 1);
  assert.equal(dayFor(history, TODAY).learning, 0);
});

console.log("\n=== 8. Multiple words aggregate correctly ===\n");

test("Independent words in different categories sum correctly per day", () => {
  const history = computeVocabularyGrowthHistory(
    [word("w1", D1), word("w2", D1), word("w3", D1)],
    [
      event("w2", "learning", "familiar", D10),
      event("w3", "learning", "familiar", D10),
      event("w3", "familiar", "strong", D10),
      event("w3", "strong", "mastered", D25),
    ],
    TODAY,
  );
  const today = dayFor(history, TODAY);
  assert.equal(today.learning, 1); // w1
  assert.equal(today.known, 1); // w2
  assert.equal(today.mastered, 1); // w3
  assert.equal(today.total, 3);
});

console.log("\n=== 9. Same-day multiple transitions produce correct end-of-day state ===\n");

test("Multiple category-crossing transitions on the same calendar day resolve to the final one, not an intermediate one", () => {
  const history = computeVocabularyGrowthHistory(
    [word("w1", D1)],
    [
      event("w1", "learning", "familiar", "2026-06-10"), // Learning -> Known
      event("w1", "familiar", "strong", "2026-06-10"),
      event("w1", "strong", "mastered", "2026-06-10"), // Known -> Mastered, same day
    ],
    "2026-06-10",
  );
  const day = dayFor(history, "2026-06-10");
  assert.equal(day.mastered, 1, "end-of-day state must be Mastered, not the intermediate Known");
  assert.equal(day.known, 0);
  assert.equal(day.learning, 0);
});

console.log("\n=== 10. Events are processed chronologically ===\n");

test("Events supplied out of order are still applied in ascending eventDateISO order", () => {
  const outOfOrder = [
    event("w1", "familiar", "strong", D25), // listed first, but happens last
    event("w1", "learning", "familiar", D10), // listed second, but happens first
  ];
  const chronological = [...outOfOrder].reverse();

  const historyOutOfOrder = computeVocabularyGrowthHistory([word("w1", D1)], outOfOrder, TODAY);
  const historyChronological = computeVocabularyGrowthHistory([word("w1", D1)], chronological, TODAY);

  assert.deepEqual(historyOutOfOrder, historyChronological);
  assert.equal(dayFor(historyOutOfOrder, TODAY).known, 1);
});

console.log("\n=== 11. Missing/invalid events are safely handled ===\n");

test("An event with an invalid state string is ignored, not applied and not crashing", () => {
  const history = computeVocabularyGrowthHistory(
    [word("w1", D1)],
    [event("w1", "learning", "not-a-real-state", D10)],
    "2026-06-10",
  );
  assert.equal(dayFor(history, "2026-06-10").learning, 1);
});

test("An event for a word that doesn't exist in the words list is ignored", () => {
  const history = computeVocabularyGrowthHistory(
    [word("w1", D1)],
    [event("ghost-word", "learning", "familiar", D10)],
    "2026-06-10",
  );
  assert.equal(dayFor(history, "2026-06-10").learning, 1);
  assert.equal(dayFor(history, "2026-06-10").known, 0);
});

test("An event with a malformed date is ignored", () => {
  const history = computeVocabularyGrowthHistory(
    [word("w1", D1)],
    [event("w1", "learning", "familiar", "not-a-date")],
    "2026-06-10",
  );
  assert.equal(dayFor(history, "2026-06-10").learning, 1);
});

test("An event dated before the word's own creation is ignored", () => {
  const history = computeVocabularyGrowthHistory(
    [word("w1", D10)],
    [event("w1", "learning", "familiar", D1)],
    "2026-06-15",
  );
  assert.equal(dayFor(history, "2026-06-15").learning, 1);
  assert.equal(dayFor(history, "2026-06-15").known, 0);
});

test("A word with a malformed createdDateISO is dropped entirely rather than crashing", () => {
  const history = computeVocabularyGrowthHistory([word("w1", "not-a-date"), word("w2", D1)], [], "2026-06-01");
  assert.equal(history.length, 1);
  assert.equal(dayFor(history, "2026-06-01").learning, 1);
});

console.log("\n=== 12. Current state matches final chart point (applyCurrentDayOverride) ===\n");

test("applyCurrentDayOverride replaces the last day with the authoritative current snapshot", () => {
  const history = computeVocabularyGrowthHistory([word("w1", D1)], [], TODAY);
  // Reconstruction alone (no events yet reflected) would still show
  // Learning; the authoritative snapshot says the word has since become
  // Known — the override must win.
  const overridden = applyCurrentDayOverride(history, TODAY, { learning: 0, known: 1, mastered: 0 });
  const today = dayFor(overridden, TODAY);
  assert.equal(today.known, 1);
  assert.equal(today.learning, 0);
  assert.equal(today.total, 1);
});

test("applyCurrentDayOverride appends today when reconstruction doesn't already reach it", () => {
  const history = [{ dateISO: "2026-06-20", learning: 1, known: 0, mastered: 0, total: 1 }];
  const overridden = applyCurrentDayOverride(history, TODAY, { learning: 0, known: 1, mastered: 0 });
  assert.equal(overridden.length, 2);
  assert.equal(overridden[overridden.length - 1].dateISO, TODAY);
});

test("applyCurrentDayOverride handles a fully empty history (brand-new snapshot only)", () => {
  const overridden = applyCurrentDayOverride([], TODAY, { learning: 2, known: 0, mastered: 0 });
  assert.deepEqual(overridden, [{ dateISO: TODAY, learning: 2, known: 0, mastered: 0, total: 2 }]);
});

console.log("\n=== 13-16. Time-range filters ===\n");

function buildLongHistory() {
  // 40 consecutive days ending on TODAY, one word per day added, so day N
  // (1-indexed from the start) has exactly N words in Learning.
  const words = [];
  let dateISO = "2026-05-17"; // TODAY (2026-06-25) minus 39 days
  for (let i = 0; i < 40; i++) {
    words.push(word(`w${i}`, dateISO));
    dateISO = new Date(new Date(dateISO + "T00:00:00.000Z").getTime() + 86400000).toISOString().slice(0, 10);
  }
  return computeVocabularyGrowthHistory(words, [], TODAY);
}

test("13. 7-day filter keeps exactly the last 7 calendar days up to today", () => {
  const history = buildLongHistory();
  const filtered = filterVocabularyGrowthByRange(history, "7d", TODAY);
  assert.equal(filtered.length, 7);
  assert.equal(filtered[filtered.length - 1].dateISO, TODAY);
  assert.equal(filtered[0].dateISO, "2026-06-19");
});

test("14. 30-day filter keeps exactly the last 30 calendar days up to today", () => {
  const history = buildLongHistory();
  const filtered = filterVocabularyGrowthByRange(history, "30d", TODAY);
  assert.equal(filtered.length, 30);
  assert.equal(filtered[filtered.length - 1].dateISO, TODAY);
});

test("15. 90-day filter clamps to whatever history actually exists (never pads with fabricated days)", () => {
  const history = buildLongHistory(); // only 40 real days exist
  const filtered = filterVocabularyGrowthByRange(history, "90d", TODAY);
  assert.equal(filtered.length, 40);
});

test("16. All-time filter returns the full, unmodified history", () => {
  const history = buildLongHistory();
  const filtered = filterVocabularyGrowthByRange(history, "all", TODAY);
  assert.deepEqual(filtered, history);
});

console.log("\n=== 17. Empty dataset ===\n");

test("No words at all produces an empty history, never a fabricated zero-filled chart", () => {
  assert.deepEqual(computeVocabularyGrowthHistory([], [], TODAY), []);
});

test("No words at all produces an empty filtered result too", () => {
  assert.deepEqual(filterVocabularyGrowthByRange([], "30d", TODAY), []);
});

console.log("\n=== 18. One-day history ===\n");

test("A single word created today produces exactly one valid data point, not a fabricated earlier run", () => {
  const history = computeVocabularyGrowthHistory([word("w1", TODAY)], [], TODAY);
  assert.equal(history.length, 1);
  assert.equal(history[0].dateISO, TODAY);
  assert.equal(history[0].learning, 1);
});

console.log("\n=== 19. Language isolation ===\n");

test("Two independently-scoped calls (simulating two target languages) never leak into each other", () => {
  // The engine has no concept of "language" at all — isolation is the
  // caller's responsibility (the new read_vocabulary_growth_events RPC and
  // readUserWordProgress both scope by target_language before this module
  // ever sees a row — see the RPC contract test and
  // test-vocabulary-growth-data-contract.mjs). This test confirms calling
  // the pure function twice with two disjoint, already-scoped input sets
  // produces two fully independent results.
  const germanHistory = computeVocabularyGrowthHistory(
    [word("de-1", D1)],
    [event("de-1", "learning", "familiar", D10)],
    TODAY,
  );
  const spanishHistory = computeVocabularyGrowthHistory([word("es-1", D1)], [], TODAY);

  assert.equal(dayFor(germanHistory, TODAY).known, 1);
  assert.equal(dayFor(spanishHistory, TODAY).known, 0);
  assert.equal(dayFor(spanishHistory, TODAY).learning, 1);
});

console.log("\n=== 20. No Supabase writes (source-text guard) ===\n");

test("vocabularyGrowth.ts contains no Supabase import, fetch, or write verb — pure computation only", () => {
  const source = fs.readFileSync(path.join(ROOT_DIR, "src", "data", "learning", "vocabularyGrowth.ts"), "utf8");
  // stripLineComments() removes `// ...` line-comment text (this file uses
  // only line comments, never block comments) so the guard checks live code
  // only — the file's own header comment discusses Supabase/RLS extensively
  // by name to document the RPC this module is wired through, which would
  // otherwise false-match a whole-file regex (same precedent as
  // test-learning-section-date-ownership.mjs's own comment-stripping).
  const liveCode = stripLineComments(source);
  assert.doesNotMatch(liveCode, /supabase/i);
  assert.doesNotMatch(liveCode, /fetch\(/);
  assert.doesNotMatch(liveCode, /"PATCH"|"POST"|"DELETE"/);
});

test("stripLineComments: a forbidden word inside an LF `//` comment is ignored", () => {
  const liveCode = stripLineComments('// mentions Supabase in prose\nconst x = 1;\n');
  assert.doesNotMatch(liveCode, /supabase/i);
});

test("stripLineComments: a forbidden word inside a CRLF `//` comment is ignored (the exact bug this guard fixes)", () => {
  const liveCode = stripLineComments('// mentions Supabase in prose\r\nconst x = 1;\r\n');
  assert.doesNotMatch(liveCode, /supabase/i);
});

test("stripLineComments: a forbidden word in executable code is still caught, LF source", () => {
  const liveCode = stripLineComments('import { createClient } from "supabase-js";\n');
  assert.match(liveCode, /supabase/i);
});

test("stripLineComments: a forbidden word in executable code is still caught, CRLF source", () => {
  const liveCode = stripLineComments('import { createClient } from "supabase-js";\r\n');
  assert.match(liveCode, /supabase/i);
});

test("stripLineComments: fetch( mentioned only inside a CRLF `//` comment is ignored", () => {
  const liveCode = stripLineComments('// fetch(url) is mentioned only here in prose\r\nconst x = 1;\r\n');
  assert.doesNotMatch(liveCode, /fetch\(/);
});

test("stripLineComments: a real fetch( call in executable code is still caught, CRLF source", () => {
  const liveCode = stripLineComments('const noop = 1;\r\nfetch("/api");\r\n');
  assert.match(liveCode, /fetch\(/);
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("vocabulary-growth guard passed");
}
