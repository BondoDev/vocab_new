import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConjugatedVerbFormsRegistry } from "../../lib/load-conjugated-verb-forms-registry.mjs";
import { compileTsToCommonJs, readJson, ROOT_DIR } from "../../lib/compileTs.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PAGE_SOURCE = fs.readFileSync(
  path.join(
    ROOT_DIR,
    "src",
    "app",
    "pages",
    "verb-lists",
    "conjugated100Verbs",
    "ConjugatedVerbFormsSeoPage.tsx",
  ),
  "utf8",
);

const TABLE_SOURCE = fs.readFileSync(
  path.join(
    ROOT_DIR,
    "src",
    "app",
    "pages",
    "verb-lists",
    "conjugated100Verbs",
    "ConjugatedVerbFormsTableSection.tsx",
  ),
  "utf8",
);

const UI_LANGUAGE_SWITCHER_SOURCE = fs.readFileSync(
  path.join(
    ROOT_DIR,
    "src",
    "app",
    "components",
    "layout",
    "UILanguageSwitcher.tsx",
  ),
  "utf8",
);

const EXPLORE_ITEMS_SOURCE = fs.readFileSync(
  path.join(ROOT_DIR, "src", "app", "pages", "explore", "useExploreItems.ts"),
  "utf8",
);

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    console.error(`  \u2717 ${name}`);
    console.error(`     ${error.message}`);
    process.exitCode = 1;
  }
}

console.log("\n[conjugated-verb-forms] registry/content/metadata");

const registryLoader = loadConjugatedVerbFormsRegistry(".tmp-conjugated-verb-forms-page-test");
const metadataLoader = compileTsToCommonJs(".tmp-conjugated-verb-forms-metadata-test", [
  path.join(
    ROOT_DIR,
    "src",
    "seo",
    "verbLists",
    "conjugated100Verbs",
    "conjugatedVerbFormsMetadata.ts",
  ),
]);
// conjugated100VerbFormsData.ts uses import.meta.glob (Vite-only syntax) to
// discover ./conjugatedVerbs/*.json, which compileTsToCommonJs cannot
// compile (module: CommonJS rejects import.meta outright). The actual
// row-shaping logic it delegates to lives in
// conjugated100VerbFormsRowBuilder.ts, which is import.meta-free and can be
// compiled/exercised directly here.
const formsRowBuilderLoader = compileTsToCommonJs(".tmp-conjugated-verb-forms-row-builder-test", [
  path.join(
    ROOT_DIR,
    "src",
    "data",
    "seo",
    "verbLists",
    "conjugated100Verbs",
    "conjugated100VerbFormsRowBuilder.ts",
  ),
]);

