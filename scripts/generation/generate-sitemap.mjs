import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadWordRouteManifest } from "../lib/load-word-route-manifest.mjs";
import { loadVerbListRegistry } from "../lib/load-verb-list-registry.mjs";
import { loadPastVerbFormsRegistry } from "../lib/load-past-verb-forms-registry.mjs";
import { loadVocabularyLevelRoutes } from "../lib/load-vocabulary-level-routes.mjs";
import { createLastmodLedger } from "../lib/sitemap-lastmod.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");

const SITE_URL = (process.env.SITE_URL || "https://www.fluentstellar.com").replace(/\/+$/, "");
const WORD_SITEMAP_LIMIT = Number.parseInt(process.env.WORD_SITEMAP_LIMIT || "0", 10);
const WORD_SITEMAP_OFFSET = Number.parseInt(process.env.WORD_SITEMAP_OFFSET || "0", 10);
const WORD_SITEMAP_TARGET_LANGUAGE = (process.env.WORD_SITEMAP_TARGET_LANGUAGE || "ALL").trim().toLowerCase();
const WORD_SITEMAP_LEVEL = (process.env.WORD_SITEMAP_LEVEL || "ALL").trim().toUpperCase();
const WORD_SITEMAP_ALL_LEVELS = WORD_SITEMAP_LEVEL === "ALL";
const WORD_SITEMAP_UI_LANG = (process.env.WORD_SITEMAP_UI_LANG || "ALL").trim().toLowerCase();
const SITEMAP_CHUNK_SIZE = Number.parseInt(process.env.SITEMAP_CHUNK_SIZE || "50000", 10);

// Word SEO pages stay live, routable, and indexable under their own metadata
// policy (src/seo/wordPages/wordMetadata.ts) — this flag is an XML-sitemap
// discovery decision only. Deleting generated sitemap-words-*.xml alone is
// not enough: prebuild regenerates public/sitemaps/ from source on every
// build, so exclusion has to live here.
const INCLUDE_WORD_SITEMAPS = false;

const CORE_ROUTES = [
  "/",
  // /languages, /languages/filters, /languages/filters/exercises,
  // /languages/level-test, and /explore are intentionally excluded here:
  // src/seo/routeMetadataPolicy.ts classifies them "public-app" and always
  // emits `robots: noindex, follow` for them. They stay live, 200-status,
  // navigable app routes — they just must not be submitted for indexing.
  "/en/seo-pages",
  "/es/paginas-seo",
  "/fr/pages-seo",
  "/de/seo-seiten",
  "/it/pagine-seo",
  "/pt/paginas-seo",
  "/ru/seo-stranicy",
  "/about",
  "/help",
];

const UI_LANGUAGE_NAMES = {
  en: "english",
  es: "spanish",
  fr: "french",
  de: "german",
  it: "italian",
  pt: "portuguese",
  ru: "russian",
};

const WORD_SITEMAP_PAIR_LIMITS = {};
const TARGET_LANGUAGES = ["english", "german", "spanish", "french", "italian", "portuguese", "russian"];

