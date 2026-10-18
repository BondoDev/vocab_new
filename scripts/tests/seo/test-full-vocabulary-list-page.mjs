// Focused guard for the full-vocabulary-list SEO family (phase 1: page
// structure only). Covers the route registry, content validation, metadata
// (canonical/hreflang/robots), and that page components carry no hardcoded
// user-facing text.
// Run: node scripts/tests/seo/test-full-vocabulary-list-page.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "../../lib/compileTs.mjs";

const PAGE_DIR = path.join(ROOT_DIR, "src", "app", "pages", "full-vocabulary-list");
const ORIGIN = "https://example.test";

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

const compiled = compileTsToCommonJs(".tmp-full-vocabulary-list-test", [
  path.join(ROOT_DIR, "src", "data", "seo", "fullVocabularyList", "fullVocabularyListRegistry.ts"),
  path.join(ROOT_DIR, "src", "seo", "fullVocabularyList", "fullVocabularyListMetadata.ts"),
  path.join(ROOT_DIR, "src", "data", "seo", "fullVocabularyList", "fullVocabularyListEntries.ts"),
  path.join(ROOT_DIR, "src", "features", "practice", "utils", "highlightInflectedWords.ts"),
]);

try {
  const registry = compiled.require("src/data/seo/fullVocabularyList/fullVocabularyListRegistry");
  const { buildFullVocabularyListSeoMetadata } = compiled.require(
    "src/seo/fullVocabularyList/fullVocabularyListMetadata",
  );

  console.log("\n=== full vocabulary list: routes ===\n");

  // The English list in all seven UI languages, each at its own localized
  // URL (the UI-language switcher navigates between these).
  const ENGLISH_LIST_PATHS = {
    en: "/en/english-vocabulary-list",
    es: "/es/lista-vocabulario-ingles",
    fr: "/fr/liste-vocabulaire-anglais",
    de: "/de/englisch-wortschatz-liste",
    it: "/it/lista-vocabolario-inglese",
    pt: "/pt/lista-vocabulario-ingles",
    ru: "/ru/slovar-angliiskii-spisok",
  };

  test("the English list is published in all seven UI languages", () => {
    assert.deepEqual(
      [...registry.getAllFullVocabularyListPaths()].sort(),
      Object.values(ENGLISH_LIST_PATHS).sort(),
    );
    for (const [uiLang, path] of Object.entries(ENGLISH_LIST_PATHS)) {
      assert.equal(registry.getFullVocabularyListPath("english", uiLang), path, `${uiLang} path`);
    }
  });

  test("routes resolve to their UI and target language; unknown variants do not", () => {
    for (const [uiLang, path] of Object.entries(ENGLISH_LIST_PATHS)) {
      assert.deepEqual(registry.resolveFullVocabularyListRoute(path), { uiLang, targetLanguage: "english" });
    }
    // A slug only exists under its own UI-language prefix.
    assert.equal(registry.resolveFullVocabularyListRoute("/es/english-vocabulary-list"), null);
    assert.equal(registry.getFullVocabularyListPath("spanish", "en"), null);
  });

  console.log("\n=== full vocabulary list: content ===\n");

  const content = registry.getFullVocabularyListContent("english", "en");

  test("content lists the six CEFR levels in A1→C2 order", () => {
    assert.deepEqual(
      content.levels.map((level) => level.level),
      ["a1", "a2", "b1", "b2", "c1", "c2"],
    );
  });

  test("content templates fill the {level} token", () => {
    assert.equal(
      registry.formatContentTemplate(content.levelPanel.searchPlaceholder, { level: "B1" }),
      "Search B1 vocabulary...",
    );
  });

  test("content templates fill {count}, {shown}, and {total} tokens", () => {
    assert.equal(registry.formatContentTemplate(content.levelPanel.loadMoreLabel, { count: 300 }), "Load 300 More Words");
    assert.equal(
      registry.formatContentTemplate(content.levelPanel.shownCountLabel, { shown: 300, total: 962 }),
      "Showing 300 of 962 words",
    );
  });

  console.log("\n=== full vocabulary list: vocabulary rows ===\n");

  const { groupFullVocabularyRows } = compiled.require(
    "src/data/seo/fullVocabularyList/fullVocabularyListEntries",
  );
  const vocabularyDir = path.join(ROOT_DIR, "src", "data", "vocabulary");
  const readVocabulary = (language) =>
    JSON.parse(fs.readFileSync(path.join(vocabularyDir, language, "vocabulary.json"), "utf8").replace(/^﻿/, ""));

  test("every vocabulary type in every language has a grammar-type label", () => {
    const labelled = new Set(registry.GRAMMAR_TYPE_KEYS);
    for (const language of fs.readdirSync(vocabularyDir).filter((name) => !name.includes("."))) {
      const rowsByLevel = groupFullVocabularyRows(readVocabulary(language));
      const unlabelled = new Set(
        Object.values(rowsByLevel).flat().map((row) => row.type).filter((type) => !labelled.has(type)),
      );
      assert.deepEqual([...unlabelled], [], `${language} has unlabelled types`);
    }
  });

  test("English rows group by CEFR level with complete fields", () => {
    const source = readVocabulary("english");
    const englishRows = groupFullVocabularyRows(source);
    for (const level of ["a1", "a2", "b1", "b2", "c1", "c2"]) {
      const expected = source.filter((entry) => entry.level === level.toUpperCase()).length;
      assert.equal(englishRows[level].length, expected, `${level} row count`);
    }
    const incomplete = Object.values(englishRows).flat().filter((row) => !row.word || !row.definition || !row.sentence);
    assert.equal(incomplete.length, 0, "rows missing word/definition/sentence");
  });

  test("unusable lemmas and repeated concept ids are skipped", () => {
    const rows = groupFullVocabularyRows([
      { concept_id: "x1", word_lemma: "-", definiton: "d", sentence: "s", type: "noun", level: "A1" },
      { concept_id: "x2", word_lemma: "cat", definiton: "d", sentence: "s", type: "Noun", level: "A1" },
      { concept_id: "x2", word_lemma: "dog", definiton: "d", sentence: "s", type: "noun", level: "A1" },
    ]);
    assert.deepEqual(rows.a1.map((row) => [row.word, row.type]), [["cat", "noun"]]);
  });

  test("numeric template values use the UI language's digit grouping", () => {
    assert.equal(
      registry.formatContentTemplate(content.levelPanel.headerCountLabel, { total: 3057 }, "en"),
      "3,057 words",
    );
    assert.equal(registry.formatContentTemplate("{total}", { total: 3057 }, "de"), "3.057");
  });

  console.log("\n=== full vocabulary list: filtering ===\n");

  const {
    filterFullVocabularyRows,
    collectGrammarTypes,
    isFullVocabularyFilterActive,
  } = compiled.require("src/data/seo/fullVocabularyList/fullVocabularyListEntries");
  const sampleRows = groupFullVocabularyRows([
    { concept_id: "c1", word_lemma: "Café", definiton: "d", sentence: "s", type: "noun", level: "A1" },
    { concept_id: "c2", word_lemma: "decaf", definiton: "d", sentence: "s", type: "noun", level: "A1" },
    { concept_id: "c3", word_lemma: "careful", definiton: "d", sentence: "s", type: "adjective", level: "A1" },
    { concept_id: "c4", word_lemma: "cafeteria", definiton: "d", sentence: "s", type: "noun", level: "A1" },
  ]).a1;
  const words = (rows) => rows.map((row) => row.word);

  test("search is case- and accent-insensitive, prefix matches first", () => {
    assert.deepEqual(words(filterFullVocabularyRows(sampleRows, [{ query: "CAFE", types: [] }])), ["Café", "cafeteria"]);
    assert.deepEqual(words(filterFullVocabularyRows(sampleRows, [{ query: "caf", types: [] }])), ["Café", "cafeteria", "decaf"]);
  });

  test("global and local filters combine (all must match)", () => {
    const filtered = filterFullVocabularyRows(sampleRows, [
      { query: "ca", types: [] },
      { query: "", types: ["adjective"] },
    ]);
    assert.deepEqual(words(filtered), ["careful"]);
    assert.equal(filterFullVocabularyRows(sampleRows, [{ query: "", types: ["verb"] }]).length, 0);
  });

  test("several selected grammar types match any of them", () => {
    assert.deepEqual(
      words(filterFullVocabularyRows(sampleRows, [{ query: "", types: ["noun", "adjective"] }])),
      ["Café", "decaf", "careful", "cafeteria"],
    );
    assert.deepEqual(
      words(filterFullVocabularyRows(sampleRows, [{ query: "", types: ["adjective", "verb"] }])),
      ["careful"],
    );
    // Global and local type selections still combine with AND.
    assert.deepEqual(
      words(filterFullVocabularyRows(sampleRows, [
        { query: "", types: ["noun", "adjective"] },
        { query: "", types: ["adjective"] },
      ])),
      ["careful"],
    );
  });

  test("empty filters return the full list unchanged; whitespace is not a filter", () => {
    assert.equal(filterFullVocabularyRows(sampleRows, [{ query: "  ", types: [] }]), sampleRows);
    assert.equal(isFullVocabularyFilterActive({ query: "  ", types: [] }), false);
  });

  test("grammar-type options list only types present, in the given order", () => {
    assert.deepEqual(collectGrammarTypes(sampleRows, registry.GRAMMAR_TYPE_KEYS), ["noun", "adjective"]);
  });

  console.log("\n=== full vocabulary list: translations ===\n");

  const { buildTranslationIndex, attachFullVocabularyTranslations } = compiled.require(
    "src/data/seo/fullVocabularyList/fullVocabularyListEntries",
  );

  test("translation index maps concept_id to the first usable lemma and its definition", () => {
    const index = buildTranslationIndex([
      { concept_id: "c1", word_lemma: "-" },
      { concept_id: "c1", word_lemma: "Kaffee", definiton: "Ein  heißes Getränk." },
      { concept_id: "c1", word_lemma: "ignored duplicate" },
      { concept_id: "c2", word_lemma: "  Tee " },
    ]);
    assert.deepEqual([...index], [
      ["c1", { word: "Kaffee", definition: "Ein heißes Getränk." }],
      ["c2", { word: "Tee", definition: "" }],
    ]);
  });

  test("attached translations replace definitions; missing ones keep the original", () => {
    const rows = attachFullVocabularyTranslations(
      { a1: sampleRows, a2: [], b1: [], b2: [], c1: [], c2: [] },
      new Map([
        ["c1", { word: "Kaffeehaus", definition: "Ein Ort, an dem man Kaffee trinkt." }],
        ["c3", { word: "vorsichtig", definition: "" }],
      ]),
    ).a1;
    assert.deepEqual(rows.map((row) => row.translation ?? null), ["Kaffeehaus", null, "vorsichtig", null]);
    // UI-language definition when present, otherwise the table language's.
    assert.deepEqual(rows.map((row) => row.definition), ["Ein Ort, an dem man Kaffee trinkt.", "d", "d", "d"]);
    // "vor" matches only a translation; "kaffee" prefix-matches a translation.
    assert.deepEqual(words(filterFullVocabularyRows(rows, [{ query: "vor", types: [] }])), ["careful"]);
    assert.deepEqual(words(filterFullVocabularyRows(rows, [{ query: "kaffee", types: [] }])), ["Café"]);
  });

  test("real data: English concepts resolve translations in every other language", () => {
    const englishRows = Object.values(groupFullVocabularyRows(readVocabulary("english"))).flat();
    for (const language of ["spanish", "french", "german", "italian", "portuguese", "russian"]) {
      const index = buildTranslationIndex(readVocabulary(language));
      const covered = englishRows.filter((row) => index.has(row.conceptId)).length;
      const ratio = covered / englishRows.length;
      console.log(`       ${language}: ${covered}/${englishRows.length} English words translated (${(ratio * 100).toFixed(1)}%)`);
      assert.ok(ratio > 0.9, `${language} translation coverage unexpectedly low`);
    }
  });

  console.log("\n=== full vocabulary list: sentence highlighting ===\n");

  const { findInflectedWordRanges, highlightInflectedWords } = compiled.require(
    "src/features/practice/utils/highlightInflectedWords",
  );
  const { buildInflectedFormsIndex } = compiled.require("src/data/seo/fullVocabularyList/fullVocabularyListEntries");

  test("inflected forms are found as whole words, case-insensitively", () => {
    const sentence = "Green beans are my favourite vegetable.";
    assert.deepEqual(findInflectedWordRanges(sentence, "en-US", ["beans", "bean"]), [{ start: 6, end: 11 }]);
    // "an" must not match inside "beans".
    assert.deepEqual(findInflectedWordRanges(sentence, "en-US", ["an"]), []);
    assert.deepEqual(findInflectedWordRanges("All the students are here.", "en-US", ["all"]), [{ start: 0, end: 3 }]);
  });

  test("practice-flow HTML highlighting is unchanged by the shared matcher", () => {
    assert.equal(
      highlightInflectedWords("Both my parents are teachers.", "en", [{ concept_id: "x", word_inflected1: "Both" }]),
      "<strong>Both</strong> my parents are teachers.",
    );
    assert.equal(highlightInflectedWords("No match here.", "en", [{ word_inflected1: "cat" }]), "No match here.");
  });

  test("inflected index reads every *inflected* key (German separable verbs)", () => {
    const index = buildInflectedFormsIndex([
      { concept_id: "v1", "word_inflected-1": "steht", "word_inflected-2": "auf" },
      { concept_id: "v2", word_inflected1: "-" },
    ]);
    assert.deepEqual([...index], [["v1", ["steht", "auf"]]]);
  });

  console.log("\n=== full vocabulary list: metadata ===\n");

  const metadata = buildFullVocabularyListSeoMetadata({
    uiLang: "en",
    siteOrigin: `${ORIGIN}/`,
    content,
    getPath: (lang) => registry.getFullVocabularyListPath("english", lang),
  });

  test("title, description, and canonical come from authored content", () => {
    assert.equal(metadata.title, "English Vocabulary List (A1–C2) with Definitions & Examples");
    assert.ok(metadata.description.startsWith("Explore English vocabulary from A1 to C2."));
    assert.equal(metadata.canonical, `${ORIGIN}/en/english-vocabulary-list`);
  });

  test("hreflang lists every authored UI variant plus an English x-default", () => {
    assert.deepEqual(metadata.alternates, [
      ...["en", "es", "de", "fr", "ru", "pt", "it"].map((lang) => ({
        hreflang: lang,
        href: `${ORIGIN}${ENGLISH_LIST_PATHS[lang]}`,
      })),
      { hreflang: "x-default", href: `${ORIGIN}${ENGLISH_LIST_PATHS.en}` },
    ]);
  });

  test("each UI variant has its own canonical URL and translated copy", () => {
    const seenTitles = new Set();
    for (const [uiLang, path] of Object.entries(ENGLISH_LIST_PATHS)) {
      const variant = registry.getFullVocabularyListContent("english", uiLang);
      const variantMetadata = buildFullVocabularyListSeoMetadata({
        uiLang,
        siteOrigin: ORIGIN,
        content: variant,
        getPath: (lang) => registry.getFullVocabularyListPath("english", lang),
      });
      assert.equal(variantMetadata.canonical, `${ORIGIN}${path}`);
      assert.ok(!seenTitles.has(variantMetadata.title), `${uiLang} reuses another variant's title`);
      seenTitles.add(variantMetadata.title);
    }
  });

  test("launched page is indexable and emits parseable JSON-LD", () => {
    assert.equal(metadata.robots, undefined);
    const graph = JSON.parse(metadata.jsonLd)["@graph"];
    assert.deepEqual(graph.map((node) => node["@type"]), ["WebPage", "BreadcrumbList"]);
  });

  console.log("\n=== full vocabulary list: localization ===\n");

  test("page components contain no hardcoded JSX text", () => {
    for (const fileName of fs.readdirSync(PAGE_DIR).filter((name) => name.endsWith(".tsx"))) {
      // Strip comments and arrow tokens first: their ">" would otherwise read
      // as the end of a JSX tag followed by "text".
      const source = fs
        .readFileSync(path.join(PAGE_DIR, fileName), "utf8")
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/=>/g, "");
      const textNodes = source.match(/>\s*[A-Za-z][^<>{}]*</g) ?? [];
      assert.deepEqual(textNodes, [], `${fileName} renders literal text instead of content JSON`);
      const literalAttributes = source.match(/\b(?:placeholder|aria-label|title|alt)="[^"]+"/g) ?? [];
      assert.deepEqual(literalAttributes, [], `${fileName} has literal user-facing attributes`);
    }
  });
} finally {
  compiled.cleanup();
}

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  process.exitCode = 1;
}
