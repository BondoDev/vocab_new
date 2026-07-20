# `src/seo/` — SEO behavior ownership

## Purpose

This folder owns executable SEO **behavior**: how a page is represented
to search engines. It answers *"how should a page be represented to
search engines?"* — not *"what SEO data or domain contract exists?"*
(that's [`src/data/seo/`](../data/seo/README.md)).

File extension does not determine ownership. Both `src/seo/` and
`src/data/seo/` contain `.ts`/`.tsx` files; the responsibility of the
code is what decides where it belongs.

## What belongs here

- Metadata builders (per-page-family `<title>`/`<meta description>` logic)
- Title and description generation/templates
- Canonical URL logic
- Hreflang / alternate-link logic
- Robots / indexing directives and route-level SEO policy
- JSON-LD / schema.org builders
- FAQ schema helpers
- SEO templates (shared copy fragments metadata builders assemble from)
- React SEO context/provider behavior
- Site-wide SEO configuration used by metadata generation (default
  origin, default OG image, etc.)

## What does not belong here

- SEO datasets, route manifests, lookup tables, or data loaders
- Validators whose job is protecting dataset quality
- Page-family-specific data shaping

Those live in [`src/data/seo/`](../data/seo/README.md).

**Decision rule:** if a file primarily answers *"what SEO data or domain
contract exists?"*, it belongs in `src/data/seo/`. If it primarily
answers *"how should a page be represented to search engines?"*, it
belongs here.

**How this folder should be consumed:** other code should import
metadata builders, schema builders, canonical builders, or other
metadata-generation helpers from here — not raw template/copy modules.
Application/UI code should not import a metadata-template module merely
to render visible page text; that copy belongs to the page family's own
content in `src/data/seo/`, even when a builder here also reads some of
it to produce metadata.

## Shared versus page-family-specific SEO behavior

- Page-family-specific: `wordMetadata.ts`, `verbListMetadata.ts`, and
  `hubMetadata.ts` each build metadata for one SEO page family at the
  `src/seo/` root. `vocabularyLevels/vocabularyMetadata.ts`,
  `vocabularyLevels/seoFaq.ts` (FAQ section), and
  `vocabularyLevels/seoSchema.ts` (JSON-LD graph) are exclusively owned
  by the vocabulary-level page family and live together in
  `vocabularyLevels/`.
- Cross-family/shared behavior: `shared/seoAlternates.ts` (hreflang
  building), `seoTemplates.ts` (shared copy templates),
  `routeMetadataPolicy.ts` (route-level indexing policy),
  `SeoContext.tsx` (the React provider/runtime), and `site.ts`
  (site-wide defaults) are consumed across multiple or all page
  families.

## Internal structure

A subfolder is used only once multiple files clearly share one owner.
`vocabularyLevels/` groups the vocabulary-level page family;
`shared/` currently owns `seoAlternates.ts`, the one file with no
single page-family owner. A single-file family (`wordMetadata.ts`,
`verbListMetadata.ts`, `hubMetadata.ts`) stays at the root until a
second file justifies its own folder. Public entry points
(`SeoContext.tsx`, `routeMetadataPolicy.ts`) and the compatibility
facade (`metadata.ts`) remain at the root regardless of file count.

## Dependency direction

- `src/seo/` may import from `src/data/seo/`.
- `src/data/seo/` must not import from `src/seo/`.

`src/data/seo/` provides the lower-level data and domain contracts;
`src/seo/` consumes them to produce metadata, schema, and policy
behavior. This direction currently holds throughout the codebase but is
**not enforced by an automated lint/boundary rule** — it's a convention
to preserve by inspection and review.

## Examples

| File | Why it's behavior, not data |
|---|---|
| `wordMetadata.ts` | Builds word-page `<title>`/description/canonical from word data — output behavior |
| `vocabularyLevels/vocabularyMetadata.ts` | Builds vocabulary-level-page metadata from vocabulary-level data |
| `verbListMetadata.ts` | Builds verb-list-page metadata |
| `vocabularyLevels/seoSchema.ts` | Builds the vocabulary-level-page JSON-LD structured-data graph |
| `shared/seoAlternates.ts` | Builds hreflang alternate-link sets — a cross-family concern |
| `routeMetadataPolicy.ts` | Classifies routes and decides indexability/noindex policy |
| `SeoContext.tsx` | React context/provider that renders SEO tags at request time |

## Checklist for adding SEO behavior for a new page family

1. Does the new page family already have data in
   `src/data/seo/<family>/`? Build the metadata module on top of it —
   don't duplicate data here.
2. Name the module `<family>Metadata.ts` to match the existing
   convention (`wordMetadata.ts`, `verbListMetadata.ts`,
   `vocabularyLevels/vocabularyMetadata.ts`). Put it in its own
   `<family>/` subfolder only once that family owns more than one file.
3. Reuse `shared/seoAlternates.ts`, `seoTemplates.ts`, and
   `routeMetadataPolicy.ts` where the concern is cross-family — don't
   fork copies of hreflang logic per family. `vocabularyLevels/seoFaq.ts`
   and `vocabularyLevels/seoSchema.ts` are vocabulary-level-only
   helpers, not general-purpose infrastructure — don't reuse them for a
   different family.
4. Only import from `src/data/seo/`, never the other way around.
5. If the module needs to be reachable under the old `./metadata`
   import path, add a re-export to `metadata.ts` (the existing
   compatibility facade) rather than changing existing call sites.

## See also

- [`src/data/seo/README.md`](../data/seo/README.md) — the data-side counterpart
- [`docs/architecture.md`](../../docs/architecture.md) — full repository architecture reference
