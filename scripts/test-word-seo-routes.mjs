import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const tempDir = path.join(rootDir, ".tmp-word-seo-test");
const require = createRequire(import.meta.url);

function compileTestModules() {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const rootNames = [
    path.join(rootDir, "src", "data", "seo", "wordSlugs.ts"),
    path.join(rootDir, "src", "data", "seo", "wordPageData.ts"),
    path.join(rootDir, "src", "data", "seo", "slugs.ts"),
    path.join(rootDir, "src", "data", "seo", "hub.ts"),
    path.join(rootDir, "src", "data", "seo", "wordHubRoutes.ts"),
    path.join(rootDir, "src", "data", "englishVerbList", "routes.ts"),
    path.join(rootDir, "src", "utils", "fixMojibake.ts"),
  ];

  const program = ts.createProgram({
    rootNames,
    options: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      jsx: ts.JsxEmit.ReactJSX,
      resolveJsonModule: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      skipLibCheck: true,
      rootDir,
      outDir: tempDir,
      noEmit: false,
    },
  });

  const emitResult = program.emit();
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .concat(emitResult.diagnostics);

  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => rootDir,
      getNewLine: () => "\n",
    });
    throw new Error(`TypeScript compile failed:\n${formatted}`);
  }

  fs.writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify({ type: "commonjs" }, null, 2),
  );
}

compileTestModules();

const wordSlugs = require(path.join(tempDir, "src", "data", "seo", "wordSlugs.js"));
const wordPageData = require(path.join(tempDir, "src", "data", "seo", "wordPageData.js"));
const wordHubRoutes = require(path.join(tempDir, "src", "data", "seo", "wordHubRoutes.js"));
const englishVerbListRoutes = require(path.join(tempDir, "src", "data", "englishVerbList", "routes.js"));
const { fixMojibake } = require(path.join(tempDir, "src", "utils", "fixMojibake.js"));

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/^\uFEFF/, ""),
  );
}

const englishVocabulary = readJson("src/data/vocabulary/english/vocabulary.json");
const russianVocabulary = readJson("src/data/vocabulary/russian/vocabulary.json");
const englishVerbList = readJson("src/data/lists/list_of_100_most_used_verb.json");
const unresolvedEnglishVerbListIds = new Set();

const aboutMatches = wordPageData.findWordEntriesBySlug(englishVocabulary, "about");
const answerMatches = wordPageData.findWordEntriesBySlug(englishVocabulary, "answer");

assert.equal(aboutMatches.length, 1, "about should be an unambiguous slug");
assert.ok(answerMatches.length > 1, "answer should be an ambiguous slug");

const canonicalRoute = wordSlugs.resolveWordRoute(
  "en",
  "english-word-about--A1-00001",
);
assert.deepEqual(canonicalRoute, {
  routeKind: "canonical",
  uiLang: "en",
  targetLanguage: "english",
  wordSlug: "about",
  conceptId: "A1-00001",
});

const slugOnlyRoute = wordSlugs.parseWordRoute("en", "english-word-about");
assert.equal(slugOnlyRoute?.routeKind, "slug-only");
assert.equal(wordSlugs.resolveWordRoute("en", "english-word-about"), null);

const ambiguousSlugOnlyRoute = wordSlugs.parseWordRoute("en", "english-word-answer");
assert.equal(ambiguousSlugOnlyRoute?.routeKind, "slug-only");
assert.equal(wordSlugs.resolveWordRoute("en", "english-word-answer"), null);

const legacyRoute = wordSlugs.parseWordRoute(
  "en",
  "english-word-about-A1-00001",
);
assert.equal(legacyRoute?.routeKind, "legacy-single-hyphen");
assert.equal(legacyRoute?.conceptId, "A1-00001");

assert.equal(
  wordSlugs.parseWordRoute("en", "english-word-about--bad-id"),
  null,
  "bad concept IDs should be invalid",
);
assert.equal(
  wordSlugs.parseWordRoute("en", "english-word-about----A1-00001"),
  null,
  "malformed canonical separators should be invalid",
);

const aboutRecord = wordPageData.findCanonicalWordRecord(
  englishVocabulary,
  "about",
  "A1-00001",
);
assert.equal(aboutRecord?.slugMatches, true);

const mismatchRecord = wordPageData.findCanonicalWordRecord(
  englishVocabulary,
  "bank",
  "A1-00001",
);
assert.equal(mismatchRecord?.slugMatches, false);

assert.equal(englishVerbList.length, 100, "English verb list should contain 100 rows");
assert.equal(
  new Set(englishVerbList.map((item) => item.id)).size,
  100,
  "English verb list IDs should be unique",
);
assert.equal(
  englishVerbListRoutes.getAllEnglishVerbListPaths().length,
  7,
  "English verb list should expose 7 localized routes",
);
assert.equal(
  englishVerbListRoutes.resolveEnglishVerbListRoute("/en/100-most-common-english-verbs"),
  "en",
);
assert.equal(
  englishVerbListRoutes.resolveEnglishVerbListRoute("/ru/100-samykh-chastykh-angliiskikh-glagolov"),
  "ru",
);
assert.ok(
  englishVerbListRoutes.getEnglishVerbListContent("de").title.length > 0,
  "German localized verb-list title should exist",
);

