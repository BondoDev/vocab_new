// Focused localization-contract guard for the Progress page, its
// Milestones section, and its (not-yet-wired — see
// src/data/learning/vocabularyGrowth.ts) Vocabulary Growth section.
// Confirms every one of the 7 supported interface files stays valid JSON
// and defines:
//   - the exact same `userProfile.progressPage.*` key set as English (the
//     page-level title/subtitle, distinct from the Milestones section's
//     own copy below) — and, since these were supplied as exact, do-not-
//     reword strings, that every locale's value matches verbatim;
//   - the exact same `userProfile.progressSection.*` key set as English
//     (no missing/extra keys), with every value a non-empty string;
//   - the exact same `userProfile.vocabularyGrowthSection.*` key set as
//     English, every value a non-empty string, and that the Learning/
//     Known/Mastered category names it needs are reused from
//     `vocabularySection.summaryCards.*` rather than duplicated;
//   - a matching translated title, in every locale, for every milestone id
//     configured in the pure engine (src/data/learning/milestones.ts).
// Plain `node` (no TypeScript needed for the JSON files themselves; the
// engine's milestone ids are read via a lightweight regex scan rather than
// importing the .ts module, keeping this guard runnable without
// --experimental-strip-types, matching test-review-words-localization.mjs's
// own precedent).
//
// Run: node scripts/tests/learning/test-progress-section-localization.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const INTERFACE_DIR = path.join(ROOT_DIR, "src", "data", "interface");

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

function flattenKeys(obj, prefix = "") {
  const out = [];
  for (const [key, value] of Object.entries(obj)) {
    const path_ = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      out.push(...flattenKeys(value, path_));
    } else {
      out.push(path_);
    }
  }
  return out.sort();
}

console.log("\n=== progressSection localization contract ===\n");

const parsed = new Map();
for (const fileName of LOCALE_FILES) {
  test(`${fileName} is valid JSON`, () => {
    const raw = fs.readFileSync(path.join(INTERFACE_DIR, fileName), "utf8");
    parsed.set(fileName, JSON.parse(raw));
  });
}

const englishSection = parsed.get("english_interface.json")?.userProfile?.progressSection;

test("english_interface.json defines a non-empty userProfile.progressSection", () => {
  assert.ok(englishSection && Object.keys(englishSection).length > 0);
});

const englishKeys = flattenKeys(englishSection ?? {});

for (const fileName of LOCALE_FILES) {
  if (fileName === "english_interface.json") continue;
  test(`${fileName} progressSection key set matches English exactly`, () => {
    const section = parsed.get(fileName)?.userProfile?.progressSection;
    assert.ok(section, `${fileName} is missing userProfile.progressSection`);
    assert.deepEqual(flattenKeys(section), englishKeys, `${fileName} progressSection keys differ from English`);
  });
}

for (const fileName of LOCALE_FILES) {
  test(`${fileName} progressSection values are all non-empty strings`, () => {
    const section = parsed.get(fileName).userProfile.progressSection;
    for (const key of englishKeys) {
      const value = key.split(".").reduce((node, part) => node?.[part], section);
      assert.equal(typeof value, "string", `${fileName}: progressSection.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${fileName}: progressSection.${key} is empty`);
    }
  });
}

console.log("\n=== progressPage (Progress page header) localization contract ===\n");

// Verbatim, do-not-reword translations as supplied — locks in that no
// paraphrasing/"improvement" slipped in for any of the 7 locales.
const EXPECTED_PROGRESS_PAGE = {
  "english_interface.json": { title: "Progress", subtitle: "Track your long-term learning progress." },
  "german_interface.json": { title: "Fortschritt", subtitle: "Verfolge deinen langfristigen Lernfortschritt." },
  "spanish_interface.json": { title: "Progreso", subtitle: "Sigue tu progreso de aprendizaje a largo plazo." },
  "french_interface.json": { title: "Progression", subtitle: "Suivez vos progrès d’apprentissage à long terme." },
  "italian_interface.json": { title: "Progressi", subtitle: "Segui i tuoi progressi di apprendimento a lungo termine." },
  "portuguese_interface.json": { title: "Progresso", subtitle: "Acompanhe o seu progresso de aprendizagem a longo prazo." },
  "russian_interface.json": { title: "Прогресс", subtitle: "Отслеживайте свой долгосрочный прогресс в обучении." },
};

const englishProgressPage = parsed.get("english_interface.json")?.userProfile?.progressPage;

test("english_interface.json defines a non-empty userProfile.progressPage", () => {
  assert.ok(englishProgressPage && Object.keys(englishProgressPage).length > 0);
});

const englishProgressPageKeys = flattenKeys(englishProgressPage ?? {});

test("userProfile.progressPage is distinct from userProfile.progressSection (page vs. section copy)", () => {
  assert.notEqual(englishProgressPage?.title, englishSection?.title);
});

for (const fileName of LOCALE_FILES) {
  test(`${fileName} progressPage key set matches English exactly`, () => {
    const page = parsed.get(fileName)?.userProfile?.progressPage;
    assert.ok(page, `${fileName} is missing userProfile.progressPage`);
    assert.deepEqual(flattenKeys(page), englishProgressPageKeys, `${fileName} progressPage keys differ from English`);
  });

  test(`${fileName} progressPage.title/subtitle match the exact supplied translation`, () => {
    const page = parsed.get(fileName).userProfile.progressPage;
    const expected = EXPECTED_PROGRESS_PAGE[fileName];
    assert.equal(page.title, expected.title, `${fileName}: progressPage.title was reworded`);
    assert.equal(page.subtitle, expected.subtitle, `${fileName}: progressPage.subtitle was reworded`);
  });
}

