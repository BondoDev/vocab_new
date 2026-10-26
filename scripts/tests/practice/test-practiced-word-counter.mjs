// Focused guard for the Custom Practice session header's "N practiced"
// counter and its header contract.
//
// Behavioral for the counter: imports the real classifyExerciseResult/
// countPracticedWords from src/features/practice/utils/practicedWordCount.ts
// (import-free by design) via Node's native TypeScript stripping. Source-text
// for the header wiring/markup, which cannot be rendered without a bundler,
// plus a 7-locale check for the new `practice.practicedCount` key.
//
// Run: node --experimental-strip-types scripts/tests/practice/test-practiced-word-counter.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyExerciseResult,
  countPracticedWords,
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

test("counts only correct attempts (skipped/incorrect never count)", () => {
  assert.equal(
    countPracticedWords([
      { conceptId: "1", result: "correct" },
      { conceptId: "2", result: "skipped" },
      { conceptId: "3", result: "incorrect" },
    ]),
    1,
  );
});

test("counts each word once across repeats", () => {
  assert.equal(
    countPracticedWords([
      { conceptId: "1", result: "correct" },
      { conceptId: "1", result: "correct" },
      { conceptId: "1", result: "incorrect" },
    ]),
    1,
  );
});

test("a word answered wrong earlier counts once it is later correct", () => {
  assert.equal(
    countPracticedWords([
      { conceptId: "1", result: "incorrect" },
      { conceptId: "1", result: "correct" },
    ]),
    1,
  );
});

test("pending correct card counts immediately and is not double-counted on Next", () => {
  const before = countPracticedWords([{ conceptId: "1", result: "correct" }], ["2"]);
  const after = countPracticedWords([
    { conceptId: "1", result: "correct" },
    { conceptId: "2", result: "correct" },
  ]);
  assert.equal(before, 2);
  assert.equal(after, 2);
  assert.equal(countPracticedWords([{ conceptId: "1", result: "correct" }], ["1"]), 1);
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

test("header keeps Finish wired and reads the localized counter label", () => {
  assert.match(header, /onClick=\{onFinishTest\}/);
  assert.match(header, /t\("practice\.practicedCount"\)/);
});

test("session derives the counter from attemptHistory and passes it down", () => {
  assert.match(session, /countPracticedWords\(attemptHistory/);
  assert.match(session, /practicedCount=\{practicedCount\}/);
  assert.match(session, /const result = classifyExerciseResult\(/);
});

test("Start Again resets attemptHistory (and so the counter)", () => {
  const startAgain = session.slice(session.indexOf("const handleStartAgain"));
  assert.match(startAgain.slice(0, 1200), /setAttemptHistory\(\[\]\)/);
});

console.log("\n=== practice.practicedCount localization ===\n");

for (const fileName of LOCALE_FILES) {
  test(`${fileName} defines practice.practicedCount with {count}`, () => {
    const parsed = JSON.parse(read(path.join("src", "data", "interface", fileName)));
    const value = parsed.practice?.practicedCount;
    assert.equal(typeof value, "string");
    assert.match(value, /\{count\}/);
  });
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exit(1);
}