const missingEnglishVerbEntries = [];
for (const item of englishVerbList) {
  assert.match(item.id, /^(A1|A2|B1|B2|C1|C2)-\d{5}$/, `Invalid CEFR ID: ${item.id}`);
  const matchingEntry = englishVocabulary.find((entry) => entry.concept_id === item.id);
  if (!matchingEntry) {
    missingEnglishVerbEntries.push(item.id);
  }
  assert.equal(
    wordSlugs.buildWordPath("en", "english", item.verb, item.id),
    `/en/english-word-${wordSlugs.wordToSlug(item.verb)}--${item.id}`,
  );
}
assert.deepEqual(
  missingEnglishVerbEntries.sort(),
  Array.from(unresolvedEnglishVerbListIds).sort(),
  "Unexpected unresolved English verb list IDs",
);

assert.equal(
  wordHubRoutes.getWordSeoHubSummaryPath("en", "english"),
  "/en/seo-pages/english-word-pages",
);
assert.equal(
  wordHubRoutes.getWordSeoHubSummaryPath("es", "german"),
  "/es/paginas-seo/paginas-palabras-aleman",
);
assert.equal(
  wordHubRoutes.getWordSeoHubLevelPath("ru", "spanish", "b2", 3),
  "/ru/seo-stranicy/stranicy-slov-ispanskii/b2/page/3",
);
assert.deepEqual(
  wordHubRoutes.resolveWordSeoHubRoute("/fr/pages-seo/pages-mots-russe/c1/page/2"),
  {
    kind: "level",
    uiLang: "fr",
    targetLanguage: "russian",
    level: "c1",
    page: 2,
  },
);
assert.deepEqual(
  wordHubRoutes.resolveWordSeoHubRoute("/de/seo-seiten/franzoesische-wortseiten"),
  {
    kind: "summary",
    uiLang: "de",
    targetLanguage: "french",
  },
);

const canonicalWordPageData = wordPageData.buildResolvedWordPageData({
  uiLang: "en",
  targetLanguage: "english",
  wordSlug: "about",
  conceptId: "A1-00001",
  vocabulary: englishVocabulary,
});
assert.equal(canonicalWordPageData.wordEntry?.word_lemma, "about");
assert.equal(canonicalWordPageData.wordEntry?.concept_id, "A1-00001");

const mismatchWordPageData = wordPageData.buildResolvedWordPageData({
  uiLang: "en",
  targetLanguage: "english",
  wordSlug: "bank",
  conceptId: "A1-00001",
  vocabulary: englishVocabulary,
});
assert.equal(mismatchWordPageData.wordEntry, null);

const slugOnlyWordPageData = wordPageData.buildResolvedWordPageData({
  uiLang: "en",
  targetLanguage: "english",
  wordSlug: "about",
  conceptId: null,
  vocabulary: englishVocabulary,
});
assert.equal(slugOnlyWordPageData.wordEntry, null);

const sitemapFiles = fs
  .readdirSync(path.join(rootDir, "public", "sitemaps"))
  .filter((name) => /^sitemap-words-.*\.xml$/.test(name));

for (const sitemapFile of sitemapFiles) {
  const xml = fs.readFileSync(path.join(rootDir, "public", "sitemaps", sitemapFile), "utf8");
  assert.ok(!xml.includes("/english-word-about-A1-00001"), "legacy URLs must not appear in sitemaps");
  assert.ok(!xml.includes("/english-word-about</loc>"), "slug-only URLs must not appear in sitemaps");
  const locMatches = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g));
  for (const [, loc] of locMatches) {
    assert.ok(
      /--(A1|A2|B1|B2|C1|C2)-\d{5}$/.test(loc),
      `word sitemap URL must use canonical double-hyphen concept format: ${loc}`,
    );
  }
}

assert.equal(
  wordSlugs.buildWordPath("en", "english", "about", "A1-00001"),
  "/en/english-word-about--A1-00001",
);
assert.equal(
  wordSlugs.buildWordPath("en", "german", "Hightech-", "B1-03527"),
  "/en/german-word-hightech--B1-03527",
  "trailing source hyphens must be removed before the canonical concept separator is appended",
);
assert.equal(
  wordSlugs.wordToSlug("Hightech-"),
  "hightech",
  "slug normalization should strip edge hyphens from source lemmas",
);

