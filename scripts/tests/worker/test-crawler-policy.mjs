// Regression guards for the 2026-07-10 production Worker quota incident.
// Root cause (measured via wrangler tail against fluentstellar-production):
// external crawlers walking the ~75k-URL sitemap corpus of server-rendered
// word pages consumed the Free-plan Worker request quota, and SSR CPU over
// the Free-plan allowance produced "Worker exceeded CPU time limit" 503s.
// The fix is a robots.txt crawl policy for AI training/high-volume
// low-value crawlers while keeping normal search-engine discovery open.
// Updated 2026-08-15: low-risk AI search/user-fetch agents (OAI-SearchBot,
// ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot,
// Perplexity-User) were moved from blocked to allowed - they are either
// user-triggered (low crawl volume) or search/discovery crawlers we want
// for AI-search referral visibility. AI training crawlers and high-volume
// SEO/data crawlers remain blocked.
// These asserts keep the policy (and the invariants the audit proved) from
// silently regressing:
//   1. robots.txt still disallows measured heavy bots and AI training
//      crawlers, still allows the selected AI search/user-fetch agents and
//      search-engine crawlers, and still points at the sitemap.
//   2. The deployed copies of robots.txt (dist/, assets-full/) match public/.
//   3. wrangler.production.toml keeps the Worker name, asset-first serving
//      for everything except the selective /records/* run_worker_first
//      rule (see docs/deployment.md), and the host redirect off (no
//      apex/www redirect loops).
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
  "OAI-AdsBot",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "Google-Extended",
  "Google-CloudVertexBot",
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

// Low-risk AI search/user-fetch agents (2026-08-15 policy change): allowed
// via a dedicated group with an explicit "Allow: /" rule, not merely by
// falling through to the catch-all - this pins down the intentional policy
// so a future re-block (or an accidental removal that silently falls back
// to the catch-all) fails loudly here.
const MUST_ALLOW_DEDICATED_AI = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
];
for (const bot of MUST_ALLOW_DEDICATED_AI) {
  const group = groupFor(bot);
  assert.ok(
    group && !group.agents.includes("*"),
    `robots.txt must have a dedicated group for ${bot}`,
  );
  assert.ok(
    !group.rules.some((r) => r.type === "disallow" && r.value === "/"),
    `robots.txt must NOT disallow ${bot} - low-risk AI search/user-fetch agents stay allowed`,
  );
  assert.ok(
    group.rules.some((r) => r.type === "allow" && r.value === "/"),
    `robots.txt must explicitly allow ${bot} via "Allow: /"`,
  );
}

const MUST_ALLOW = [
  "Googlebot",
  "Bingbot",
  "YandexBot",
  "DuckDuckBot",
  "Applebot",
  ...MUST_ALLOW_DEDICATED_AI,
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
  path.join(rootDir, "workers", "word-ssr", "config", "wrangler.production.toml"),
  "utf8",
);
assert.match(wranglerToml, /^name = "fluentstellar-production"$/m, "Worker name must stay fluentstellar-production");
assert.match(wranglerToml, /^\[assets\]$/m, "production config must keep the [assets] block");
assert.match(wranglerToml, /^binding = "ASSETS"$/m, "assets binding must stay ASSETS");
assert.ok(
  !/run_worker_first\s*=\s*true\b/.test(wranglerToml),
  "run_worker_first must not be globally enabled: static assets must be served without invoking the Worker",
);
assert.match(
  wranglerToml,
  /^run_worker_first\s*=\s*\["\/records\/\*"\]$/m,
  "run_worker_first must stay scoped to exactly [\"/records/*\"] - denies direct record access without routing other static assets through the Worker",
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
// Zero-tolerance by default: a browser-side setInterval that ends up
// repeatedly hitting the Worker after hydration would reproduce the same
// request-volume failure mode as the 2026-07-10 incident (see file header),
// mirroring guard 4's server-side "no recursive fetch()" invariant from the
// browser side. One narrow, manually-audited exception is allowlisted below
// - every entry's setInterval was traced end-to-end and confirmed to touch
// no fetch/Supabase/API call anywhere in its call graph before being added;
// do not add another entry without doing the same.
const SAFE_BROWSER_INTERVAL_FILES = new Set([
  // Periodically re-checks (never accumulates) elapsed local active time
  // against a threshold, purely via Date.now() math plus sessionStorage/
  // localStorage reads/writes - see accountIntroPolicy.ts (explicitly
  // import-free at runtime) and accountIntroStorage.ts (plain Storage
  // access only). No network call anywhere in its reachable code.
  "src/app/hooks/useAccountIntroSeoEngagement.ts",
]);

function toPosixRelativePath(file) {
  return path.relative(rootDir, file).split(path.sep).join("/");
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}
for (const file of walk(path.join(rootDir, "src"))) {
  const relativePath = toPosixRelativePath(file);
  if (SAFE_BROWSER_INTERVAL_FILES.has(relativePath)) {
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  assert.ok(
    !/setInterval\s*\(/.test(source),
    `${relativePath} uses setInterval - no request polling loops allowed (only src/app/hooks/useAccountIntroSeoEngagement.ts is allowlisted, and only after a manual network-I/O audit)`,
  );
}

// Stale-allowlist guard: every entry above must still exist and still
// actually use setInterval, so a future refactor that removes the interval
// (or the file) surfaces as a failure prompting removal of the now-obsolete
// entry, instead of the exception silently outliving its justification.
for (const relativePath of SAFE_BROWSER_INTERVAL_FILES) {
  const filePath = path.join(rootDir, ...relativePath.split("/"));
  assert.ok(
    fs.existsSync(filePath),
    `SAFE_BROWSER_INTERVAL_FILES entry "${relativePath}" no longer exists - remove it`,
  );
  assert.ok(
    /setInterval\s*\(/.test(fs.readFileSync(filePath, "utf8")),
    `SAFE_BROWSER_INTERVAL_FILES entry "${relativePath}" no longer uses setInterval - remove the now-obsolete allowlist entry`,
  );
}

console.log("crawler-policy regression guards passed");
