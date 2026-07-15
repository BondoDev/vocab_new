// Manual-only operator script: submits FluentStellar URLs to the Google
// Indexing API. Never invoked from prebuild/build/CI/postinstall — run by
// hand when the operator wants to nudge indexing for new or updated pages.
// See docs/google-indexing-operations.md for full usage.
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";
import { XMLParser } from "fast-xml-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..", "..");

const SITEMAP_INDEX_PATH = path.join(ROOT_DIR, "public", "sitemap.xml");
const SITEMAPS_DIR = path.join(ROOT_DIR, "public", "sitemaps");
const LEGACY_SERVICE_ACCOUNT_PATH = path.join(ROOT_DIR, "service-account.json");
const PROGRESS_FILE_PATH = path.join(__dirname, "state", "indexed-progress.json");
const INDEXING_SCOPE = "https://www.googleapis.com/auth/indexing";
const DEFAULT_RUN_LIMIT = 200;
const ALLOWED_URL_PREFIX = "https://www.fluentstellar.com/";

const HELP_TEXT = `Usage: node scripts/operations/google-index.mjs [options]

Submits pending FluentStellar URLs to the Google Indexing API, sourced from
the local sitemap files unless --url is given. Resumable: already-submitted
URLs are skipped via the progress-state file.

Options:
  --limit=<n>      Max URLs to submit this run (default: ${DEFAULT_RUN_LIMIT})
  --url=<url>      Submit exactly one explicit URL instead of reading sitemaps
  --dry-run        Resolve and validate URLs, but perform no API requests
  --help           Show this help text

Credential resolution order:
  1. GOOGLE_APPLICATION_CREDENTIALS env var (path to a service-account JSON file)
  2. Local repo-root service-account.json (legacy fallback, must stay gitignored)

Only URLs beginning with ${ALLOWED_URL_PREFIX} are accepted.
`;

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function parseCliArgs(argv) {
  const options = {
    limit: DEFAULT_RUN_LIMIT,
    url: null,
    dryRun: false,
    help: false,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

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

function assertAllowedUrl(url) {
  if (!url.startsWith(ALLOWED_URL_PREFIX)) {
    throw new Error(
      `Refusing to submit URL outside the allowed FluentStellar origin: ${url}`
    );
  }
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
  let raw;
  try {
    raw = await fs.readFile(PROGRESS_FILE_PATH, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      await fs.mkdir(path.dirname(PROGRESS_FILE_PATH), { recursive: true });
      await fs.writeFile(PROGRESS_FILE_PATH, "[]\n", "utf8");
      return new Set();
    }

    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `${PROGRESS_FILE_PATH} contains malformed JSON. Fix or remove it before continuing (it is regenerable, but existing resume state will be lost).`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${PROGRESS_FILE_PATH} must contain a JSON array.`);
  }

  return new Set(
    parsed.filter((item) => typeof item === "string" && item.trim().length > 0)
  );
}

async function writeProgressFile(progressSet) {
  const urls = [...progressSet];
  const tmpPath = `${PROGRESS_FILE_PATH}.tmp-${process.pid}`;
  await fs.mkdir(path.dirname(PROGRESS_FILE_PATH), { recursive: true });
  await fs.writeFile(tmpPath, `${JSON.stringify(urls, null, 2)}\n`, "utf8");
  await fs.rename(tmpPath, PROGRESS_FILE_PATH);
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

function resolveCredentialPath() {
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }

  return LEGACY_SERVICE_ACCOUNT_PATH;
}

async function getIndexingClient() {
  const keyFile = resolveCredentialPath();

  try {
    await fs.access(keyFile);
  } catch {
    throw new Error(
      `No Google service-account credential found at ${keyFile}. Set GOOGLE_APPLICATION_CREDENTIALS to a valid service-account JSON path, or place service-account.json at the repo root (gitignored).`
    );
  }

  const auth = new google.auth.GoogleAuth({
    keyFile,
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

  if (options.help) {
    console.log(HELP_TEXT);
    return;
  }

  if (options.url) {
    assertAllowedUrl(options.url);
  }

  const progressSet = await readProgressFile();
  const sourceUrls = options.url
    ? [options.url]
    : await collectUrlsFromSitemapIndex();

  for (const url of sourceUrls) {
    assertAllowedUrl(url);
  }

  const pendingUrls = sourceUrls.filter((url) => !progressSet.has(url));
  const urls = pendingUrls.slice(0, options.limit);

  if (urls.length === 0) {
    console.log("No pending URLs to process.");
    return;
  }

  if (options.url) {
    console.log(`Submitting 1 explicitly provided URL${options.dryRun ? " (dry run)" : ""}.`);
  } else {
    console.log(
      `Submitting ${urls.length} URL(s) from local sitemap files with limit ${options.limit}${
        options.dryRun ? " (dry run)" : ""
      }.`
    );
  }

  console.log(
    `Skipping ${sourceUrls.length - pendingUrls.length} URL(s) already recorded in progress state.`
  );

  if (options.dryRun) {
    for (const [index, url] of urls.entries()) {
      console.log(`[${index + 1}/${urls.length}] Would submit ${url}`);
    }
    console.log("Dry run complete. No API requests were made.");
    return;
  }

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
