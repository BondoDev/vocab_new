# `src/data/seo/` — SEO data ownership

## Purpose

This folder owns SEO-facing **data**: what content, routes, and domain
contracts exist for each SEO page family. It answers *"what SEO data or
domain contract exists?"* — not *"how is a page represented to a search
engine?"* (that's [`src/seo/`](../../seo/README.md)).

File extension does not determine ownership. Both `src/data/seo/` and
`src/seo/` contain `.ts` files; the responsibility of the code is what
decides where it belongs.

## What belongs here

- Generated or hand-authored SEO datasets (JSON, or the TS that shapes them)
- Localized SEO page content
- Lookup tables and registries
- Route manifests and route/data contracts (parsing a pathname into a
  typed route, building a canonical path from data)
- Data loaders (`import.meta.glob`, JSON imports, fetch-based loaders)
- Validators whose main purpose is protecting or shaping SEO datasets
  (e.g. rejecting malformed vocabulary entries before they reach a route)
- Page-family-specific data models and helpers
- Shared constants/types that form the SEO data contract (supported
  languages, levels, slug tables)

## What does not belong here

- Metadata builders that decide `<title>`/`<meta description>` text
- Canonical URL / hreflang / robots directive logic
- JSON-LD or schema.org generation
- React SEO context/provider behavior
- Anything whose job is describing a page *to a search engine* rather
  than describing *what SEO data exists*

Those live in [`src/seo/`](../../seo/README.md).

**Decision rule:** if a file primarily answers *"what SEO data or domain
contract exists?"*, it belongs here. If it primarily answers *"how should
a page be represented to search engines?"*, it belongs in `src/seo/`.

**Field names don't decide ownership.** Page-family content and fallback
content may legitimately include fields named `pageTitle`, `metaTitle`,
`metaDescription`, `searchPlaceholder`, `definition`, `noResults`,
`pronounceLabel`, or similar. A field name alone never moves a file to
`src/seo/`. If the content is authored/keyed per page family and may be
read directly by UI/runtime code (not only by a metadata builder), it
belongs here — even when a `src/seo/` metadata builder also reads some
of its fields as a title/description source. A metadata builder
*reading* page-family data does not transfer ownership of that data to
`src/seo/`: builders consume page-family content, they don't own it.

## Current page-family structure

```
src/data/seo/
  vocabularyLevels/   CEFR vocabulary-level pages
  levelTests/         Level-test pages
  verbLists/          Verb-list page-family umbrella
    common100Verbs/   100-most-common-verb pages
  wordPages/          Word detail/hub pages
  shared/             Cross-family data contracts (not a fifth family)
```

Each page-family folder owns its own route helpers, data shaping, and
lookup data. A file inside one family folder should not be the
canonical home for another family's data.

## Shared folder criteria

`shared/` is **not** a fifth page family. A file belongs there only if:

- it is a genuinely cross-family data contract or helper, and
- no single page family can own it cleanly without the others importing
  sideways from that family's folder.

Current contents and why they qualify:

- `shared/slugs.ts` — the supported UI-language/target-language/CEFR-level
  constants and types every family's data layer is built on.
- `shared/browseWordValidation.ts` — a domain-neutral lemma validator
  consumed by both `vocabularyLevels/` and `wordPages/` code.
- `shared/hub.ts` — the site-wide `/seo-pages` hub route, consumed across
  all four page families plus app/SSR routing.

If a new helper is only used by one family, put it in that family's
folder, not in `shared/`.

**Red flag:** a page-family folder importing a general-purpose symbol
from a *sibling* page-family folder (e.g. `verbLists/` importing from
`wordPages/`) is a sign of misplaced ownership, not a fine cross-family
dependency. When you see one, check whether the symbol belongs in
`shared/` instead of accepting the sideways import.

**Allowed exception — canonical-route-owner imports.** A family (or
app-level feature) importing a sibling family's canonical route
builder, in order to link to or reference that family's own pages, is
not the red flag above — it's a dependency on the route owner. The
owning family stays the single authority for constructing and parsing
its own canonical URLs; consumers must call that builder rather than
duplicating its URL format. For example, `levelTests/` imports
`buildLocalizedVocabularyPath` from `vocabularyLevels/` only to link to
vocabulary-level pages, the same way word pages, verb lists, explore
pages, the UI-language switcher, and the SEO hub already do — it does
not construct or own vocabulary-level routes itself. The red flag is
importing a sibling family's internal data-shaping, lookup, formatting,
or other general-purpose implementation helpers to build or operate
your own family's pages, not calling its public route API. Being
called from many families doesn't move a canonical route builder to
`shared/` on its own — semantic ownership decides that, not consumer
count.

## Dependency direction

- `src/seo/` may import from `src/data/seo/`.
- `src/data/seo/` must not import from `src/seo/`.

Data and domain contracts are the lower-level inputs; metadata, schema,
and policy behavior in `src/seo/` consumes them, not the other way
around. This direction currently holds throughout the codebase but is
**not enforced by an automated lint/boundary rule** — it's a convention
to preserve by inspection and review.

## Examples

| File | Why it's data, not behavior |
|---|---|
| `wordPages/wordRouteManifest.ts` | Parses/builds word-page route shapes — a route/data contract, not rendered metadata |
| `wordPages/wordPageData.ts` | Shapes matched word records into page data — data shaping, not `<head>` output |
| `shared/slugs.ts` | Shared language/level constants and types — the contract other data (and `src/seo/`) is built on |
| `shared/browseWordValidation.ts` | Validates a lemma is browse-worthy — protects data quality, not SEO tag output |

## Checklist for adding a new SEO page family or data module

1. Does this data belong to exactly one existing family
   (`vocabularyLevels/`, `levelTests/`, `verbLists/`, `wordPages/`)? Put
   it there.
2. Is it genuinely needed by two or more families, with no single owner?
   Only then consider `shared/`.
3. Does it build `<title>`, canonical URLs, hreflang, robots, or JSON-LD?
   It belongs in `src/seo/`, not here.
4. Does it import anything from `src/seo/`? It shouldn't — invert the
   dependency instead.
5. If adding a brand-new page family, create a new top-level folder
   here (not a subfolder of `shared/`) and update
   [`docs/architecture.md`](../../../docs/architecture.md) and
   [`docs/generated-data.md`](../../../docs/generated-data.md) if it
   introduces generated or mirrored data.

## See also

- [`src/seo/README.md`](../../seo/README.md) — the behavior-side counterpart
- [`docs/architecture.md`](../../../docs/architecture.md) — full repository architecture reference