async function collectWordRoutes(wordRouteManifest) {
  const { WORD_SITEMAP_DEFINITIONS, buildCanonicalWordPathFromSlug, buildWordRouteLookupKey, wordToSlug } =
    wordRouteManifest;
  const routesByPair = new Map();
  const selectedDefinitions = WORD_SITEMAP_DEFINITIONS.filter(({ targetLanguage, uiLang }) => {
    const targetMatches =
      !WORD_SITEMAP_TARGET_LANGUAGE ||
      WORD_SITEMAP_TARGET_LANGUAGE === "all" ||
      targetLanguage === WORD_SITEMAP_TARGET_LANGUAGE;
    const uiMatches =
      !WORD_SITEMAP_UI_LANG ||
      WORD_SITEMAP_UI_LANG === "all" ||
      uiLang === WORD_SITEMAP_UI_LANG;
    return targetMatches && uiMatches;
  });

  const selectedTargetLanguages = Array.from(
    new Set(selectedDefinitions.map(({ targetLanguage }) => targetLanguage)),
  );
  const definitionsByTargetLanguage = new Map();
  for (const definition of selectedDefinitions) {
    const definitions = definitionsByTargetLanguage.get(definition.targetLanguage) || [];
    definitions.push(definition);
    definitionsByTargetLanguage.set(definition.targetLanguage, definitions);
  }

  for (const targetLanguage of selectedTargetLanguages) {
    const definitions = definitionsByTargetLanguage.get(targetLanguage) || [];
    if (definitions.length === 0) continue;
    const vocabPath = path.join(ROOT_DIR, "src", "data", "vocabulary", targetLanguage, "vocabulary.json");
    const raw = await fs.readFile(vocabPath, "utf8");
    const vocab = JSON.parse(raw.replace(/^\uFEFF/, ""));
    const seen = new Set();
    const pairRoutes = new Map();
    for (const definition of definitions) {
      const pairKey = `${definition.fileWordCode}:${definition.fileUiCode}`;
      pairRoutes.set(pairKey, []);
    }
    for (const entry of vocab) {
      if (!WORD_SITEMAP_ALL_LEVELS && WORD_SITEMAP_LEVEL && entry.level !== WORD_SITEMAP_LEVEL) continue;
      const slug = wordToSlug(entry.word_lemma);
      if (!slug) continue;
      const conceptId = String(entry.concept_id ?? "").trim();
      const uniqueWordKey = buildWordRouteLookupKey(targetLanguage, conceptId, slug);
      if (seen.has(uniqueWordKey)) continue;
      seen.add(uniqueWordKey);
      for (const definition of definitions) {
        const pairKey = `${definition.fileWordCode}:${definition.fileUiCode}`;
        pairRoutes.get(pairKey).push(
          buildCanonicalWordPathFromSlug(definition.uiLang, targetLanguage, slug, conceptId),
        );
      }
    }

    for (const definition of definitions) {
      const pairKey = `${definition.fileWordCode}:${definition.fileUiCode}`;
      const baseRoutes = pairRoutes.get(pairKey) || [];
      const pairLimit = WORD_SITEMAP_PAIR_LIMITS[pairKey];
      const limitedRoutes =
        Number.isFinite(pairLimit) && pairLimit > 0
          ? baseRoutes.slice(0, pairLimit)
          : baseRoutes;
      if (Number.isFinite(WORD_SITEMAP_LIMIT) && WORD_SITEMAP_LIMIT > 0) {
        const offset =
          Number.isFinite(WORD_SITEMAP_OFFSET) && WORD_SITEMAP_OFFSET > 0
            ? WORD_SITEMAP_OFFSET
            : 0;
        routesByPair.set(
          pairKey,
          {
            ...definition,
            routes: limitedRoutes.slice(offset, offset + WORD_SITEMAP_LIMIT),
          },
        );
      } else {
        routesByPair.set(pairKey, {
          ...definition,
          routes: limitedRoutes,
        });
      }
    }
  }

  return routesByPair;
}

function xmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// Sourced from the application's own route registry
// (src/data/seo/vocabularyLevels/vocabularyLevelRoutes.ts's
// getAllLocalizedVocabularyRoutes()), not by scanning the legacy
// src/data/seo/vocabularyLevels/{ui}/{target}.json matrix: that matrix is
// no longer used for page rendering or metadata (see docs/generated-data.md).
function collectVocabularyRoutes(vocabularyLevelRoutesModule) {
  const routes = vocabularyLevelRoutesModule.getAllLocalizedVocabularyRoutes();
  return Array.from(new Set(routes.map((route) => route.path))).sort();
}

async function collectLevelTestRoutes() {
  const filePath = path.join(ROOT_DIR, "src", "data", "seo", "levelTests", "seo_level_test_content.json");
  const raw = await fs.readFile(filePath, "utf8");
  const entries = JSON.parse(raw.replace(/^\uFEFF/, ""));
  const routes = new Set();

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const routePath = typeof entry.path === "string" ? entry.path.trim() : "";
    if (!routePath) {
      continue;
    }

    routes.add(routePath);
  }

  return Array.from(routes).sort();
}

