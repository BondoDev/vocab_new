import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const SITE_URL = (process.env.SITE_URL || "https://fluentstellar.com").replace(/\/+$/, "");

const CORE_ROUTES = [
  "/",
  "/languages",
  "/languages/filters",
  "/languages/filters/exercises",
  "/languages/filters/exercises/practice",
  "/explore",
  "/languages/level-test",
  "/en/english-level-test",
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
  const allRoutes = [...new Set([...CORE_ROUTES, ...vocabularyRoutes])];
  const sitemap = buildSitemapXml(allRoutes);
  const outputPath = path.join(ROOT_DIR, "public", "sitemap.xml");
  await fs.writeFile(outputPath, sitemap, "utf8");
  console.log(`Generated sitemap with ${allRoutes.length} URLs at ${outputPath}`);
}

main().catch((error) => {
  console.error("Failed to generate sitemap:", error);
  process.exitCode = 1;
});
