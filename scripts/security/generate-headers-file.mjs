// Generates public/_headers from the canonical CSP policy in
// src/security/csp.ts — never hand-edit public/_headers directly.
//
// public/_headers is copied verbatim by Vite into dist/ (Vite copies
// public/ contents into the build output root), and workers/word-ssr/
// generation/publish-shards.mjs then walks all of dist/ into assets-full/,
// which is what Cloudflare Static Assets actually serves — so this file
// ends up exactly where Cloudflare's `_headers` convention expects it,
// with no extra wiring.
//
// Run: node scripts/security/generate-headers-file.mjs
// Verified fresh by scripts/tests/security/test-csp-policy-parity.mjs,
// which re-runs this generator and fails if the committed public/_headers
// doesn't match.
import fs from "node:fs";
import path from "node:path";
import { compileTsToCommonJs, ROOT_DIR } from "../lib/compileTs.mjs";

const OUTPUT_PATH = path.join(ROOT_DIR, "public", "_headers");

export function buildHeadersFileContent(cspModule) {
  const enforcingValue = cspModule.buildCspEnforcingHeaderValue();
  return [
    "# GENERATED FILE — do not hand-edit.",
    "# Source of truth: src/security/csp.ts",
    "# Regenerate: node scripts/security/generate-headers-file.mjs",
    "# Verified fresh by: scripts/tests/security/test-csp-policy-parity.mjs",
    "#",
    "# Applies to every Cloudflare Static Assets response (the SPA shell,",
    "# JS/CSS bundles, prerendered SEO/hub/level-test/verb-list pages).",
    "# Worker-generated SSR word-page responses carry the same policy from",
    "# workers/word-ssr/src/index.full.ts instead, since Static Assets'",
    "# _headers rules never apply to responses the Worker's own fetch",
    "# handler generates.",
    "#",
    "# CSP Phase 2C.2: production sends only the real, enforcing",
    "# Content-Security-Policy header — the directives already proven safe",
    "# against production traffic. No script-src, no default-src (its",
    "# absence is deliberate: with script-src omitted, default-src would",
    "# otherwise fall back to governing scripts too, silently enforcing",
    "# exactly what this header exists to avoid enforcing yet — see",
    "# src/security/csp.ts for the full rationale, including why script",
    "# sources aren't enforced: Cloudflare JavaScript Detections injects a",
    "# per-request-unique inline script that can never be hash-allowed).",
    "#",
    "# The full strict policy (including script-src) that used to also ship",
    "# here as Content-Security-Policy-Report-Only through Phase 2C.1 is",
    "# still defined and tested (src/security/csp.ts's CSP_AUDIT_DIRECTIVES /",
    "# buildCspAuditHeaderValue()) but deliberately not emitted anymore —",
    "# its only remaining signal was permanent, already-understood Cloudflare",
    "# noise. Re-enable it for a future audit by adding a second header line",
    "# here the same way the enforcing one is added below.",
    "/*",
    `  ${cspModule.CSP_ENFORCING_HEADER_NAME}: ${enforcingValue}`,
    "",
  ].join("\n");
}

async function main() {
  const compiled = compileTsToCommonJs(".tmp-generate-headers-file", [
    path.join(ROOT_DIR, "src", "security", "csp.ts"),
  ]);
  try {
    const cspModule = compiled.require("src/security/csp");
    const content = buildHeadersFileContent(cspModule);
    fs.writeFileSync(OUTPUT_PATH, content, "utf8");
    console.log(`Wrote ${path.relative(ROOT_DIR, OUTPUT_PATH)} (${Buffer.byteLength(content, "utf8")} bytes).`);
  } finally {
    compiled.cleanup();
  }
}

main().catch((error) => {
  console.error("Failed to generate public/_headers:", error);
  process.exitCode = 1;
});
