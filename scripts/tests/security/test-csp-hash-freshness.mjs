/**
 * CSP hash freshness guard.
 *
 * src/security/csp.ts hardcodes three CSP hashes (the language-detection
 * <script>'s hash, and the two distinct inline <style> block hashes) because
 * neither Cloudflare Static Assets' _headers file nor the Worker at request
 * time can run code against source files to compute them. This test
 * re-derives all three straight from current source bytes via
 * scripts/security/compute-csp-hashes.mjs (never re-typing/estimating a
 * hash itself) and fails if a source edit — e.g. someone tweaks whitespace
 * inside the language-detection script, or edits a keyframes block — ever
 * makes the hardcoded constants in csp.ts stale without updating them.
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

    console.log("\n[2] Inline <style> block hashes match current source");
    test("csp.ts's SHAKE_KEYFRAMES_STYLE_HASH matches a fresh hash of ListeningExercise.tsx's inline style", () => {
      assert.equal(csp.SHAKE_KEYFRAMES_STYLE_HASH, fresh.style.byOwner.ListeningExercise);
    });
    test("ConnectWordsExercise.tsx's inline style is still byte-identical to ListeningExercise.tsx's (one shared hash)", () => {
      assert.equal(
        fresh.style.byOwner.ConnectWordsExercise,
        fresh.style.byOwner.ListeningExercise,
        "The two shakeX keyframe blocks used to be byte-identical (covered by one CSP hash) — one of them " +
          "changed. Either restore identical content or add a second distinct hash to csp.ts's style-src.",
      );
    });
    test("csp.ts's PRACTICED_WORDS_CALLOUT_STYLE_HASH matches a fresh hash of PracticeResults.tsx's inline style", () => {
      assert.equal(csp.PRACTICED_WORDS_CALLOUT_STYLE_HASH, fresh.style.byOwner.PracticeResults);
    });

    console.log("\n[3] No unexpected extra distinct style content");
    test("exactly 2 distinct inline <style> hashes exist across the 3 known source files", () => {
      assert.equal(
        fresh.style.unique.length,
        2,
        "A source file's inline <style> content changed to something not matching either known hash — " +
          "recompute and update csp.ts's style-src hash list.",
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
