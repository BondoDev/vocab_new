/**
 * CSP hash freshness guard.
 *
 * src/security/csp.ts hardcodes LANG_DETECT_SCRIPT_HASH because neither
 * Cloudflare Static Assets' `_headers` file nor the Worker at request time
 * can run code against source files to compute it. This test re-derives it
 * straight from current source bytes via
 * scripts/security/compute-csp-hashes.mjs (never re-typing/estimating a
 * hash itself) and fails if a source edit — e.g. someone tweaks whitespace
 * inside the language-detection script — ever makes the hardcoded constant
 * in csp.ts stale without updating it.
 *
 * The two static inline <style> block hashes computed by compute-csp-
 * hashes.mjs are checked here too, but only as an informational sanity
 * check (still exactly 2 distinct blocks, still byte-identical to each
 * other where expected) — CSP Phase 2B.1 found style-src needs
 * 'unsafe-inline' instead (see csp.ts's CSP_ALLOWS_UNSAFE_INLINE_STYLES),
 * so these hashes are no longer part of the active policy and this file
 * does not assert against any csp.ts constant for them.
 *
 * Run: node scripts/tests/security/test-csp-hash-freshness.mjs
 * No build required — reads repo source files directly.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "../../lib/compileTs.mjs";
import { computeAllCspHashes } from "../../security/compute-csp-hashes.mjs";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${name}`);
    console.error(`       ${err.message}`);
    failed++;
  }
}

async function main() {
  const fresh = computeAllCspHashes();

  const compiled = compileTsToCommonJs(".tmp-csp-hash-freshness", [
    path.join(ROOT_DIR, "src", "security", "csp.ts"),
  ]);

  try {
    const csp = compiled.require("src/security/csp");

    console.log("\n[1] Language-detection script hash matches current source");
    test("csp.ts's LANG_DETECT_SCRIPT_HASH matches a fresh hash of index.html's inline script", () => {
      assert.equal(
        csp.LANG_DETECT_SCRIPT_HASH,
        fresh.script.langDetectScript,
        "src/security/csp.ts's LANG_DETECT_SCRIPT_HASH is stale — someone edited the language-detection " +
          "<script> in index.html without recomputing its CSP hash. Run " +
          "`node scripts/security/compute-csp-hashes.mjs` and update the constant.",
      );
    });

    console.log("\n[2] Inline <style> blocks (informational only — not part of the active policy, see file header)");
    test("ConnectWordsExercise.tsx's inline style is still byte-identical to ListeningExercise.tsx's", () => {
      assert.equal(
        fresh.style.byOwner.ConnectWordsExercise,
        fresh.style.byOwner.ListeningExercise,
      );
    });
    test("exactly 2 distinct inline <style> blocks exist across the 3 known source files", () => {
      assert.equal(
        fresh.style.unique.length,
        2,
        "A source file's inline <style> content changed shape — worth knowing about even though style-src " +
          "no longer hashes these (it uses 'unsafe-inline' instead; see src/security/csp.ts).",
      );
    });

    console.log(`\n─────────────────────────────────────────`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`─────────────────────────────────────────\n`);

    if (failed > 0) {
      process.exitCode = 1;
    } else {
      console.log("CSP hash freshness tests passed");
    }
  } finally {
    compiled.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
