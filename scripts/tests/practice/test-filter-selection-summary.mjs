// Focused guard for the Custom Practice vocabulary filters: the detailed
// filters page and the CEFR level tiles on the Custom Practice setup page.
//
// Behavioral for the selection logic: imports the real getSelectionState/
// abbreviateList/toggleSelection/toggleLevelSelection/formatCountLabel/
// formatSelectionSummary/fillTemplate from
// src/features/learning-setup/filterSelection.ts
// (import-free by design) via Node's native TypeScript stripping. Source-text
// for the page wiring, which cannot be rendered without a bundler, plus a
// 7-locale check for the `levelCategory.filtersPage` keys and plural forms.
//
// Run: node --experimental-strip-types scripts/tests/practice/test-filter-selection-summary.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  abbreviateList,
  fillTemplate,
  formatCountLabel,
  formatSelectionSummary,
  getSelectionState,
  toggleLevelSelection,
  toggleSelection,
} from "../../../src/features/learning-setup/filterSelection.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..", "..", "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8");

const LOCALES = {
  en: "english_interface.json",
  de: "german_interface.json",
  es: "spanish_interface.json",
  fr: "french_interface.json",
  it: "italian_interface.json",
  pt: "portuguese_interface.json",
  ru: "russian_interface.json",
};

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

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const TOPICS = Array.from({ length: 33 }, (_, i) => `topic-${i + 1}`);

console.log("\n=== filter selection summary ===\n");

test("exactly one selected", () => {
  const state = getSelectionState(["A2"], LEVELS, { emptyMeansAll: true });
  assert.equal(state.kind, "some");
  assert.equal(state.count, 1);
  assert.deepEqual(state.selected, ["A2"]);
});

test("multiple selected keep option order, not click order", () => {
  const state = getSelectionState(["B1", "A1", "A2"], LEVELS, {
    emptyMeansAll: true,
  });
  assert.equal(state.kind, "some");
  assert.equal(state.count, 3);
  assert.deepEqual(state.selected, ["A1", "A2", "B1"]);
});

test("every option listed explicitly reads as all selected", () => {
  const state = getSelectionState([...LEVELS], LEVELS, { emptyMeansAll: true });
  assert.equal(state.kind, "all");
  assert.equal(state.count, 6);
  assert.equal(state.total, 6);
});

test("empty topic list is unrestricted, never 'none selected'", () => {
  const state = getSelectionState([], TOPICS, { emptyMeansAll: true });
  assert.equal(state.kind, "unrestricted");
  assert.equal(state.count, TOPICS.length);
  assert.deepEqual(state.selected, []);
});

test("empty list without emptyMeansAll is zero selected", () => {
  const state = getSelectionState([], TOPICS, { emptyMeansAll: false });
  assert.equal(state.kind, "some");
  assert.equal(state.count, 0);
});

test("counts include selections hidden by the collapsed topic list", () => {
  // The page shows 15 topics collapsed; two selections sit beyond that.
  const visible = TOPICS.slice(0, 15);
  const selected = ["topic-2", "topic-20", "topic-31"];
  const state = getSelectionState(selected, TOPICS, { emptyMeansAll: true });
  assert.equal(state.count, 3);
  assert.equal(selected.filter((id) => visible.includes(id)).length, 1);
});

test("unknown persisted ids are ignored for display", () => {
  const state = getSelectionState(["topic-1", "removed-topic"], TOPICS, {
    emptyMeansAll: true,
  });
  assert.equal(state.count, 1);
  assert.deepEqual(state.selected, ["topic-1"]);
});

test("abbreviateList keeps short lists whole and counts the overflow", () => {
  assert.deepEqual(abbreviateList(["A1", "A2"], 3), {
    shown: ["A1", "A2"],
    rest: 0,
  });
  assert.deepEqual(abbreviateList(["A1", "A2", "B1", "B2", "C1"], 3), {
    shown: ["A1", "A2", "B1"],
    rest: 2,
  });
});

test("toggleSelection adds and removes without touching other values", () => {
  assert.deepEqual(toggleSelection(["noun"], "verb"), ["noun", "verb"]);
  assert.deepEqual(toggleSelection(["noun", "verb"], "noun"), ["verb"]);
  // Clearing the last topic returns to the unrestricted [] state.
  assert.deepEqual(toggleSelection(["noun"], "noun"), []);
});

test("removing the last level selects every level again", () => {
  assert.deepEqual(toggleLevelSelection(["A2"], "A2", LEVELS), LEVELS);
  assert.deepEqual(toggleLevelSelection(["A2", "B1"], "A2", LEVELS), ["B1"]);
  assert.deepEqual(toggleLevelSelection(["A2"], "C1", LEVELS), ["A2", "C1"]);
});

