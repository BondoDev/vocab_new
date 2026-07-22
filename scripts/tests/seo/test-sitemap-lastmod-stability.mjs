// Regression guards for sitemap <lastmod> churn (2026-07-12 incident).
// generate-sitemap.mjs used to stamp the build date on every URL of every
// sitemap, so each deploy told crawlers the entire ~84,873-URL corpus
// changed — triggering full-corpus recrawls that consumed the Free-plan
// Worker request quota.
//
// Owner policy: lastmod is MANUAL-ONLY. It never advances automatically —
// not on rebuilds and not on data changes. It changes only when the owner
// edits scripts/data/sitemap-lastmod-ledger.json or runs the generator with
// an explicit SITEMAP_LASTMOD_BUMP (see scripts/lib/sitemap-lastmod.mjs).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createLastmodLedger } from "../../lib/sitemap-lastmod.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// --- 1. ledger behavior (pure unit checks) ---------------------------------
const tmpLedger = path.join(os.tmpdir(), `sitemap-ledger-test-${process.pid}.json`);
try {
  const dayOne = createLastmodLedger(tmpLedger, { today: "2026-01-01" });
  assert.equal(dayOne.resolve("sitemaps/a.xml", "fp-1"), "2026-01-01", "first sighting stamps today");
  dayOne.save();

  const dayTwo = createLastmodLedger(tmpLedger, { today: "2026-02-02" });
  assert.equal(
    dayTwo.resolve("sitemaps/a.xml"),
    "2026-01-01",
    "rebuild on a later day must keep the frozen lastmod",
  );
  assert.equal(dayTwo.resolve("sitemaps/b.xml"), "2026-02-02", "new file stamps the current day once");
  dayTwo.save();

  // No automatic advancement, ever: another day, same files — dates frozen.
  const dayThree = createLastmodLedger(tmpLedger, { today: "2026-03-03" });
  assert.equal(dayThree.resolve("sitemaps/a.xml"), "2026-01-01", "lastmod must never auto-advance");
  assert.equal(dayThree.resolve("sitemaps/b.xml"), "2026-02-02", "lastmod must never auto-advance");
  dayThree.save();

  // Explicit owner bump: only the named file advances.
  const bumped = createLastmodLedger(tmpLedger, { today: "2026-04-04", bump: "sitemaps/a.xml" });
  assert.equal(bumped.resolve("sitemaps/a.xml"), "2026-04-04", "explicitly bumped file stamps today");
  assert.equal(bumped.resolve("sitemaps/b.xml"), "2026-02-02", "un-bumped files stay frozen");
  bumped.save();

  // Explicit bump-all advances everything.
  const bumpedAll = createLastmodLedger(tmpLedger, { today: "2026-05-05", bump: "all" });
  assert.equal(bumpedAll.resolve("sitemaps/a.xml"), "2026-05-05", "bump=all stamps every file");
  bumpedAll.save();

  // Pruning: entries for files no longer generated are dropped on save.
  const persisted = JSON.parse(fs.readFileSync(tmpLedger, "utf8"));
  assert.ok(!persisted.files["sitemaps/b.xml"], "entries for files no longer generated are pruned");
  assert.equal(persisted.files["sitemaps/a.xml"].lastmod, "2026-05-05");
} finally {
  fs.rmSync(tmpLedger, { force: true });
}

// --- 2. generator must use the ledger, never a bare build-date stamp -------
const generatorSource = fs.readFileSync(path.join(rootDir, "scripts", "generation", "generate-sitemap.mjs"), "utf8");
assert.ok(
  generatorSource.includes("createLastmodLedger"),
  "generate-sitemap.mjs must resolve lastmod through the ledger",
);
assert.ok(
  !/new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/.test(generatorSource),
  "generate-sitemap.mjs must not stamp the build date directly (lastmod churn regression)",
);

// --- 3. committed artifacts stay consistent with the ledger ----------------
const ledgerPath = path.join(rootDir, "scripts", "data", "sitemap-lastmod-ledger.json");
assert.ok(fs.existsSync(ledgerPath), "committed sitemap-lastmod ledger missing — run npm run sitemap");
const ledger = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));

const indexXml = fs.readFileSync(path.join(rootDir, "public", "sitemap.xml"), "utf8");
const indexEntries = [...indexXml.matchAll(/<loc>[^<]*\/(sitemaps\/[^<]+\.xml)<\/loc>\s*<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g)];
assert.ok(indexEntries.length > 0, "sitemap.xml index has no parseable child entries");
for (const [, fileName, lastmod] of indexEntries) {
  const entry = ledger.files[fileName];
  assert.ok(entry, `ledger has no entry for ${fileName}`);
  assert.equal(entry.lastmod, lastmod, `index lastmod for ${fileName} must match the ledger`);

  const childXml = fs.readFileSync(path.join(rootDir, "public", ...fileName.split("/")), "utf8");
  const childDates = new Set([...childXml.matchAll(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g)].map((m) => m[1]));
  assert.deepEqual(
    [...childDates],
    [entry.lastmod],
    `${fileName} must carry exactly its ledger lastmod on every URL`,
  );
}

console.log(`sitemap lastmod manual-only guards passed (${indexEntries.length} child sitemaps consistent with ledger)`);