try {
  const registry = registryLoader.registry;
  const metadata = metadataLoader.require(
    "src/seo/verbLists/conjugated100Verbs/conjugatedVerbFormsMetadata",
  );
  const formsRowBuilder = formsRowBuilderLoader.require(
    "src/data/seo/verbLists/conjugated100Verbs/conjugated100VerbFormsRowBuilder",
  );

  const content = registry.getConjugatedVerbFormsContent("english", "en");

  test("English/English content parses with the multi-tense schema", () => {
    assert.ok(content, "expected authored English/English content");
    assert.equal(content.metadata.title, "100 Most Common English Verb Conjugations");
    assert.equal(content.urlSlug, "100-most-common-english-verb-conjugations");
    assert.equal(content.tenseSelector.defaultTense, "present_simple");
    assert.deepEqual(
      content.tenseSelector.groups.map((group) => group.key),
      ["present", "past", "future"],
    );
    assert.equal(content.tenses.length, 12);
    assert.ok(content.tenses.every((tense) => tense.grammar.heading && tense.grammar.formula));
    assert.deepEqual(
      content.pronounForms.map((pronoun) => pronoun.key),
      ["i", "you", "he_she_it", "we", "they"],
    );
  });

  test("canonical route uses one page slug and no per-tense URL state", () => {
    assert.equal(
      registry.getConjugatedVerbFormsPath("english", "en"),
      "/en/100-most-common-english-verb-conjugations",
    );
    const paths = registry.getAllConjugatedVerbFormsPaths();
    assert.ok(paths.includes("/en/100-most-common-english-verb-conjugations"));
    assert.ok(paths.includes("/es/100-verbos-ingleses-mas-comunes-conjugados"));
    assert.ok(paths.every((path) => !path.includes("present-simple")));
    assert.ok(paths.every((path) => !path.includes("past-simple")));
    assert.ok(paths.every((path) => !path.includes("future-simple")));
    assert.deepEqual(
      registry.resolveConjugatedVerbFormsRoute("/en/100-most-common-english-verb-conjugations"),
      { uiLang: "en", targetLanguage: "english" },
    );
    assert.deepEqual(
      registry.resolveConjugatedVerbFormsRoute("/es/100-verbos-ingleses-mas-comunes-conjugados"),
      { uiLang: "es", targetLanguage: "english" },
    );
  });

  test("metadata comes from JSON and canonical stays on the single route", () => {
    const result = metadata.buildConjugatedVerbFormsSeoMetadata({
      uiLang: "en",
      pathname: "/en/100-most-common-english-verb-conjugations",
      siteOrigin: "https://www.fluentstellar.com",
      content,
      getAllPaths: registry.getAllConjugatedVerbFormsPaths,
      getPath: (uiLang) => registry.getConjugatedVerbFormsPath("english", uiLang),
    });

    assert.equal(result.title, "100 Common English Verb Conjugations by Tense");
    assert.equal(
      result.description,
      "Explore 100 common English verbs conjugated by pronoun across important present, past, and future tenses, with clear grammar rules and learning tips.",
    );
    assert.equal(
      result.canonical,
      "https://www.fluentstellar.com/en/100-most-common-english-verb-conjugations",
    );
  });

  test("present simple conjugation rows load from the authored English JSON file", () => {
    const englishTenseGroups = readJson(
      "src/data/seo/verbLists/conjugated100Verbs/conjugatedVerbs/english.json",
    );
    const rows = formsRowBuilder.buildConjugatedVerbFormsRows(
      "conjugatedVerbs/english.json",
      "english",
      englishTenseGroups,
    );
    assert.ok(rows, "expected English conjugation rows");
    assert.equal(rows.size, 100);
    assert.deepEqual(rows.get("A1-00008")?.present_simple, {
      i: "am",
      you: "are",
      he_she_it: "is",
      we: "are",
      they: "are",
    });
    assert.equal(rows.get("A1-00008")?.past_simple?.i, "was");
  });

  test("conjugation list loader validates duplicate tenses and targetLanguage mismatches", () => {
    const source = fs.readFileSync(
      path.join(
        ROOT_DIR,
        "src",
        "data",
        "seo",
        "verbLists",
        "conjugated100Verbs",
        "conjugated100VerbFormsRowBuilder.ts",
      ),
      "utf8",
    );

    assert.match(source, /targetLanguage\?: string/);
    assert.match(source, /TARGET_LANGUAGE_TO_UI_LANGUAGE\[targetLanguage\]/);
    assert.match(source, /has duplicate tense "\$\{tense\}"/);

    assert.throws(
      () =>
        formsRowBuilder.buildConjugatedVerbFormsRows("fixture", "english", [
          { tense: "present_simple", targetLanguage: "en", verbs: [] },
          { tense: "present_simple", targetLanguage: "en", verbs: [] },
        ]),
      /has duplicate tense "present_simple"/,
    );

    assert.throws(
      () =>
        formsRowBuilder.buildConjugatedVerbFormsRows("fixture", "english", [
          { tense: "present_simple", targetLanguage: "es", verbs: [] },
        ]),
      /has targetLanguage "es", expected "en"/,
    );
  });

  test("Spanish pronoun labels normalize to the JSON pronoun column keys", () => {
    assert.equal(formsRowBuilder.normalizePronounKey("Nosotros/Nosotras"), "nosotros");
    assert.equal(formsRowBuilder.normalizePronounKey("Vosotros/Vosotras"), "vosotros");
    assert.equal(formsRowBuilder.normalizePronounKey("Él/Ella/Usted"), "el_ella_usted");

    const rows = formsRowBuilder.buildConjugatedVerbFormsRows("fixture", "spanish", [
      {
        tense: "present_indicative",
        targetLanguage: "es",
        verbs: [
          {
            word_id: "A1-00008",
            conjugations: [
              { pronoun: "Yo", form: "soy" },
              { pronoun: "Tú", form: "eres" },
              { pronoun: "Él/Ella/Usted", form: "es" },
              { pronoun: "Nosotros/Nosotras", form: "somos" },
              { pronoun: "Vosotros/Vosotras", form: "sois" },
              { pronoun: "Ellos/Ellas/Ustedes", form: "son" },
            ],
          },
        ],
      },
    ]);

    assert.deepEqual(rows.get("A1-00008")?.present_indicative, {
      yo: "soy",
      tu: "eres",
      el_ella_usted: "es",
      nosotros: "somos",
      vosotros: "sois",
      ellos_ellas_ustedes: "son",
    });
  });

  test("French ‘je / j’’ elision normalizes to the JSON “je” pronoun column key", () => {
    // Regression test: the curly apostrophe in the authored "je / j’"
    // label (and a straight-apostrophe "je / j'") isn't stripped by the
    // generic diacritic/non-alphanumeric rules, so both fall through to
    // "je_j" before the je_j -> je special case is applied.
    assert.equal(formsRowBuilder.normalizePronounKey("je / j’"), "je");
    assert.equal(formsRowBuilder.normalizePronounKey("je / j'"), "je");
    assert.equal(formsRowBuilder.normalizePronounKey("il / elle / on"), "il_elle_on");

    const rows = formsRowBuilder.buildConjugatedVerbFormsRows("fixture", "french", [
      {
        tense: "present_indicative",
        targetLanguage: "fr",
        verbs: [
          {
            word_id: "A1-00008",
            conjugations: [
              { pronoun: "je / j’", form: "suis" },
              { pronoun: "tu", form: "es" },
              { pronoun: "il / elle / on", form: "est" },
              { pronoun: "nous", form: "sommes" },
              { pronoun: "vous", form: "êtes" },
              { pronoun: "ils / elles", form: "sont" },
            ],
          },
        ],
      },
    ]);

    assert.deepEqual(rows.get("A1-00008")?.present_indicative, {
      je: "suis",
      tu: "es",
      il_elle_on: "est",
      nous: "sommes",
      vous: "êtes",
      ils_elles: "sont",
    });
  });
} finally {
  registryLoader.cleanup();
  metadataLoader.cleanup();
  formsRowBuilderLoader.cleanup();
}

