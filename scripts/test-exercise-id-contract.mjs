// Focused guard for the canonical exercise-identifier contract in
// src/exercises/exerciseIds.ts. Complements
// scripts/test-interactive-contracts.mjs, which guards the
// `app.selectedExercises` storage-key *string* in src/app/App.tsx but does
// not check the id values, the canonical set, or the typing/four-word
// partition — this script does.
//
// Behavioral, not source-text, for the id-set/partition checks: this imports
// the real EXERCISE_IDS/TYPING_EXERCISE_IDS/FOUR_WORD_EXERCISE_IDS constants
// via Node's native TypeScript stripping (--experimental-strip-types).
// exerciseIds.ts is deliberately import-free (see its own header comment),
// so — like storedLanguagePreferencePolicy.ts in
// scripts/test-practice-route-sync.mjs — it can be loaded directly here
// without a bundler or a compile step.
//
// The setup-option completeness check (exerciseGroups in
// src/features/learning-setup/ExerciseSelection.tsx) can't use the same
// approach: that file imports .scss/motion/lucide-react, which Node's ESM
// resolver can't follow without a bundler (the same constraint documented in
// scripts/test-interactive-contracts.mjs's header, which is why that script
// also never require()s/imports .tsx modules). That one check below uses a
// narrow source-text regex instead, in the same spirit as
// test-interactive-contracts.mjs's extractRouteObject helper.
//
// Run: node --experimental-strip-types scripts/test-exercise-id-contract.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EXERCISE_IDS,
  TYPING_EXERCISE_IDS,
  FOUR_WORD_EXERCISE_IDS,
  isExerciseId,
} from "../src/exercises/exerciseIds.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

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

console.log("\n=== canonical exercise-id set ===\n");

const EXPECTED_EXERCISE_IDS = [
  "wordTyping",
  "halfWritten",
  "brokenWord",
  "connectWords",
  "listening",
];

test("EXERCISE_IDS is exactly the expected five values, in the expected order", () => {
  assert.deepEqual(EXERCISE_IDS, EXPECTED_EXERCISE_IDS);
});

test("isExerciseId accepts every canonical id and rejects an unknown value", () => {
  for (const id of EXERCISE_IDS) {
    assert.ok(isExerciseId(id), `isExerciseId(${id}) should be true`);
  }
  assert.equal(isExerciseId("madeUpExercise"), false);
});

console.log("\n=== typing / four-word partition ===\n");

test("TYPING_EXERCISE_IDS and FOUR_WORD_EXERCISE_IDS contain only canonical ids", () => {
  const canonical = new Set(EXERCISE_IDS);
  for (const id of [...TYPING_EXERCISE_IDS, ...FOUR_WORD_EXERCISE_IDS]) {
    assert.ok(canonical.has(id), `${id} is not a canonical exercise id`);
  }
});

test("TYPING_EXERCISE_IDS and FOUR_WORD_EXERCISE_IDS do not overlap", () => {
  const typingSet = new Set(TYPING_EXERCISE_IDS);
  const overlap = FOUR_WORD_EXERCISE_IDS.filter((id) => typingSet.has(id));
  assert.deepEqual(overlap, [], `overlapping id(s): ${overlap.join(", ")}`);
});

test("TYPING_EXERCISE_IDS and FOUR_WORD_EXERCISE_IDS together cover every canonical id", () => {
  const covered = new Set([...TYPING_EXERCISE_IDS, ...FOUR_WORD_EXERCISE_IDS]);
  const missing = EXERCISE_IDS.filter((id) => !covered.has(id));
  assert.deepEqual(
    missing,
    [],
    `id(s) not classified as typing or four-word: ${missing.join(", ")}`,
  );
});

test("typing subset is exactly wordTyping/halfWritten/brokenWord (unchanged classification)", () => {
  assert.deepEqual(
    [...TYPING_EXERCISE_IDS].sort(),
    ["brokenWord", "halfWritten", "wordTyping"],
  );
});

test("four-word subset is exactly connectWords/listening (unchanged classification)", () => {
  assert.deepEqual([...FOUR_WORD_EXERCISE_IDS].sort(), ["connectWords", "listening"]);
});

console.log(
  "\n=== setup option completeness (source-text — ExerciseSelection.tsx imports .scss/motion and can't be require()'d, see header) ===\n",
);

test("ExerciseSelection.tsx's exerciseGroups exposes exactly the canonical exercise-id set", () => {
  const source = fs.readFileSync(
    path.join(ROOT_DIR, "src", "features", "learning-setup", "ExerciseSelection.tsx"),
    "utf8",
  );
  const blockMatch = source.match(
    /const exerciseGroups: ExerciseGroup\[\] = \[([\s\S]*?)\n\];/,
  );
  assert.ok(
    blockMatch,
    'could not find "const exerciseGroups: ExerciseGroup[] = [ ... ];" block in ExerciseSelection.tsx',
  );
  const body = blockMatch[1];
  // Item entries (not group entries) are the ones immediately followed by a
  // `description:` field — group entries are followed by `title:` instead.
  // One item id ("listening") collides with a group id, so filtering by
  // exclusion would be unsafe; keying off the following field name isn't.
  const itemIdPattern = /id:\s*"(\w+)",\s*\n\s*description:/g;
  const foundIds = [];
  let match;
  while ((match = itemIdPattern.exec(body)) !== null) {
    foundIds.push(match[1]);
  }
  assert.deepEqual(
    [...foundIds].sort(),
    [...EXERCISE_IDS].sort(),
    `exerciseGroups item ids do not match the canonical set exactly; found: ${foundIds.join(", ")}`,
  );
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("exercise-id contract guard passed");
}
