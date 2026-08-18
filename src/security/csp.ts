// Canonical FluentStellar production Content-Security-Policy definition —
// the single source of truth for both delivery surfaces:
//
//   - public/_headers (Cloudflare Static Assets: SPA shell, JS/CSS bundles,
//     prerendered SEO/hub/level-test/verb-list pages) — generated from this
//     module by scripts/security/generate-headers-file.mjs, never hand-edited.
//   - workers/word-ssr/src/index.full.ts (Cloudflare Worker: SSR word pages,
//     redirects, errors) — imports buildCspHeaderValue() directly.
//
// scripts/tests/security/test-csp-policy-parity.mjs asserts both surfaces
// stay semantically identical (parsed directive/value sets, not raw
// strings — public/_headers has its own file syntax around the value).
//
// Report-Only for now (CSP Phase 2B). CSP_HEADER_NAME is deliberately the
// Report-Only variant so violations are observed, not enforced, in
// production. Switching to the enforcing `Content-Security-Policy` header
// is a separate, later, deliberate decision — do not flip this constant as
// a side effect of an unrelated change.
//
// The three hash constants below are hardcoded, not computed at
// request/build time: Cloudflare Static Assets can't run code to produce
// `_headers`, and the Worker has no filesystem access to source files at
// runtime. They were produced by, and can be recomputed from source at any
// time with, scripts/security/compute-csp-hashes.mjs — never hand-typed or
// estimated. scripts/tests/security/test-csp-hash-freshness.mjs re-runs
// that script and fails if these constants ever drift from the actual
// source bytes (e.g. someone edits the language-detection script or a
// keyframes block without updating the hash here).

export const CSP_HEADER_NAME = "Content-Security-Policy-Report-Only";

// The one legitimate executable inline script remaining after CSP Phase 2A
// (which removed the two dynamic hydration `window.X=...` scripts): the
// static, byte-identical language-detection snippet shared by index.html
// and server-build/ssr-template.html.
export const LANG_DETECT_SCRIPT_HASH = "sha256-Re9krxasKuuFR9srOY0ldjUZQ6ei5cz5/nwx8rimshg=";

// The two distinct static inline <style> blocks found in the CSP audit.
// ListeningExercise.tsx and ConnectWordsExercise.tsx are byte-identical to
// each other (same shakeX @keyframes + .animate-shake rule), so one hash
// covers both; PracticeResults.tsx's practicedWordsCalloutFloat block is
// the second, distinct one.
export const SHAKE_KEYFRAMES_STYLE_HASH = "sha256-W7c31Hk4gEqMkZnmvf4wBbRcDG/orp5+PyF3H5UofE8=";
export const PRACTICED_WORDS_CALLOUT_STYLE_HASH = "sha256-yGlMKSofPsmE0+xvaWSrT4JiAECljkPnJoj3217uA88=";

// Production Supabase project origin (VITE_SUPABASE_URL) — the sole
// network origin every Auth/REST/RPC/Edge-Function call in the browser
// codebase targets. src/lib/supabaseAuth.ts's supabaseRequest is the only
// fetch() call site in the entire browser app, and it always targets
// `${SUPABASE_URL}${path}`. Not secret — this origin is already public in
// every browser network request the app makes; only the anon key (never
// referenced here) would need protecting, and CSP doesn't carry it.
export const SUPABASE_ORIGIN = "https://ogovfcmhwqjljawsoiru.supabase.co";

// Directive order here is the order both public/_headers and the Worker
// header emit it in — arbitrary, but kept stable so a diff of either
// generated/emitted value is easy to eyeball.
export const CSP_DIRECTIVES: readonly (readonly [string, readonly string[]])[] = [
  ["default-src", ["'self'"]],
  ["script-src", ["'self'", `'${LANG_DETECT_SCRIPT_HASH}'`]],
  [
    "style-src",
    [
      "'self'",
      "https://fonts.googleapis.com",
      `'${SHAKE_KEYFRAMES_STYLE_HASH}'`,
      `'${PRACTICED_WORDS_CALLOUT_STYLE_HASH}'`,
    ],
  ],
  ["img-src", ["'self'"]],
  ["font-src", ["'self'", "https://fonts.gstatic.com"]],
  ["connect-src", ["'self'", SUPABASE_ORIGIN]],
  ["frame-src", ["'none'"]],
  ["frame-ancestors", ["'none'"]],
  ["object-src", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["form-action", ["'self'"]],
];

// The exact header value both delivery surfaces must serve. `; ` between
// directives, a single space between a directive name and its source list,
// no trailing `;` — an arbitrary but fixed serialization; the parity test
// only cares about the *parsed* directive/value sets, not this exact
// formatting.
export function buildCspHeaderValue(): string {
  return CSP_DIRECTIVES.map(([directive, sources]) => `${directive} ${sources.join(" ")}`).join("; ");
}

// Parses any CSP header value (this module's own output, or a raw
// public/_headers line, or a live HTTP response header) into a
// directive -> Set<source> map, order-independent and dedup'd, so two
// differently-formatted but semantically identical policies compare equal.
export function parseCspHeaderValue(headerValue: string): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const rawDirective of headerValue.split(";")) {
    const trimmed = rawDirective.trim();
    if (!trimmed) continue;
    const [name, ...sources] = trimmed.split(/\s+/);
    result.set(name, new Set(sources));
  }
  return result;
}
