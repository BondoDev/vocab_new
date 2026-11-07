// Publish pipeline for the production full-corpus Worker (Phase 5, revised:
// Cloudflare Workers Static Assets instead of R2 — no R2 account calls, no
// billing); also used for local staging/preview builds. Assembles
// assets-full/, the single combined directory wrangler.full.toml's
// `[assets] directory` points at:
//   - a copy of ../../../dist/**     (the existing production client
//                                      bundle, copied into the Worker's
//                                      Static Assets directory)
//   - records/{dataVersion}/**       (the generated shard tree from
//                                      generate-full-corpus.mjs)
//   - records/latest/manifest.json   (stable version pointer — see the
//                                      comment in the manifest-copy step)
//
// Run: node workers/word-ssr/generation/publish-shards.mjs
// Idempotent/incremental: skips any file whose SHA-256 already matches the
// prior run's record in data/publish-manifest.json.
// Self-cleaning: after copying, every file this run did not publish is
// deleted, so assets-full/ holds exactly the current dist/ plus the current
// dataVersion's records (Cloudflare uploads whatever this directory holds).
// records/latest/manifest.json is written last, only after verification.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(__dirname, "..");
const rootDir = path.resolve(workerDir, "..", "..");
const distDir = path.join(rootDir, "dist");
const dataDir = path.join(workerDir, "data", "full-corpus");
const assetsFullDir = path.join(workerDir, "assets-full");
const publishManifestPath = path.join(workerDir, "data", "publish-manifest.json");
const clientAssetsOutputPath = path.join(workerDir, "data", "client-assets.full.json");

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function walkFiles(rootAbsDir) {
  const results = [];
  function walk(relDir) {
    const absDir = path.join(rootAbsDir, relDir);
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const relPath = path.join(relDir, entry.name);
      if (entry.isDirectory()) {
        walk(relPath);
      } else {
        results.push(relPath);
      }
    }
  }
  walk(".");
  return results;
}

function copyIfChanged(srcAbsPath, destAbsPath, previousManifest, newManifest, manifestKey) {
  const buffer = fs.readFileSync(srcAbsPath);
  const checksum = sha256(buffer);
  const previous = previousManifest.files?.[manifestKey];
  if (previous?.checksum === checksum && fs.existsSync(destAbsPath)) {
    newManifest.files[manifestKey] = previous;
    return false;
  }
  fs.mkdirSync(path.dirname(destAbsPath), { recursive: true });
  fs.writeFileSync(destAbsPath, buffer);
  newManifest.files[manifestKey] = { checksum, sizeBytes: buffer.length, publishedAt: new Date().toISOString() };
  return true;
}

function writeClientAssetsManifest() {
  const indexHtmlPath = path.join(distDir, "index.html");
  if (!fs.existsSync(indexHtmlPath)) {
    throw new Error("dist/index.html not found - run `npm run build` at the repo root first.");
  }

  const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");
  const scriptMatch = indexHtml.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i);
  const styleMatches = Array.from(
    indexHtml.matchAll(/<link(?=[^>]*rel="stylesheet")(?=[^>]*href="([^"]+)")[^>]*>/gi),
  );
  const preconnectMatches = Array.from(
    indexHtml.matchAll(/<link(?=[^>]*rel="preconnect")(?=[^>]*href="([^"]+)")[^>]*>/gi),
  );
  const faviconMatch = indexHtml.match(/<link[^>]+rel="icon"[^>]+href="([^"]+)"/i);

  fs.writeFileSync(
    clientAssetsOutputPath,
    JSON.stringify(
      {
        scriptSrc: scriptMatch?.[1] ?? null,
        styleHrefs: styleMatches.map((match) => ({
          href: match[1],
          crossorigin: /\bcrossorigin\b/i.test(match[0]),
        })),
        preconnects: preconnectMatches.map((match) => ({
          href: match[1],
          crossorigin: /\bcrossorigin\b/i.test(match[0]),
        })),
        faviconHref: faviconMatch?.[1] ?? null,
      },
      null,
      2,
    ) + "\n",
  );
}

