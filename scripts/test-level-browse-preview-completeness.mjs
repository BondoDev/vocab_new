import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const TARGET_LANGUAGES = ["english", "german", "spanish", "french", "italian", "portuguese", "russian"];
const SUPPORTED_LEVELS = ["a1", "a2", "b1", "b2", "c1", "c2"];
const PREVIEW_DIR = path.join(rootDir, "src", "data", "seo", "vocabularyLevels", "level-browse-preview");

const expectedKeys = TARGET_LANGUAGES.flatMap((targetLanguage) =>
  SUPPORTED_LEVELS.map((level) => `${targetLanguage}-${level}`),
);

const actualFiles = fs
  .readdirSync(PREVIEW_DIR)
  .filter((name) => name.endsWith(".json"));
const actualKeys = actualFiles.map((name) => name.slice(0, -".json".length));

const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
assert.deepEqual(missing, [], `missing level-browse-preview files: ${missing.join(", ")}`);

const unexpected = actualKeys.filter((key) => !expectedKeys.includes(key));
assert.deepEqual(
  unexpected,
  [],
  `unexpected/misnamed level-browse-preview files (not a supported language-level combination): ${unexpected.join(", ")}`,
);

const seenKeys = new Set();
for (const key of actualKeys) {
  assert.ok(!seenKeys.has(key), `duplicate level-browse-preview key: ${key}`);
  seenKeys.add(key);
}

const malformed = [];
for (const key of expectedKeys) {
  const filePath = path.join(PREVIEW_DIR, `${key}.json`);
  const [targetLanguage, level] = key.split(/-(?=[a-c][12]$)/);

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^﻿/, ""));
  } catch (error) {
    malformed.push(`${key}: invalid JSON (${error.message})`);
    continue;
  }

  if (typeof data?.targetLanguage !== "string" || data.targetLanguage !== targetLanguage) {
    malformed.push(`${key}: targetLanguage field mismatch (expected "${targetLanguage}", got "${data?.targetLanguage}")`);
  }
  if (typeof data?.level !== "string" || data.level.toLowerCase() !== level) {
    malformed.push(`${key}: level field mismatch (expected "${level}", got "${data?.level}")`);
  }
  if (typeof data?.totalWords !== "number" || data.totalWords <= 0) {
    malformed.push(`${key}: totalWords must be a positive number`);
  }
  if (typeof data?.totalPages !== "number" || data.totalPages <= 0) {
    malformed.push(`${key}: totalPages must be a positive number`);
  }
  if (!Array.isArray(data?.words) || data.words.length === 0) {
    malformed.push(`${key}: words must be a non-empty array`);
    continue;
  }

  const seenConceptIds = new Set();
  for (const word of data.words) {
    if (typeof word?.concept_id !== "string" || typeof word?.word_lemma !== "string") {
      malformed.push(`${key}: word entries must have string concept_id and word_lemma`);
      break;
    }
    if (seenConceptIds.has(word.concept_id)) {
      malformed.push(`${key}: duplicate concept_id "${word.concept_id}"`);
      break;
    }
    seenConceptIds.add(word.concept_id);
  }
}

assert.deepEqual(malformed, [], `malformed level-browse-preview data:\n${malformed.join("\n")}`);

console.log(
  `level browse preview completeness passed: ${expectedKeys.length} expected combinations, all present and well-formed`,
);
