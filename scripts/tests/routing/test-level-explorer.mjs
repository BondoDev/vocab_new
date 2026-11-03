// Regression contract for the CEFR vocabulary-level explorer's pure logic
// (src/data/seo/vocabularyLevels/levelExplorerRows.ts) and its localized
// copy (cefrPageCopy.ts): meaning assignment from the generated
// level-explorer files, word links resolving on the word Worker, search
// ranking, pagination, the ?q=/?page= URL state, and copy completeness for
// all seven UI languages.
//
// Data freshness of the generated files is checked separately by
// `npm run test:level-explorer-data` (the generator's --check mode).
//
// Run: node scripts/tests/routing/test-level-explorer.mjs
import assert from "node:assert/strict";
import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR, readJson } from "../../lib/compileTs.mjs";

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

const compiled = compileTsToCommonJs(".tmp-level-explorer", [
  path.join(ROOT_DIR, "src", "data", "seo", "shared", "slugs.ts"),
  path.join(ROOT_DIR, "src", "data", "seo", "vocabularyLevels", "levelExplorerRows.ts"),
  path.join(ROOT_DIR, "src", "data", "seo", "vocabularyLevels", "cefrPageCopy.ts"),
]);
const { SUPPORTED_UI_LANGUAGES, SUPPORTED_TARGET_LANGUAGES, SUPPORTED_LEVELS } = compiled.require(
  "src/data/seo/shared/slugs",
);
const rowsModule = compiled.require("src/data/seo/vocabularyLevels/levelExplorerRows");
const copyModule = compiled.require("src/data/seo/vocabularyLevels/cefrPageCopy");
const {
  LEVEL_EXPLORER_PAGE_SIZE,
  buildLevelExplorerRows,
  toSearchableLevelExplorerRows,
  filterLevelExplorerRows,
  clampLevelExplorerPage,
  getLevelExplorerPageCount,
  getLevelExplorerPageItems,
  parseLevelExplorerUrlState,
  buildLevelExplorerSearch,
} = rowsModule;

const explorerFile = (name) => readJson(`src/data/seo/vocabularyLevels/level-explorer/${name}.json`);

console.log("\n=== rows and meanings ===\n");

test("page size is 40", () => {
  assert.equal(LEVEL_EXPLORER_PAGE_SIZE, 40);
});

test("cross-language meanings are the UI-language word for the same concept", () => {
  const german = explorerFile("german-a1");
  const english = explorerFile("english-a1");
  const rows = buildLevelExplorerRows(german, "translation", english);
  const englishByConcept = new Map(english.words.map(([id, word]) => [id, word]));
  assert.equal(rows.length, german.words.length);
  for (const row of rows.slice(0, 200)) {
    assert.equal(row.meaning, englishByConcept.get(row.conceptId) ?? "");
  }
});

test("same-language meanings are the target language's own definitions", () => {
  const english = explorerFile("english-a1");
  const definitions = explorerFile("english-a1-definitions");
  const rows = buildLevelExplorerRows(english, "definition", definitions);
  const hello = rows.find((row) => row.word === "hello");
  assert.ok(hello, "hello is an English A1 word");
  assert.equal(hello.meaning, definitions.definitions[hello.conceptId]);
  assert.ok(rows.every((row) => typeof row.meaning === "string"));
});

test("a concept missing in the UI language gets an empty meaning (no substitution)", () => {
  const rows = buildLevelExplorerRows(
    { language: "german", level: "a1", words: [["A1-1", "Haus", "noun"], ["A1-2", "Baum", "noun"]] },
    "translation",
    { language: "english", level: "a1", words: [["A1-1", "house", "noun"]] },
  );
  assert.deepEqual(
    rows.map((row) => row.meaning),
    ["house", ""],
  );
});

test("only lemmas valid for word pages are linkable (short words stay plain text)", () => {
  const rows = buildLevelExplorerRows(
    { language: "english", level: "a1", words: [["A1-1", "go", "verb"], ["A1-2", "house", "noun"]] },
    "definition",
    { language: "english", level: "a1", definitions: {} },
  );
  assert.deepEqual(
    rows.map((row) => row.linkable),
    [false, true],
  );
});

