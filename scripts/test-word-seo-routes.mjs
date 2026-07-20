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
    path.join(rootDir, "src", "data", "seo", "wordPages", "wordSlugs.ts"),
    path.join(rootDir, "src", "data", "seo", "wordPages", "wordPageData.ts"),
    path.join(rootDir, "src", "data", "seo", "slugs.ts"),
    path.join(rootDir, "src", "data", "seo", "hub.ts"),
    path.join(rootDir, "src", "data", "seo", "wordPages", "wordHubRoutes.ts"),
    path.join(rootDir, "src", "data", "seo", "verbLists", "verbListRegistry.ts"),
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

const wordSlugs = require(path.join(tempDir, "src", "data", "seo", "wordPages", "wordSlugs.js"));
const wordPageData = require(path.join(tempDir, "src", "data", "seo", "wordPages", "wordPageData.js"));
const wordHubRoutes = require(path.join(tempDir, "src", "data", "seo", "wordPages", "wordHubRoutes.js"));
const verbListRegistry = require(path.join(tempDir, "src", "data", "seo", "verbLists", "verbListRegistry.js"));
const { fixMojibake } = require(path.join(tempDir, "src", "utils", "fixMojibake.js"));

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(rootDir, relativePath), "utf8").replace(/^\uFEFF/, ""),
  );
}

const englishVocabulary = readJson("src/data/vocabulary/english/vocabulary.json");
const russianVocabulary = readJson("src/data/vocabulary/russian/vocabulary.json");
const spanishVocabulary = readJson("src/data/vocabulary/spanish/vocabulary.json");
const englishVerbList = readJson("src/data/seo/verbLists/list_of_100_most_used_verb.json");
const normalizedEnglishVerbList = englishVerbList.map((item) => {
  const legacyId = String(item?.id ?? "").trim();
  if (legacyId) {
    return {
      id: legacyId,
      verb: String(item?.verb ?? "").trim(),
    };
  }

  const conceptId = String(item?.concept_id ?? "").trim();
  const verbEntry = Object.entries(item).find(
    ([key, value]) => key !== "concept_id" && typeof value === "string",
  );

  return {
    id: conceptId,
    verb:
      verbEntry && verbEntry[0].trim().toLowerCase() === "verb"
        ? String(verbEntry[1]).trim()
        : String(verbEntry?.[0] ?? "").trim(),
  };
});
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

// Accents are canonical (wordToSlug preserves them) - an accented URL must
// resolve directly, with no redirect involved.
const accentedCanonicalRoute = wordSlugs.parseWordRoute(
  "en",
  `spanish-word-${encodeURIComponent("amplificación")}--C1-00035`,
);
assert.deepEqual(
  accentedCanonicalRoute,
  {
    routeKind: "canonical",
    uiLang: "en",
    targetLanguage: "spanish",
    wordSlug: "amplificación",
    conceptId: "C1-00035",
  },
  "accented slugs are canonical and must resolve directly, not redirect",
);

// Non-accent drift (stray casing) still needs to redirect to the normalized form.
const caseDriftRoute = wordSlugs.parseWordRoute("en", "english-word-ABOUT--A1-00001");
assert.deepEqual(
  caseDriftRoute,
  {
    routeKind: "legacy-slug-format",
    uiLang: "en",
    targetLanguage: "english",
    wordSlug: "about",
    conceptId: "A1-00001",
  },
  "non-accent slug drift (casing) should still redirect to the normalized slug",
);

const accentedLegacySingleHyphenRoute = wordSlugs.parseWordRoute(
  "en",
  `spanish-word-${encodeURIComponent("amplificación")}-C1-00035`,
);
assert.equal(accentedLegacySingleHyphenRoute?.routeKind, "legacy-single-hyphen");
assert.equal(
  accentedLegacySingleHyphenRoute?.wordSlug,
  "amplificación",
  "legacy single-hyphen redirects must preserve accents in the target slug",
);

// Recovery path: a link built while wordToSlug briefly stripped accents
// (2026-06-22 to the revert) must still find the real word via fallback,
// rather than 410ing, even though it's not an exact slug match.
const spanishAmplificacion = spanishVocabulary.find((e) => e.concept_id === "C1-00035");
assert.equal(spanishAmplificacion?.word_lemma, "amplificación");
const exactMatch = wordPageData.findCanonicalWordRecord(spanishVocabulary, "amplificacion", "C1-00035");
assert.equal(exactMatch?.slugMatches, false, "accent-free slug must not exact-match the accented canonical entry");
const fallbackMatch = wordPageData.findWordEntryIgnoringAccents(spanishVocabulary, "amplificacion", "C1-00035");
assert.equal(fallbackMatch?.word_lemma, "amplificación", "accent-insensitive fallback must still find the real word");

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

assert.equal(normalizedEnglishVerbList.length, 100, "English verb list should contain 100 rows");
assert.equal(
  new Set(normalizedEnglishVerbList.map((item) => item.id)).size,
  100,
  "English verb list IDs should be unique",
);