console.log("\n[conjugated-verb-forms] component source contracts");

test("page initializes active tense from tenseSelector.defaultTense", () => {
  assert.match(PAGE_SOURCE, /resolveInitialTense\(tenses, content\?\.tenseSelector\.defaultTense\)/);
  assert.match(PAGE_SOURCE, /useState\(initialTense\)/);
});

test("selector renders JSON groups and tense labels with active state", () => {
  assert.match(PAGE_SOURCE, /content\.tenseSelector\.groups\.map/);
  assert.match(PAGE_SOURCE, /setActiveGroupKey\(group\.key\)/);
  assert.match(PAGE_SOURCE, /setActiveTenseKey\(groupTenses\[0\]\.key\)/);
  assert.match(PAGE_SOURCE, /activeGroupTenses\.map/);
  assert.match(PAGE_SOURCE, /aria-pressed=\{isActive\}/);
  assert.match(PAGE_SOURCE, /setActiveTenseKey\(tense\.key\)/);
});

test("selected tense updates grammar and table heading/description", () => {
  assert.match(PAGE_SOURCE, /activeTense\.grammar\.heading/);
  assert.match(PAGE_SOURCE, /activeTense\.grammar\.formula/);
  assert.match(PAGE_SOURCE, /activeTense\.grammar\.additionalFormula/);
  assert.match(PAGE_SOURCE, /heading=\{activeTense\?\.tableHeading \?\? content\.table\.heading\}/);
  assert.match(PAGE_SOURCE, /description=\{activeTense\?\.tableDescription \?\? content\.table\.description\}/);
});

test("meaning column is hidden when target language and UI language match", () => {
  assert.match(PAGE_SOURCE, /TARGET_LANGUAGE_TO_UI_LANGUAGE\[targetLanguage\] !== uiLang/);
  assert.match(PAGE_SOURCE, /showMeaningColumn=\{showMeaningColumn\}/);
});

test("table pronoun columns remain dynamic and horizontal-scroll compatible", () => {
  assert.match(TABLE_SOURCE, /pronounForms\.map/);
  assert.match(TABLE_SOURCE, /TableScrollControls/);
  assert.match(TABLE_SOURCE, /TableSearchRow/);
  assert.match(TABLE_SOURCE, /STICKY_HEADER_CELL/);
  assert.match(TABLE_SOURCE, /overflow-x-auto/);
  assert.match(TABLE_SOURCE, /tableMinWidthRem/);
  assert.match(TABLE_SOURCE, /table-fixed/);
  assert.match(TABLE_SOURCE, /whitespace-normal break-words/);
});

test("UI language switcher maps conjugated verb forms routes between authored UI slugs", () => {
  assert.match(UI_LANGUAGE_SWITCHER_SOURCE, /resolveConjugatedVerbFormsRoute/);
  assert.match(UI_LANGUAGE_SWITCHER_SOURCE, /getConjugatedVerbFormsPath/);
  assert.match(
    UI_LANGUAGE_SWITCHER_SOURCE,
    /getConjugatedVerbFormsPath\(conjugatedVerbFormsRoute\.targetLanguage, code\)/,
  );
});

test("Explore dropdowns append conjugated verb links for authored target-language pages", () => {
  assert.match(EXPLORE_ITEMS_SOURCE, /buildConjugatedVerbFormsExploreTopic\("english", uiLanguage\)/);
  assert.match(EXPLORE_ITEMS_SOURCE, /buildConjugatedVerbFormsExploreTopic\("spanish", uiLanguage\)/);
  assert.match(EXPLORE_ITEMS_SOURCE, /\.\.\.\(conjugatedVerbFormsTopic \? \[conjugatedVerbFormsTopic\] : \[\]\)/);
});

if (process.exitCode) {
  console.error("\nconjugated verb forms page tests failed");
  process.exit(process.exitCode);
}

console.log("\nconjugated verb forms page tests passed");
