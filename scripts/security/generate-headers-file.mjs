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
  const reportOnlyValue = cspModule.buildCspReportOnlyHeaderValue();
  const enforcingValue = cspModule.buildCspEnforcingHeaderValue();
  return [
    "# GENERATED FILE — do not hand-edit.",
    "# Source of truth: src/security/csp.ts",
    "# Regenerate: node scripts/security/generate-headers-file.mjs",
    "# Verified fresh by: scripts/tests/security/test-csp-policy-parity.mjs",
    "#",
    "# Applies to every Cloudflare Static Assets response (the SPA shell,",
    "# JS/CSS bundles, prerendered SEO/hub/level-test/verb-list pages).",
    "# Worker-generated SSR word-page responses carry the same two policies",
    "# from workers/word-ssr/src/index.full.ts instead, since Static Assets'",
    "# _headers rules never apply to responses the Worker's own fetch",
    "# handler generates.",
    "#",
    "# Two headers, deliberately different scope (CSP Phase 2C — see",
    "# src/security/csp.ts for the full rationale):",
    "#   - Content-Security-Policy-Report-Only carries the FULL policy",
    "#     (including script-src) for visibility only — never blocks",
    "#     anything, including Cloudflare's own dynamic bot-management",
    "#     inline script, which cannot be allow-listed by hash.",
    "#   - Content-Security-Policy (real enforcement) carries only the",
    "#     directives already proven safe against production traffic —",
    "#     no script-src, no default-src (its absence is deliberate: with",
    "#     script-src omitted, default-src would otherwise fall back to",
    "#     governing scripts too, silently enforcing exactly what this",
    "#     header exists to avoid enforcing yet).",
    "/*",
    `  ${cspModule.CSP_REPORT_ONLY_HEADER_NAME}: ${reportOnlyValue}`,
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
