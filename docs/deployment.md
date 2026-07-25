# FluentStellar deployment

Last verified: 2026-07-14 (production probed over HTTP, including a full
redirect audit of all host/protocol combinations; Worker deployment history
inspected via `wrangler deployments list`).

**Cloudflare is the authoritative production platform.** Vercel no longer
serves any production traffic. GitHub is the source repository and the
integration point for Cloudflare deployment.

## Production source

- Repository: `https://github.com/BondoDev/vocab_new` (remote `origin`)
- Production branch: `master`
- Domain: `www.fluentstellar.com` (Cloudflare zone; both apex and `www`
  resolve to Cloudflare — verified via `Server: cloudflare` / `CF-RAY`
  response headers on 2026-07-13/14)

## Deployment flow

```text
Local development
→ push to GitHub (master)
→ Cloudflare Workers Builds runs `npm run build && npm run build:word-worker:full`
→ Wrangler deploys the built Worker artifact automatically
→ https://www.fluentstellar.com
```

> **Status note (2026-07-15):** Cloudflare Workers Builds (Git integration)
> was connected after the 2026-07-14 status note above was written. Pushes to
> `master` now trigger a Cloudflare-hosted remote build (`npm run build && npm
> run build:word-worker:full`) followed by an automatic Wrangler deploy; this
> configuration lives only in the Cloudflare dashboard, is not represented in
> this repository, and was not changed by this repository's tooling. The
> previous note describing manual, no-Git-build-source deploys reflected the
> state before this connection and no longer applies — confirm current
> behavior in the Cloudflare dashboard (Workers Builds settings, deployment
> history) if this ever needs re-verifying.

## Frontend build

- Build command: `npm run build`
  - `prebuild`: `generate:word-hub-data` + `sitemap` (regenerates
    `src/data/seo/wordPages/word-hub-pages/`, `wordPages/word-browse-shards/`,
    `src/data/seo/verbLists/common100Verbs/verbListLookup/`, `public/sitemap.xml`, `public/sitemaps/`)
  - `vite build` → `dist/` (client bundle + prerender template)
  - `vite build --ssr src/entry-server.tsx --outDir server-build`
  - `scripts/build/copy-ssr-template.mjs` (copies `dist/index.html` →
    `server-build/ssr-template.html`, preparing the frontend HTML as the
    SSR template consumed by the server/Worker packaging flow)
  - `scripts/build/prerender.mjs` (SSG of all core/CEFR/hub/level-test/verb-list
    routes into `dist/`)
  - `scripts/build/verify-word-ssr-package.mjs` (smoke-tests the Node SSR runtime
    in `server/` against `server-build/` — kept as a generic SSR regression
    gate; see "Vercel status")
- Output directory: `dist/` (client + prerendered HTML), `server-build/`
  (SSR bundle used by tests and by the Worker data build)
- Environment variables: `VITE_GA_MEASUREMENT_ID`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` (see `.env.example`); `SITE_ORIGIN`/`SITE_URL`
  default to `https://www.fluentstellar.com` in the build scripts.
- Note: `vite.config.ts` sets `base: /<repo>/` when `GITHUB_ACTIONS` is set.
  This was for the retired GitHub Pages workflow; production builds must run
  without `GITHUB_ACTIONS` so the base stays `/`.

## Word SSR Worker (production)

- Worker name: **`fluentstellar-production`** (Cloudflare Free plan)
- Source folder: `workers/word-ssr/`
  (renamed from the historical `staging/cloudflare-word-worker/` on
  2026-07-14 — this folder **is** the production Worker source)
- Production entry: `workers/word-ssr/src/index.full.ts`,
  pre-bundled by Vite (`vite.worker.config.mjs`) into
  `worker-dist-full/index.full.js`; deployed with `no_bundle = true`
- Wrangler config: `workers/word-ssr/config/wrangler.production.toml`
  (`workers_dev = false`; `ENABLE_CANONICAL_HOST_REDIRECT = "false"`)
- Worker build: `npm run build:word-worker:full`
  (**regenerates the data corpus and mints a new UTC-dated `dataVersion`** —
  running it rotates the live data version on the next deploy)
- Deploy command: as of the Cloudflare Workers Builds connection
  (2026-07-15 status note above), deploys run automatically on push to
  `master`. `npx wrangler deploy --config
  workers/word-ssr/config/wrangler.production.toml` (never a bare `wrangler
  deploy`) remains the manual fallback for out-of-band redeploys.
- Assets: one `[assets]` binding serving `assets-full/` (the production
  client bundle + prerendered HTML + record shards, assembled by
  `publish-shards.mjs`). Assets are served **asset-first**; the Worker's
  `fetch` handler only runs for paths that do not exist as files — in
  practice the SSR word routes (`…-word-…`), browse pagination, and the
  browse-shard JSON endpoint.
- **`/records/*` direct access is denied.** Record shards live under
  `assets-full/records/` because Worker SSR reads them internally through
  the `ASSETS` binding (`env.ASSETS.fetch()` in `src/shard-store.ts`) —
  that binding call goes straight to Static Assets regardless of any
  routing rule below, so internal shard access is unaffected by this.
  The shard data itself is non-sensitive vocabulary content already
  exposed through public word pages; direct external `/records/*` access
  is still denied because no external consumer needs it, and the fixed
  `records/latest/manifest.json` path otherwise enumerates every shard in
  the corpus — an unnecessary bulk-extraction shortcut compared to
  crawling individual (WAF-challenged) word pages. Both
  `wrangler.production.toml` and `wrangler.full.toml` set
  `run_worker_first = ["/records/*"]` under `[assets]`, routing only that
  path prefix to the Worker instead of Static Assets; `src/index.full.ts`'s
  `fetch` handler returns a minimal `404` for any `/records` or
  `/records/*` request before doing anything else, without calling
  `env.ASSETS.fetch()` for it. Every other path stays asset-first.