test("generated word lists are sorted in the target language's collation with unique concepts", () => {
  for (const language of SUPPORTED_TARGET_LANGUAGES) {
    for (const level of SUPPORTED_LEVELS) {
      const file = explorerFile(`${language}-${level}`);
      const ids = new Set(file.words.map(([id]) => id));
      assert.equal(ids.size, file.words.length, `${language}-${level} has duplicate concept ids`);
      const collator = new Intl.Collator(copyLanguageCode(language), { numeric: true });
      for (let index = 1; index < file.words.length; index++) {
        assert.ok(
          collator.compare(file.words[index - 1][1], file.words[index][1]) <= 0,
          `${language}-${level} is not sorted at ${index}`,
        );
      }
    }
  }
});

function copyLanguageCode(language) {
  return { english: "en", german: "de", spanish: "es", french: "fr", italian: "it", portuguese: "pt", russian: "ru" }[
    language
  ];
}

console.log("\n=== word links resolve on the word Worker ===\n");

// Every linkable explorer row (the first 40 are prerendered; the rest are
// reached through pagination) must resolve, for every UI language, through
// the same parser/lookup rules the word Worker applies
// (workers/word-ssr/src/index.full.ts) to a 200 page for that exact concept —
// not a 308 or 410. Ported from the retired level-browse-preview test, which
// guarded the previous 54-word CEFR browse grid the same way.
test("every linkable explorer word links to its canonical word page in all UI languages", () => {
  const routes = compileTsToCommonJs(".tmp-level-explorer-routes", [
    path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordRouteManifest.ts"),
    path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordSlugs.ts"),
    path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "verifiedHistoricalWordRouteRedirects.ts"),
  ]);
  const unresolved = [];
  let checkedLinks = 0;
  try {
    const { parseWordRoutePathname, wordToSlug } = routes.require("src/data/seo/wordPages/wordRouteManifest");
    const { buildWordPath } = routes.require("src/data/seo/wordPages/wordSlugs");
    const { VERIFIED_HISTORICAL_WORD_ROUTE_REDIRECTS } = routes.require(
      "src/data/seo/wordPages/verifiedHistoricalWordRouteRedirects",
    );
    for (const targetLanguage of SUPPORTED_TARGET_LANGUAGES) {
      const vocabulary = readJson(`src/data/vocabulary/${targetLanguage}/vocabulary.json`);
      const recordsById = new Map(vocabulary.map((entry) => [entry.concept_id, entry]));
      for (const level of SUPPORTED_LEVELS) {
        const rows = buildLevelExplorerRows(explorerFile(`${targetLanguage}-${level}`), "definition", {
          definitions: {},
        });
        for (const row of rows) {
          if (!row.linkable) continue;
          const record = recordsById.get(row.conceptId);
          for (const uiLang of SUPPORTED_UI_LANGUAGES) {
            checkedLinks += 1;
            const href = buildWordPath(uiLang, targetLanguage, row.word, row.conceptId);
            const parsed = parseWordRoutePathname(href);
            const problem =
              parsed.kind !== "canonical"
                ? `parses as ${parsed.kind}`
                : !record
                  ? "concept missing from vocabulary.json (Worker 410)"
                  : record.level !== parsed.conceptId.slice(0, 2)
                    ? "concept level does not match its ID prefix (Worker 410)"
                    : wordToSlug(record.word_lemma) !== parsed.wordSlug
                      ? `slug "${parsed.wordSlug}" != current "${wordToSlug(record.word_lemma)}" (Worker 410)`
                      : targetLanguage === "english" &&
                          VERIFIED_HISTORICAL_WORD_ROUTE_REDIRECTS.has(`${parsed.conceptId}:${parsed.wordSlug}`)
                        ? "collides with a verified historical redirect (Worker 308)"
                        : null;
            if (problem) unresolved.push(`${targetLanguage}-${level} ${row.conceptId} "${row.word}" ${href}: ${problem}`);
          }
        }
      }
    }
  } finally {
    routes.cleanup();
  }
  assert.deepEqual(unresolved.slice(0, 20), [], `${unresolved.length} explorer link(s) the word Worker would not serve as 200`);
  assert.ok(checkedLinks > 400000, `only ${checkedLinks} links checked`);
  console.log(`       ${checkedLinks} explorer links checked`);
});

