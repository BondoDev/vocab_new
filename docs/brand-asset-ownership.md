# Brand-asset ownership

Established by the 2026-07-16 favicon audit. Before it, a single GPT-generated
1024×1024 PNG (1,517,974 bytes, RGBA + 29 KB C2PA `caBX` metadata chunk) sat at
`public/favicon.png` and was reused as both the browser favicon and the
`og:image` (which falsely declared 1200×630). Enforced by
`npm run test:brand-asset-ownership`.

## Master source

| Path | Role |
|---|---|
| `src/assets/brand/favicon-master.png` | Authoritative 1024×1024 RGBA master (the original artwork, moved out of `public/`). **Not shipped**: nothing imports it, so Vite never bundles or copies it. All variants below are generated from it. |

The artwork is a gradient-heavy raster illustration (semi-transparent outer
glow, 66 % non-opaque pixels). It cannot be faithfully vectorized, so there is
deliberately **no SVG favicon** — a real-path SVG would require redrawing the
mark, and a base64-embedded raster SVG is not an optimization.

## Public assets and their consumers

| Asset | Dimensions | Budget | Consumer |
|---|---|---|---|
| `public/favicon.png` | 96×96 PNG (RGBA) | 25 KB | `<link rel="icon" type="image/png" href="/favicon.png">` in `index.html` (inherited by all prerendered pages) and the Worker word pages via `faviconHref` in the tracked `workers/word-ssr/data/client-assets*.json`. 96 px satisfies Google Search's multiple-of-48 favicon guideline. **The path is pinned** — renaming it requires regenerating the Worker client-asset manifests. |
| `public/favicon.ico` | 16/32/48 multi-frame ICO (PNG frames) | 50 KB | Implicit `/favicon.ico` requests from legacy browsers, crawlers, and feed readers. Deliberately **not** declared in HTML (the Worker's head template is hardcoded in Worker source; keeping declarations identical across renderers means declaring only the PNG). |
| `public/apple-touch-icon.png` | 180×180 PNG (opaque, flattened on black) | 100 KB | `<link rel="apple-touch-icon">` in `index.html`, plus iOS's implicit root-path fetch on Worker-rendered pages. Flattened because iOS renders alpha as black anyway. |
| `public/og-image.png` | 1200×630 PNG (opaque) | 500 KB | `og:image` in `index.html` and `DEFAULT_OG_IMAGE` in `src/seo/site.ts` (emitted by `src/seo/SeoContext.tsx` on every canonical page, SSR and client). Full artwork centered on black — the glow fades to black so the widescreen extension is seamless. Twitter/X has no dedicated tags and falls back to Open Graph. |

Not present, by design: web app manifest / PWA icons (the site is not a PWA),
structured-data `logo`/`image` fields (JSON-LD builders don't emit any), and a
visible image logo (the header uses text-only branding in
`src/app/components/layout/Header.tsx`).

## Regeneration

```
python scripts/generate-brand-assets.py   # requires Pillow
node scripts/test-brand-asset-ownership.mjs
```

Deterministic LANCZOS downsampling from the master. Icon variants use an 820 px
square crop centered on the badge core (`(109, 64, 929, 884)`) so the mark
stays legible at 16×16; the og-image keeps the full canvas. Regenerated files
drop the master's C2PA metadata chunk automatically.

## Rules

- `public/` copies are the only shipped brand assets; `dist/`, `server-build/`,
  and `workers/word-ssr/assets-full/` copies are build output — never edit them
  by hand and never treat them as sources.
- Raising a size budget means editing both the table above and
  `scripts/test-brand-asset-ownership.mjs` in the same change.
- Don't reuse the favicon as a social image or vice versa — each consumer has
  its own asset.
