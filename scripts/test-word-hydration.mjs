import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR, readJson } from "./seo-baseline/lib/compileTs.mjs";

const compiled = compileTsToCommonJs(".tmp-word-hydration-test", [
  path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordPageData.ts"),
  path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordSlugs.ts"),
  path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "wordRouteManifest.ts"),
  path.join(ROOT_DIR, "src", "data", "seo", "shared", "slugs.ts"),
  path.join(ROOT_DIR, "src", "data", "seo", "shared", "browseWordValidation.ts"),
  path.join(ROOT_DIR, "src", "utils", "fixMojibake.ts"),
]);

try {
  const wordPageData = compiled.require("src/data/seo/wordPages/wordPageData");
  const wordSlugs = compiled.require("src/data/seo/wordPages/wordSlugs");
  const englishVocabulary = readJson("src/data/vocabulary/english/vocabulary.json");
  const russianVocabulary = readJson("src/data/vocabulary/russian/vocabulary.json");
  const wordSeoPageSource = fs.readFileSync(
    path.join(ROOT_DIR, "src", "app", "pages", "word-pages", "detail", "WordSeoPage.tsx"),
    "utf8",
  );
  const wordSeoPageViewSource = fs.readFileSync(
    path.join(ROOT_DIR, "src", "app", "pages", "word-pages", "detail", "WordSeoPageView.tsx"),
    "utf8",
  );
  const browseShardPath = path.join(
    ROOT_DIR,
    "src",
    "data",
    "seo",
    "wordPages",
    "word-browse-shards",
    "english-a1.json",
  );
  const browseShard = JSON.parse(fs.readFileSync(browseShardPath, "utf8").replace(/^\uFEFF/, ""));

  const resolved = wordPageData.buildResolvedWordPageData({
    uiLang: "en",
    targetLanguage: "english",
    wordSlug: "about",
    conceptId: "A1-00001",
    vocabulary: englishVocabulary,
  });
  const hydrationData = wordPageData.buildHydrationWordPageData(resolved, 1);
  assert.ok(hydrationData, "hydration data should exist for canonical word page");

  const multiMeaningRecord = englishVocabulary.find((entry) => {
    const candidate = wordPageData.buildResolvedWordPageData({
      uiLang: "en",
      targetLanguage: "english",
      wordSlug: wordSlugs.wordToSlug(entry.word_lemma),
      conceptId: entry.concept_id,
      vocabulary: englishVocabulary,
    });
    return candidate.otherMeanings.length > 0;
  });
  assert.ok(multiMeaningRecord, "expected an English word with other meanings for hydration-shape checks");
  const multiMeaningHydration = wordPageData.buildHydrationWordPageData(
    wordPageData.buildResolvedWordPageData({
      uiLang: "en",
      targetLanguage: "english",
      wordSlug: wordSlugs.wordToSlug(multiMeaningRecord.word_lemma),
      conceptId: multiMeaningRecord.concept_id,
      vocabulary: englishVocabulary,
    }),
    1,
  );

  const legacyHydrationData = {
    ...resolved,
    browseWords: resolved.browseWords.slice(0, wordPageData.WORD_PAGE_BROWSE_WORDS_PER_PAGE),
    browseWordsTotalCount: resolved.browseWords.length,
    browseWordsPartial: resolved.browseWords.length > wordPageData.WORD_PAGE_BROWSE_WORDS_PER_PAGE,
    browsePage: 1,
  };

  const beforePayloadSize = Buffer.byteLength(
    JSON.stringify({ pathname: "/en/english-word-about--A1-00001", data: legacyHydrationData }),
    "utf8",
  );
  const afterPayloadSize = Buffer.byteLength(
    JSON.stringify({ pathname: "/en/english-word-about--A1-00001", data: hydrationData }),
    "utf8",
  );

  assert.deepEqual(
    Object.keys(hydrationData.wordEntry ?? {}).sort(),
    ["category", "conceptId", "definition", "grammarType", "level", "sentence", "wordLemma"].sort(),
    "current word hydration entry should contain only render-required fields",
  );
  assert.deepEqual(
    Object.keys(hydrationData.relatedWords[0] ?? {}).sort(),
    ["conceptId", "wordLemma"],
    "related words should be compact link entries",
  );
  assert.deepEqual(
    Object.keys(hydrationData.discoveryWords[0] ?? {}).sort(),
    ["conceptId", "wordLemma"],
    "discovery words should be compact link entries",
  );
  assert.deepEqual(
    Object.keys(hydrationData.browseWords[0] ?? {}).sort(),
    ["conceptId", "wordLemma"],
    "browse words should be compact link entries",
  );
  assert.deepEqual(
    Object.keys(multiMeaningHydration?.otherMeanings[0] ?? {}).sort(),
    ["conceptId", "definition", "grammarType", "level", "wordLemma"].sort(),
    "other meanings should contain only rendered fields",
  );
  assert.equal("browseWordsPartial" in hydrationData, false, "hydration data should not expose browseWordsPartial");
  assert.ok(
    hydrationData.browseWords.length === wordPageData.WORD_PAGE_BROWSE_WORDS_PER_PAGE,
    "first hydrated browse page should keep the SSR page-sized browse slice",
  );
  assert.ok(
    hydrationData.browseWordsTotalCount > hydrationData.browseWords.length,
    "hydration data should preserve total browse count without loading the full list",
  );
  assert.ok(
    afterPayloadSize < beforePayloadSize,
    `compact hydration payload should be smaller (${afterPayloadSize} < ${beforePayloadSize})`,
  );

  assert.equal(browseShard.targetLanguage, "english");
  assert.equal(browseShard.level, "a1");
  assert.ok(browseShard.words.length > wordPageData.WORD_PAGE_BROWSE_WORDS_PER_PAGE);
  assert.deepEqual(
    Object.keys(browseShard.words[0] ?? {}).sort(),
    ["conceptId", "wordLemma"],
    "browse shard entries should contain only compact link fields",
  );

  const russianResolved = wordPageData.buildResolvedWordPageData({
    uiLang: "en",
    targetLanguage: "russian",
    wordSlug: wordSlugs.wordToSlug(russianVocabulary[0].word_lemma),
    conceptId: russianVocabulary[0].concept_id,
    vocabulary: russianVocabulary,
    uiVocabulary: englishVocabulary,
  });
  const russianHydration = wordPageData.buildHydrationWordPageData(russianResolved, 1);
  assert.ok(russianHydration?.displayDefinition?.length, "hydration should preserve UI-language display fields");

  assert.ok(
    !wordSeoPageSource.includes("browseWordsPartial"),
    "WordSeoPage should not trigger post-hydration reloads from browseWordsPartial",
  );
  assert.match(
    wordSeoPageViewSource,
    /onFocus=\{\(\) => \{\s*onRequestBrowseSearchData\(\);\s*\}\}/m,
    "browse search input should lazy-load compact browse data on focus",
  );
  assert.match(
    wordSeoPageViewSource,
    /if \(e\.target\.value\.trim\(\)\) \{\s*onRequestBrowseSearchData\(\);\s*\}/m,
    "browse search should also lazy-load compact browse data when typing starts",
  );
  assert.match(
    wordSeoPageSource,
    /if \(routeHydrationData\) \{\s*setPageData\(routeHydrationData\);/m,
    "hydrated word pages should keep SSR-provided route data instead of clearing it",
  );

  console.log(
    `word hydration tests passed (payload ${beforePayloadSize} -> ${afterPayloadSize} bytes; browse shard words: ${browseShard.words.length})`,
  );
} finally {
  compiled.cleanup();
}