// Held for the duration of a publish so two concurrent publishes never copy
// into and prune the same directory. It stores the owner's PID: a lock left
// behind by a crashed run (dead PID) is taken over rather than blocking
// forever, while a lock owned by a live process aborts this run untouched.
const publishLockPath = path.join(assetsFullDir, ".publish-in-progress");
const latestPointerRelPath = "records/latest/manifest.json";

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to another user.
    return error.code === "EPERM";
  }
}

function acquirePublishLock() {
  fs.mkdirSync(assetsFullDir, { recursive: true });
  try {
    fs.writeFileSync(publishLockPath, String(process.pid), { flag: "wx" });
    return;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  const ownerPid = Number.parseInt(fs.readFileSync(publishLockPath, "utf8"), 10);
  if (Number.isInteger(ownerPid) && ownerPid !== process.pid && isProcessAlive(ownerPid)) {
    throw new Error(
      `assets-full/ is being published by another process (PID ${ownerPid}); refusing to modify it.`,
    );
  }
  fs.writeFileSync(publishLockPath, String(process.pid));
}

function releasePublishLock() {
  if (!fs.existsSync(publishLockPath)) return;
  if (fs.readFileSync(publishLockPath, "utf8").trim() === String(process.pid)) fs.rmSync(publishLockPath);
}

// Deletes every file under assets-full/ that this run did not publish (prior
// dataVersions' record trees, hashed client chunks from earlier dist/ builds,
// prerendered pages for removed routes), then any directories left empty.
// Only ever touches assetsFullDir, which is gitignored generated output.
function pruneUnpublishedFiles(keepRelPaths) {
  let removedFiles = 0;
  let removedBytes = 0;
  function prune(absDir) {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const absPath = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        prune(absPath);
        if (fs.readdirSync(absPath).length === 0) fs.rmdirSync(absPath);
        continue;
      }
      const relPath = path.relative(assetsFullDir, absPath).replace(/\\/g, "/");
      if (keepRelPaths.has(relPath)) continue;
      removedBytes += fs.statSync(absPath).size;
      fs.rmSync(absPath);
      removedFiles += 1;
    }
  }
  prune(assetsFullDir);
  return { removedFiles, removedBytes };
}

function collectManifestShardPaths(manifest) {
  const expectedRelPaths = new Set();
  for (const lang of Object.keys(manifest.shards.concepts)) {
    const value = manifest.shards.concepts[lang];
    for (const level of Object.keys(value)) {
      const entry = value[level];
      if (Array.isArray(entry)) entry.forEach((r) => expectedRelPaths.add(r.path));
      else expectedRelPaths.add(entry);
    }
  }
  for (const lang of Object.keys(manifest.shards.browse)) {
    for (const relPath of Object.values(manifest.shards.browse[lang])) expectedRelPaths.add(relPath);
  }
  for (const uiLang of Object.keys(manifest.shards.overlays)) {
    for (const relPath of Object.values(manifest.shards.overlays[uiLang])) expectedRelPaths.add(relPath);
  }
  return expectedRelPaths;
}

