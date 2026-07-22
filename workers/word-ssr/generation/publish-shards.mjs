// STAGING-ONLY publish pipeline (Phase 5, revised: Cloudflare Workers Static
// Assets instead of R2 — no R2 account calls, no billing). Assembles
// assets-full/, the single combined directory wrangler.full.toml's
// `[assets] directory` points at:
//   - a copy of ../../../dist/**     (the existing production client bundle —
//                                      same files the sample Worker already
//                                      serves via its own [assets] binding)
//   - records/{dataVersion}/**       (the generated shard tree from
//                                      generate-full-corpus.mjs)
//   - records/latest/manifest.json   (stable version pointer — see the
//                                      comment in the manifest-copy step)
//
// Run: node workers/word-ssr/generation/publish-shards.mjs
// Idempotent/incremental: skips any file whose SHA-256 already matches the
// prior run's record in data/publish-manifest.json.
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

function main() {
  if (!fs.existsSync(distDir)) {
    throw new Error("dist/ not found — run `npm run build` at the repo root first.");
  }
  const manifestPath = path.join(dataDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("data/full-corpus/manifest.json not found — run generate-full-corpus.mjs first.");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const dataVersion = manifest.dataVersion;
  writeClientAssetsManifest();

  const previousManifest = fs.existsSync(publishManifestPath)
    ? JSON.parse(fs.readFileSync(publishManifestPath, "utf8"))
    : { files: {} };
  const newManifest = { publishedAt: new Date().toISOString(), dataVersion, files: {} };

  let clientCopied = 0;
  let clientSkipped = 0;
  for (const relPath of walkFiles(distDir)) {
    const changed = copyIfChanged(
      path.join(distDir, relPath),
      path.join(assetsFullDir, relPath),
      previousManifest,
      newManifest,
      `client:${relPath.replace(/\\/g, "/")}`,
    );
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
    if (changed) shardCopied += 1;
    else shardSkipped += 1;
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
  const latestDestPath = path.join(assetsFullDir, "records", "latest", "manifest.json");
  fs.mkdirSync(path.dirname(latestDestPath), { recursive: true });
  fs.copyFileSync(manifestPath, latestDestPath);

  fs.writeFileSync(publishManifestPath, JSON.stringify(newManifest, null, 2));

  const assetFileCount = walkFiles(assetsFullDir).length;
  console.log(`Data version: ${dataVersion}`);
  console.log(`Client bundle: ${clientCopied} copied, ${clientSkipped} unchanged`);
  console.log(`Data shards: ${shardCopied} copied, ${shardSkipped} unchanged`);
  console.log(`Total files in assets-full/: ${assetFileCount}`);
  console.log(`Assets directory: ${path.relative(process.cwd(), assetsFullDir)}`);

  // Verification: every shard the manifest's own shard index references
  // must exist under assets-full/records/{dataVersion}/...
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
  const missing = Array.from(expectedRelPaths).filter(
    (relPath) => !fs.existsSync(path.join(assetsFullDir, "records", dataVersion, relPath)),
  );
  if (missing.length > 0) {
    console.error(`\nVERIFICATION FAILED: ${missing.length} manifest-referenced shard(s) missing from assets-full/:`);
    console.error(missing.slice(0, 10).join("\n"));
    process.exitCode = 1;
  } else {
    console.log(`\nVerification passed: all ${expectedRelPaths.size} manifest-referenced shards are present under assets-full/records/${dataVersion}/.`);
  }
  if (!fs.existsSync(latestDestPath)) {
    console.error("VERIFICATION FAILED: records/latest/manifest.json pointer missing.");
    process.exitCode = 1;
  }
}

main();
