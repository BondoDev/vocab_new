// EXPERIMENTAL — Node-only local test harness for loading the record store
// off local disk with node:fs. This is intentionally SEPARATE from renderer.mjs
// (which never touches node:fs). In a real Cloudflare Worker this file would
// be replaced by a KV/R2/D1 fetch; renderer.mjs itself would not change,
// since it only ever receives already-loaded plain objects.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const recordsDir = path.join(__dirname, "records");

export function loadStore() {
  const concepts = JSON.parse(fs.readFileSync(path.join(recordsDir, "concepts.english.json"), "utf8"));
  const uiOverlay = JSON.parse(fs.readFileSync(path.join(recordsDir, "ui-overlay.en.english.json"), "utf8"));
  const browseShard = JSON.parse(fs.readFileSync(path.join(recordsDir, "browse.english.a1.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(recordsDir, "manifest.json"), "utf8"));
  return { concepts, uiOverlay, browseShard, manifest };
}
