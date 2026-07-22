import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const stageDir = path.join(rootDir, ".tmp-word-ssr-package");

const requiredFiles = [
  "server/word-ssr-handler.mjs",
  "server/word-ssr-http.mjs",
  "server/word-ssr-runtime.mjs",
  "server-build/entry-server.js",
  "server-build/ssr-template.html",
];

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

async function ensureRequiredFiles() {
  for (const relativePath of requiredFiles) {
    const absolutePath = path.join(rootDir, relativePath);
    await fsp.access(absolutePath);
  }
}

async function copyFileToStage(relativePath) {
  const sourcePath = path.join(rootDir, relativePath);
  const destinationPath = path.join(stageDir, relativePath);
  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
  await fsp.copyFile(sourcePath, destinationPath);
}

async function copyDirectoryToStage(relativePath) {
  const sourcePath = path.join(rootDir, relativePath);
  const destinationPath = path.join(stageDir, relativePath);
  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
  await fsp.cp(sourcePath, destinationPath, { recursive: true });
}

async function prepareStageDirectory() {
  await fsp.rm(stageDir, { recursive: true, force: true });
  await fsp.mkdir(stageDir, { recursive: true });

  await copyFileToStage("package.json");
  await copyFileToStage("server/word-ssr-handler.mjs");
  await copyFileToStage("server/word-ssr-http.mjs");
  await copyFileToStage("server/word-ssr-runtime.mjs");
  await copyDirectoryToStage("server-build");
}

async function verifyStageImport() {
  const runtimeUrl = pathToFileURL(path.join(stageDir, "server", "word-ssr-runtime.mjs")).href;
  const runtimeModule = await import(runtimeUrl);
  const handlerUrl = pathToFileURL(path.join(stageDir, "server", "word-ssr-handler.mjs")).href;
  const handlerModule = await import(handlerUrl);

  assert.equal(typeof runtimeModule.handleWordSsrPathname, "function");
  assert.equal(typeof handlerModule.handleInternalWordSsrRequest, "function");

  const response = await runtimeModule.handleWordSsrPathname(
    "/en/english-word-about--A1-00001",
    "https://www.fluentstellar.com",
  );

  assert.equal(response.status, 200);
  assert.match(response.body, /<title>.*about.*<\/title>/i);
  assert.match(response.body, /<link rel="canonical" href="https:\/\/www\.fluentstellar\.com\/en\/english-word-about--A1-00001"/i);

  const blockedApiResponse = await handlerModule.handleInternalWordSsrRequest({
    method: "GET",
    url: "/api/word-ssr-internal?pathname=/en/english-word-about--A1-00001",
    query: {
      pathname: "/en/english-word-about--A1-00001",
    },
    headers: {},
  });
  assert.equal(blockedApiResponse.status, 200);
  assert.match(blockedApiResponse.body, /<title>.*about.*<\/title>/i);
  assert.match(
    blockedApiResponse.body,
    /<link rel="canonical" href="https:\/\/www\.fluentstellar\.com\/en\/english-word-about--A1-00001"/i,
  );

  const canonicalApiResponse = await handlerModule.handleInternalWordSsrRequest({
    method: "GET",
    url: "/api/word-ssr-internal?pathname=/en/english-word-about--A1-00001",
    query: {
      pathname: "/en/english-word-about--A1-00001",
    },
    headers: {
      "x-matched-path": "/en/english-word-about--A1-00001",
    },
  });
  assert.equal(canonicalApiResponse.status, 200);
  assert.match(canonicalApiResponse.body, /<link rel="canonical" href="https:\/\/www\.fluentstellar\.com\/en\/english-word-about--A1-00001"/i);
}

function verifyNoRetryPathDependencies() {
  const filesToCheck = [
    readText("server/word-ssr-runtime.mjs"),
    readText("src/entry-server.tsx"),
  ];

  for (const content of filesToCheck) {
    assert.ok(!/dist-retry-|server-build-retry-/i.test(content));
  }
}

function getDirectorySize(directoryPath) {
  let total = 0;

  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      total += getDirectorySize(absolutePath);
      continue;
    }

    total += fs.statSync(absolutePath).size;
  }

  return total;
}

async function main() {
  await ensureRequiredFiles();
  verifyNoRetryPathDependencies();
  await prepareStageDirectory();
  await verifyStageImport();

  const packagedSizeBytes = getDirectorySize(stageDir);
  const serverBuildSizeBytes = getDirectorySize(path.join(rootDir, "server-build"));

  console.log(
    JSON.stringify(
      {
        verified: true,
        requiredFiles,
        packagedSizeBytes,
        serverBuildSizeBytes,
        stageDir,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await fsp.rm(stageDir, { recursive: true, force: true });
});
