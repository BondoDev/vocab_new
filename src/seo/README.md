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

- Page-family-specific: `wordMetadata.ts`, `vocabularyMetadata.ts`,
  `verbListMetadata.ts`, `hubMetadata.ts` each build metadata for one
  SEO page family.
- Cross-family/shared behavior: `seoAlternates.ts` (hreflang building),
  `seoFaq.ts` (FAQ schema), `seoSchema.ts` (JSON-LD graph building),
  `seoTemplates.ts` (shared copy templates), `routeMetadataPolicy.ts`
  (route-level indexing policy), `SeoContext.tsx` (the React
  provider/runtime), and `site.ts` (site-wide defaults) are consumed
  across multiple or all page families.

`src/seo/` does not yet have a family-based subfolder split the way
`src/data/seo/` does. This README documents current ownership as a
baseline before a separate ownership audit and possible reorganization
— it does not prescribe a final subfolder structure.

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
| `vocabularyMetadata.ts` | Builds vocabulary-level-page metadata from vocabulary-level data |
| `verbListMetadata.ts` | Builds verb-list-page metadata |
| `seoSchema.ts` | Builds the JSON-LD structured-data graph |
| `seoAlternates.ts` | Builds hreflang alternate-link sets — a cross-family concern |
| `routeMetadataPolicy.ts` | Classifies routes and decides indexability/noindex policy |
| `SeoContext.tsx` | React context/provider that renders SEO tags at request time |

## Checklist for adding SEO behavior for a new page family

1. Does the new page family already have data in
   `src/data/seo/<family>/`? Build the metadata module on top of it —
   don't duplicate data here.
2. Name the module `<family>Metadata.ts` to match the existing
   convention (`wordMetadata.ts`, `vocabularyMetadata.ts`, `verbListMetadata.ts`).
3. Reuse `seoAlternates.ts`, `seoSchema.ts`, `seoTemplates.ts`, and
   `routeMetadataPolicy.ts` where the concern is cross-family — don't
   fork copies of hreflang/JSON-LD logic per family.
4. Only import from `src/data/seo/`, never the other way around.
5. If the module needs to be reachable under the old `./metadata`
   import path, add a re-export to `metadata.ts` (the existing
   compatibility facade) rather than changing existing call sites.

## See also

- [`src/data/seo/README.md`](../data/seo/README.md) — the data-side counterpart
- [`docs/architecture.md`](../../docs/architecture.md) — full repository architecture reference