function buildSitemapXml(paths, options = {}) {
  const comment = options.comment ? String(options.comment).trim() : "";
  // Stable, ledger-resolved date (see scripts/lib/sitemap-lastmod.mjs) —
  // stamping the build date here re-announces the whole corpus as changed
  // on every deploy and triggers full recrawls (2026-07-12 incident).
  const lastmod = options.lastmod;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lastmod ?? "")) {
    throw new Error(`buildSitemapXml requires a resolved lastmod, got: ${lastmod}`);
  }
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "",
  ];
  if (comment) {
    lines.push(`  <!-- ${xmlEscape(comment)} -->`);
    lines.push("");
  }

  for (const route of paths) {
    const loc = `${SITE_URL}${route}`;
    lines.push("  <url>");
    lines.push(`    <loc>${xmlEscape(loc)}</loc>`);
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push("  </url>");
    lines.push("");
  }

  lines.push("</urlset>");
  lines.push("");
  return lines.join("\n");
}

function buildSitemapIndexXml(fileEntries) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "",
  ];

  // Each child <sitemap> advertises its own stable lastmod, so an unchanged
  // child never looks freshly modified in the index.
  for (const { fileName, lastmod } of fileEntries) {
    lines.push("  <sitemap>");
    lines.push(`    <loc>${xmlEscape(`${SITE_URL}/${fileName}`)}</loc>`);
    lines.push(`    <lastmod>${lastmod}</lastmod>`);
    lines.push("  </sitemap>");
    lines.push("");
  }

  lines.push("</sitemapindex>");
  lines.push("");
  return lines.join("\n");
}

