// Canonical FluentStellar production Content-Security-Policy definitions —
// the single source of truth for both delivery surfaces:
//
//   - public/_headers (Cloudflare Static Assets: SPA shell, JS/CSS bundles,
//     prerendered SEO/hub/level-test/verb-list pages) — generated from this
//     module by scripts/security/generate-headers-file.mjs, never hand-edited.
//   - workers/word-ssr/src/index.full.ts (Cloudflare Worker: SSR word pages,
//     redirects, errors) — imports buildCspReportOnlyHeaderValue() and
//     buildCspEnforcingHeaderValue() directly.
//
// scripts/tests/security/test-csp-policy-parity.mjs asserts both surfaces
// stay semantically identical for EACH policy independently (parsed
// directive/value sets, not raw strings — public/_headers has its own file
// syntax around the value).
//
// ── CSP Phase 2C: two policies, sent as two separate headers ──────────────
//
// Content-Security-Policy-Report-Only carries the FULL policy, including
// script-src — this is pure visibility, never blocks anything, and is what
// lets this project keep watching for Cloudflare JavaScript Detections'
// edge-injected inline bootstrap script (see script-src's own comment
// below) without that script's Report-Only noise ever going away.
//
// Content-Security-Policy (the real, enforcing header) carries only the
// subset of directives already proven safe against real production traffic
// in Phase 2B.1 — style-src, img-src, font-src, connect-src, frame-src,
// frame-ancestors, object-src, base-uri, form-action. It deliberately
// OMITS both `script-src` AND `default-src`. This is not an oversight:
//
//   - Cloudflare's JavaScript Detections feature (Bot Fight Mode, Free
//     plan — see the CSP Phase 2B.2 audit) edge-injects an inline
//     `<script>` bootstrap into every HTML response, whose content embeds
//     a fresh random token on every single request. It can never be
//     covered by a static hash, and this project will not add
//     `script-src 'unsafe-inline'` or route all HTML through a
//     nonce-generating Worker just to accommodate it (Phase 2B.2 found
//     that would risk recreating the exact Worker-request-quota exhaustion
//     this project already hit twice from bot traffic). So an ENFORCING
//     script-src would, today, actively block Cloudflare's own script on
//     every page load — an outcome deliberately avoided by leaving script
//     enforcement in Report-Only until a real nonce architecture is worth
//     the cost, which is not yet.
//   - If `default-src 'self'` were included in the enforcing policy
//     WITHOUT an explicit `script-src`, CSP's own fallback rule means
//     `default-src` governs script loading too — silently re-introducing
//     exactly the script enforcement this policy exists to avoid, just
//     one layer removed from view. So `default-src` is also deliberately
//     absent from the enforcing policy; every directive it would
//     otherwise need to cover is instead listed explicitly. (Directive
//     types with no legitimate use anywhere in this app and no dedicated
//     entry here — e.g. `worker-src`, `manifest-src` — simply aren't
//     restricted by the enforcing header; this is an accepted, narrow gap,
//     not a fallback hazard, since nothing in the app uses those features
//     per the Phase 1 audit.)
//
// scripts/tests/security/test-csp-policy-parity.mjs's "explicit
// non-enforcement" checks fail loudly if `script-src`, `script-src-elem`,
// `script-src-attr`, or `default-src` ever appear in the enforcing policy
// without a deliberate, documented architecture change (a real per-request
// nonce implementation — see the Phase 2B.2 report for what that would
// require).
//
// ── Hardcoded hash/prefix constants ────────────────────────────────────────
// The hash/prefix constants below are hardcoded, not computed at
// request/build time: Cloudflare Static Assets can't run code to produce
// `_headers`, and the Worker has no filesystem access to source files at
// runtime. LANG_DETECT_SCRIPT_HASH was produced by, and can be recomputed
// from source at any time with, scripts/security/compute-csp-hashes.mjs —
// never hand-typed or estimated. scripts/tests/security/test-csp-hash-
// freshness.mjs re-runs that script and fails if the constant ever drifts
// from the actual source bytes (e.g. someone edits the language-detection
// script without updating the hash here).

export const CSP_REPORT_ONLY_HEADER_NAME = "Content-Security-Policy-Report-Only";
export const CSP_ENFORCING_HEADER_NAME = "Content-Security-Policy";

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
// project deliberately never weakens the same way. Now enforced for real
// (Phase 2C) as part of the enforcing policy's style-src.
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

// CSP Phase 2C.1 (partial-enforcement production validation) found a real
// enforcing img-src violation on /explore: `data:image/svg+xml,...` flag
// images being blocked. Traced to the "flag-icons" npm dependency (v7.2.1,
// MIT-licensed, imported once via `import "flag-icons/css/flag-icons.min.css"`
// in both src/main.tsx and src/entry-client.tsx) — its stylesheet defines
// `.fi-<code>` classes (applied via `className={`fi fi-${language.flagCode}`}`
// in ExplorePage.tsx and UILanguageSwitcher.tsx, `language.flagCode` always
// coming from this app's own fixed, curated language list, never user/
// database input) with a `background-image`. Vite's build inlines these
// small SVG assets as `data:image/svg+xml,...` URIs directly into the
// compiled CSS bundle (confirmed in dist/assets/*.css — e.g. `.fi-gb{
// background-image:url("data:image/svg+xml,...id='flag-icons-gb'...")}`,
// where the `id='flag-icons-gb'` is a literal attribute inside the
// embedded SVG markup, not a separate template value). Entirely static,
// fixed at build time by the pinned npm package version — no runtime,
// user-, or database-supplied content ever reaches these data URIs. A
// Cloudflare Zaraz frame sometimes appears in the browser's captured call
// stack for this violation, but Zaraz does not create or own this asset —
// it's an unrelated async task the browser happened to attribute the
// image-load evaluation near, not the actual source.
export const IMG_SRC_ALLOWS_DATA_URIS = true;

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
// script-src and connect-src; none of it needs a new CSP allowance. This
// origin is script-src-only (Report-Only policy) — it has no bearing on
// the enforcing policy, which carries no script-src at all.
export const CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN = "https://static.cloudflareinsights.com";

