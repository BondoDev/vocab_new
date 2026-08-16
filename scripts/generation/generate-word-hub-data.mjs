import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");

const TARGET_LANGUAGES = ["english", "german", "spanish", "french", "italian", "portuguese", "russian"];
const SUPPORTED_LEVELS = ["a1", "a2", "b1", "b2", "c1", "c2"];
const OUTPUT_DIR = path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "word-hub-pages");
const BROWSE_SHARD_OUTPUT_DIR = path.join(ROOT_DIR, "src", "data", "seo", "wordPages", "word-browse-shards");
const VERB_LIST_LOOKUP_OUTPUT_DIR = path.join(
  ROOT_DIR,
  "src",
  "data",
  "seo",
  "verbLists",
  "shared",
  "common100VerbLookup",
);
const ENGLISH_VERB_LIST_PATH = path.join(
  ROOT_DIR,
  "src",
  "data",
  "seo",
  "verbLists",
  "shared",
  "list_of_100_most_used_verb.json",
);
const TARGET_LANGUAGE_VERB_LIST_PATHS = [
  ENGLISH_VERB_LIST_PATH,
  path.join(
    ROOT_DIR,
    "src",
    "data",
    "seo",
    "verbLists",
    "shared",
    "list_of_100_most_used_verb_french.json",
  ),
  path.join(
    ROOT_DIR,
    "src",
    "data",
    "seo",
    "verbLists",
    "shared",
    "list_of_100_most_used_verb_german.json",
  ),
  path.join(
    ROOT_DIR,
    "src",
    "data",
    "seo",
    "verbLists",
    "shared",
    "list_of_100_most_used_verb_spanish.json",
  ),
];

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });
const WINDOWS_1251_DECODER = new TextDecoder("windows-1251", { fatal: false });
const WINDOWS_1252_DECODER = new TextDecoder("windows-1252", { fatal: false });

let windows1251ReverseMap = null;
let windows1252ReverseMap = null;

function buildReverseMap(decoder) {
  const map = new Map();
  for (let index = 0; index <= 255; index += 1) {
    const decoded = decoder.decode(Uint8Array.of(index));
    if (!map.has(decoded)) {
      map.set(decoded, index);
    }
  }
  return map;
}

function getWindows1251ReverseMap() {
  if (!windows1251ReverseMap) {
    windows1251ReverseMap = buildReverseMap(WINDOWS_1251_DECODER);
  }
  return windows1251ReverseMap;
}

function getWindows1252ReverseMap() {
  if (!windows1252ReverseMap) {
    windows1252ReverseMap = buildReverseMap(WINDOWS_1252_DECODER);
  }
  return windows1252ReverseMap;
}

const MOJIBAKE_PATTERNS = [
  /Гѓ./g,
  /Г‚./g,
  /Гў[\u0080-\u00BF]/g,
  /Гђ./g,
  /Г‘./g,
  /Р ./g,
  /РЎ./g,
  /РІР‚./g,
  /РІвЂћ./g,
  /РІв‚¬./g,
  /РІ[\u0400-\u04FF]/g,
  /Р“./g,
  /\uFFFD/g,
];

function countSuspiciousChars(value) {
  let suspicious = 0;
  for (const pattern of MOJIBAKE_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = value.match(pattern);
    if (matches) {
      suspicious += matches.length;
    }
  }
  return suspicious;
}

function looksLikeMojibake(value) {
  return countSuspiciousChars(value) > 0;
}

function decodeUtf8FromReverseMap(value, reverseMap) {
  const bytes = [];
  for (const char of value) {
    const mappedByte = reverseMap.get(char);
    if (mappedByte !== undefined) {
      bytes.push(mappedByte);
      continue;
    }

    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint > 0xff) {
      return null;
    }

    bytes.push(codePoint);
  }

  const decoded = UTF8_DECODER.decode(Uint8Array.from(bytes));
  return decoded.includes("\uFFFD") ? null : decoded;
}

