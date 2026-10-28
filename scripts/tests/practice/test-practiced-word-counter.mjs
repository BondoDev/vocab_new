// Focused guard for the Custom Practice session header's "N practiced"
// counter and its header contract.
//
// Behavioral for the counter: imports the real classifyExerciseResult/
// countPracticedWords/isPracticedAttempt/isWrittenWordAttempt from src/features/practice/utils/practicedWordCount.ts
// (import-free by design) via Node's native TypeScript stripping. Source-text
// for the header wiring/markup, which cannot be rendered without a bundler,
// plus a 7-locale check for the plural `practice.practicedCount_*` keys.
//
// Run: node --experimental-strip-types scripts/tests/practice/test-practiced-word-counter.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyExerciseResult,
  countPracticedWords,
  isPracticedAttempt,
  isWrittenWordAttempt,
} from "../../../src/features/practice/utils/practicedWordCount.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");

const LOCALE_FILES = [
  "english_interface.json",
  "german_interface.json",
  "spanish_interface.json",
  "french_interface.json",
  "italian_interface.json",
  "portuguese_interface.json",
  "russian_interface.json",
];

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

const status = (overrides = {}) => ({
  isCorrect: false,
  hasTypedAnswer: false,
  usedShowWord: false,
  usedHintForBrokenWord: false,
  ...overrides,
});

console.log("\n=== practiced-word counter ===\n");

test("starts at 0 for an empty session", () => {
  assert.equal(countPracticedWords([]), 0);
});

const single = (conceptId, wroteWord, result = "incorrect") => ({
  conceptId,
  result,
  isGroupExercise: false,
  wroteWord,
});
const group = (conceptId, result) => ({
  conceptId,
  result,
  isGroupExercise: true,
  wroteWord: false,
});

test("a single word counts once the learner wrote it, right or wrong", () => {
  assert.equal(
    countPracticedWords([
      single("1", true, "correct"),
      single("2", true, "incorrect"),
      single("3", false, "skipped"),
      single("4", false, "incorrect"),
    ]),
    2,
  );
});

test("Show me word earlier never matters once the word is written later", () => {
  // Revealed first (graded incorrect), then written after Practice again.
  assert.equal(isWrittenWordAttempt(single("1", true, "incorrect")), true);
  // Revealed on one card, written on a later repeat of the same word.
  assert.equal(countPracticedWords([single("1", false), single("1", true)]), 1);
});

test("group matches count only when correct and never as written words", () => {
  assert.equal(countPracticedWords([group("1", "correct"), group("2", "skipped")]), 1);
  assert.equal(isWrittenWordAttempt(group("1", "correct")), false);
  assert.equal(isPracticedAttempt(group("1", "correct")), true);
});

test("counts each word once across repeats", () => {
  assert.equal(
    countPracticedWords([single("1", true, "correct"), single("1", true), single("1", false)]),
    1,
  );
});

test("pending card counts immediately and is not double-counted on Next", () => {
  const before = countPracticedWords([single("1", true)], ["2"]);
  const after = countPracticedWords([single("1", true), single("2", true)]);
  assert.equal(before, 2);
  assert.equal(after, 2);
  assert.equal(countPracticedWords([single("1", true)], ["1"]), 1);
});

test("classification: typed correct answer is correct", () => {
  assert.equal(
    classifyExerciseResult(status({ isCorrect: true, hasTypedAnswer: true }), "wordTyping", false),
    "correct",
  );
});

test("classification: revealed word or broken-word hint is incorrect", () => {
  assert.equal(
    classifyExerciseResult(
      status({ isCorrect: true, hasTypedAnswer: true, usedShowWord: true }),
      "wordTyping",
      false,
    ),
    "incorrect",
  );
  assert.equal(
    classifyExerciseResult(
      status({ isCorrect: true, usedHintForBrokenWord: true }),
      "brokenWord",
      false,
    ),
    "incorrect",
  );
});

test("classification: untouched exercise is skipped", () => {
  assert.equal(classifyExerciseResult(status(), "wordTyping", false), "skipped");
  assert.equal(classifyExerciseResult(status(), "connectWords", true), "skipped");
});

test("classification: brokenWord and four-word exercises follow isCorrect", () => {
  assert.equal(classifyExerciseResult(status({ isCorrect: true }), "brokenWord", false), "correct");
  assert.equal(classifyExerciseResult(status({ isCorrect: true }), "listening", true), "correct");
});

console.log("\n=== session header contract ===\n");

// PracticeHeader composes the shared SessionHeader rail, so the markup
// contract spans both files.
const header = [
  read("src/features/practice/components/PracticeHeader.tsx"),
  read("src/features/practice/components/SessionHeader.tsx"),
].join("\n");
const session = read("src/features/practice/VocabularyPractice.tsx");

test("header uses CheckCircle2 and no back arrow or book icons", () => {
  assert.match(header, /\bCheckCircle2\b/);
  assert.doesNotMatch(header, /\bArrowLeft\b/);
  assert.doesNotMatch(header, /\bBookOpen\w*\b/);
});

test("header renders the language direction with an arrow, not uppercase", () => {
  assert.match(header, /\bArrowRight\b/);
  assert.doesNotMatch(header, /\buppercase\b/);
});

test("header keeps Finish wired", () => {
  assert.match(header, /onClick=\{onFinishTest\}/);
});

test("session derives the counter from attemptHistory and passes it down", () => {
  assert.match(session, /countPracticedWords\(attemptHistory/);
  // The counter chip sits below the card (SessionCountFooter) with a
  // plural-aware, number-first label.
  assert.match(session, /count=\{practicedCount\}/);
  assert.match(session, /practice\.practicedCount_\$\{new Intl\.PluralRules\(uiLanguage\)/);
  assert.match(session, /const result = classifyExerciseResult\(/);
});

test("Start Again resets attemptHistory (and so the counter)", () => {
  const startAgain = session.slice(session.indexOf("const handleStartAgain"));
  assert.match(startAgain.slice(0, 1200), /setAttemptHistory\(\[\]\)/);
});

console.log("\n=== practice.practicedCount_* localization ===\n");

for (const fileName of LOCALE_FILES) {
  test(`${fileName} defines number-first practice.practicedCount_one/_other`, () => {
    const parsed = JSON.parse(read(path.join("src", "data", "interface", fileName)));
    for (const form of ["one", "other"]) {
      const value = parsed.practice?.[`practicedCount_${form}`];
      assert.equal(typeof value, "string");
      assert.match(value, /^\{count\} /);
    }
  });
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
