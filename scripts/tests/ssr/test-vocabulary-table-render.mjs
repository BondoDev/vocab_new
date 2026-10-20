/**
 * Server-render contract of the shared VocabularyTable
 * (src/app/components/vocabulary-table/) and its first adapter,
 * FullVocabularyTable (src/app/pages/list-pages/full-vocabulary-list/).
 *
 * The table's rows are prerendered for SEO and then hydrated, so the server
 * markup must stay compact and deterministic: no interactive controls before
 * hydration (they render client-side only), columns derived from the column
 * configuration, and the short vt-* classes the stylesheet targets.
 * Interaction (Details toggle, row taps, menu) needs a DOM and is not covered.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { compileTsToCommonJs, ROOT_DIR } from "../../lib/compileTs.mjs";

const TABLE_SOURCE = "src/app/components/vocabulary-table/VocabularyTable";
const ADAPTER_SOURCE = "src/app/pages/list-pages/full-vocabulary-list/FullVocabularyTable";

const compiled = compileTsToCommonJs(".tmp-vocabulary-table-render", [
  path.join(ROOT_DIR, `${TABLE_SOURCE}.tsx`),
  path.join(ROOT_DIR, `${ADAPTER_SOURCE}.tsx`),
]);

// TypeScript doesn't emit the stylesheet import's target; an empty stand-in
// lets Node resolve it (styles are irrelevant to markup).
const scssStandIn = path.join(compiled.tempDir, "src/app/components/vocabulary-table/vocabulary-table.scss");
fs.writeFileSync(scssStandIn, "");
const nodeRequire = createRequire(import.meta.url);
nodeRequire.extensions[".scss"] = () => {};

const React = nodeRequire("react");
const { renderToString } = nodeRequire("react-dom/server");

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`not ok - ${name}`);
    console.error(error);
  }
}

const count = (html, pattern) => (html.match(pattern) ?? []).length;

try {
  const { VocabularyTable, VocabularyTableBadge } = compiled.require(TABLE_SOURCE);
  const { FullVocabularyTable } = compiled.require(ADAPTER_SOURCE);

  const rows = [
    { id: "c1", word: "apple", meaning: "a fruit", kind: "noun" },
    { id: "c2", word: "run", meaning: "to move fast", kind: "verb" },
  ];
  const labels = {
    number: "N",
    word: "Word",
    details: "Details",
    hide: "Hide",
    actions: "Actions",
    pronounce: "Pronounce {word}",
    rowActions: "Actions for {word}",
  };
  const baseProps = {
    rows,
    getRowKey: (row) => row.id,
    getWord: (row) => row.word,
    wordLang: "en-US",
    labels,
    ariaLabel: "Word list",
    idPrefix: "test",
  };
  const render = (props) => renderToString(React.createElement(VocabularyTable, { ...baseProps, ...props }));

  const primaryColumn = { key: "meaning", header: "Meaning", placement: "primary", render: (row) => row.meaning };
  const detailColumn = {
    key: "kind",
    header: "Type",
    placement: "detail",
    detailStyle: "badge",
    render: (row) => React.createElement(VocabularyTableBadge, null, row.kind),
  };
  const action = { key: "add", label: "Add", onSelect: () => {} };

  test("renders one body row per entry with number, word, and language", () => {
    const html = render({ columns: [primaryColumn] });
    assert.equal(count(html, /class="vt-row"/g), 2);
    assert.match(html, /<td class="vt-num">1<\/td>/);
    assert.match(html, /<td class="vt-num">2<\/td>/);
    assert.match(html, /<th scope="row" class="vt-word">/);
    assert.match(html, /<span lang="en-US" class="vt-word-text">apple<\/span>/);
    assert.match(html, /role="region" aria-label="Word list"/);
  });

  test("headers and cells follow the column configuration", () => {
    const html = render({ columns: [primaryColumn, detailColumn] });
    assert.ok(html.indexOf(">Meaning</th>") < html.indexOf(">Type</th>"), "primary headers precede detail headers");
    assert.match(html, /<td class="vt-p vt-strong">a fruit<\/td>/);
    assert.match(html, /<td class="vt-d"><span class="vt-badge">noun<\/span><\/td>/);
  });

  test("no interactive controls in server markup (added after hydration)", () => {
    const html = render({ columns: [primaryColumn, detailColumn], rowActions: [action] });
    assert.equal(count(html, /<button/g), 0);
    // Their cells are still present so hydration doesn't shift the layout.
    assert.equal(count(html, /class="vt-toggle-cell"/g), 2);
    assert.equal(count(html, /class="vt-actions"/g), 2);
    assert.doesNotMatch(html, /test-details-/, "details panels render only when opened");
  });

  test("Details and actions columns appear only when configured", () => {
    const plain = render({ columns: [primaryColumn] });
    assert.doesNotMatch(plain, /vt-toggle-cell|vt-actions|vt-expandable/);
    assert.doesNotMatch(plain, />Details<|>Actions</);

    const full = render({ columns: [primaryColumn, detailColumn], rowActions: [action] });
    assert.match(full, /<span class="sr-only">Details<\/span>/);
    assert.match(full, /<span class="sr-only">Actions<\/span>/);
    assert.match(full, /vt-expandable/);
  });

  test("desktop minimum width grows with primary columns", () => {
    assert.match(render({ columns: [detailColumn] }), /min-width:46rem/);
    assert.match(render({ columns: [primaryColumn, detailColumn] }), /min-width:54rem/);
  });

  test("number column width fits the widest row number", () => {
    const manyRows = Array.from({ length: 1000 }, (_, index) => ({ ...rows[0], id: `r${index}` }));
    assert.match(render({ rows: manyRows, columns: [] }), /--number-col:2\.70rem/);
    assert.match(render({ columns: [] }), /--number-col:1\.05rem/);
  });

  // --- FullVocabularyTable adapter -----------------------------------------

  const fullRows = [
    {
      conceptId: "k1",
      word: "apple",
      definition: "A round fruit.",
      sentence: "She ate an apple.",
      type: "noun",
      searchKey: "apple",
      translation: "manzana",
      sentenceForms: ["apple"],
    },
    { conceptId: "k2", word: "run", definition: "To move fast.", sentence: "We run daily.", type: "verb", searchKey: "run" },
  ];
  const renderAdapter = (props) =>
    renderToString(
      React.createElement(FullVocabularyTable, {
        rows: fullRows,
        label: "A1 words",
        columns: {
          number: "N",
          word: "Word",
          translation: "Translation",
          definition: "Definition",
          sentence: "Example",
          grammarType: "Type",
          actions: "Actions",
        },
        grammarTypes: { noun: "Noun", verb: "Verb" },
        pronounceLabel: "Pronounce {word}",
        speechLang: "en-US",
        showTranslations: true,
        detailsLabel: "Details",
        hideLabel: "Hide",
        rowActionsLabel: "Actions for {word}",
        addToListLabel: "Add to list",
        onAddToList: () => {},
        ...props,
      }),
    );

  test("adapter: translation column only when translations are shown", () => {
    const withTranslations = renderAdapter();
    assert.match(withTranslations, />Translation<\/th>/);
    assert.match(withTranslations, /<td class="vt-p vt-strong">manzana<\/td>/);
    // Missing translation renders the muted placeholder.
    assert.match(withTranslations, /<td class="vt-p vt-strong"><span class="vt-missing">—<\/span><\/td>/);

    const sameLanguage = renderAdapter({ showTranslations: false });
    assert.doesNotMatch(sameLanguage, /Translation|vt-p/);
  });

  test("adapter: definition, highlighted sentence, and localized type", () => {
    const html = renderAdapter();
    assert.match(html, /<td class="vt-d vt-muted">A round fruit\.<\/td>/);
    assert.match(html, /<td class="vt-d vt-sent">She ate an <strong class="vt-hl">apple<\/strong>\.<\/td>/);
    assert.match(html, /<td class="vt-d vt-sent">We run daily\.<\/td>/, "no forms, no highlight");
    assert.match(html, /<span class="vt-badge">Noun<\/span>/);
    assert.match(html, /<span class="vt-badge">Verb<\/span>/);
  });
} finally {
  compiled.cleanup();
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nVocabularyTable render tests passed");
