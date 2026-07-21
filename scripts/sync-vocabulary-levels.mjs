// Deterministic sync for the vocabulary-level public runtime mirror,
// documented in docs/generated-data.md. src/data/seo/vocabularyLevels/ is
// authoritative; public/vocabularyLevels/*.json is a required browser-runtime
// mirror fetched by src/data/seo/vocabularyLevels/index.ts's fetchVocabularyFile()
// and must stay byte-identical (also guarded by test:import-boundaries).
//
// Usage:
//   node scripts/sync-vocabulary-levels.mjs           # sync (writes public/)
//   node scripts/sync-vocabulary-levels.mjs --check   # read-only drift check
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { compileTsToCommonJs, ROOT_DIR } from "./lib/compileTs.mjs";

const CHECK_ONLY = process.argv.includes("--check");

const SRC_DIR = path.join(ROOT_DIR, "src", "data", "seo", "vocabularyLevels");
const PUBLIC_DIR = path.join(ROOT_DIR, "public", "vocabularyLevels");

// index.ts is the legitimate SSR/client loader module that lives alongside
// the source JSON — it is never copied to public/, only skipped.
// levelBrowseWords.ts, vocabularyLevelRoutes.ts, level-browse-preview/, and
// seo-cefr-content.json are other CEFR vocabulary-level SEO data co-located
// here (not part of the {ui}/{target}.json matrix this script mirrors) —
// also skipped, never copied to public/.
const ALLOWED_SOURCE_TOP_LEVEL_FILES = new Set([
  "index.ts",
  "levelBrowseWords.ts",
  "vocabularyLevelRoutes.ts",
  "seo-cefr-content.json",
]);
const ALLOWED_SOURCE_TOP_LEVEL_DIRS = new Set(["level-browse-preview"]);
const ALLOWED_PUBLIC_EXTRA_FILES = new Set([".gitkeep"]);