function chunkArray(values, chunkSize) {
  const result = [];
  const size = Number.isFinite(chunkSize) && chunkSize > 0 ? chunkSize : 50000;
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function main() {
  const manifestLoader = loadWordRouteManifest(".tmp-word-route-manifest-sitemap");
  const verbListRegistryLoader = loadVerbListRegistry(".tmp-verb-list-registry-sitemap");
  const pastVerbFormsRegistryLoader = loadPastVerbFormsRegistry(".tmp-past-verb-forms-registry-sitemap");
  const vocabularyLevelRoutesLoader = loadVocabularyLevelRoutes(".tmp-vocabulary-level-routes-sitemap");
  const publicDir = path.join(ROOT_DIR, "public");
  const sitemapsDir = path.join(publicDir, "sitemaps");

  try {
    await fs.mkdir(sitemapsDir, { recursive: true });

    const existingSubSitemapFiles = await fs.readdir(sitemapsDir);
    await Promise.all(
      existingSubSitemapFiles
        .filter((name) => /^(sitemap-(core|cefr|words.*)|verb-lists)\.xml$/.test(name))
        .map((name) => fs.rm(path.join(sitemapsDir, name), { force: true })),
    );
    const existingRootFiles = await fs.readdir(publicDir);
    await Promise.all(
      existingRootFiles
        .filter((name) => /^(sitemap-(core|cefr|words.*)|verb-lists)\.xml$/.test(name))
        .map((name) => fs.rm(path.join(publicDir, name), { force: true })),
    );

    const vocabularyRoutes = collectVocabularyRoutes(vocabularyLevelRoutesLoader.routes);
    const levelTestRoutes = await collectLevelTestRoutes();
    // Past-verb-forms routes only join the verb-lists sitemap once
    // PAST_VERB_FORMS_LAUNCHED flips to true (src/seo/verbLists/pastForms100Verbs/pastVerbFormsLaunchStatus.ts).
    // Before launch, records are authored incrementally and any record
    // without a urlSlug yet is skipped by getAllPastVerbFormsPaths() — this
    // flag check makes the exclusion an explicit, centralized decision
    // rather than an incidental side effect of unfilled data.
    const pastVerbFormsRoutes = pastVerbFormsRegistryLoader.launchStatus.PAST_VERB_FORMS_LAUNCHED
      ? pastVerbFormsRegistryLoader.registry.getAllPastVerbFormsPaths()
      : [];
    const verbListRoutes = Array.from(
      new Set([...verbListRegistryLoader.registry.getAllVerbListPaths(), ...pastVerbFormsRoutes]),
    ).sort();
    const wordRoutesByPair = INCLUDE_WORD_SITEMAPS
      ? await collectWordRoutes(manifestLoader.manifest)
      : new Map();

    // Manual-only lastmod: dates are frozen in the committed ledger and
    // never advance on rebuilds or data changes. To change them, edit
    // scripts/data/sitemap-lastmod-ledger.json or run with
    // SITEMAP_LASTMOD_BUMP="all" / comma-separated file keys.
    const ledger = createLastmodLedger(path.join(ROOT_DIR, "scripts", "data", "sitemap-lastmod-ledger.json"), {
      bump: process.env.SITEMAP_LASTMOD_BUMP || "",
    });
    const resolveLastmod = (fileName) => ledger.resolve(fileName);

    const sitemapFiles = [];

    const coreRoutes = Array.from(new Set(CORE_ROUTES));
    if (coreRoutes.length > 0) {
      const coreName = "sitemap-core.xml";
      const lastmod = resolveLastmod(`sitemaps/${coreName}`);
      await fs.writeFile(path.join(sitemapsDir, coreName), buildSitemapXml(coreRoutes, { lastmod }), "utf8");
      sitemapFiles.push({ fileName: `sitemaps/${coreName}`, lastmod });
    }

    const cefrRoutes = Array.from(
      new Set([...vocabularyRoutes, ...levelTestRoutes]),
    );
    if (cefrRoutes.length > 0) {
      const cefrName = "sitemap-cefr.xml";
      const lastmod = resolveLastmod(`sitemaps/${cefrName}`);
      await fs.writeFile(path.join(sitemapsDir, cefrName), buildSitemapXml(cefrRoutes, { lastmod }), "utf8");
      sitemapFiles.push({ fileName: `sitemaps/${cefrName}`, lastmod });
    }

    if (verbListRoutes.length > 0) {
      const verbListsName = "verb-lists.xml";
      const lastmod = resolveLastmod(`sitemaps/${verbListsName}`);
      await fs.writeFile(
        path.join(sitemapsDir, verbListsName),
        buildSitemapXml(verbListRoutes, { lastmod }),
        "utf8",
      );
      sitemapFiles.push({ fileName: `sitemaps/${verbListsName}`, lastmod });
    }

    const pairKeys = Array.from(wordRoutesByPair.keys()).sort();
    for (const pairKey of pairKeys) {
      const pairData = wordRoutesByPair.get(pairKey);
      if (!pairData) continue;
      const { fileWordCode, fileUiCode, uiLang, targetLanguage, routes: pairRoutes } = pairData;
      if (pairRoutes.length === 0) continue;
      const wordChunks = chunkArray(pairRoutes, SITEMAP_CHUNK_SIZE);
      for (let i = 0; i < wordChunks.length; i += 1) {
        const wordsName =
          wordChunks.length === 1
            ? `sitemap-words-${fileWordCode}-${fileUiCode}.xml`
            : `sitemap-words-${fileWordCode}-${fileUiCode}-${String(i + 1).padStart(4, "0")}.xml`;
        const lastmod = resolveLastmod(`sitemaps/${wordsName}`);
        await fs.writeFile(
          path.join(sitemapsDir, wordsName),
          buildSitemapXml(wordChunks[i], {
            comment: `Word SEO URLs for word language ${targetLanguage} and UI language ${UI_LANGUAGE_NAMES[uiLang] || uiLang}.`,
            lastmod,
          }),
          "utf8",
        );
        sitemapFiles.push({ fileName: `sitemaps/${wordsName}`, lastmod });
      }
    }

    const indexXml = buildSitemapIndexXml(sitemapFiles);
    const indexPath = path.join(publicDir, "sitemap.xml");
    await fs.writeFile(indexPath, indexXml, "utf8");
    ledger.save();

    const totalWordUrls = Array.from(wordRoutesByPair.values()).reduce(
      (sum, pairData) => sum + pairData.routes.length,
      0,
    );
    const totalUrls = coreRoutes.length + cefrRoutes.length + verbListRoutes.length + totalWordUrls;
    console.log(
      `Generated sitemap index (${sitemapFiles.length} files, ${totalUrls} URLs total) at ${indexPath}`,
    );
  } finally {
    verbListRegistryLoader.cleanup();
    pastVerbFormsRegistryLoader.cleanup();
    manifestLoader.cleanup();
    vocabularyLevelRoutesLoader.cleanup();
  }
}

main().catch((error) => {
  console.error("Failed to generate sitemap:", error);
  process.exitCode = 1;
});