function publish(manifest, manifestPath) {
  const dataVersion = manifest.dataVersion;

  // The latest pointer doubles as the "publish completed" marker: it is
  // removed before anything is copied and rewritten only after every
  // referenced file is verified present. A run that fails midway therefore
  // leaves assets-full/ without a pointer, which the Worker rejects at cold
  // start ("records/latest/manifest.json not found"), instead of a
  // plausible-looking directory with a partially copied client bundle.
  fs.rmSync(path.join(assetsFullDir, latestPointerRelPath), { force: true });

  writeClientAssetsManifest();

  const previousManifest = fs.existsSync(publishManifestPath)
    ? JSON.parse(fs.readFileSync(publishManifestPath, "utf8"))
    : { files: {} };
  const newManifest = { publishedAt: new Date().toISOString(), dataVersion, files: {} };
  const publishedRelPaths = new Set([latestPointerRelPath, path.basename(publishLockPath)]);

  let clientCopied = 0;
  let clientSkipped = 0;
  for (const relPath of walkFiles(distDir)) {
    const normalizedRelPath = relPath.replace(/\\/g, "/");
    const changed = copyIfChanged(
      path.join(distDir, relPath),
      path.join(assetsFullDir, relPath),
      previousManifest,
      newManifest,
      `client:${normalizedRelPath}`,
    );
    publishedRelPaths.add(path.posix.normalize(normalizedRelPath));
    if (changed) clientCopied += 1;
    else clientSkipped += 1;
  }

  let shardCopied = 0;
  let shardSkipped = 0;
  for (const relPath of walkFiles(dataDir)) {
    if (!relPath.endsWith(".json")) continue; // skip generation-stats.json etc. from being served publicly
    if (path.basename(relPath) === "generation-stats.json") continue;
    const objectKey = path.join("records", dataVersion, relPath).replace(/\\/g, "/");
    const changed = copyIfChanged(
      path.join(dataDir, relPath),
      path.join(assetsFullDir, "records", dataVersion, relPath),
      previousManifest,
      newManifest,
      objectKey,
    );
    publishedRelPaths.add(objectKey);
    if (changed) shardCopied += 1;
    else shardSkipped += 1;
  }

  const { removedFiles, removedBytes } = pruneUnpublishedFiles(publishedRelPaths);

  // Verification (after pruning, before the pointer is written): every shard
  // the manifest's own shard index references, and every file of the current
  // client build, must exist in assets-full/.
  const missingShards = Array.from(collectManifestShardPaths(manifest)).filter(
    (relPath) => !fs.existsSync(path.join(assetsFullDir, "records", dataVersion, relPath)),
  );
  const missingClientFiles = Object.keys(newManifest.files)
    .filter((key) => key.startsWith("client:"))
    .map((key) => key.slice("client:".length))
    .filter((relPath) => !fs.existsSync(path.join(assetsFullDir, relPath)));
  if (missingShards.length > 0 || missingClientFiles.length > 0) {
    console.error(`\nVERIFICATION FAILED: ${missingShards.length} manifest-referenced shard(s) and ${missingClientFiles.length} client file(s) missing from assets-full/:`);
    console.error([...missingShards, ...missingClientFiles].slice(0, 10).join("\n"));
    throw new Error("assets-full/ is incomplete; records/latest/manifest.json was not written.");
  }

  // Stable "latest" pointer: a version-independent copy of manifest.json at
  // records/latest/manifest.json, always overwritten (never checksum-
  // skipped against itself, since its content — the current dataVersion —
  // is exactly what must change on every regeneration). The Worker fetches
  // this ONE fixed path on every cold start to discover which dataVersion's
  // shard tree to read, so publishing new data never requires a Worker
  // code redeploy, and the request-level cache key (which already includes
  // dataVersion) naturally busts itself once this pointer moves — no manual
  // cache purge needed (Phase 10).
  const latestDestPath = path.join(assetsFullDir, latestPointerRelPath);
  fs.mkdirSync(path.dirname(latestDestPath), { recursive: true });
  fs.copyFileSync(manifestPath, latestDestPath);

  fs.writeFileSync(publishManifestPath, JSON.stringify(newManifest, null, 2));

  const assetFileCount = walkFiles(assetsFullDir).length;
  console.log(`Data version: ${dataVersion}`);
  console.log(`Client bundle: ${clientCopied} copied, ${clientSkipped} unchanged`);
  console.log(`Data shards: ${shardCopied} copied, ${shardSkipped} unchanged`);
  console.log(`Stale files removed: ${removedFiles} (${(removedBytes / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Total files in assets-full/: ${assetFileCount}`);
  console.log(`Assets directory: ${path.relative(process.cwd(), assetsFullDir)}`);
  console.log(`\nVerification passed: all manifest-referenced shards and client files are present under assets-full/ (records/${dataVersion}/ only).`);
}

function main() {
  if (!fs.existsSync(distDir)) {
    throw new Error("dist/ not found — run `npm run build` at the repo root first.");
  }
  const manifestPath = path.join(dataDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("data/full-corpus/manifest.json not found — run generate-full-corpus.mjs first.");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  acquirePublishLock();
  try {
    publish(manifest, manifestPath);
  } finally {
    releasePublishLock();
  }
}

main();
