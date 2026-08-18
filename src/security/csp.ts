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
// The hash/prefix constants below are hardcoded, not computed at
// request/build time: Cloudflare Static Assets can't run code to produce
// `_headers`, and the Worker has no filesystem access to source files at
// runtime. LANG_DETECT_SCRIPT_HASH was produced by, and can be recomputed
// from source at any time with, scripts/security/compute-csp-hashes.mjs —
// never hand-typed or estimated. scripts/tests/security/test-csp-hash-
// freshness.mjs re-runs that script and fails if the constant ever drifts
// from the actual source bytes (e.g. someone edits the language-detection
// script without updating the hash here).

export const CSP_HEADER_NAME = "Content-Security-Policy-Report-Only";

// The one legitimate executable inline script remaining after CSP Phase 2A
// (which removed the two dynamic hydration `window.X=...` scripts): the
// static, byte-identical language-detection snippet shared by index.html
// and server-build/ssr-template.html.
export const LANG_DETECT_SCRIPT_HASH = "sha256-Re9krxasKuuFR9srOY0ldjUZQ6ei5cz5/nwx8rimshg=";

// CSP Phase 2B.1 (production Report-Only triage) found style-src's earlier
// two static-hash allowance (ListeningExercise.tsx/ConnectWordsExercise.tsx's
// shared shakeX block, PracticeResults.tsx's practicedWordsCalloutFloat
// block) was never sufficient: React's `style={{...}}` prop serializes to a
// real `style="..."` HTML attribute in server-rendered/prerendered markup
// (not a CSSOM-only write CSP ignores — that nuance only ever applied to
// client-side re-renders of an already-mounted node, never to the initial
// SSR/hydration markup, which is how virtually every page here first
// loads), and the app has ~100 such call sites across ~30 files, many
// genuinely dynamic (state/props/computed layout values — exam progress
// percentages, selection-driven colors, scroll-state widths), not a small
// fixed set hashing could realistically cover. Confirmed live in
// production: dozens of distinct "Applying inline style violates..."
// console warnings, one per distinct style-attribute value.
//
// CSP_ALLOWS_UNSAFE_INLINE_STYLES records that decision: style-src carries
// 'unsafe-inline' instead. This is deliberately NOT combined with a hash
// list — per the CSP3 spec, a source list containing both a hash/nonce
// source AND 'unsafe-inline' causes browsers that support hash/nonce
// matching to ignore 'unsafe-inline' entirely (a backward-compatibility
// rule for browsers predating hash support), which would silently keep
// blocking every one of the ~100 non-hashed attribute values while
// pointlessly still allowing the 2 already-hashed <style> blocks. Sampled
// every style={{...}} call site's actual values during this triage
// (starfield/decorative gradients, index-based color/opacity lookups,
// computed widths/percentages) — none embed user-, database-, or
// translation-supplied text, so 'unsafe-inline' here does not open a path
// for attacker-controlled CSS content, unlike the script-src case this
// project deliberately never weakens the same way (see script-src below).
export const CSP_ALLOWS_UNSAFE_INLINE_STYLES = true;

// jsDelivr path prefix used for the two remote country-flag <img> sources
// in src/app/components/LanguageSelector.tsx (confirmed the only
// jsdelivr/remote-image usage in the codebase). Path-scoped (CSP source
// lists support a path prefix when it ends in "/") to the exact
// org/repo/tag/dir LanguageSelector.tsx hardcodes, rather than a bare
// https://cdn.jsdelivr.net allowance that would permit any content jsDelivr
// serves. Kept as one exported constant, matched byte-for-byte against
// LanguageSelector.tsx's own URL template by
// scripts/tests/security/test-csp-policy-parity.mjs, so a future change to
// the pinned tag/path there can't silently drift from this allowance.
export const COUNTRY_FLAGS_IMG_SRC_PREFIX =
  "https://cdn.jsdelivr.net/gh/hampusborgos/country-flags@main/svg/";

// Cloudflare Web Analytics' externally-hosted beacon script — confirmed
// live in production (real headless-Chrome capture, not just static HTML
// inspection: the Phase 2B repo/live-HTML audit missed this because
// Cloudflare injects it at the edge into the response Chrome renders, not
// into the HTML text a plain curl fetch receives). This is "Automatic
// Injection" per Cloudflare's own Web Analytics documentation — confirmed
// by there being zero reference to this script anywhere in this
// repository — under which the beacon's own analytics POST goes to this
// site's own origin (observed live: POSTs to /cdn-cgi/rum), already
// covered by 'self' in connect-src, so no connect-src addition is needed
// for it. Cloudflare's other edge-injected same-origin activity observed
// during this triage (bot-management/challenge-platform scripts and POSTs,
// Cloudflare Zaraz's tag-manager script and event POSTs — Zaraz is running
// a Google Analytics v4 tag, entirely server/edge-side) all proxy through
// this site's own origin (/cdn-cgi/*), already covered by 'self' in both
// script-src and connect-src; none of it needs a new CSP allowance.
export const CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN = "https://static.cloudflareinsights.com";

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
  // Cloudflare's own edge-injected bot-management bootstrap script embeds a
  // fresh random nonce/token on every single response (confirmed by
  // fetching production twice and diffing the two inline scripts' bytes) —
  // it can never be pinned by a static hash, and it is not app-owned code
  // this project controls, so unlike LANG_DETECT_SCRIPT_HASH it is
  // deliberately NOT allow-listed here. It will keep showing as Report-Only
  // console noise indefinitely; this is expected, not a bug to keep
  // chasing. 'unsafe-inline' is NOT added here to silence it — script-src
  // stays strict.
  ["script-src", ["'self'", `'${LANG_DETECT_SCRIPT_HASH}'`, CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN]],
  ["style-src", ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"]],
  ["img-src", ["'self'", COUNTRY_FLAGS_IMG_SRC_PREFIX]],
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
