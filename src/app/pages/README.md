# App Pages

## Purpose

`src/app/pages/` owns route-level page composition — components `App.tsx`
renders directly for a route — plus supporting files exclusively owned by
that one page or page family: route-family views, layouts, dialogs, and
small local configuration.

Placement is determined by **route-family ownership**, not visual type,
filename, or rendering environment (browser, SSR, prerender, Worker). Not
a general location for reusable product workflows (→ `src/features/`),
generic UI components (→ `src/app/components/`), or domain-wide data
infrastructure (→ `src/data/`, `src/seo/`).

## Current structure

```
src/app/pages/
  About.tsx, Help.tsx,                    # standalone route pages
  NotFoundPage.tsx, SeoHubPage.tsx, VocabularyLevelExam.tsx

  explore/              # page family: explore route + its exclusive hook
  home/                 # page family: homepage + its exclusive components
  level-test/           # page family: level-test SEO page + its modal
  verb-lists/
    common100Verbs/     # domain (verb-lists) + concrete subtype
  vocabulary/           # page family + local production runtime config
  word-pages/
    detail/             # route subfamily: single word-detail pages
    hub/                # route subfamily: word index/hub pages
```

## Standalone route pages

Stays directly under `src/app/pages/` when it's a single route component
with no exclusively owned supporting view, modal, layout, or local
configuration — a one-file folder would add nesting without clarifying
ownership.

**Examples:** `About.tsx`, `Help.tsx`, `SeoHubPage.tsx`,
`VocabularyLevelExam.tsx`. `NotFoundPage.tsx` also stays flat, for a
different reason: it's a shared route fallback rendered from several
unrelated route branches, so no single family owns it.

Do not create a one-file folder for every route merely for visual
consistency.

## Page-family folders

Normally created once a route has at least one exclusively owned
supporting file — a current architectural convention, not a
machine-enforced rule.

```
home/
  HomePage.tsx
  FloatingWords.tsx
  LanguageContinuePopup.tsx
```

`FloatingWords.tsx`/`LanguageContinuePopup.tsx` stay beside `HomePage.tsx`
because they have no consumers outside the homepage. General shape: one
route entry plus one supporting file with the same ownership.

`explore/` is the same pattern with a hook instead of a component:
`useExploreItems.ts` has no consumer besides `ExplorePage.tsx`, so it moved
beside it rather than staying in `src/app/hooks/` (which is reserved for
hooks consumed across unrelated page/feature owners).

```
explore/
  ExplorePage.tsx
  useExploreItems.ts
```

## Supporting-file colocation

Files exclusively owned by one page family stay beside its route entry —
presentational views, render variants, page-specific layouts,
page-specific dialogs/modals, loaders/wrappers, and route-family-local
config/lookup code all qualify.

**Examples:** `FloatingWords.tsx`, `LanguageContinuePopup.tsx`,
`RichVerbListSeoPage.tsx`, `VerbListSeoTableOnlyPage.tsx`,
`LevelTestLanguageModal.tsx`, `WordPageLayout.tsx`, `WordSeoPageView.tsx`,
`devSeoCefrPreviewData.ts`.

Stay flat inside the family folder while it's small. Do not create local
`components/`, `dialogs/`, `layouts/`, or `data/` folders merely because
of a file's visual or technical type.

## Page-owned dialogs and layouts

Visual type does not determine folder ownership.

`LevelTestLanguageModal.tsx` remains under [`level-test/`](level-test/) —
owned by the level-test family — not `components/dialogs/`, merely because
it renders a modal. `WordPageLayout.tsx` remains under
[`word-pages/detail/`](word-pages/detail/) — owned by the word-detail
family — not `components/layout/`, merely because its filename contains
"Layout".

Page-owned views, dialogs, and layouts stay with their owner unless they
become genuinely shared across unrelated page or feature owners.

**Rendering pipelines do not change ownership:** a file may render via
browser, SSR, prerender, or Worker while still belonging to one page
family. `WordSeoPageView.tsx` and `WordPageLayout.tsx` are both consumed
by more than one rendering pipeline for the **same** word-detail family —
reuse across pipelines for one family is not reuse across unrelated
families. See [`docs/architecture.md`](../../../docs/architecture.md) for
the Worker rendering/bundle details this README omits.

## Nested domain/subtype and route-subfamily folders

Nesting is justified only by a real ownership taxonomy. `verb-lists/` is
the general domain, `common100Verbs/` is one concrete list family, and its
supporting views (`RichVerbListSeoPage.tsx`, `VerbListSeoTableOnlyPage.tsx`)
are specific to that subtype. Future sibling subtypes should only appear
once an actual route/data/SEO family exists for them — not speculatively;
shared extraction across subtypes waits until a second real subtype
demonstrates the need.

Sibling folders such as `word-pages/detail/` and `word-pages/hub/` are a
different case — a **route subfamily** split, valid when the folders
represent distinct route concerns with separate route parsing, data
shapes, metadata behavior, and rendering responsibilities: `detail/` owns
individual word pages, `hub/` owns word index/browse hub routes. Not every
route variation needs a nested folder.

## Pages versus components

- Route entry or page-family-exclusive supporting file → `src/app/pages/`.
- App-specific component reused by unrelated page/feature owners →
  `src/app/components/`.
- Domain-agnostic UI primitive → `src/app/components/ui/`.
- Global navigation or app chrome → `src/app/components/layout/`.
- Centrally orchestrated app-shell dialog → `src/app/components/dialogs/`.

