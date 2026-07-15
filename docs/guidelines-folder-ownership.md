# `guidelines/` folder ownership

Audited 2026-07-15. Guard script: `npm run test:guidelines-ownership`
(`scripts/test-guidelines-ownership.mjs`), wired into
`npm run test:architecture-guards`.

## Rule

`guidelines/` is **human-guidance-only**. It exists to hold instructions for
an AI coding assistant (the Figma "system guidelines" convention), not
application, SEO, or build data. The only allowed file type is Markdown, and
the only file currently present is:

- `guidelines/Guidelines.md`

No `.json`, `.html`, or other data/code file belongs in this directory. The
guard script asserts this on every run.

## What used to be here

Three files previously sat in `guidelines/` despite being live production
data, discovered during a 2026-07-15 ownership audit:

| Former path | Finding | Action | New path |
|---|---|---|---|
| `guidelines/seo_level_test_content.json` | Authoritative, hand-maintained level-test SEO content (49 entries, one per UI-language x target-language). Imported by `src/data/levelTests/index.ts` and read directly by `scripts/generate-sitemap.mjs`; feeds `LevelTestSeoPage.tsx`, `src/seo/metadata.ts`, and SSR/prerender (`src/entry-server.tsx`) route enumeration. | Moved | `src/data/levelTests/seo_level_test_content.json` |
| `guidelines/seo-cefr-content.json` | Authoritative, hand-maintained CEFR level-page content (294 entries = 7 UI-languages x 7 target-languages x 6 CEFR levels — full coverage). Imported by `src/app/components/devSeoCefrPreviewData.ts`. Despite that module's "dev preview" name, `App.tsx`'s `vocabularyLevel` route branch always matches an entry (full coverage) and renders this content as the production page body via `DevSeoCefrPlaceholderPage`, ahead of the `VocabularyLevelPage`/`src/data/vocabularyLevels` fallback. See `docs/generated-data.md` for the full split-content finding. | Moved | `src/data/seo/seo-cefr-content.json` |
| `guidelines/seo-cefr-placeholder.html` | Static HTML mockup with `{{handlebars}}`-style placeholders mirroring the CEFR page's field names. Added once (`9749376f`, "Add CEFR SEO preview route and sample content") and never touched again; zero references anywhere in the tracked repo (no script, import, `fs` read, or doc pointed to it). Superseded by the real React implementation (`DevSeoCefrPlaceholderPage.tsx` / `VocabularyLevelPage.tsx`), which already encodes the same field structure in TypeScript types. | Deleted | — |

Both JSON files are hand-maintained; no generator script produces or
synchronizes either one. Content was moved byte-for-byte (`git mv`) — no
field values changed.

## Why this matters

Production code should not depend on a directory whose stated purpose is
non-technical guidance. A `guidelines/` file can be edited, reorganized, or
deleted by anyone treating the folder as documentation, silently breaking the
level-test SEO route, the sitemap, or the CEFR vocabulary-level pages. Moving
the two JSON files under `src/data/` puts them alongside the code that
depends on them and under the same import-boundary and generated-data
guards as every other data file in the repo.

## How to update these files safely now

- `src/data/levelTests/seo_level_test_content.json` — edit directly; consumed
  via a plain relative `import` in `src/data/levelTests/index.ts` and via
  `fs.readFile` in `scripts/generate-sitemap.mjs`. Re-run `npm run sitemap`
  and `npm run test:word-seo` after any content or route-path change.
- `src/data/seo/seo-cefr-content.json` — edit directly; consumed via a plain
  relative `import` in `src/app/components/devSeoCefrPreviewData.ts`. This is
  the file that actually determines vocabulary-level page body content in
  production — see the split-content note in `docs/generated-data.md` before
  assuming `src/data/vocabularyLevels/` controls page content.

## Adding a new guidance file

Any new file under `guidelines/` must be Markdown and must contain only
instructions for the AI assistant, not application data. If you need to add
new SEO or application data, put it under `src/data/` (or `src/data/seo/`)
next to its consumer, not in `guidelines/`.
