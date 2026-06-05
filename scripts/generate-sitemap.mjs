import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const SITE_URL = (process.env.SITE_URL || "https://www.fluentstellar.com").replace(/\/+$/, "");
const WORD_SITEMAP_LIMIT = Number.parseInt(process.env.WORD_SITEMAP_LIMIT || "0", 10);
const WORD_SITEMAP_OFFSET = Number.parseInt(process.env.WORD_SITEMAP_OFFSET || "0", 10);
const WORD_SITEMAP_TARGET_LANGUAGE = (process.env.WORD_SITEMAP_TARGET_LANGUAGE || "ALL").trim().toLowerCase();
const WORD_SITEMAP_LEVEL = (process.env.WORD_SITEMAP_LEVEL || "ALL").trim().toUpperCase();
const WORD_SITEMAP_ALL_LEVELS = WORD_SITEMAP_LEVEL === "ALL";
const WORD_SITEMAP_UI_LANG = (process.env.WORD_SITEMAP_UI_LANG || "en").trim().toLowerCase();
const SITEMAP_CHUNK_SIZE = Number.parseInt(process.env.SITEMAP_CHUNK_SIZE || "50000", 10);

const CORE_ROUTES = [
  "/",
  "/languages",
  "/languages/filters",
  "/languages/filters/exercises",
  "/explore",
  "/languages/level-test",
  "/en/seo-pages",
  "/en/english-level-test",
  "/es/paginas-seo",
  "/es/test-de-nivel-de-ingles",
  "/fr/pages-seo",
  "/fr/test-de-niveau-d-anglais",
  "/de/seo-seiten",
  "/de/englisch-niveau-test",
  "/it/pagine-seo",
  "/it/test-di-livello-di-inglese",
  "/pt/paginas-seo",
  "/pt/teste-de-nivel-de-ingles",
  "/ru/seo-stranicy",
  "/ru/test-urovnya-angliiskogo",
  "/about",
  "/help",
];

const TARGET_NAME_SLUGS = {
  en: {
    english: "english",
    german: "german",
    spanish: "spanish",
    french: "french",
    italian: "italian",
    portuguese: "portuguese",
    russian: "russian",
  },
  es: {
    english: "ingles",
    german: "aleman",
    spanish: "espanol",
    french: "frances",
    italian: "italiano",
    portuguese: "portugues",
    russian: "ruso",
  },
  de: {
    english: "englisch",
    german: "deutsch",
    spanish: "spanisch",
    french: "franzoesisch",
    italian: "italienisch",
    portuguese: "portugiesisch",
    russian: "russisch",
  },
  fr: {
    english: "anglais",
    german: "allemand",
    spanish: "espagnol",
    french: "francais",
    italian: "italien",
    portuguese: "portugais",
    russian: "russe",
  },
  ru: {
    english: "angliiskii",
    german: "nemetskii",
    spanish: "ispanskii",
    french: "frantsuzskii",
    italian: "italyanskii",
    portuguese: "portugalskii",
    russian: "russkii",
  },
  pt: {
    english: "ingles",
    german: "alemao",
    spanish: "espanhol",
    french: "frances",
    italian: "italiano",
    portuguese: "portugues",
    russian: "russo",
  },
  it: {
    english: "inglese",
    german: "tedesco",
    spanish: "spagnolo",
    french: "francese",
    italian: "italiano",
    portuguese: "portoghese",
    russian: "russo",
  },
};

const SLUG_PATTERNS = {
  en: (targetSlug, level) => `${targetSlug}-${level}-vocabulary-practice`,
  es: (targetSlug, level) => `vocabulario-${targetSlug}-${level}-practica`,
  de: (targetSlug, level) => `${targetSlug}-${level}-wortschatz-ueben`,
  fr: (targetSlug, level) => `vocabulaire-${targetSlug}-${level}-pratique`,
  ru: (targetSlug, level) => `slovar-${targetSlug}-${level}-praktika`,
  pt: (targetSlug, level) => `vocabulario-${targetSlug}-${level}-pratica`,
  it: (targetSlug, level) => `vocabolario-${targetSlug}-${level}-pratica`,
};

const UI_LANGUAGES = ["en", "es", "fr", "de", "it", "pt", "ru"];
const ALLOWED_WORD_SITEMAP_PAIRS = new Set(["en:english", "en:spanish"]);
const WORD_SITEMAP_PAIR_LIMITS = {};