function repairOnce(value) {
  const candidates = [
    decodeUtf8FromReverseMap(value, getWindows1251ReverseMap()),
    decodeUtf8FromReverseMap(value, getWindows1252ReverseMap()),
  ].filter(Boolean);

  const currentScore = countSuspiciousChars(value);
  let bestCandidate = value;
  let bestScore = currentScore;

  for (const candidate of candidates) {
    const candidateScore = countSuspiciousChars(candidate);
    if (candidateScore < bestScore) {
      bestCandidate = candidate;
      bestScore = candidateScore;
    }
  }

  return bestCandidate;
}

function fixMojibake(value) {
  if (!value || !looksLikeMojibake(value)) {
    return value;
  }

  let repaired = value;
  for (let pass = 0; pass < 3; pass += 1) {
    const nextValue = repairOnce(repaired);
    if (nextValue === repaired) {
      break;
    }
    repaired = nextValue;
  }

  return repaired;
}

function isValidBrowseWordLemma(value) {
  if (typeof value !== "string") {
    return false;
  }

  const trimmed = value.normalize("NFC").trim();
  if (trimmed.length <= 2) {
    return false;
  }

  if (/^[-–—]+$/u.test(trimmed)) {
    return false;
  }

  return /[\p{L}\p{N}]/u.test(trimmed);
}

function normalizeLevel(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return SUPPORTED_LEVELS.find((level) => level.toUpperCase() === normalized) ?? null;
}

