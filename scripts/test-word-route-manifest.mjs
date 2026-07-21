import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { loadWordRouteManifest } from "./lib/load-word-route-manifest.mjs";
import { ROOT_DIR } from "./lib/compileTs.mjs";

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, relativePath), "utf8").replace(/^\uFEFF/, ""),
  );
}

const manifestLoader = loadWordRouteManifest(".tmp-word-route-manifest-test");

try {
  const manifest = manifestLoader.manifest;
  const englishVocabulary = readJson("src/data/vocabulary/english/vocabulary.json");
  const spanishVocabulary = readJson("src/data/vocabulary/spanish/vocabulary.json");
  const germanVocabulary = readJson("src/data/vocabulary/german/vocabulary.json");

  const sampleConceptsByLevel = new Map();
  for (const entry of englishVocabulary) {
    const level = String(entry.level || "").toUpperCase();
    if (!sampleConceptsByLevel.has(level) && entry.concept_id) {
      sampleConceptsByLevel.set(level, entry);
    }
  }
  for (const level of ["A1", "A2", "B1", "B2", "C1", "C2"]) {
    assert.ok(sampleConceptsByLevel.has(level), `expected a sample English concept for ${level}`);
  }

  for (const uiLang of ["en", "es", "fr", "de", "it", "pt", "ru"]) {
    const route = manifest.parseWordRoutePathname(`/` + uiLang + `/english-word-about--A1-00001`);
    assert.equal(route.kind, "canonical", `canonical route should parse for ${uiLang}`);
    assert.equal(route.uiLang, uiLang);
    assert.equal(route.targetLanguage, "english");
    assert.equal(route.wordSlug, "about");
    assert.equal(route.conceptId, "A1-00001");
    assert.equal(route.browsePage, 1);
  }

  for (const targetLanguage of ["english", "german", "spanish", "french", "italian", "portuguese", "russian"]) {
    const vocabulary = readJson(`src/data/vocabulary/${targetLanguage}/vocabulary.json`);
    const sample = vocabulary.find((entry) => entry.concept_id);
    assert.ok(sample, `expected vocabulary sample for ${targetLanguage}`);
    const slug = manifest.wordToSlug(sample.word_lemma);
    const pathName = manifest.buildCanonicalWordPathFromSlug("en", targetLanguage, slug, sample.concept_id);
    const parsed = manifest.parseWordRoutePathname(pathName);
    assert.equal(parsed.kind, "canonical", `round-trip canonical parse failed for ${targetLanguage}`);
    assert.equal(parsed.targetLanguage, targetLanguage);
    assert.equal(parsed.wordSlug, slug);
    assert.equal(parsed.conceptId, String(sample.concept_id).trim());
  }

  for (const entry of sampleConceptsByLevel.values()) {
    const slug = manifest.wordToSlug(entry.word_lemma);
    const pathName = manifest.buildCanonicalWordPathFromSlug("en", "english", slug, entry.concept_id);
    const parsed = manifest.parseWordRoutePathname(pathName);
    assert.equal(parsed.kind, "canonical");
    assert.equal(parsed.conceptId, String(entry.concept_id).trim());
  }

  assert.equal(
    manifest.buildCanonicalWordPath("en", "english", "About", "A1-00001"),
    "/en/english-word-about--A1-00001",
  );
  assert.equal(
    manifest.buildWordBrowsePagePath("en", "english", "About", "A1-00001", 3),
    "/en/english-word-about--A1-00001/browse/page/3",
  );

  const germanSample = germanVocabulary.find((entry) => /[\s-]/.test(String(entry.word_lemma || "")) && entry.concept_id);
  assert.ok(germanSample, "expected a multi-word German sample");
  const germanSlug = manifest.wordToSlug(germanSample.word_lemma);
  assert.ok(germanSlug.includes("-"), "multi-word sample should slugify with hyphens");
  const germanParsed = manifest.parseWordRoutePathname(
    manifest.buildCanonicalWordPathFromSlug("en", "german", germanSlug, germanSample.concept_id),
  );
  assert.equal(germanParsed.kind, "canonical");
  assert.equal(germanParsed.wordSlug, germanSlug);

  const spanishAccented = spanishVocabulary.find((entry) => entry.concept_id === "C1-00035");
  assert.ok(spanishAccented, "expected accented Spanish sample");
  const accentedSlug = manifest.wordToSlug(spanishAccented.word_lemma);
  assert.ok(/[^\u0000-\u007f]/.test(accentedSlug), "accented slug should preserve non-ASCII characters");
  const accentedRoute = manifest.parseWordRoutePathname(
    manifest.buildCanonicalWordPathFromSlug("en", "spanish", accentedSlug, spanishAccented.concept_id),
  );
  assert.equal(accentedRoute.kind, "canonical");
  assert.equal(accentedRoute.wordSlug, accentedSlug);

  const legacyRoute = manifest.parseWordRoutePathname("/en/english-word-about-A1-00001");
  assert.equal(legacyRoute.kind, "legacy-single-hyphen");
  assert.equal(legacyRoute.wordSlug, "about");
  assert.equal(legacyRoute.conceptId, "A1-00001");

  const caseDriftRoute = manifest.parseWordRoutePathname("/en/english-word-ABOUT--A1-00001");
  assert.equal(caseDriftRoute.kind, "legacy-slug-format");
  assert.equal(caseDriftRoute.wordSlug, "about");

  const slugOnlyRoute = manifest.parseWordRoutePathname("/en/english-word-answer");
  assert.equal(slugOnlyRoute.kind, "slug-only");
  assert.equal(slugOnlyRoute.conceptId, null);

  const browsePageRoute = manifest.parseWordRoutePathname("/en/english-word-about--A1-00001/browse/page/2");
  assert.equal(browsePageRoute.kind, "canonical");
  assert.equal(browsePageRoute.browsePage, 2);

  assert.equal(
    manifest.parseWordRoutePathname("/en/english-word-about--A1-00001/browse/page/0").kind,
    "invalid-browse-page",
  );
  assert.equal(
    manifest.parseWordRoutePathname("/en/english-word-about--bad-id").kind,
    "invalid-concept-id",
  );
  assert.equal(
    manifest.parseWordRoutePathname("/en/english-word-about----A1-00001").kind,
    "malformed-route",
  );
  assert.equal(
    manifest.parseWordRoutePathname("/zz/english-word-about--A1-00001").kind,
    "unsupported-ui-language",
  );
  assert.equal(
    manifest.parseWordRoutePathname("/en/klingon-word-about--A1-00001").kind,
    "unsupported-target-language",
  );
  assert.equal(
    manifest.parseWordRoutePathname("/en/not-a-route").kind,
    "not-word-route",
  );

  const sitemapEligible = manifest.parseWordRoutePathname("/es/english-word-about--A1-00001");
  assert.equal(manifest.isSitemapEligibleWordRouteResult(sitemapEligible), true);
  const nonSitemapEligible = manifest.parseWordRoutePathname("/en/spanish-word-hola--A1-00001");
  assert.equal(manifest.isSitemapEligibleWordRouteResult(nonSitemapEligible), false);
  assert.equal(manifest.hasCrawlableWordSeoFamily("english"), true);
  assert.equal(manifest.hasCrawlableWordSeoFamily("german"), false);

  console.log("Word route manifest tests passed.");
} finally {
  manifestLoader.cleanup();
}