console.log("\n=== vocabularyGrowthSection (Vocabulary Growth chart) localization contract ===\n");

const englishGrowthSection = parsed.get("english_interface.json")?.userProfile?.vocabularyGrowthSection;

test("english_interface.json defines a non-empty userProfile.vocabularyGrowthSection", () => {
  assert.ok(englishGrowthSection && Object.keys(englishGrowthSection).length > 0);
});

const englishGrowthKeys = flattenKeys(englishGrowthSection ?? {});

for (const fileName of LOCALE_FILES) {
  test(`${fileName} vocabularyGrowthSection key set matches English exactly`, () => {
    const section = parsed.get(fileName)?.userProfile?.vocabularyGrowthSection;
    assert.ok(section, `${fileName} is missing userProfile.vocabularyGrowthSection`);
    assert.deepEqual(flattenKeys(section), englishGrowthKeys, `${fileName} vocabularyGrowthSection keys differ from English`);
  });

  test(`${fileName} vocabularyGrowthSection values are all non-empty strings`, () => {
    const section = parsed.get(fileName).userProfile.vocabularyGrowthSection;
    for (const key of englishGrowthKeys) {
      const value = key.split(".").reduce((node, part) => node?.[part], section);
      assert.equal(typeof value, "string", `${fileName}: vocabularyGrowthSection.${key} is not a string`);
      assert.ok(value.trim().length > 0, `${fileName}: vocabularyGrowthSection.${key} is empty`);
    }
  });
}

test("vocabularyGrowthSection required keys are all present (title/subtitle/loadError/retryButton/totalLabel/emptyState/ranges)", () => {
  const requiredTopLevel = ["ariaLabel", "title", "subtitle", "loadError", "retryButton", "totalLabel"];
  for (const key of requiredTopLevel) {
    assert.ok(englishGrowthKeys.includes(key), `missing vocabularyGrowthSection.${key}`);
  }
  for (const key of ["emptyState.title", "emptyState.message"]) {
    assert.ok(englishGrowthKeys.includes(key), `missing vocabularyGrowthSection.${key}`);
  }
  for (const key of ["ranges.sevenDays", "ranges.thirtyDays", "ranges.ninetyDays", "ranges.allTime"]) {
    assert.ok(englishGrowthKeys.includes(key), `missing vocabularyGrowthSection.${key}`);
  }
});

test("Category names (Learning/Known/Mastered) are reused from vocabularySection.summaryCards, not duplicated", () => {
  // Per the task brief: "use the same category mapping already used on the
  // Vocabulary page" — this asserts those exact keys still exist (in every
  // locale) for the Vocabulary Growth chart to reuse, and that
  // vocabularyGrowthSection does NOT redeclare its own copy of them.
  for (const fileName of LOCALE_FILES) {
    const data = parsed.get(fileName);
    const cards = data.userProfile.vocabularySection.summaryCards;
    for (const category of ["learning", "known", "mastered"]) {
      const title = cards?.[category]?.title;
      assert.equal(typeof title, "string", `${fileName}: vocabularySection.summaryCards.${category}.title is missing`);
      assert.ok(title.trim().length > 0, `${fileName}: vocabularySection.summaryCards.${category}.title is empty`);
    }
  }
  assert.ok(
    !("categories" in (englishGrowthSection ?? {})) && !("learning" in (englishGrowthSection ?? {})),
    "vocabularyGrowthSection must not duplicate the category-name keys already owned by vocabularySection",
  );
});

console.log("\n=== Every configured milestone id has a translated title in every locale ===\n");

// Scanned via regex (id: "..." literals inside milestones.ts) rather than
// importing the module, so this file stays plain-`node` runnable like the
// rest of this guard.
const milestonesSource = fs.readFileSync(path.join(ROOT_DIR, "src", "data", "learning", "milestones.ts"), "utf8");
const milestoneIds = [...milestonesSource.matchAll(/id: "([a-z]+-\d+)"/g)].map((m) => m[1]);

test("At least one milestone id was found in milestones.ts (regex sanity check)", () => {
  assert.ok(milestoneIds.length >= 30, `expected >=30 milestone ids, found ${milestoneIds.length}`);
});

test("Every milestone id scanned from milestones.ts is unique", () => {
  assert.equal(new Set(milestoneIds).size, milestoneIds.length);
});

for (const fileName of LOCALE_FILES) {
  test(`${fileName} defines a translated title for every milestone id`, () => {
    const titles = parsed.get(fileName).userProfile.progressSection.milestones;
    for (const id of milestoneIds) {
      assert.ok(typeof titles[id] === "string" && titles[id].trim().length > 0, `${fileName}: missing milestones.${id}`);
    }
  });
}

test("english_interface.json's progressSection.milestones has no extra ids beyond what milestones.ts defines", () => {
  const titleKeys = Object.keys(englishSection.milestones).sort();
  assert.deepEqual(titleKeys, [...milestoneIds].sort());
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("progress-section-localization guard passed");
}