async function buildWordHubFile(targetLanguage) {
  const vocabPath = path.join(
    ROOT_DIR,
    "src",
    "data",
    "vocabulary",
    targetLanguage,
    "vocabulary.json",
  );
  const raw = await fs.readFile(vocabPath, "utf8");
  const vocabulary = JSON.parse(raw.replace(/^\uFEFF/, ""));

  const levels = Object.fromEntries(SUPPORTED_LEVELS.map((level) => [level, []]));
  const seen = new Set();

  for (const entry of vocabulary) {
    const level = normalizeLevel(entry.level);
    if (!level) {
      continue;
    }

    const conceptId = String(entry.concept_id ?? "").trim();
    const wordLemma = fixMojibake(String(entry.word_lemma ?? "")).trim();
    if (!conceptId || !isValidBrowseWordLemma(wordLemma)) {
      continue;
    }

    const key = `${targetLanguage}:${conceptId}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    levels[level].push([conceptId, wordLemma]);
  }

  const output = {
    targetLanguage,
    levels,
  };

  await fs.writeFile(
    path.join(OUTPUT_DIR, `${targetLanguage}.json`),
    `${JSON.stringify(output)}\n`,
    "utf8",
  );
}

async function buildWordBrowseShardFiles(targetLanguage) {
  const vocabPath = path.join(
    ROOT_DIR,
    "src",
    "data",
    "vocabulary",
    targetLanguage,
    "vocabulary.json",
  );
  const raw = await fs.readFile(vocabPath, "utf8");
  const vocabulary = JSON.parse(raw.replace(/^\uFEFF/, ""));

  const levels = Object.fromEntries(SUPPORTED_LEVELS.map((level) => [level, []]));
  const seenByLevel = new Map(SUPPORTED_LEVELS.map((level) => [level, new Set()]));

  for (const entry of vocabulary) {
    const level = normalizeLevel(entry.level);
    if (!level) {
      continue;
    }

    const conceptId = String(entry.concept_id ?? "").trim();
    const wordLemma = fixMojibake(String(entry.word_lemma ?? "")).trim();
    if (!conceptId || !isValidBrowseWordLemma(wordLemma)) {
      continue;
    }

    const seenConceptIds = seenByLevel.get(level);
    if (!seenConceptIds || seenConceptIds.has(conceptId)) {
      continue;
    }

    seenConceptIds.add(conceptId);
    levels[level].push({
      conceptId,
      wordLemma,
    });
  }

  for (const level of SUPPORTED_LEVELS) {
    const words = levels[level];
    await fs.writeFile(
      path.join(BROWSE_SHARD_OUTPUT_DIR, `${targetLanguage}-${level}.json`),
      `${JSON.stringify({
        targetLanguage,
        level,
        totalWords: words.length,
        totalPages: Math.max(1, Math.ceil(words.length / 54)),
        words,
      })}\n`,
      "utf8",
    );
  }
}

async function buildCommon100VerbLookupFiles() {
  const normalizedVerbList = [];
  for (const verbListPath of TARGET_LANGUAGE_VERB_LIST_PATHS) {
    const rawVerbList = await fs.readFile(verbListPath, "utf8");
    const verbList = JSON.parse(rawVerbList.replace(/^\uFEFF/, ""));
    normalizedVerbList.push(
      ...verbList
        .map((item) => {
          const legacyId = String(item?.id ?? "").trim();
          if (legacyId) {
            return {
              id: legacyId,
              verb: String(item?.verb ?? "").trim(),
            };
          }

          const conceptId = String(item?.concept_id ?? "").trim();
          if (!conceptId) {
            return null;
          }

          const verbEntry = Object.entries(item).find(
            ([key, value]) => key !== "concept_id" && typeof value === "string",
          );
          if (!verbEntry) {
            return null;
          }

          const [verbKey, verbValue] = verbEntry;
          return {
            id: conceptId,
            verb: verbKey.trim().toLowerCase() === "verb" ? String(verbValue).trim() : verbKey.trim(),
          };
        })
        .filter(Boolean),
    );
  }
  const verbIds = new Set(
    normalizedVerbList
      .map((item) => String(item?.id ?? "").trim())
      .filter((id) => id.length > 0),
  );

  await fs.mkdir(VERB_LIST_LOOKUP_OUTPUT_DIR, { recursive: true });
  const existingFiles = await fs.readdir(VERB_LIST_LOOKUP_OUTPUT_DIR);
  await Promise.all(
    existingFiles
      .filter((name) => name.endsWith(".json"))
      .map((name) => fs.rm(path.join(VERB_LIST_LOOKUP_OUTPUT_DIR, name), { force: true })),
  );

  for (const targetLanguage of TARGET_LANGUAGES) {
    const vocabPath = path.join(
      ROOT_DIR,
      "src",
      "data",
      "vocabulary",
      targetLanguage,
      "vocabulary.json",
    );
    const raw = await fs.readFile(vocabPath, "utf8");
    const vocabulary = JSON.parse(raw.replace(/^\uFEFF/, ""));
    const byId = {};

    for (const entry of vocabulary) {
      const conceptId = String(entry.concept_id ?? "").trim();
      if (!verbIds.has(conceptId) || byId[conceptId]) {
        continue;
      }

      byId[conceptId] = {
        definition: fixMojibake(String(entry.definiton ?? "").trim()),
        wordLemma: fixMojibake(String(entry.word_lemma ?? "").trim()),
      };
    }

    await fs.writeFile(
      path.join(VERB_LIST_LOOKUP_OUTPUT_DIR, `${targetLanguage}.json`),
      `${JSON.stringify({ targetLanguage, byId })}\n`,
      "utf8",
    );
  }
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(BROWSE_SHARD_OUTPUT_DIR, { recursive: true });

  const existingFiles = await fs.readdir(OUTPUT_DIR);
  await Promise.all(
    existingFiles
      .filter((name) => name.endsWith(".json"))
      .map((name) => fs.rm(path.join(OUTPUT_DIR, name), { force: true })),
  );
  const existingBrowseShardFiles = await fs.readdir(BROWSE_SHARD_OUTPUT_DIR);
  await Promise.all(
    existingBrowseShardFiles
      .filter((name) => name.endsWith(".json"))
      .map((name) => fs.rm(path.join(BROWSE_SHARD_OUTPUT_DIR, name), { force: true })),
  );

  for (const targetLanguage of TARGET_LANGUAGES) {
    await buildWordHubFile(targetLanguage);
    await buildWordBrowseShardFiles(targetLanguage);
  }

  await buildCommon100VerbLookupFiles();

  console.log(`Generated compact word hub data in ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error("Failed to generate word hub data:", error);
  process.exitCode = 1;
});
