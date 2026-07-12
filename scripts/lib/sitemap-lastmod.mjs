// Manual-only <lastmod> resolution for generated sitemaps.
//
// Why this exists (2026-07-12 traffic incident): generate-sitemap.mjs used
// to stamp `new Date()` on every URL of every generated sitemap, so each
// build/deploy re-announced the entire ~84,873-URL corpus as "changed
// today". Crawlers that honor <lastmod> (Googlebot, GPTBot, YandexBot, …)
// responded by recrawling the full corpus after every deploy — each such
// crawl is ~85k Worker invocations against a 100k/day Free-plan quota.
//
// Policy (owner decision, 2026-07-12): lastmod NEVER advances
// automatically — not on rebuilds, and not on data changes. It changes only
// when the owner explicitly asks:
//   - edit scripts/data/sitemap-lastmod-ledger.json by hand, or
//   - run the generator with SITEMAP_LASTMOD_BUMP="all" (every file) or
//     SITEMAP_LASTMOD_BUMP="sitemaps/sitemap-words-en-fr.xml,..." (specific
//     file keys) to stamp today's date on the named files.
// A file with no ledger entry yet (genuinely new sitemap) is stamped once
// with today's date and then frozen.
import fs from "node:fs";
import path from "node:path";

export function createLastmodLedger(ledgerPath, { today = new Date().toISOString().slice(0, 10), bump = "" } = {}) {
  let files = {};
  if (fs.existsSync(ledgerPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
      if (parsed && typeof parsed.files === "object" && parsed.files !== null) files = parsed.files;
    } catch {
      files = {};
    }
  }
  const bumpAll = String(bump).trim().toLowerCase() === "all";
  const bumpKeys = new Set(
    bumpAll ? [] : String(bump).split(",").map((s) => s.trim()).filter(Boolean),
  );
  const resolvedKeys = new Set();

  return {
    /**
     * Returns the frozen lastmod (YYYY-MM-DD) for fileKey. Stamps `today`
     * only for a file with no ledger entry yet, or when the owner
     * explicitly requested a bump for it.
     */
    resolve(fileKey) {
      resolvedKeys.add(fileKey);
      const entry = files[fileKey];
      const explicitlyBumped = bumpAll || bumpKeys.has(fileKey);
      if (!explicitlyBumped && entry && /^\d{4}-\d{2}-\d{2}$/.test(entry.lastmod)) {
        return entry.lastmod;
      }
      files[fileKey] = { lastmod: today };
      return today;
    },

    /** Persist the ledger, pruning entries for files no longer generated. */
    save() {
      const pruned = {};
      for (const key of Object.keys(files).sort()) {
        if (resolvedKeys.has(key)) pruned[key] = { lastmod: files[key].lastmod };
      }
      fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
      fs.writeFileSync(ledgerPath, JSON.stringify({ files: pruned }, null, 2) + "\n");
    },
  };
}
