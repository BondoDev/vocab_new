import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { XMLParser } from "fast-xml-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITEMAP_INDEX_PATH = path.join(__dirname, "public", "sitemap.xml");
const SITEMAPS_DIR = path.join(__dirname, "public", "sitemaps");
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "service-account.json");
const PROGRESS_FILE_PATH = path.join(__dirname, "indexed-progress.json");
const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const DEFAULT_RUN_LIMIT = 200;

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function parseCliArgs(argv) {
  const options = {
    limit: DEFAULT_RUN_LIMIT,
    url: null,
  };

  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
      const rawValue = arg.slice("--limit=".length);
      const limit = Number.parseInt(rawValue, 10);

      if (!Number.isFinite(limit) || limit <= 0) {
        throw new Error("--limit must be a positive integer.");
      }

      options.limit = limit;
      continue;
    }

    if (arg.startsWith("--url=")) {
      const rawUrl = arg.slice("--url=".length).trim();
      if (!rawUrl) {
        throw new Error("--url must not be empty.");
      }

      options.url = rawUrl;
      continue;
    }
  }

  return options;
}

function toArray(value) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function normalizeLoc(entry) {
  if (typeof entry === "string") {
    return entry.trim();
  }

  if (entry && typeof entry.loc === "string") {
    return entry.loc.trim();
  }

  return "";
}

function resolveLocalSitemapPath(loc) {
  const url = new URL(loc);
  const fileName = path.basename(url.pathname);
  return path.join(SITEMAPS_DIR, fileName);
}

async function parseXmlFile(filePath) {
  const xml = await fs.readFile(filePath, "utf8");
  return parser.parse(xml);
}

async function readProgressFile() {
  try {
    const raw = await fs.readFile(PROGRESS_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      throw new Error("indexed-progress.json must contain a JSON array.");
    }

    return new Set(
      parsed.filter((item) => typeof item === "string" && item.trim().length > 0)
    );
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      await fs.writeFile(PROGRESS_FILE_PATH, "[]\n", "utf8");
      return new Set();
    }

    throw error;
  }
}

async function writeProgressFile(progressSet) {
  const urls = [...progressSet];
  await fs.writeFile(PROGRESS_FILE_PATH, `${JSON.stringify(urls, null, 2)}\n`, "utf8");
}

async function appendSuccessfulUrl(progressSet, url) {
  progressSet.add(url);
  await writeProgressFile(progressSet);
}

async function collectUrlsFromSitemapIndex() {
  const sitemapIndex = await parseXmlFile(SITEMAP_INDEX_PATH);
  const sitemapEntries = toArray(sitemapIndex?.sitemapindex?.sitemap);
  const urls = [];

  for (const entry of sitemapEntries) {
    const loc = normalizeLoc(entry);
    if (!loc) {
      continue;
    }

    const childPath = resolveLocalSitemapPath(loc);
    const childSitemap = await parseXmlFile(childPath);
    const childUrls = toArray(childSitemap?.urlset?.url)
      .map((urlEntry) => normalizeLoc(urlEntry))
      .filter(Boolean);

    urls.push(...childUrls);
  }

  return urls;
}

async function getIndexingClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: SERVICE_ACCOUNT_PATH,
    scopes: [INDEXING_SCOPE],
  });

  return google.indexing({
    version: "v3",
    auth: await auth.getClient(),
  });
}

function isQuotaExceededError(error) {
  const message =
    error instanceof Error ? error.message : JSON.stringify(error ?? "");
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? error.status
      : typeof error === "object" &&
          error !== null &&
          "response" in error &&
          error.response &&
          typeof error.response === "object" &&
          "status" in error.response
        ? error.response.status
        : undefined;

  return (
    status === 429 ||
    message.includes("Quota exceeded") ||
    message.includes("RESOURCE_EXHAUSTED") ||
    message.includes("publish requests per day")
  );
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  const progressSet = await readProgressFile();
  const sourceUrls = options.url
    ? [options.url]
    : await collectUrlsFromSitemapIndex();
  const pendingUrls = sourceUrls.filter((url) => !progressSet.has(url));
  const urls = pendingUrls.slice(0, options.limit);

  if (urls.length === 0) {
    console.log("No pending URLs to process.");
    return;
  }

  if (options.url) {
    console.log("Submitting 1 explicitly provided URL.");
  } else {
    console.log(
      `Submitting ${urls.length} URL(s) from local sitemap files with limit ${options.limit}.`
    );
  }

  console.log(
    `Skipping ${sourceUrls.length - pendingUrls.length} URL(s) already recorded in indexed-progress.json.`
  );

  const indexing = await getIndexingClient();

  for (const [index, url] of urls.entries()) {
    const progress = `[${index + 1}/${urls.length}]`;

    try {
      await indexing.urlNotifications.publish({
        requestBody: {
          url,
          type: "URL_UPDATED",
        },
      });

      await appendSuccessfulUrl(progressSet, url);
      console.log(`${progress} Submitted ${url}`);
    } catch (error) {
      if (isQuotaExceededError(error)) {
        await writeProgressFile(progressSet);
        console.log("Daily quota reached. Saved progress. See you tomorrow!");
        return;
      }

      const message =
        error instanceof Error ? error.message : JSON.stringify(error);
      console.error(`${progress} Failed ${url}`);
      console.error(message);
    }
  }
}

main().catch((error) => {
  console.error("Google indexing run failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
