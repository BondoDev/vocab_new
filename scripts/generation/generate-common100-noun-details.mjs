// Generates the word details for the "100 most common nouns" SEO pages.
// common100NounList.json is one language-independent list of concept ids;
// for every vocabulary language this writes, per concept, the word (lemma),
// definition and example sentence (vocabulary.json), the word forms to bold
// in that sentence (inflected.json), and the word and definition in each
// other UI language (translations/definitions, by concept_id).
//
// Output: src/data/seo/listPages/nounLists/common100Nouns/common100NounDetails/
// {language}.json (e.g. english.json) — committed generated source, bundled
// into the page so the full table is in the prerendered HTML. Every language
// is generated so a new target-language page needs no extra step. Never edit
// these by hand; rerun `npm run generate:common100-nouns` after changing the
// list.
//
// Fails (exit code 1) when the list names a concept_id missing from any
// language's vocabulary, so a typo can't ship as an empty row. Warns when two
// concepts share a word in one language (e.g. Spanish "hora" for hour and
// time), since that page would show the same noun twice.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const ROOT_DIR = path.resolve(path.dirname(__filename), "..", "..");
const FAMILY_DIR = path.join(
  ROOT_DIR,
  "src",
  "data",
  "seo",
  "listPages",
  "nounLists",
  "common100Nouns",
);
const LIST_FILE = path.join(FAMILY_DIR, "common100NounList.json");
const OUTPUT_DIR = path.join(FAMILY_DIR, "common100NounDetails");

// UI language code -> vocabulary folder (mirrors src/data/seo/shared/slugs.ts).
const LANGUAGE_FOLDERS = {
  en: "english",
  es: "spanish",
  de: "german",
  fr: "french",
  ru: "russian",
  pt: "portuguese",
  it: "italian",
};

const jsonCache = new Map();

async function readJson(filePath) {
  if (!jsonCache.has(filePath)) {
    const raw = await fs.readFile(filePath, "utf8");
    jsonCache.set(filePath, JSON.parse(raw.replace(/^﻿/, "")));
  }
  return jsonCache.get(filePath);
}

function readText(value) {
  return typeof value === "string" ? value.trim() : "";
}

// concept_id -> first vocabulary entry with that id.
async function loadVocabularyIndex(folder) {
  const entries = await readJson(
    path.join(ROOT_DIR, "src", "data", "vocabulary", folder, "vocabulary.json"),
  );
  const index = new Map();
  for (const entry of entries) {
    const conceptId = readText(entry.concept_id);
    if (conceptId && !index.has(conceptId)) {
      index.set(conceptId, entry);
    }
  }
  return index;
}

// concept_id -> inflected forms. Any key containing "inflected" counts, as
// in buildInflectedFormsIndex() (fullVocabularyListEntries.ts).
async function loadInflectedIndex(folder) {
  const filePath = path.join(
    ROOT_DIR,
    "src",
    "data",
    "inflected",
    folder,
    "inflected.json",
  );
  let entries;
  try {
    entries = await readJson(filePath);
  } catch {
    return new Map();
  }
  const index = new Map();
  for (const entry of entries) {
    const conceptId = readText(entry.concept_id);
    if (!conceptId || index.has(conceptId)) {
      continue;
    }
    const forms = Object.entries(entry)
      .filter(([key]) => /inflected/i.test(key))
      .map(([, value]) => readText(value))
      .filter((form) => form && form !== "-");
    index.set(conceptId, forms);
  }
  return index;
}

async function buildLanguageDetails(targetCode, targetFolder, rows) {
  const targetVocabulary = await loadVocabularyIndex(targetFolder);
  const inflected = await loadInflectedIndex(targetFolder);
  const translationIndexes = {};
  for (const [code, folder] of Object.entries(LANGUAGE_FOLDERS)) {
    if (code !== targetCode) {
      translationIndexes[code] = await loadVocabularyIndex(folder);
    }
  }

  const byConceptId = {};
  const problems = [];
  const conceptsByWord = new Map();
  for (const row of rows) {
    const conceptId = readText(row.concept_id);
    const entry = targetVocabulary.get(conceptId);
    if (!entry) {
      problems.push(`${conceptId} (N ${row.N}) is not in ${targetFolder}/vocabulary.json`);
      continue;
    }
    const lemma = readText(entry.word_lemma);
    const wordKey = lemma.toLowerCase();
    conceptsByWord.set(wordKey, [...(conceptsByWord.get(wordKey) ?? []), conceptId]);

    // The word and its definition in every other UI language, for pages
    // whose UI language differs from the list's.
    const translations = {};
    const definitions = {};
    for (const [code, index] of Object.entries(translationIndexes)) {
      const translated = index.get(conceptId);
      const translation = readText(translated?.word_lemma);
      if (translation) {
        translations[code] = translation;
      }
      const definition = readText(translated?.definiton);
      if (definition) {
        definitions[code] = definition;
      }
    }

    byConceptId[conceptId] = {
      word: lemma,
      // The vocabulary data spells this field "definiton".
      definition: readText(entry.definiton),
      sentence: readText(entry.sentence),
      sentenceForms: [...new Set([...(inflected.get(conceptId) ?? []), lemma])],
      translations,
      definitions,
    };
  }

  if (problems.length > 0) {
    throw new Error(
      `${targetFolder}: ${problems.length} unknown concept(s):\n  ${problems.join("\n  ")}`,
    );
  }
  for (const [word, conceptIds] of conceptsByWord) {
    if (conceptIds.length > 1) {
      console.warn(`  ! ${targetFolder}: "${word}" is the word for ${conceptIds.join(", ")}`);
    }
  }
  return { listId: targetFolder, targetLanguage: targetFolder, byConceptId };
}

async function main() {
  const rows = await readJson(LIST_FILE);
  if (!Array.isArray(rows)) {
    throw new Error("common100NounList.json must be an array.");
  }
  const lookups = [];
  for (const [code, folder] of Object.entries(LANGUAGE_FOLDERS)) {
    lookups.push(await buildLanguageDetails(code, folder, rows));
  }

  // Written only after every list succeeded, so a failure never leaves a
  // half-updated directory. Stale files of removed lists are deleted.
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const expected = new Set(lookups.map((lookup) => `${lookup.listId}.json`));
  for (const name of await fs.readdir(OUTPUT_DIR)) {
    if (name.endsWith(".json") && !expected.has(name)) {
      await fs.rm(path.join(OUTPUT_DIR, name), { force: true });
    }
  }
  for (const lookup of lookups) {
    await fs.writeFile(
      path.join(OUTPUT_DIR, `${lookup.listId}.json`),
      `${JSON.stringify(lookup, null, 2)}\n`,
      "utf8",
    );
    console.log(
      `  ✓ ${lookup.listId}: ${Object.keys(lookup.byConceptId).length} concepts`,
    );
  }
}

main().catch((error) => {
  console.error(
    "Failed to generate noun-list details:",
    error.message ?? error,
  );
  process.exitCode = 1;
});