test("clicking a level while all are selected keeps only that level", () => {
  assert.deepEqual(toggleLevelSelection([...LEVELS], "B1", LEVELS), ["B1"]);
});

test("summary lists a few names, then switches to 'N of total'", () => {
  const options = {
    allLabel: "All topics",
    ofTotalTemplate: "{selected} of {total}",
    getLabel: (id) => id.toUpperCase(),
    maxListed: 3,
  };
  const summarize = (selected) =>
    formatSelectionSummary(
      getSelectionState(selected, TOPICS, { emptyMeansAll: true }),
      options,
    );
  assert.equal(summarize([]), "All topics");
  assert.equal(summarize([...TOPICS]), "All topics");
  assert.equal(summarize(["topic-2"]), "TOPIC-2");
  assert.equal(summarize(["topic-3", "topic-1"]), "TOPIC-1, TOPIC-3");
  assert.equal(
    summarize(["topic-1", "topic-2", "topic-3", "topic-4"]),
    "4 of 33",
  );
});

test("level selection flow shared by both pages", () => {
  // Setup page: from all levels pick A1, then add A2.
  let levels = toggleLevelSelection([...LEVELS], "A1", LEVELS);
  levels = toggleLevelSelection(levels, "A2", LEVELS);
  assert.deepEqual(levels, ["A1", "A2"]);
  // Detailed page reads the same list, then switches to B1 + B2.
  levels = toggleLevelSelection(levels, "A1", LEVELS);
  levels = toggleLevelSelection(levels, "A2", LEVELS);
  assert.deepEqual(levels, LEVELS, "removing the last level restores all");
  levels = toggleLevelSelection(levels, "B1", LEVELS);
  levels = toggleLevelSelection(levels, "B2", LEVELS);
  assert.deepEqual(levels, ["B1", "B2"]);
  const state = getSelectionState(levels, LEVELS, { emptyMeansAll: true });
  assert.equal(state.kind, "some");
  assert.equal(state.count, 2);
});

test("fillTemplate replaces every placeholder", () => {
  assert.equal(
    fillTemplate("{selected} of {total}", { selected: 8, total: 33 }),
    "8 of 33",
  );
});

// ── Localization ────────────────────────────────────────────

const lookup = (root, key) =>
  key.split(".").reduce((node, part) => node?.[part], root);
const makeT = (root) => (key) => {
  const value = lookup(root, key);
  return typeof value === "string" && value ? value : key;
};
const localeData = Object.fromEntries(
  Object.entries(LOCALES).map(([code, file]) => [
    code,
    JSON.parse(read(`src/data/interface/${file}`)),
  ]),
);

const leafKeys = (node, prefix = "") =>
  Object.entries(node).flatMap(([key, value]) =>
    value && typeof value === "object"
      ? leafKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );

test("every locale defines the English filtersPage keys", () => {
  const english = leafKeys(localeData.en.levelCategory.filtersPage);
  for (const [code, data] of Object.entries(localeData)) {
    const block = data.levelCategory?.filtersPage;
    assert.ok(block, `${code}: levelCategory.filtersPage missing`);
    for (const key of english) {
      const value = lookup(block, key);
      assert.ok(
        typeof value === "string" && value.trim(),
        `${code}: filtersPage.${key} missing or empty`,
      );
    }
  }
});

test("placeholders survive translation", () => {
  const required = {
    "topics.showAll": ["{count}"],
    selectedCount_other: ["{count}"],
    allCount: ["{count}"],
    selectedValues: ["{values}"],
    moreValues: ["{count}"],
    "summary.ofTotal": ["{selected}", "{total}"],
  };
  for (const [code, data] of Object.entries(localeData)) {
    for (const [key, tokens] of Object.entries(required)) {
      const value = lookup(data.levelCategory.filtersPage, key);
      for (const token of tokens) {
        assert.ok(value.includes(token), `${code}: ${key} lacks ${token}`);
      }
    }
  }
});

test("count labels pick the right plural form per language", () => {
  const base = "levelCategory.filtersPage.selectedCount";
  const label = (code, count) =>
    formatCountLabel(makeT(localeData[code]), code, base, count);
  assert.equal(label("en", 1), "1 selected");
  assert.equal(label("en", 3), "3 selected");
  assert.equal(label("es", 1), "1 seleccionado");
  assert.equal(label("es", 4), "4 seleccionados");
  assert.equal(label("ru", 1), "Выбран 1");
  assert.equal(label("ru", 3), "Выбрано 3");
  assert.equal(label("ru", 5), "Выбрано 5");
  assert.equal(label("ru", 21), "Выбран 21");
  for (const code of Object.keys(LOCALES)) {
    for (const count of [1, 2, 5, 11, 22]) {
      const text = label(code, count);
      assert.ok(!text.includes(base), `${code}/${count}: raw key "${text}"`);
      assert.ok(text.includes(String(count)), `${code}/${count}: "${text}"`);
    }
  }
});