console.log("\n=== search ===\n");

const sample = toSearchableLevelExplorerRows([
  { conceptId: "1", word: "café", type: "noun", meaning: "coffee", linkable: true },
  { conceptId: "2", word: "water", type: "noun", meaning: "Wasser", linkable: true },
  { conceptId: "3", word: "watch", type: "verb", meaning: "anschauen", linkable: true },
  { conceptId: "4", word: "tap water", type: "noun", meaning: "Leitungswasser", linkable: true },
  { conceptId: "5", word: "sea", type: "noun", meaning: "Meer", linkable: true },
]);

test("empty query returns every row in display order", () => {
  assert.deepEqual(
    filterLevelExplorerRows(sample, "  ").map((row) => row.conceptId),
    ["1", "2", "3", "4", "5"],
  );
});

test("word-prefix matches rank before meaning-prefix and contained matches", () => {
  assert.deepEqual(
    filterLevelExplorerRows(sample, "wa").map((row) => row.conceptId),
    ["2", "3", "4"],
  );
  assert.deepEqual(
    filterLevelExplorerRows(sample, "wasser").map((row) => row.conceptId),
    ["2", "4"],
  );
});

test("search is case- and accent-insensitive and matches meanings", () => {
  assert.deepEqual(
    filterLevelExplorerRows(sample, "CAFE").map((row) => row.conceptId),
    ["1"],
  );
  assert.deepEqual(
    filterLevelExplorerRows(sample, "meer").map((row) => row.conceptId),
    ["5"],
  );
  assert.deepEqual(filterLevelExplorerRows(sample, "zzz"), []);
});

console.log("\n=== pagination and URL state ===\n");

test("page count and clamping", () => {
  assert.equal(getLevelExplorerPageCount(0), 1);
  assert.equal(getLevelExplorerPageCount(40), 1);
  assert.equal(getLevelExplorerPageCount(41), 2);
  assert.equal(clampLevelExplorerPage(99, 81), 3);
  assert.equal(clampLevelExplorerPage(0, 81), 1);
  assert.equal(clampLevelExplorerPage(Number.NaN, 81), 1);
});

test("page items keep first, last, and a window around the current page", () => {
  assert.deepEqual(getLevelExplorerPageItems(1, 5), [1, 2, 3, 4, 5]);
  assert.deepEqual(getLevelExplorerPageItems(1, 24), [1, 2, null, 24]);
  assert.deepEqual(getLevelExplorerPageItems(12, 24), [1, null, 11, 12, 13, null, 24]);
  assert.deepEqual(getLevelExplorerPageItems(24, 24), [1, null, 23, 24]);
});

test("URL state parsing ignores invalid pages and caps query length", () => {
  assert.deepEqual(parseLevelExplorerUrlState(""), { query: "", page: 1 });
  assert.deepEqual(parseLevelExplorerUrlState("?q=haus&page=3"), { query: "haus", page: 3 });
  assert.deepEqual(parseLevelExplorerUrlState("?page=-2"), { query: "", page: 1 });
  assert.deepEqual(parseLevelExplorerUrlState("?page=abc"), { query: "", page: 1 });
  assert.equal(parseLevelExplorerUrlState(`?q=${"a".repeat(300)}`).query.length, 100);
});

