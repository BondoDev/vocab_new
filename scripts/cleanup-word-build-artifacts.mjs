import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const generatedTypeScriptArtifacts = [
  path.join(rootDir, "dist", "vocabularyLevels", "index.ts"),
  path.join(rootDir, "server-build", "vocabularyLevels", "index.ts"),
];

await Promise.all(
  generatedTypeScriptArtifacts.map((artifactPath) =>
    fs.rm(artifactPath, { force: true }),
  ),
);

const serverTemplatePath = path.join(rootDir, "server-build", "ssr-template.html");
await fs.copyFile(path.join(rootDir, "dist", "index.html"), serverTemplatePath);