// ── Page wiring (source text) ───────────────────────────────

const page = read("src/features/learning-setup/LevelCategorySelection.tsx");

test("page summaries come from the shared selection state", () => {
  for (const call of [
    "getSelectionState(selectedLevels, allLevelCodes",
    "getSelectionState(selectedCategories, categoryIds",
    "getSelectionState(\n    selectedWordTypes,\n    prioritizedWordTypes",
  ]) {
    assert.ok(page.includes(call), `missing ${call}`);
  }
});

test("'All' chips select the unrestricted [] state; levels select every code", () => {
  assert.ok(page.includes("onClick={() => setSelectedCategories([])}"));
  assert.ok(page.includes("onClick={() => setSelectedWordTypes([])}"));
  assert.ok(page.includes("onClick={() => setSelectedLevels([...allLevelCodes])}"));
});

const tiles = read("src/features/learning-setup/CefrLevelTiles.tsx");
const setupPage = read("src/app/pages/CustomPracticePreviewPage.tsx");
const app = read("src/app/App.tsx");

test("options expose their state to assistive tech", () => {
  const pressed = page.match(/aria-pressed=\{/g) ?? [];
  assert.ok(pressed.length >= 4, `expected aria-pressed on chips`);
  assert.ok(tiles.includes("aria-pressed={isSelected}"), "level tiles");
  assert.ok(page.includes("aria-expanded={areTopicsExpanded}"));
});

test("both pages render the shared level tiles over the App-owned list", () => {
  for (const [name, source] of [["filters page", page], ["setup page", setupPage]]) {
    assert.ok(source.includes("<CefrLevelTiles"), `${name}: CefrLevelTiles`);
    assert.ok(
      source.includes("selectedLevels={selectedLevels}"),
      `${name}: reads the shared level list`,
    );
    assert.ok(
      source.includes("onChange={setSelectedLevels}"),
      `${name}: writes the shared level list`,
    );
    assert.ok(source.includes("useFilterVocabulary("), `${name}: word guard`);
  }
  assert.ok(!/useState<string\[\]>/.test(setupPage), "setup page keeps no copy");
  assert.ok(!/pending|draft/i.test(page), "filters page writes live, no drafts");
  // One App state feeds the setup page, the filters page and the session.
  const setters = app.match(/setSelectedLevels=\{setSelectedLevels\}/g) ?? [];
  assert.equal(setters.length, 2, "setup + filters page receive the setter");
  const readers = app.match(/selectedLevels=\{selectedLevels\}/g) ?? [];
  assert.ok(readers.length >= 3, "practice session reads the same levels");
});

test("level tiles guard empty-word combinations and the empty list", () => {
  assert.ok(tiles.includes("disabled={isDisabled}"));
  assert.ok(tiles.includes("if (canApply(levels)) onChange(levels);"));
  assert.ok(
    tiles.includes("selectedLevels.length > 0 ? selectedLevels : FILTER_LEVEL_CODES"),
    "an empty persisted list is shown and toggled as all levels",
  );
});

test("setup page 'Select all' restores every level, never an empty list", () => {
  assert.ok(
    setupPage.includes("onClick={() => setSelectedLevels([...FILTER_LEVEL_CODES])}"),
  );
  assert.ok(setupPage.includes('disabled={levelState.kind !== "some"}'));
  assert.ok(!/setSelectedLevels\(\[\]\)/.test(setupPage), "no deselect-all");
});

test("setup page links to the detailed filters with localized copy", () => {
  assert.ok(setupPage.includes('t("home.customPractice.filters.moreFilters")'));
  assert.ok(setupPage.includes("onClick={onCustomizeFilters}"));
  for (const [code, data] of Object.entries(localeData)) {
    for (const key of ["moreFilters", "levelsHeading"]) {
      const value = data.home?.customPractice?.filters?.[key];
      assert.ok(typeof value === "string" && value.trim(), `${code}: ${key}`);
    }
  }
});

test("expanding topics never writes selections", () => {
  const toggle = page.match(/onClick=\{\(\) => setAreTopicsExpanded\([^)]*\)[^}]*\}/);
  assert.ok(toggle, "topic expand toggle not found");
  assert.ok(!/setSelected/.test(toggle[0]));
});

test("primary action keeps onContinue and the no-words guard", () => {
  assert.ok(page.includes("onClick={onContinue}"));
  assert.ok(page.includes("disabled={!hasWordsForCurrentFilters}"));
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