test("URL writing omits defaults and keeps unrelated parameters", () => {
  assert.equal(buildLevelExplorerSearch("", { query: "", page: 1 }), "");
  assert.equal(buildLevelExplorerSearch("?q=old&page=4", { query: "", page: 1 }), "");
  assert.equal(buildLevelExplorerSearch("", { query: " haus ", page: 2 }), "?q=haus&page=2");
  assert.equal(buildLevelExplorerSearch("?utm_source=x", { query: "", page: 3 }), "?utm_source=x&page=3");
});

console.log("\n=== localized copy ===\n");

const { getCefrPageCopy, formatCefrWordCount, formatCefrCount, getCefrLevelCode } = copyModule;
const usedTypes = new Set();
for (const language of SUPPORTED_TARGET_LANGUAGES) {
  for (const level of SUPPORTED_LEVELS) {
    for (const [, , type] of explorerFile(`${language}-${level}`).words) usedTypes.add(type);
  }
}

test("every UI language has names for every target language and level", () => {
  for (const uiLang of SUPPORTED_UI_LANGUAGES) {
    const copy = getCefrPageCopy(uiLang);
    for (const language of SUPPORTED_TARGET_LANGUAGES) {
      assert.ok(copy.languageNames[language], `${uiLang}: missing name for ${language}`);
      assert.ok(copy.vocabularyHeading(language, "A1").includes("A1"), `${uiLang}: heading lacks level`);
      assert.ok(copy.levelTestLabel(language).length > 0);
    }
    for (const level of SUPPORTED_LEVELS) {
      assert.ok(copy.levelNames[level], `${uiLang}: missing level name for ${level}`);
    }
  }
});

test("non-English UI copy never shows English language names", () => {
  const englishNames = ["English", "German", "Spanish", "French", "Italian", "Portuguese", "Russian"];
  for (const uiLang of SUPPORTED_UI_LANGUAGES.filter((code) => code !== "en")) {
    const copy = getCefrPageCopy(uiLang);
    for (const language of SUPPORTED_TARGET_LANGUAGES) {
      const phrases = [copy.languageNames[language], copy.vocabularyHeading(language, "B1"), copy.levelTestLabel(language)];
      for (const phrase of phrases) {
        // Whole words only: "Italiano" is not "Italian".
        assert.ok(
          !englishNames.some((name) => new RegExp(`\\b${name}\\b`).test(phrase)),
          `${uiLang}: "${phrase}" uses an English name`,
        );
      }
    }
  }
});

test("every grammar type in the generated data has a label in every UI language", () => {
  for (const uiLang of SUPPORTED_UI_LANGUAGES) {
    const copy = getCefrPageCopy(uiLang);
    for (const type of usedTypes) {
      if (!type) continue;
      assert.ok(copy.wordTypes[type], `${uiLang}: missing label for word type "${type}"`);
    }
  }
});

test("word counts use each language's plural rules and fixed digit grouping", () => {
  assert.equal(formatCefrWordCount("en", 1), "1 word");
  assert.equal(formatCefrWordCount("en", 1224), "1,224 words");
  assert.equal(formatCefrWordCount("de", 1224), "1.224 Wörter");
  assert.equal(formatCefrWordCount("ru", 21), "21 слово");
  assert.equal(formatCefrWordCount("ru", 22), "22 слова");
  assert.equal(formatCefrWordCount("ru", 1480), "1 480 слов");
  assert.equal(formatCefrWordCount("fr", 3057), "3 057 mots");
  assert.equal(formatCefrCount(getCefrPageCopy("it"), 999), "999");
  assert.equal(getCefrLevelCode("c2"), "C2");
});

test("French level-test labels elide before a vowel", () => {
  const copy = getCefrPageCopy("fr");
  assert.equal(copy.levelTestLabel("english"), "Test de niveau d’anglais");
  assert.equal(copy.levelTestLabel("german"), "Test de niveau d’allemand");
  assert.equal(copy.levelTestLabel("portuguese"), "Test de niveau de portugais");
});

console.log(`\n─────────────────────────────────────────`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log(`─────────────────────────────────────────\n`);

compiled.cleanup();

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("level-explorer contract passed");
}