const russianFirstEntry = russianVocabulary[0];
const russianCanonicalPath = wordSlugs.buildWordPath(
  "en",
  "russian",
  russianFirstEntry.word_lemma,
  russianFirstEntry.concept_id,
);
const russianEncodedSlug = encodeURIComponent(
  wordSlugs.wordToSlug(russianFirstEntry.word_lemma),
);
const russianResolvedRoute = wordSlugs.resolveWordRoute(
  "en",
  russianCanonicalPath.replace(/^\/en\//, ""),
);
assert.deepEqual(russianResolvedRoute, {
  routeKind: "canonical",
  uiLang: "en",
  targetLanguage: "russian",
  wordSlug: wordSlugs.wordToSlug(russianFirstEntry.word_lemma),
  conceptId: russianFirstEntry.concept_id,
});
const russianEncodedResolvedRoute = wordSlugs.resolveWordRoute(
  "en",
  `russian-word-${russianEncodedSlug}--${russianFirstEntry.concept_id}`,
);
assert.deepEqual(russianEncodedResolvedRoute, {
  routeKind: "canonical",
  uiLang: "en",
  targetLanguage: "russian",
  wordSlug: wordSlugs.wordToSlug(russianFirstEntry.word_lemma),
  conceptId: russianFirstEntry.concept_id,
});

const russianWordPageData = wordPageData.buildResolvedWordPageData({
  uiLang: "en",
  targetLanguage: "russian",
  wordSlug: russianResolvedRoute.wordSlug,
  conceptId: russianFirstEntry.concept_id,
  vocabulary: russianVocabulary,
  uiVocabulary: englishVocabulary,
});
assert.equal(russianWordPageData.wordEntry?.concept_id, russianFirstEntry.concept_id);
assert.equal(
  fixMojibake('Italienisches Wort "anticlimatico" вЂ“ Bedeutung und Beispiel (C1 adjective)'),
  'Italienisches Wort "anticlimatico" – Bedeutung und Beispiel (C1 adjective)',
);
assert.equal(
  fixMojibake("EnttГ¤uschung verursachend, weil weniger aufregend als erwartet."),
  "Enttäuschung verursachend, weil weniger aufregend als erwartet.",
);
assert.equal(
  fixMojibake("Р СѓСЃСЃРєРёР№"),
  "Русский",
);

const vocabularyLevelPageSource = fs.readFileSync(
  path.join(rootDir, "src", "app", "components", "VocabularyLevelPage.tsx"),
  "utf8",
);
assert.ok(
  /buildWordPath\(\s*uiLang,\s*targetLanguage,\s*word\.word_lemma,\s*word\.concept_id,\s*\)/m.test(
    vocabularyLevelPageSource,
  ),
  "vocabulary level links should use canonical concept IDs",
);

const wordSeoPageSource = fs.readFileSync(
  path.join(rootDir, "src", "app", "components", "WordSeoPage.tsx"),
  "utf8",
);
const englishVerbListPageSource = fs.readFileSync(
  path.join(rootDir, "src", "app", "components", "EnglishVerbListSeoPage.tsx"),
  "utf8",
);
const metadataSource = fs.readFileSync(path.join(rootDir, "src", "seo", "metadata.ts"), "utf8");
const coreSitemapXml = fs.readFileSync(
  path.join(rootDir, "public", "sitemaps", "sitemap-core.xml"),
  "utf8",
);

assert.ok(
  /href:\s*`\$\{origin\}\$\{buildWordPath\(lang,\s*targetLanguage,\s*wordLemma,\s*conceptId\)\}`/m.test(
    metadataSource,
  ),
  "hreflang entries should preserve concept IDs in metadata",
);
assert.ok(
  /return\s*\{\s*title,\s*description,\s*canonical:\s*`\$\{origin\}\$\{pathname\}`,\s*alternates,\s*jsonLd,[\s\S]*\};/m.test(
    metadataSource,
  ),
  "canonical metadata should use the current ID-based pathname",
);
assert.ok(
  /buildWordPath\(\s*uiLang,\s*targetLanguage,\s*relWord\.word_lemma,\s*relWord\.concept_id\s*\)/m.test(
    wordSeoPageSource,
  ),
  "related word links should use canonical concept IDs",
);
assert.ok(
  /buildWordPath\(\s*uiLang,\s*targetLanguage,\s*browseWord\.word_lemma,\s*browseWord\.concept_id\s*\)/m.test(
    wordSeoPageSource,
  ),
  "browse word links should use canonical concept IDs",
);
assert.ok(
  /ENGLISH_VERB_LIST_ITEMS\.map/m.test(englishVerbListPageSource),
  "English verb list page should render rows from the imported JSON list",
);
assert.ok(
  /buildWordPath\(\s*uiLang,\s*TARGET_LANGUAGE,\s*getEnglishVerbWordLemma\(item\.id\),\s*item\.id\s*\)/m.test(
    englishVerbListPageSource,
  ),
  "English verb list page should link rows with the shared word-path helper",
);
assert.ok(
  metadataSource.includes("buildEnglishVerbListSeoMetadata"),
  "metadata builder for the English verb list should exist",
);
assert.ok(
  coreSitemapXml.includes("/en/100-most-common-english-verbs"),
  "core sitemap should include the English verb list route",
);
assert.ok(
  coreSitemapXml.includes("/ru/100-samykh-chastykh-angliiskikh-glagolov"),
  "core sitemap should include localized English verb list routes",
);

console.log("word SEO route tests passed");
fs.rmSync(tempDir, { recursive: true, force: true });