function wordToSlug(lemma) {
  if (typeof lemma !== "string") return "";
  return lemma
    .toLowerCase()
    .replace(/[''']/g, "")
    .replace(/[^a-z0-9À-ɏЀ-ӿ\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const TARGET_LANGUAGES = ["english", "german", "spanish", "french", "italian", "portuguese", "russian"];

async function collectWordRoutes() {
  const routesByPair = new Map();
  const selectedTargetLanguages =
    !WORD_SITEMAP_TARGET_LANGUAGE || WORD_SITEMAP_TARGET_LANGUAGE === "all"
      ? TARGET_LANGUAGES
      : TARGET_LANGUAGES.filter((lang) => lang === WORD_SITEMAP_TARGET_LANGUAGE);
  const selectedUiLanguages =
    WORD_SITEMAP_UI_LANG && UI_LANGUAGES.includes(WORD_SITEMAP_UI_LANG)
      ? [WORD_SITEMAP_UI_LANG]
      : UI_LANGUAGES;

  for (const targetLanguage of selectedTargetLanguages) {
    const vocabPath = path.join(ROOT_DIR, "src", "data", "vocabulary", targetLanguage, "vocabulary.json");
    const raw = await fs.readFile(vocabPath, "utf8");
    const vocab = JSON.parse(raw.replace(/^\uFEFF/, ""));
    const seen = new Set();
    const pairRoutes = new Map();
    for (const uiLang of selectedUiLanguages) {
      pairRoutes.set(uiLang, []);
    }
    for (const entry of vocab) {
      if (!WORD_SITEMAP_ALL_LEVELS && WORD_SITEMAP_LEVEL && entry.level !== WORD_SITEMAP_LEVEL) continue;
      const slug = wordToSlug(entry.word_lemma);
      if (!slug) continue;
      const conceptId = String(entry.concept_id ?? "").trim();
      const uniqueWordKey = conceptId
        ? `${targetLanguage}:${conceptId}`
        : `${targetLanguage}:${slug}`;
      if (seen.has(uniqueWordKey)) continue;
      seen.add(uniqueWordKey);
      const wordPathSuffix = conceptId ? `${slug}--${conceptId}` : slug;
      for (const uiLang of selectedUiLanguages) {
        pairRoutes.get(uiLang).push(`/${uiLang}/${targetLanguage}-word-${wordPathSuffix}`);
      }
    }

    for (const uiLang of selectedUiLanguages) {
      const pairKey = `${uiLang}:${targetLanguage}`;
      if (!ALLOWED_WORD_SITEMAP_PAIRS.has(pairKey)) continue;
      const baseRoutes = pairRoutes.get(uiLang) || [];
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
          limitedRoutes.slice(offset, offset + WORD_SITEMAP_LIMIT),
        );
      } else {
        routesByPair.set(pairKey, limitedRoutes);
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

async function collectVocabularyRoutes() {
  const baseDir = path.join(ROOT_DIR, "src", "data", "vocabularyLevels");
  const uiDirEntries = await fs.readdir(baseDir, { withFileTypes: true });
  const routes = new Set();

  for (const uiEntry of uiDirEntries) {
    if (!uiEntry.isDirectory()) {
      continue;
    }
    const uiLang = uiEntry.name;
    if (!TARGET_NAME_SLUGS[uiLang] || !SLUG_PATTERNS[uiLang]) {
      continue;
    }

    const uiDir = path.join(baseDir, uiLang);
    const files = await fs.readdir(uiDir, { withFileTypes: true });

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".json")) {
        continue;
      }

      const targetLanguage = file.name.replace(/\.json$/, "");
      const localizedTargetSlug = TARGET_NAME_SLUGS[uiLang][targetLanguage];
      if (!localizedTargetSlug) {
        continue;
      }

      const filePath = path.join(uiDir, file.name);
      const raw = await fs.readFile(filePath, "utf8");
      const data = JSON.parse(raw.replace(/^\uFEFF/, ""));
      const levels = data?.levels && typeof data.levels === "object" ? data.levels : {};

      for (const [level, content] of Object.entries(levels)) {
        if (!content || typeof content !== "object") {
          continue;
        }
        const slug = SLUG_PATTERNS[uiLang](localizedTargetSlug, level);
        routes.add(`/${uiLang}/${slug}`);
      }
    }
  }

  return Array.from(routes).sort();
}

function buildSitemapXml(paths, options = {}) {
  const comment = options.comment ? String(options.comment).trim() : "";
  const lastmod = new Date().toISOString().slice(0, 10);
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

function buildSitemapIndexXml(fileNames) {
  const lastmod = new Date().toISOString().slice(0, 10);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "",
  ];

  for (const fileName of fileNames) {
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
  const publicDir = path.join(ROOT_DIR, "public");
  const sitemapsDir = path.join(publicDir, "sitemaps");
  await fs.mkdir(sitemapsDir, { recursive: true });

  const existingSubSitemapFiles = await fs.readdir(sitemapsDir);
  await Promise.all(
    existingSubSitemapFiles
      .filter((name) => /^sitemap-(core|cefr|words.*)\.xml$/.test(name))
      .map((name) => fs.rm(path.join(sitemapsDir, name), { force: true })),
  );
  const existingRootFiles = await fs.readdir(publicDir);
  await Promise.all(
    existingRootFiles
      .filter((name) => /^sitemap-(core|cefr|words.*)\.xml$/.test(name))
      .map((name) => fs.rm(path.join(publicDir, name), { force: true })),
  );

  const vocabularyRoutes = await collectVocabularyRoutes();
  const wordRoutesByPair = await collectWordRoutes();
  const targetLangCodeByName = {
    english: "en",
    german: "de",
    spanish: "sp",
    french: "fr",
    italian: "it",
    portuguese: "pt",
    russian: "ru",
  };

  const sitemapFiles = [];

  const coreRoutes = Array.from(new Set(CORE_ROUTES));
  if (coreRoutes.length > 0) {
    const coreName = "sitemap-core.xml";
    await fs.writeFile(path.join(sitemapsDir, coreName), buildSitemapXml(coreRoutes), "utf8");
    sitemapFiles.push(`sitemaps/${coreName}`);
  }

  if (vocabularyRoutes.length > 0) {
    const cefrName = "sitemap-cefr.xml";
    await fs.writeFile(path.join(sitemapsDir, cefrName), buildSitemapXml(vocabularyRoutes), "utf8");
    sitemapFiles.push(`sitemaps/${cefrName}`);
  }

  const pairKeys = Array.from(wordRoutesByPair.keys()).sort();
  for (const pairKey of pairKeys) {
    const [uiLang, targetLanguage] = pairKey.split(":");
    const pairRoutes = wordRoutesByPair.get(pairKey) || [];
    if (pairRoutes.length === 0) continue;
    const targetCode = targetLangCodeByName[targetLanguage] || targetLanguage.slice(0, 2);
    const wordChunks = chunkArray(pairRoutes, SITEMAP_CHUNK_SIZE);
    for (let i = 0; i < wordChunks.length; i += 1) {
      const wordsName =
        wordChunks.length === 1
          ? `sitemap-words-${uiLang}-${targetCode}.xml`
          : `sitemap-words-${uiLang}-${targetCode}-${String(i + 1).padStart(4, "0")}.xml`;
      await fs.writeFile(
        path.join(sitemapsDir, wordsName),
        buildSitemapXml(wordChunks[i], {
          comment: `Word SEO URLs for UI language ${uiLang} and target language ${targetLanguage}.`,
        }),
        "utf8",
      );
      sitemapFiles.push(`sitemaps/${wordsName}`);
    }
  }

  const indexXml = buildSitemapIndexXml(sitemapFiles);
  const indexPath = path.join(publicDir, "sitemap.xml");
  await fs.writeFile(indexPath, indexXml, "utf8");

  const totalWordUrls = Array.from(wordRoutesByPair.values()).reduce(
    (sum, routes) => sum + routes.length,
    0,
  );
  const totalUrls = coreRoutes.length + vocabularyRoutes.length + totalWordUrls;
  console.log(
    `Generated sitemap index (${sitemapFiles.length} files, ${totalUrls} URLs total) at ${indexPath}`,
  );
}

main().catch((error) => {
  console.error("Failed to generate sitemap:", error);
  process.exitCode = 1;
});

