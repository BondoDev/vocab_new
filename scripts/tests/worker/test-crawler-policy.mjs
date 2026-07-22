// Regression guards for the 2026-07-10 production Worker quota incident.
// Root cause (measured via wrangler tail against fluentstellar-production):
// external crawlers walking the ~75k-URL sitemap corpus of server-rendered
// word pages consumed the Free-plan Worker request quota, and SSR CPU over
// the Free-plan allowance produced "Worker exceeded CPU time limit" 503s.
// The fix is a robots.txt crawl policy for AI crawlers and high-volume
// low-value crawlers while keeping normal search-engine discovery open.
// These asserts keep the policy (and the invariants the audit proved) from
// silently regressing:
//   1. robots.txt still disallows measured heavy bots and AI crawlers, still
//      allows search-engine crawlers through the catch-all, and still points at
//      the sitemap.
//   2. The deployed copies of robots.txt (dist/, assets-full/) match public/.
//   3. wrangler.production.toml keeps the Worker name, the asset-first
//      serving default (no run_worker_first), and the host redirect off
//      (no apex/www redirect loops).
//   4. Worker runtime sources never call global fetch() (no recursive
//      self-requests; data access goes through the ASSETS binding only).
//   5. Browser code has no setInterval polling (no hydration request loops).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// --- 1. robots.txt policy -------------------------------------------------
const robotsPath = path.join(rootDir, "public", "robots.txt");
const robots = fs.readFileSync(robotsPath, "utf8");

function parseRobotsGroups(text) {
  const groups = [];
  let current = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [rawField, ...rest] = line.split(":");
    const field = rawField.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (field === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "disallow" || field === "allow") && current) {
      current.rules.push({ type: field, value });
    }
  }
  return groups;
}

const groups = parseRobotsGroups(robots);
const groupFor = (agent) =>
  groups.find((g) => g.agents.includes(agent.toLowerCase())) ??
  groups.find((g) => g.agents.includes("*"));

const MUST_DISALLOW = [
  "AhrefsBot",
  "SemrushBot",
  "DataForSeoBot",
  "Amazonbot",
  "Amzn-SearchBot",
  "PetalBot",
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "OAI-AdsBot",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "anthropic-ai",
  "Claude-Web",
  "Google-Extended",
  "Google-CloudVertexBot",
  "PerplexityBot",
  "Perplexity-User",
  "CCBot",
  "Bytespider",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "Meta-ExternalFetcher",
];
for (const bot of MUST_DISALLOW) {
  const group = groupFor(bot);
  assert.ok(
    group && !group.agents.includes("*"),
    `robots.txt must have a dedicated group for ${bot}`,
  );
  assert.ok(
    group.rules.some((r) => r.type === "disallow" && r.value === "/"),
    `robots.txt must fully disallow ${bot}`,
  );
}

const MUST_ALLOW = [
  "Googlebot",
  "Bingbot",
  "YandexBot",
  "DuckDuckBot",
  "Applebot",
];
for (const bot of MUST_ALLOW) {
  const group = groupFor(bot);
  assert.ok(group, `robots.txt must resolve a group for ${bot}`);
  assert.ok(
    !group.rules.some((r) => r.type === "disallow" && r.value === "/"),
    `robots.txt must NOT disallow ${bot} - allowed crawlers stay open`,
  );
}

const catchAll = groups.find((g) => g.agents.includes("*"));
assert.ok(catchAll, "robots.txt must keep a catch-all User-agent: * group");
assert.ok(
  !catchAll.rules.some((r) => r.type === "disallow" && r.value === "/"),
  "catch-all group must not become a global Disallow",
);
assert.match(
  robots,
  /^Sitemap:\s*https:\/\/www\.fluentstellar\.com\/sitemap\.xml\s*$/m,
  "robots.txt must keep the sitemap pointer",
);

// --- 2. deployed copies stay in sync --------------------------------------
for (const rel of ["dist/robots.txt", "workers/word-ssr/assets-full/robots.txt"]) {
  const copyPath = path.join(rootDir, ...rel.split("/"));
  assert.ok(fs.existsSync(copyPath), `${rel} missing - run the publish pipeline`);
  assert.equal(
    fs.readFileSync(copyPath, "utf8").replace(/\r\n/g, "\n"),
    robots.replace(/\r\n/g, "\n"),
    `${rel} must match public/robots.txt (stale deploy artifact)`,
  );
}

// --- 3. production wrangler config invariants ------------------------------
const wranglerToml = fs.readFileSync(
  path.join(rootDir, "workers", "word-ssr", "wrangler.production.toml"),
  "utf8",
);
assert.match(wranglerToml, /^name = "fluentstellar-production"$/m, "Worker name must stay fluentstellar-production");
assert.match(wranglerToml, /^\[assets\]$/m, "production config must keep the [assets] block");
assert.match(wranglerToml, /^binding = "ASSETS"$/m, "assets binding must stay ASSETS");
assert.ok(
  !/run_worker_first\s*=\s*(true|\[)/.test(wranglerToml),
  "run_worker_first must stay off: static assets must be served without invoking the Worker",
);
assert.match(
  wranglerToml,
  /^ENABLE_CANONICAL_HOST_REDIRECT = "false"$/m,
  "canonical-host redirect must stay disabled (redirect-loop guard)",
);

// --- 4. no global fetch() in Worker runtime sources ------------------------
const workerSrcDir = path.join(rootDir, "workers", "word-ssr", "src");
for (const file of fs.readdirSync(workerSrcDir)) {
  if (!/\.(ts|tsx|mjs)$/.test(file)) continue;
  const source = fs.readFileSync(path.join(workerSrcDir, file), "utf8");
  // `.fetch(` (binding calls) and `async fetch(` (the exported handler's own
  // definition) are fine; a bare global `fetch(` call is not.
  const bareFetch = source.match(/(?<!async )(?<![.\w])fetch\s*\(/);
  assert.ok(
    !bareFetch,
    `${file} calls global fetch() - Worker must only use the ASSETS binding (recursive-request guard)`,
  );
}

// --- 5. no polling loops in browser code -----------------------------------
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}
for (const file of walk(path.join(rootDir, "src"))) {
  const source = fs.readFileSync(file, "utf8");
  assert.ok(
    !/setInterval\s*\(/.test(source),
    `${path.relative(rootDir, file)} uses setInterval - no request polling loops allowed`,
  );
}

console.log("crawler-policy regression guards passed");