Counter-examples: `LanguageSelector.tsx` belongs in `components/` — unrelated
owners (homepage, account onboarding, level-test) all consume it;
`Header.tsx` belongs in `components/layout/` — global application chrome;
`LevelTestLanguageModal.tsx` and `WordPageLayout.tsx` belong in `pages/` —
page-family-owned.

See [`src/app/components/README.md`](../components/README.md) for the
components-side rules in full.

## Pages versus features

`pages/` groups code by route/page-family ownership; `src/features/`
groups reusable product capabilities or workflows. A page may **compose**
a feature but should not absorb its private internals just because the
feature appears on that route. Current features: `src/features/practice/`,
`src/features/learning-setup/`, `src/features/user-profile/`. A feature
may expose a route-level component through its public API (e.g.
`UserProfileDashboardPage`) while remaining under `features/` — not every
feature needs a page wrapper inside `pages/`. See
[`src/features/user-profile/README.md`](../../features/user-profile/README.md)
for feature-local ownership rules.

## Pages versus data and SEO

Pages may consume route helpers, page data, metadata builders, contexts,
and shared library modules. `pages/` should not own generated datasets,
cross-route data infrastructure, general metadata builders, domain-wide
lookup systems, or shared route-parsing infrastructure — those belong
under `src/data/`, `src/seo/`, or shared utility/library modules. Word-page
data lives under `src/data/seo/wordPages/`; word-page metadata under
`src/seo/wordPages/`; hub metadata under `src/seo/hubPages/`.

**Allowed local exception:** small config/lookup code may stay beside a
page family when it has no independent data-layer ownership and serves
only that family. `devSeoCefrPreviewData.ts` is the current example —
despite its legacy name, it and `DevSeoCefrPlaceholderPage.tsx` are
production runtime code (see "Known legacy naming"), not renamed here. See
[`docs/generated-data.md`](../../../docs/generated-data.md) for
generated-data ownership rules.

## Dependency direction

As architectural conventions (not all machine-enforced — see below):

- pages may import app components;
- pages may compose public feature APIs;
- pages may import shared data, SEO, context, utility, and library modules;
- one page family must not import another page family's private files;
- supporting files inside a page family should not become global
  dependencies without reconsidering ownership;
- general business logic should not be created inside `pages/` for
  convenience.

Only `import.meta.glob` path-sensitivity is currently guarded (see
[`docs/import-boundaries.md`](../../../docs/import-boundaries.md)) —
general pages/family dependency direction is a convention, not a guard.

## Creating a new page folder

Justified when a route has one or more exclusively owned supporting
files, multiple route variants share one clear page-family owner, a
meaningful domain/subtype taxonomy exists, or the folder name communicates
route/ownership scope. Do not create one when the page is a single
standalone file, the only motivation is visual consistency, the folder
would hold one file indefinitely, the name would be vague, or the
grouping is by component type alone.

Discourage vague names (`shared/`, `common/`, `miscellaneous/`, `helpers/`)
and visual-type folders (`dialogs/`, `layouts/`, `views/`, `components/`)
inside a page family — not forbidden outright, but they need real
multi-file ownership evidence, which no current family has.

## Placement checklist

1. Route-level page with no supporting files? → `src/app/pages/`.
2. Route owns additional views, layouts, dialogs, or local config? →
   `src/app/pages/<family>/`.
3. Part of a real domain/subtype taxonomy? → `src/app/pages/<domain>/<subtype>/`.
4. Reused by unrelated pages or features? → consider `src/app/components/`.
5. A reusable product workflow or capability? → `src/features/<feature>/`.
6. Generated, cross-route, or domain-wide data? → `src/data/`.
7. Shared metadata or SEO infrastructure? → `src/seo/`.
8. Ownership unclear? → inspect all consumers before choosing a folder.

## Known legacy naming

`DevSeoCefrPlaceholderPage.tsx` and `devSeoCefrPreviewData.ts` are
**production runtime files** despite their legacy "dev"/"preview" names —
known and documented, not a bug. Do not rename them during unrelated
cleanup.

`SeoHubPage.tsx` is the general SEO hub; `word-pages/hub/WordSeoHubPage.tsx`
is the word-specific hub page — similar names, genuinely distinct route
families. Neither is a rename candidate.

## Anti-patterns

- Putting every route component directly under `pages/` even after it
  gains supporting files.
- Creating a folder for every standalone page.
- Moving a modal into `components/dialogs/` based only on visual type.
- Moving a layout into `components/layout/` based only on its filename.
- Creating `shared/` as a catch-all.
- Importing private files from another page family.
- Putting generated or cross-route datasets inside `pages/`.
- Placing reusable product workflows under `pages/` instead of `features/`.
- Creating local `components/`, `dialogs/`, `layouts/`, `views/`, or
  `data/` folders without enough files or a real ownership boundary.
- Renaming known legacy production files during unrelated cleanup.

## Related documentation

- [`docs/architecture.md`](../../../docs/architecture.md) — full repository
  architecture and ownership history.
- [`docs/generated-data.md`](../../../docs/generated-data.md) — generated
  vs. hand-maintained data ownership.
- [`docs/import-boundaries.md`](../../../docs/import-boundaries.md) —
  `import.meta.glob` path-sensitivity guards.
- [`src/app/components/README.md`](../components/README.md) — components
  ownership rules.
- [`src/features/user-profile/README.md`](../../features/user-profile/README.md)
  — example of feature-local ownership rules.