const missingEnglishVerbEntries = [];
for (const item of normalizedEnglishVerbList) {
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

// The related/browse word link JSX moved from WordSeoPage.tsx into the
// extracted, server-safe WordSeoPageView.tsx (see that file's header
// comment for why — the split keeps the Cloudflare staging Worker's SSR
// bundle from pulling in WordSeoPage.tsx's heavy client-only vocabulary/
// browse-search loaders). The two checks below assert against wherever that
// JSX actually lives now, not against WordSeoPage.tsx specifically.
const wordSeoPageSource = fs.readFileSync(
  path.join(rootDir, "src", "app", "components", "WordSeoPageView.tsx"),
  "utf8",
);
const verbListPageSource = fs.readFileSync(
  path.join(rootDir, "src", "app", "components", "VerbListSeoPage.tsx"),
  "utf8",
);
// src/seo/metadata.ts was split (Issue 15) into a compatibility facade plus
// focused modules; these two now hold the code the checks below assert
// against (word-page metadata, verb-list metadata respectively).
const wordMetadataSource = fs.readFileSync(
  path.join(rootDir, "src", "seo", "wordMetadata.ts"),
  "utf8",
);
const verbListMetadataSource = fs.readFileSync(
  path.join(rootDir, "src", "seo", "verbListMetadata.ts"),
  "utf8",
);
const wordHubDataSource = fs.readFileSync(
  path.join(rootDir, "src", "data", "seo", "wordPages", "wordHubData.ts"),
  "utf8",
);
const verbListRegistrySource = fs.readFileSync(
  path.join(rootDir, "src", "data", "seo", "verbLists", "verbListRegistry.ts"),
  "utf8",
);
const commonVerbListSource = fs.readFileSync(
  path.join(rootDir, "src", "data", "seo", "verbLists", "commonVerbList.ts"),
  "utf8",
);
const verbListsSource = fs.readFileSync(
  path.join(rootDir, "src", "data", "seo", "verbLists", "index.ts"),
  "utf8",
);
const generateWordHubDataSource = fs.readFileSync(
  path.join(rootDir, "scripts", "generate-word-hub-data.mjs"),
  "utf8",
);
const levelBrowseWordsSource = fs.readFileSync(
  path.join(rootDir, "src", "data", "seo", "vocabularyLevels", "levelBrowseWords.ts"),
  "utf8",
);
const entryServerSource = fs.readFileSync(path.join(rootDir, "src", "entry-server.tsx"), "utf8");
const packageJsonSource = fs.readFileSync(path.join(rootDir, "package.json"), "utf8");
const wranglerProductionSource = fs.readFileSync(
  path.join(rootDir, "workers", "word-ssr", "wrangler.production.toml"),
  "utf8",
);
const coreSitemapXml = fs.readFileSync(
  path.join(rootDir, "public", "sitemaps", "sitemap-core.xml"),
  "utf8",
);
const verbListsSitemapXml = fs.readFileSync(
  path.join(rootDir, "public", "sitemaps", "verb-lists.xml"),
  "utf8",
);

assert.ok(
  wordHubDataSource.includes('import.meta.glob("./word-hub-pages/*.json"'),
  "word hub data should read compact generated hub JSON files",
);
assert.ok(
  !wordHubDataSource.includes('import.meta.glob("../vocabulary/*/vocabulary.json"'),
  "word hub data should not eagerly import full vocabulary JSON files",
);
assert.ok(
  commonVerbListSource.includes('import.meta.glob("./verbListLookup/*.json"'),
  "shared verb list data should read compact generated lookup JSON files",
);
assert.ok(
  verbListsSource.includes('from "./verbListRegistry"'),
  "runtime verb list module should re-export route and content helpers from the shared registry",
);
assert.equal(
  Object.keys(verbListRegistry.VERB_LIST_CONFIG).length,
  7,
  "verb list registry should expose 7 target-language configs",
);
const allVerbListPaths = verbListRegistry.getAllVerbListPaths();
assert.equal(allVerbListPaths.length, 49, "verb list registry should expose 49 localized routes");
assert.equal(new Set(allVerbListPaths).size, 49, "verb list registry routes should be unique");
assert.ok(
  allVerbListPaths.includes("/en/100-most-common-english-verbs"),
  "verb list registry should include the English English-route slug",
);
assert.ok(
  allVerbListPaths.includes("/ru/100-samykh-chastykh-angliiskikh-glagolov"),
  "verb list registry should include the Russian UI English-route slug",
);
for (const [targetLanguage, config] of Object.entries(verbListRegistry.VERB_LIST_CONFIG)) {
  assert.equal(Object.keys(config.paths).length, 7, `${targetLanguage} should expose 7 localized routes`);
  assert.match(config.speechLang, /^[a-z]{2}-[A-Z]{2}$/, `${targetLanguage} should expose a BCP47 speech locale`);
  for (const [uiLang, routePath] of Object.entries(config.paths)) {
    assert.deepEqual(
      verbListRegistry.resolveVerbListRoute(routePath),
      { uiLang, targetLanguage },
      `verb list route should round-trip through the shared resolver: ${routePath}`,
    );
    const content = verbListRegistry.getVerbListContent(targetLanguage, uiLang);
    assert.ok(content, `verb list content should exist for ${targetLanguage}/${uiLang}`);
    assert.ok(content.title.trim().length > 0, `verb list title should be non-empty for ${targetLanguage}/${uiLang}`);
  }
}
assert.equal(
  verbListRegistry.resolveVerbListRoute("/en/not-a-verb-list-page"),
  null,
  "verb list resolver should reject unrelated routes",
);
assert.ok(
  verbListRegistrySource.includes("buildVerbListContentLookup("),
  "verb list registry should build localized content lookup from shared JSON content",
);
assert.ok(
  /["']verbListLookup["']/.test(generateWordHubDataSource),
  "word hub generator should write shared verb list lookup JSON files to src/data/seo/verbLists/verbListLookup",
);
assert.ok(
  !/englishVerbList["'],\s*["']lookup/.test(generateWordHubDataSource),
  "word hub generator should not write shared verb list lookup JSON files to deleted englishVerbList/lookup",
);
assert.ok(
  !commonVerbListSource.includes('../vocabulary/english/vocabulary.json'),
  "shared verb list data should not statically import full vocabulary JSON files",
);
assert.ok(
  levelBrowseWordsSource.includes('import.meta.glob("./level-browse-preview/*.json"'),
  "level browse data should read compact preview JSON files",
);
assert.ok(
  !levelBrowseWordsSource.includes('import.meta.glob("../vocabulary/*/vocabulary.json"'),
  "level browse data should not eagerly import full vocabulary JSON files",
);
assert.ok(
  entryServerSource.includes('import.meta.glob("./data/vocabulary/*/vocabulary.json"'),
  "SSR entry server should load vocabulary via bundled JSON modules",
);
assert.ok(
  entryServerSource.includes('import.meta.glob("./data/interface/*.json"'),
  "SSR entry server should load interface data via bundled JSON modules",
);
assert.ok(
  !entryServerSource.includes("readFileSync("),
  "SSR entry server should not filesystem-read source JSON files at runtime",
);
assert.ok(
  packageJsonSource.includes("verify-word-ssr-package.mjs"),
  "npm run build should keep the SSR packaging verification gate (verify-word-ssr-package.mjs)",
);
assert.ok(
  /main\s*=\s*"worker-dist-full\/index\.full\.js"/.test(wranglerProductionSource),
  "production Worker should deploy the prebundled worker-dist-full artifact",
);
assert.ok(
  /no_bundle\s*=\s*true/.test(wranglerProductionSource),
  "production Worker should not let wrangler re-bundle (packaging is done by the Vite worker build)",
);
assert.ok(
  /directory\s*=\s*"assets-full"/.test(wranglerProductionSource),
  "production Worker should serve the assembled assets-full static bundle",
);
assert.ok(
  /\(lang\)\s*=>\s*`\$\{origin\}\$\{buildWordPath\(lang,\s*targetLanguage,\s*wordLemma,\s*conceptId\)\}`/m.test(
    wordMetadataSource,
  ),
  "hreflang entries should preserve concept IDs in metadata",
);
assert.ok(
  /return\s*\{\s*title,\s*description,\s*canonical:\s*`\$\{origin\}\$\{pathname\}`,\s*alternates,\s*jsonLd,[\s\S]*\};/m.test(
    wordMetadataSource,
  ),
  "canonical metadata should use the current ID-based pathname",
);
assert.ok(
  /buildWordPath\(\s*uiLang,\s*targetLanguage,\s*relWord\.wordLemma,\s*relWord\.conceptId\s*\)/m.test(
    wordSeoPageSource,
  ),
  "related word links should use canonical concept IDs",
);
assert.ok(
  /buildWordPath\(\s*uiLang,\s*targetLanguage,\s*browseWord\.wordLemma,\s*browseWord\.conceptId\s*\)/m.test(
    wordSeoPageSource,
  ),
  "browse word links should use canonical concept IDs",
);
assert.ok(
  /VERB_LIST_ITEMS\.map/m.test(verbListPageSource),
  "shared verb list page should render rows from the imported JSON list",
);
assert.ok(
  /buildWordPath\(\s*uiLang,\s*targetLanguage,\s*wordLemma,\s*item\.id\s*\)/m.test(
    verbListPageSource,
  ),
  "shared verb list page should link rows with the shared word-path helper",
);
assert.ok(
  verbListMetadataSource.includes("export function buildVerbListSeoMetadata"),
  "generic metadata builder for verb list pages should exist",
);
assert.ok(
  !coreSitemapXml.includes("/en/100-most-common-english-verbs"),
  "core sitemap should no longer contain verb list routes",
);
assert.ok(
  verbListsSitemapXml.includes("/en/100-most-common-english-verbs"),
  "dedicated verb-lists sitemap should include the English verb list route",
);
assert.ok(
  verbListsSitemapXml.includes("/ru/100-samykh-chastykh-angliiskikh-glagolov"),
  "dedicated verb-lists sitemap should include localized verb list routes",
);

console.log("word SEO route tests passed");
fs.rmSync(tempDir, { recursive: true, force: true });