- Bundle-size limit: 3 MB gzip (Free-plan ceiling); the repo enforces a
  2.5 MB budget plus single-file output via
  `npm run test:word-worker:bundle-size`.
- Static Assets cap: 20,000 files per version — full prerender of the
  ~85k-URL word corpus is infeasible; word pages stay SSR.
- Rollback: redeploy a previous Worker version from the Cloudflare
  dashboard (Deployments → rollback), or rebuild from an earlier git commit
  and `wrangler deploy` the same config. The earlier 81-word sample Worker
  (`src/index.ts` + `wrangler.toml`) was never a rollback path and was
  removed after Phase 9 of the `workers/word-ssr/` cleanup confirmed it had
  no production dependency.

## Domain, redirects, and status behavior

- Canonical host: `https://www.fluentstellar.com`
- **Apex-to-www and HTTP-to-HTTPS redirects: live and verified
  (2026-07-14).** `http://fluentstellar.com`, `https://fluentstellar.com`,
  and `http://www.fluentstellar.com` all return a single **301** directly to
  `https://www.fluentstellar.com` with path and query preserved (scheme and
  host corrected in one hop; no loops). The redirect fires at the zone edge
  before the WAF. It is a zone-level Cloudflare rule managed **only in the
  dashboard** — it is not represented in this repository and cannot come
  from the Worker (static pages are served asset-first without invoking the
  Worker; `ENABLE_CANONICAL_HOST_REDIRECT` stays `"false"`).
  `scripts/tests/seo/test-seo-core-routes.mjs` asserts this paragraph stays present;
  if the dashboard rule ever changes, re-probe and update both.
- Legacy word-URL redirects (single-hyphen and legacy slug formats):
  `308` computed by the Worker (`classifyAndRespondNonCanonical` in
  `src/index.full.ts`), including accent-insensitive slug recovery.
- Removed/invalid word URLs: `410 Gone` (text/plain) from the Worker.
- Unknown non-word paths that miss the asset directory also fall through to
  the Worker and currently return `410 Gone` (verified live 2026-07-13).
- `404` is returned only for missing browse-shard JSON lookups.
- Sitemap/robots content types come from Static Assets MIME mapping
  (verified live: `application/xml` for `/sitemap.xml` and `/sitemaps/*`,
  `text/plain` for `/robots.txt`).
- `noindex` for `/profile` and practice routes is baked into the
  prerendered HTML as `<meta name="robots" content="noindex, nofollow">`
  (verified live). The Vercel-era `X-Robots-Tag`/`Cache-Control: no-store`
  **headers** are not reproduced on Cloudflare; the page shells contain no
  user data (profile data loads client-side from Supabase), so this is an
  accepted difference.
- Bot management: `robots.txt` disallows quota-heavy crawlers
  (guarded by `npm run test:crawler-policy`); a zone WAF Managed Challenge
  covers `-word-` paths (dashboard-managed — curl probes of word routes
  return `403` with `Cf-Mitigated: challenge`, which is expected).
- Sitemap `<lastmod>` is **manual-only**, stabilized by
  `scripts/data/sitemap-lastmod-ledger.json`; it never advances
  automatically (guarded by `npm run test:sitemap-lastmod`).

## GitHub's role

- Source control and pull requests.
- Deployment trigger for Cloudflare **if/when Workers Builds is connected**
  (dashboard configuration; not represented in the repo).
- **GitHub Pages is not used.** The `deploy-pages.yml` workflow (which
  published a `/vocab_new/`-based duplicate of `dist/` to github.io on every
  master push) was removed on 2026-07-14. No CNAME, badge, or script
  referenced it, and Cloudflare never consumed its artifact.

## Vercel status

**Fully retired (2026-07-14).** The domain is served entirely by
Cloudflare; `x-vercel-*` headers no longer appear on production responses.
With the apex-to-www and HTTP-to-HTTPS redirects verified live on
Cloudflare (see above), the last blocker was cleared and the Vercel
deployment files were deleted:

- `vercel.json` — removed. Its routing/header policy now lives in the
  Cloudflare stack: host normalization is the zone-level 301 rule; the
  legacy word-URL redirect is the Worker's `308`; sitemap/robots MIME
  types come from Static Assets; `noindex` for restricted routes is baked
  into the prerendered HTML from `src/seo/routeMetadataPolicy.ts`. The
  regression tests that previously asserted `vercel.json` contents
  (`scripts/tests/seo/test-seo-core-routes.mjs`, `scripts/tests/seo/test-sitemap-structure.mjs` §6,
  `scripts/tests/seo/test-word-seo-routes.mjs`) were migrated to assert those Cloudflare /
  shared-policy sources instead.
- `api/word-ssr.ts`, `api/word-ssr-internal.ts` — removed (thin Vercel
  function wrappers around `server/word-ssr-handler.mjs`; dead on
  Cloudflare).
- `server/word-ssr-*.mjs` — **kept; not Vercel-specific**: this is the
  generic Node SSR runtime used by `npm run build`'s final verification
  step and by the main SSR regression test (`npm run test:word-ssr-http`).
  Its internal `/api/word-ssr*` route names are its own HTTP surface, not
  a Vercel dependency.

## Regression suite for deployment changes

Run before and after any deployment-related change:

```bash
npm run build
npm run test:word-seo
npm run test:seo-output
npm run test:word-worker:production-safety
```