const UTF8_BOM_PATTERN = /^﻿/;

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function reportFailure(title, errors) {
  console.error(`\n${title}\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error("");
  process.exitCode = 1;
}

function main() {
  const compiled = compileTsToCommonJs(".tmp-sync-vocabulary-levels", [
    path.join(ROOT_DIR, "src", "data", "seo", "shared", "slugs.ts"),
  ]);

  try {
    const { SUPPORTED_UI_LANGUAGES, SUPPORTED_TARGET_LANGUAGES } =
      compiled.require("src/data/seo/shared/slugs");

    const uiSet = new Set(SUPPORTED_UI_LANGUAGES);
    const expectedFileNames = new Set(SUPPORTED_TARGET_LANGUAGES.map((t) => `${t}.json`));
    const expectedRelPaths = [];
    for (const ui of SUPPORTED_UI_LANGUAGES) {
      for (const target of SUPPORTED_TARGET_LANGUAGES) {
        expectedRelPaths.push(`${ui}/${target}.json`);
      }
    }
    expectedRelPaths.sort();

    const errors = [];

    // ---- validate source tree shape ----
    if (!fs.existsSync(SRC_DIR)) {
      reportFailure("Vocabulary-level synchronization failed:", [
        `source directory missing: ${path.relative(ROOT_DIR, SRC_DIR)}`,
      ]);
      return;
    }

    for (const entry of fs.readdirSync(SRC_DIR, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!uiSet.has(entry.name) && !ALLOWED_SOURCE_TOP_LEVEL_DIRS.has(entry.name)) {
          errors.push(`unexpected source directory: src/data/seo/vocabularyLevels/${entry.name}`);
        }
      } else if (!ALLOWED_SOURCE_TOP_LEVEL_FILES.has(entry.name)) {
        errors.push(`unexpected source file: src/data/seo/vocabularyLevels/${entry.name}`);
      }
    }

    for (const ui of SUPPORTED_UI_LANGUAGES) {
      const uiDir = path.join(SRC_DIR, ui);
      if (!fs.existsSync(uiDir)) {
        errors.push(`missing source UI-language directory: src/data/seo/vocabularyLevels/${ui}`);
        continue;
      }
      for (const entry of fs.readdirSync(uiDir, { withFileTypes: true })) {
        const rel = `src/data/seo/vocabularyLevels/${ui}/${entry.name}`;
        if (entry.isDirectory()) {
          errors.push(`unexpected nested directory: ${rel}`);
        } else if (entry.name.startsWith(".")) {
          errors.push(`hidden file not allowed: ${rel}`);
        } else if (!entry.name.endsWith(".json")) {
          errors.push(`non-JSON file must not exist in source vocabulary-level directory: ${rel}`);
        } else if (!expectedFileNames.has(entry.name)) {
          errors.push(`unexpected JSON file: ${rel}`);
        }
      }
      for (const target of SUPPORTED_TARGET_LANGUAGES) {
        if (!fs.existsSync(path.join(uiDir, `${target}.json`))) {
          errors.push(`missing expected source pair: src/data/seo/vocabularyLevels/${ui}/${target}.json`);
        }
      }
    }

    if (errors.length > 0) {
      reportFailure("Vocabulary-level synchronization failed (source validation):", errors);
      return;
    }

    // ---- parse + hash every expected source file ----
    const sourceFiles = new Map(); // relPath -> { buf, hash }
    for (const rel of expectedRelPaths) {
      const abs = path.join(SRC_DIR, ...rel.split("/"));
      const buf = fs.readFileSync(abs);
      try {
        JSON.parse(buf.toString("utf8").replace(UTF8_BOM_PATTERN, ""));
      } catch (err) {
        errors.push(`invalid JSON: src/data/seo/vocabularyLevels/${rel} (${err.message})`);
        continue;
      }
      sourceFiles.set(rel, { buf, hash: sha256(buf) });
    }

    // Duplicate-logical-key guard: catches case-insensitive filename
    // collisions that would be invisible on a case-insensitive filesystem
    // (Windows) but break the expected matrix on Linux (Cloudflare's build).
    const normalizedSeen = new Map();
    for (const rel of expectedRelPaths) {
      const norm = rel.toLowerCase();
      if (normalizedSeen.has(norm) && normalizedSeen.get(norm) !== rel) {
        errors.push(`duplicate logical vocabulary-level key: ${rel}`);
      }
      normalizedSeen.set(norm, rel);
    }

    if (errors.length > 0) {
      reportFailure("Vocabulary-level synchronization failed (source validation):", errors);
      return;
    }

    // ---- scan public mirror tree ----
    const publicFiles = [];
    (function walk(dir, relBase) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(abs, rel);
        } else {
          publicFiles.push(rel.replace(/\\/g, "/"));
        }
      }
    })(PUBLIC_DIR, "");

    for (const rel of publicFiles) {
      const base = path.posix.basename(rel);
      if (!rel.endsWith(".json") && !ALLOWED_PUBLIC_EXTRA_FILES.has(base)) {
        errors.push(`unexpected non-JSON file in public mirror: public/vocabularyLevels/${rel}`);
      }
    }

    if (errors.length > 0) {
      reportFailure("Vocabulary-level synchronization failed (public mirror validation):", errors);
      return;
    }

    const expectedRelSet = new Set(expectedRelPaths);
    const publicJsonRelSet = new Set(publicFiles.filter((rel) => rel.endsWith(".json")));
    const staleRel = [...publicJsonRelSet].filter((rel) => !expectedRelSet.has(rel)).sort();

    // ---- diff each expected pair against the public mirror ----
    let copied = 0;
    let updated = 0;
    let unchanged = 0;
    const toWrite = [];
    for (const rel of expectedRelPaths) {
      const source = sourceFiles.get(rel);
      const publicAbs = path.join(PUBLIC_DIR, ...rel.split("/"));
      if (!fs.existsSync(publicAbs)) {
        copied++;
        toWrite.push({ rel, buf: source.buf });
        continue;
      }
      const publicBuf = fs.readFileSync(publicAbs);
      if (sha256(publicBuf) !== source.hash) {
        updated++;
        toWrite.push({ rel, buf: source.buf });
      } else {
        unchanged++;
      }
    }

    const hasDrift = copied > 0 || updated > 0 || staleRel.length > 0;

    if (CHECK_ONLY) {
      if (hasDrift) {
        console.error("\nVocabulary-level public mirror is out of sync with src/data/seo/vocabularyLevels/:\n");
        if (copied > 0) console.error(`  missing in public: ${copied}`);
        if (updated > 0) console.error(`  modified in public: ${updated}`);
        if (staleRel.length > 0) {
          console.error(`  stale extra public file(s): ${staleRel.join(", ")}`);
        }
        console.error("\nRun: npm run sync:vocabulary-levels\n");
        process.exitCode = 1;
      } else {
        console.log("Vocabulary-level public mirror check passed.");
        console.log(`Source files: ${expectedRelPaths.length}`);
        console.log(`Verified byte-identical: ${expectedRelPaths.length}`);
      }
      return;
    }

    // ---- apply writes ----
    for (const { rel, buf } of toWrite) {
      const publicAbs = path.join(PUBLIC_DIR, ...rel.split("/"));
      fs.mkdirSync(path.dirname(publicAbs), { recursive: true });
      fs.writeFileSync(publicAbs, buf);
    }

    // ---- remove stale public JSON files ----
    for (const rel of staleRel) {
      fs.rmSync(path.join(PUBLIC_DIR, ...rel.split("/")), { force: true });
    }

    // ---- remove now-empty stale directories (never the root) ----
    (function removeEmptyDirs(dir) {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) removeEmptyDirs(path.join(dir, entry.name));
      }
      if (
        path.resolve(dir) !== path.resolve(PUBLIC_DIR) &&
        fs.readdirSync(dir).length === 0
      ) {
        fs.rmdirSync(dir);
      }
    })(PUBLIC_DIR);

    fs.mkdirSync(PUBLIC_DIR, { recursive: true });

    // ---- verify byte-identical after sync ----
    let verified = 0;
    const verifyErrors = [];
    for (const rel of expectedRelPaths) {
      const publicAbs = path.join(PUBLIC_DIR, ...rel.split("/"));
      if (!fs.existsSync(publicAbs)) {
        verifyErrors.push(`missing after sync: public/vocabularyLevels/${rel}`);
        continue;
      }
      const publicBuf = fs.readFileSync(publicAbs);
      if (sha256(publicBuf) !== sourceFiles.get(rel).hash) {
        verifyErrors.push(`byte mismatch after sync: public/vocabularyLevels/${rel}`);
        continue;
      }
      verified++;
    }

    if (verifyErrors.length > 0) {
      reportFailure("Vocabulary-level synchronization failed (post-sync verification):", verifyErrors);
      return;
    }

    console.log("Vocabulary-level synchronization complete.");
    console.log(`Source files: ${expectedRelPaths.length}`);
    console.log(`Copied: ${copied}`);
    console.log(`Updated: ${updated}`);
    console.log(`Unchanged: ${unchanged}`);
    console.log(`Removed stale files: ${staleRel.length}`);
    console.log(`Verified byte-identical: ${verified}`);
  } finally {
    compiled.cleanup();
  }
}

main();
