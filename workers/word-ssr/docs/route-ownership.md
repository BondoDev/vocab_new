# Route ownership (Phase 9)

STAGING-ONLY. Describes which routes are served directly by Cloudflare
Workers Static Assets (no Worker code runs) vs. intercepted by
`src/index.full.ts`. Verified against the running `npx wrangler dev --config
workers/word-ssr/config/wrangler.full.toml --local` instance (run from the
repository root) — see the status codes recorded below.

## Assets-served (no Worker invocation)

All of these already exist as prerendered/static output under `dist/`
(produced by `npm run build` at the repo root) and are copied verbatim into
`assets-full/` by `publish-shards.mjs`. Cloudflare serves them directly
because Workers Static Assets checks the assets directory **before**
invoking the Worker's `fetch` handler for any matching path.

| Route family | Example | Verified status |
|---|---|---|
| Homepage | `/` | 200 |
| About | `/about` | 200 (see `html_handling` note below) |
| Help | `/help` | 200 |
| CEFR vocabulary pages | `/en/english-a1-vocabulary-practice` | 200 |
| SEO hubs | `/en/seo-pages` | 200 (prerendered, per earlier build) |
| Word hubs | `/en/seo-pages/english-word-pages` | 200 (prerendered) |
| Level tests | `/en/english-level-test` | 200 (prerendered) |
| Verb lists | `/en/100-most-common-english-verbs` | 200 (prerendered) |
| Profile shell | `/profile` | 200, noindex (prerendered — the retired Vercel-era `X-Robots-Tag` header policy is mirrored into the prerendered HTML itself as a robots `<meta>`) |
| Practice pages | `/languages/filters/exercises/en-es/practice` | 200, noindex (prerendered) |
| robots.txt | `/robots.txt` | 200 |
| Sitemap index + child sitemaps | `/sitemap.xml`, `/sitemaps/*.xml` | 200 |
| Static assets (JS/CSS/images/fonts) | `/assets/*.js` | 200 |

**`html_handling` fix (applies to both configs, only actually changed in
`wrangler.full.toml`):** Workers Static Assets' default `html_handling`
(`"auto-trailing-slash"`) 307-redirects directory-style routes like `/about`
to `/about/` before serving `about/index.html` — an extra redirect hop
production doesn't have (production, then Vercel, served `/about` directly
as 200; the Cloudflare production config keeps that behavior). This is
present in Cloudflare Workers Static Assets' default `html_handling`
generally (tested directly against the sample Worker's `wrangler.toml`
before its removal — same behavior, not something introduced by this
migration).
`wrangler.full.toml` sets `html_handling = "drop-trailing-slash"` so `/about`
resolves directly (matching production exactly) and `/about/` redirects to
`/about` instead — the direction that actually preserves existing URLs/status
codes.

## Worker-intercepted (src/index.full.ts's `fetch` handler runs)

| Route family | Example | Why the Worker must run |
|---|---|---|
| Canonical word pages | `/en/english-word-about--A1-00001` | Requires a data lookup (concept shard fetch) + React SSR — not a static file (Phase 3 explicitly rules out one physical HTML file per URL) |
| Word browse pages | `/en/english-word-about--A1-00001/browse/page/2` | Same as above, plus pagination-boundary logic |
| Legacy/alias word URLs | `/en/english-word-about-A1-00001` | 308 redirect computed from the concept record's canonical slug |
| Malformed/invalid word-shaped URLs | `/en/english-word-about--Z9-99999` | 410, computed after a shard lookup miss |
| Browse-shard JSON (client-side search) | `/staging-assets/browse-shard/english/a1.json` | Not a static file — served from the same shard store as word pages |

There is no path overlap between the two tables: word-route pathnames
(`-word-` marker) never exist as physical files in `assets-full/`, so
Cloudflare's asset-first check always falls through to the Worker for them,
and every other route always resolves as a static file first. No explicit
`run_worker_first` configuration is needed for this split — it falls out
naturally from what does/doesn't exist as a file in the assets directory.
