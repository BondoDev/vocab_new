// Focused guard for the full-vocabulary-list SEO family (phase 1: page
// structure only). Covers the route registry, content validation, metadata
// (canonical/hreflang/robots), and that page components carry no hardcoded
// user-facing text.
// Run: node scripts/tests/seo/test-full-vocabulary-list-page.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "../../lib/compileTs.mjs";

const PAGE_DIR = path.join(ROOT_DIR, "src", "app", "pages", "list-pages", "full-vocabulary-list");
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
  path.join(ROOT_DIR, "src", "data", "seo", "listPages", "fullVocabularyList", "fullVocabularyListRegistry.ts"),
  path.join(ROOT_DIR, "src", "seo", "listPages", "fullVocabularyList", "fullVocabularyListMetadata.ts"),
  path.join(ROOT_DIR, "src", "data", "seo", "listPages", "fullVocabularyList", "fullVocabularyListEntries.ts"),
  path.join(ROOT_DIR, "src", "features", "practice", "utils", "highlightInflectedWords.ts"),
]);

try {
  const registry = compiled.require("src/data/seo/listPages/fullVocabularyList/fullVocabularyListRegistry");
  const { buildFullVocabularyListSeoMetadata } = compiled.require(
    "src/seo/listPages/fullVocabularyList/fullVocabularyListMetadata",
  );

  console.log("\n=== full vocabulary list: routes ===\n");

  // The English list in all seven UI languages (the UI-language switcher
  // navigates between these). Slugs are authored per record in the JSON.
  const ENGLISH_LIST_PATHS = {
    en: "/en/english-vocabulary-list",
    es: "/es/english-vocabulary-list",
    fr: "/fr/english-vocabulary-list",
    de: "/de/english-vocabulary-list",
    it: "/it/english-vocabulary-list",
    pt: "/pt/english-vocabulary-list",
    ru: "/ru/english-vocabulary-list",
  };

  // Pages are generated from whatever (targetLanguage, uiLanguage) records
  // the content JSON holds (up to 7 x 7), so these checks hold for any set.
  test("the English list is published in all seven UI languages", () => {
    const allPaths = registry.getAllFullVocabularyListPaths();
    for (const [uiLang, path] of Object.entries(ENGLISH_LIST_PATHS)) {
      assert.equal(registry.getFullVocabularyListPath("english", uiLang), path, `${uiLang} path`);
      assert.ok(allPaths.includes(path), `${path} is enumerated for prerender/sitemap`);
    }
  });

  test("every record gets a unique path that resolves back to it", () => {
    const allPaths = registry.getAllFullVocabularyListPaths();
    assert.equal(new Set(allPaths).size, allPaths.length, "duplicate paths");
    for (const path of allPaths) {
      const route = registry.resolveFullVocabularyListRoute(path);
      assert.ok(route, `${path} resolves`);
      assert.equal(registry.getFullVocabularyListPath(route.targetLanguage, route.uiLang), path);
      assert.ok(path.startsWith(`/${route.uiLang}/`), `${path} sits under its UI language`);
    }
  });

  test("routes resolve to their UI and target language; unknown variants do not", () => {
    for (const [uiLang, path] of Object.entries(ENGLISH_LIST_PATHS)) {
      assert.deepEqual(registry.resolveFullVocabularyListRoute(path), { uiLang, targetLanguage: "english" });
    }
    // Paths are only those authored: an unknown slug resolves to nothing.
    assert.equal(registry.resolveFullVocabularyListRoute("/es/no-such-vocabulary-list"), null);
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
    "src/data/seo/listPages/fullVocabularyList/fullVocabularyListEntries",
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

  test("with a locale, each level is sorted by its own word in that language's order", () => {
    const sorted = groupFullVocabularyRows([
      { concept_id: "c1", word_lemma: "Zug", definiton: "d", sentence: "s", type: "noun", level: "A1" },
      { concept_id: "c2", word_lemma: "Äpfel", definiton: "d", sentence: "s", type: "noun", level: "A1" },
      { concept_id: "c3", word_lemma: "Apfel", definiton: "d", sentence: "s", type: "noun", level: "A1" },
      { concept_id: "c4", word_lemma: "Bahn", definiton: "d", sentence: "s", type: "noun", level: "A1" },
    ], "de").a1;
    // German collation keeps Ä with A rather than after Z.
    assert.deepEqual(sorted.map((row) => row.word), ["Apfel", "Äpfel", "Bahn", "Zug"]);
    // Real data: the German A1 table is no longer in English concept order.
    const germanA1 = groupFullVocabularyRows(readVocabulary("german"), "de").a1.map((row) => row.word);
    const collator = new Intl.Collator("de", { numeric: true });
    assert.ok(germanA1.every((word, i) => i === 0 || collator.compare(germanA1[i - 1], word) <= 0), "German A1 sorted");
  });

  test("unusable lemmas and repeated concept ids are skipped", () => {
    const rows = groupFullVocabularyRows([
      { concept_id: "x1", word_lemma: "-", definiton: "d", sentence: "s", type: "noun", level: "A1" },
      { concept_id: "x3", word_lemma: "—", definiton: "d", sentence: "s", type: "noun", level: "A1" },
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
  } = compiled.require("src/data/seo/listPages/fullVocabularyList/fullVocabularyListEntries");
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
    "src/data/seo/listPages/fullVocabularyList/fullVocabularyListEntries",
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
  const { buildInflectedFormsIndex } = compiled.require("src/data/seo/listPages/fullVocabularyList/fullVocabularyListEntries");

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

  console.log("\n=== full vocabulary list: educational sections ===\n");

  // The page copy is hand-authored and edited over time, so these check
  // structure (every educational section present and complete, the agreed
  // counts) rather than pinning sentences.
  test("English record has the full educational structure", () => {
    for (const field of ["heading", "description", "levelHeadingTemplate"]) {
      assert.ok(content.levelsSection[field], `levelsSection.${field}`);
    }
    assert.match(
      registry.formatContentTemplate(content.levelsSection.levelHeadingTemplate, { level: "B2", name: content.levels[3].name }),
      /^B2 .+ Upper Intermediate$/,
    );
    assert.deepEqual(Object.keys(content.cefrSection.levelSummaries), ["a1", "a2", "b1", "b2", "c1", "c2"]);
    assert.equal(content.learningSection.tips.length, 3);
    // The standalone practice link was replaced by the learning-options section.
    assert.equal(content.learningSection.practiceLinkLabel, undefined);
    for (const option of ["personalized", "freePractice"]) {
      for (const field of ["heading", "description", "buttonLabel"]) {
        assert.ok(content.learningOptions[option][field], `learningOptions.${option}.${field}`);
      }
    }
    assert.equal(content.faq.items.length, 4);
  });

  test("no record carries both the old how-to paragraph and the learning section", () => {
    assert.equal(content.howToUse, undefined, "howToUse would duplicate learningSection");
    for (const path of registry.getAllFullVocabularyListPaths()) {
      const route = registry.resolveFullVocabularyListRoute(path);
      const record = registry.getFullVocabularyListContent(route.targetLanguage, route.uiLang);
      assert.ok(!(record.howToUse && record.learningSection), `${path} would render two "how to" sections`);
    }
  });

  test("no FAQPage structured data is emitted", () => {
    const pageMetadata = buildFullVocabularyListSeoMetadata({
      uiLang: "en",
      siteOrigin: ORIGIN,
      content,
      getPath: (lang) => registry.getFullVocabularyListPath("english", lang),
    });
    const types = JSON.parse(pageMetadata.jsonLd)["@graph"].map((node) => node["@type"]);
    assert.ok(!types.includes("FAQPage"));
  });

  console.log("\n=== full vocabulary list: metadata ===\n");

  const metadata = buildFullVocabularyListSeoMetadata({
    uiLang: "en",
    siteOrigin: `${ORIGIN}/`,
    content,
    getPath: (lang) => registry.getFullVocabularyListPath("english", lang),
  });

  test("title, description, and canonical come from authored content", () => {
    assert.equal(metadata.title, content.metadata.metaTitle);
    assert.equal(metadata.description, content.metadata.metaDescription);
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
