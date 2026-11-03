// Generates the compact word lists behind the CEFR vocabulary-level pages'
// vocabulary explorer: src/data/seo/vocabularyLevels/level-explorer/.
//
// Source of truth: src/data/vocabulary/{language}/vocabulary.json. For every
// language x CEFR level this writes two files:
//   {language}-{level}.json             [conceptId, word, type] rows, sorted
//                                       alphabetically in that language
//   {language}-{level}-definitions.json conceptId -> that language's own
//                                       definition
// A CEFR page reads its target language's rows, plus either the visitor's
// UI-language rows (cross-language pages: the UI-language word for the same
// concept is the translation) or the target language's definitions
// (same-language pages). Splitting definitions out keeps cross-language
// pages from downloading text they never show.
//
// Row rules match the full vocabulary list's groupFullVocabularyRows
// (src/data/seo/listPages/fullVocabularyList/fullVocabularyListEntries.ts):
// whitespace is collapsed, dash-only lemmas mark a concept with no word in
// that language and are skipped, and the first occurrence of a concept id
// wins. Sorting uses the language's own collation (ä beside a in German,
// Cyrillic order in Russian); Array.prototype.sort is stable, so equal
// words keep concept-id order and the output is deterministic.
//
// Usage:
//   node scripts/generation/generate-level-explorer-data.mjs          write files
//   node scripts/generation/generate-level-explorer-data.mjs --check  exit 1 if stale
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), "..", "..");

const LANGUAGES = {
  english: "en",
  german: "de",
  spanish: "es",
  french: "fr",
  italian: "it",
  portuguese: "pt",
  russian: "ru",
};
const LEVELS = ["a1", "a2", "b1", "b2", "c1", "c2"];
const OUTPUT_DIR = path.join(ROOT_DIR, "src", "data", "seo", "vocabularyLevels", "level-explorer");
const MISSING_LEMMA = /^[-–—]+$/;

function readText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function buildLanguageFiles(language, entries) {
  const byLevel = Object.fromEntries(LEVELS.map((level) => [level, []]));
  const seenConceptIds = new Set();
  for (const entry of entries) {
    const conceptId = readText(entry?.concept_id);
    const word = readText(entry?.word_lemma);
    const level = readText(entry?.level).toLowerCase();
    if (!conceptId || !word || MISSING_LEMMA.test(word) || !byLevel[level] || seenConceptIds.has(conceptId)) {
      continue;
    }
    seenConceptIds.add(conceptId);
    byLevel[level].push({
      conceptId,
      word,
      type: readText(entry.type).toLowerCase(),
      // The source field is spelled "definiton"; accept the corrected
      // spelling too in case it is ever fixed.
      definition: readText(entry.definiton) || readText(entry.definition),
    });
  }

  const collator = new Intl.Collator(LANGUAGES[language], { numeric: true });
  const files = new Map();
  for (const level of LEVELS) {
    const rows = byLevel[level].sort((a, b) => collator.compare(a.word, b.word));
    files.set(
      `${language}-${level}.json`,
      `${JSON.stringify({
        language,
        level,
        words: rows.map((row) => [row.conceptId, row.word, row.type]),
      })}\n`,
    );
    files.set(
      `${language}-${level}-definitions.json`,
      `${JSON.stringify({
        language,
        level,
        definitions: Object.fromEntries(rows.map((row) => [row.conceptId, row.definition])),
      })}\n`,
    );
  }
  return files;
}

async function buildAllFiles() {
  const all = new Map();
  for (const language of Object.keys(LANGUAGES)) {
    const sourcePath = path.join(ROOT_DIR, "src", "data", "vocabulary", language, "vocabulary.json");
    const entries = JSON.parse(await fs.readFile(sourcePath, "utf8"));
    if (!Array.isArray(entries)) {
      throw new Error(`${sourcePath} is not a JSON array`);
    }
    for (const [name, text] of buildLanguageFiles(language, entries)) {
      all.set(name, text);
    }
  }
  return all;
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const expected = await buildAllFiles();
  let existingNames = [];
  try {
    existingNames = (await fs.readdir(OUTPUT_DIR)).filter((name) => name.endsWith(".json"));
  } catch {
    existingNames = [];
  }

  const stale = [];
  for (const [name, text] of expected) {
    let current = null;
    try {
      // Git's core.autocrlf may check these files out with CRLF line
      // endings; that is not a content change.
      current = (await fs.readFile(path.join(OUTPUT_DIR, name), "utf8")).replace(/\r\n/g, "\n");
    } catch {
      current = null;
    }
    if (current !== text) {
      stale.push(name);
    }
  }
  const unexpected = existingNames.filter((name) => !expected.has(name));

  if (checkOnly) {
    if (stale.length > 0 || unexpected.length > 0) {
      console.error(
        `level-explorer data is out of date (${stale.length} stale, ${unexpected.length} unexpected). ` +
          "Run: npm run generate:level-explorer",
      );
      if (stale.length > 0) console.error(`  stale: ${stale.slice(0, 10).join(", ")}`);
      if (unexpected.length > 0) console.error(`  unexpected: ${unexpected.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    console.log(`level-explorer data is up to date (${expected.size} files).`);
    return;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  for (const name of unexpected) {
    await fs.rm(path.join(OUTPUT_DIR, name));
  }
  for (const name of stale) {
    await fs.writeFile(path.join(OUTPUT_DIR, name), expected.get(name), "utf8");
  }
  console.log(
    `level-explorer: ${expected.size} files (${stale.length} written, ${unexpected.length} removed) in ${path.relative(ROOT_DIR, OUTPUT_DIR)}`,
  );
}

await main();