// Production Supabase project origin (VITE_SUPABASE_URL) — the sole
// network origin every Auth/REST/RPC/Edge-Function call in the browser
// codebase targets. src/lib/supabaseAuth.ts's supabaseRequest is the only
// fetch() call site in the entire browser app, and it always targets
// `${SUPABASE_URL}${path}`. Not secret — this origin is already public in
// every browser network request the app makes; only the anon key (never
// referenced here) would need protecting, and CSP doesn't carry it.
export const SUPABASE_ORIGIN = "https://ogovfcmhwqjljawsoiru.supabase.co";

type DirectiveEntry = readonly [string, readonly string[]];

// The directive entries already proven safe against real production
// traffic (Phase 2B.1) — every one of these is non-script, and every one
// is shared, byte-for-byte, by both policies below. Defined exactly once
// here so the Report-Only and enforcing policies can never accidentally
// drift apart on the directives they're supposed to share; the enforcing
// policy is this list and NOTHING else (see CSP_ENFORCING_DIRECTIVES).
const SAFE_NON_SCRIPT_DIRECTIVES: readonly DirectiveEntry[] = [
  ["style-src", ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"]],
  ["img-src", ["'self'", "data:", COUNTRY_FLAGS_IMG_SRC_PREFIX]],
  ["font-src", ["'self'", "https://fonts.gstatic.com"]],
  ["connect-src", ["'self'", SUPABASE_ORIGIN]],
  ["frame-src", ["'none'"]],
  ["frame-ancestors", ["'none'"]],
  ["object-src", ["'none'"]],
  ["base-uri", ["'self'"]],
  ["form-action", ["'self'"]],
];

// Full visibility policy — default-src, strict script-src (including the
// one FluentStellar-owned hash and the Cloudflare Insights beacon origin;
// deliberately NOT Cloudflare's own dynamic bot-management script — see
// the file header comment), plus every SAFE_NON_SCRIPT_DIRECTIVES entry.
// Sent only as Content-Security-Policy-Report-Only — never blocks
// anything, purely observational.
export const CSP_REPORT_ONLY_DIRECTIVES: readonly DirectiveEntry[] = [
  ["default-src", ["'self'"]],
  // Cloudflare's own edge-injected bot-management bootstrap script embeds a
  // fresh random nonce/token on every single response (confirmed by
  // fetching production twice and diffing the two inline scripts' bytes) —
  // it can never be pinned by a static hash, and it is not app-owned code
  // this project controls, so unlike LANG_DETECT_SCRIPT_HASH it is
  // deliberately NOT allow-listed here. It will keep showing as Report-Only
  // console noise indefinitely; this is expected, not a bug to keep
  // chasing. 'unsafe-inline' is NOT added here to silence it — script-src
  // stays strict, and (Phase 2C) exists only in this Report-Only policy,
  // never in the enforcing one.
  ["script-src", ["'self'", `'${LANG_DETECT_SCRIPT_HASH}'`, CLOUDFLARE_INSIGHTS_SCRIPT_ORIGIN]],
  ...SAFE_NON_SCRIPT_DIRECTIVES,
];

// Enforcing policy (Phase 2C) — real Content-Security-Policy, actually
// blocks violations. Exactly SAFE_NON_SCRIPT_DIRECTIVES: no default-src,
// no script-src, no script-src-elem, no script-src-attr. See the file
// header comment for exactly why both omissions are deliberate and
// security-significant, not oversights. Directive types not listed here
// and with no legitimate use anywhere in the app (worker-src,
// manifest-src, etc. — see the Phase 1 CSP audit) are simply unrestricted
// by this header; this is an accepted, narrow, intentional gap, not a
// fallback hazard, since default-src's absence means there is no implicit
// coverage to leak through in the first place.
export const CSP_ENFORCING_DIRECTIVES: readonly DirectiveEntry[] = SAFE_NON_SCRIPT_DIRECTIVES;

function serializeDirectives(directives: readonly DirectiveEntry[]): string {
  return directives.map(([directive, sources]) => `${directive} ${sources.join(" ")}`).join("; ");
}

// `; ` between directives, a single space between a directive name and its
// source list, no trailing `;` — an arbitrary but fixed serialization; the
// parity test only cares about the *parsed* directive/value sets, not this
// exact formatting.
export function buildCspReportOnlyHeaderValue(): string {
  return serializeDirectives(CSP_REPORT_ONLY_DIRECTIVES);
}

export function buildCspEnforcingHeaderValue(): string {
  return serializeDirectives(CSP_ENFORCING_DIRECTIVES);
}

// Parses any CSP header value (either policy's own output, a raw
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
