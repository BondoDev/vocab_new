import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const SITE_URL = (process.env.SITE_URL || "https://www.fluentstellar.com").replace(/\/+$/, "");
const WORD_SITEMAP_LIMIT = Number.parseInt(process.env.WORD_SITEMAP_LIMIT || "1000", 10);
const WORD_SITEMAP_OFFSET = Number.parseInt(process.env.WORD_SITEMAP_OFFSET || "0", 10);
const WORD_SITEMAP_TARGET_LANGUAGE = (process.env.WORD_SITEMAP_TARGET_LANGUAGE || "english").trim().toLowerCase();
const WORD_SITEMAP_LEVEL = (process.env.WORD_SITEMAP_LEVEL || "A1").trim().toUpperCase();
const WORD_SITEMAP_UI_LANG = (process.env.WORD_SITEMAP_UI_LANG || "en").trim().toLowerCase();

const CORE_ROUTES = [
  "/",
  "/languages",
  "/languages/filters",
  "/languages/filters/exercises",
  "/languages/filters/exercises/practice",
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

function wordToSlug(lemma) {
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
  const routes = [];
  const seen = new Set();
  const selectedTargetLanguages = WORD_SITEMAP_TARGET_LANGUAGE
    ? TARGET_LANGUAGES.filter((lang) => lang === WORD_SITEMAP_TARGET_LANGUAGE)
    : TARGET_LANGUAGES;
  const selectedUiLanguages =
    WORD_SITEMAP_UI_LANG && UI_LANGUAGES.includes(WORD_SITEMAP_UI_LANG)
      ? [WORD_SITEMAP_UI_LANG]
      : UI_LANGUAGES;

  for (const targetLanguage of selectedTargetLanguages) {
    const vocabPath = path.join(ROOT_DIR, "src", "data", "vocabulary", targetLanguage, "vocabulary.json");
    const raw = await fs.readFile(vocabPath, "utf8");
    const vocab = JSON.parse(raw.replace(/^\uFEFF/, ""));
    for (const entry of vocab) {
      if (WORD_SITEMAP_LEVEL && entry.level !== WORD_SITEMAP_LEVEL) continue;
      const slug = wordToSlug(entry.word_lemma);
      if (!slug) continue;
      const uniqueWordKey = `${targetLanguage}:${slug}`;
      if (seen.has(uniqueWordKey)) continue;
      seen.add(uniqueWordKey);
      for (const uiLang of selectedUiLanguages) {
        routes.push(`/${uiLang}/${targetLanguage}-word-${slug}`);
      }
    }
  }

  if (Number.isFinite(WORD_SITEMAP_LIMIT) && WORD_SITEMAP_LIMIT > 0) {
    const offset = Number.isFinite(WORD_SITEMAP_OFFSET) && WORD_SITEMAP_OFFSET > 0
      ? WORD_SITEMAP_OFFSET
      : 0;
    return routes.slice(offset, offset + WORD_SITEMAP_LIMIT);
  }

  return routes;
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

function buildSitemapXml(paths) {
  const lastmod = new Date().toISOString().slice(0, 10);
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "",
  ];

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

async function main() {
  const vocabularyRoutes = await collectVocabularyRoutes();
  const wordRoutes = await collectWordRoutes();
  const allRoutes = [...new Set([...CORE_ROUTES, ...vocabularyRoutes, ...wordRoutes])];
  const sitemap = buildSitemapXml(allRoutes);
  const outputPath = path.join(ROOT_DIR, "public", "sitemap.xml");
  await fs.writeFile(outputPath, sitemap, "utf8");
  console.log(`Generated sitemap with ${allRoutes.length} URLs at ${outputPath}`);
}

main().catch((error) => {
  console.error("Failed to generate sitemap:", error);
  process.exitCode = 1;
});
