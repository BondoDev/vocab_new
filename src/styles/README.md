# Styles

## Purpose

`src/styles/` owns only application-wide styling infrastructure: font-loading
policy, the Tailwind bootstrap, design tokens/theme mappings, and true
global/base element resets.

It is **not** the correct location for:

- page-specific styles;
- feature-specific styles;
- component-specific styles;
- layout-component styles.

Those belong beside their real owner — see "Ownership rule" below.

## Current files

```
src/styles/
  fonts.css
  index.css
  tailwind.css
  theme.css
```

### `fonts.css`

Documents the font-loading policy. Fonts themselves are loaded through
`<link>` elements in `index.html`, not through this file. It intentionally
does not contain a render-blocking remote `@import` — that trade-off is the
reason this file exists and stays a comment rather than an actual `@import`.

### `tailwind.css`

Bootstraps Tailwind CSS v4: registers source discovery and imports
`tw-animate-css`. Should not accumulate page- or component-specific
selectors.

### `theme.css`

Owns CSS custom properties, theme tokens, and Tailwind theme mappings, plus
true global/base element styling (`html`, `body`, headings, form elements).

It also currently contains a page-root typography selector registry (rules
keyed off page-root classes such as `.language-page`, `.filters-page`,
`.exercise-page`, `.about-page`, `.help-page`, `.practice-main`,
`.practice-card`). This is a **deliberate, centralized exception** — not a
general precedent for adding page-specific styling to this file. Do not
treat `theme.css` as tokens-only; it is tokens + base resets + this one
documented registry.

### `index.css`

The global style entry point. Imports, in order:

1. `fonts.css`
2. `tailwind.css`
3. `theme.css`

This order is deliberate and should not be casually changed.

## Ownership rule

| Scope | Location |
|---|---|
| Global infrastructure | `src/styles/` |
| Page styles | Beside the page |
| Feature styles | Inside the owning feature |
| Component/layout styles | Beside the owning component boundary |

Current owner-local examples:

- `src/app/components/layout/styles/header.scss` — owned by `Header.tsx`.
- `src/app/pages/about-help.scss` — jointly owned by `About.tsx` and
  `Help.tsx`.
- `src/app/pages/home/language-page.scss` — owned by `HomePage.tsx`.
- `src/features/learning-setup/styles/exercise-selection.scss` — owned by
  `ExerciseSelection.tsx`.
- `src/features/learning-setup/styles/level-category-selection.scss` —
  owned by `LevelCategorySelection.tsx`.
- `src/features/practice/styles/exercises.scss` — owned by
  `VocabularyPractice.tsx` and the exercise-type components it renders.
- `src/features/user-profile/styles/user-profile-sidebar.scss` — owned by
  `UserProfileSidebar.tsx`.

These are current architecture, not a migration in progress.

## Owner-local import rule

Owner-specific stylesheets should normally be imported by the owning page,
feature entry component, or component boundary — not from:

- `src/entry-client.tsx`;
- `src/main.tsx`;
- `src/App.tsx`;
- `src/styles/index.css`.

Jointly owned styles may be imported explicitly by each owner, as with
`src/app/pages/about-help.scss`, imported by both `About.tsx` and `Help.tsx`.

## Tailwind cascade-layer relationship

Tailwind v4 emits its framework rules inside native CSS cascade layers.
Current owner-local SCSS files are **unlayered**. Per the cascade-layers
spec, unlayered author rules always outrank layered author rules —
regardless of specificity or simple source-order differences — so
owner-local SCSS overriding Tailwind utility classes works because of this
layering, not because of import order relative to `tailwind.css`.

Cautions:

- Do not wrap an existing owner-local stylesheet in `@layer` casually —
  doing so moves it into the layered cascade and can materially change
  precedence against Tailwind utilities.
- Import order is still relevant when two **unlayered** stylesheets contain
  colliding selectors — the layering guarantee only concerns
  layered-vs-unlayered precedence, not order among unlayered files
  themselves. Import order is not irrelevant in general.
- Existing `!important` usage should not be broadly removed as part of
  unrelated ownership work — some of it predates this layering behavior and
  removing it is a separate, deliberate task (see "Scope boundaries").

## Sass policy

Current `.scss` files use Sass primarily for nesting and local stylesheet
organization, not advanced Sass features.

- Keep `.scss` when moving an existing SCSS file.
- Do not convert SCSS to CSS merely because advanced Sass features are not
  currently used.
- Do not introduce shared mixins, variables, or partials without a real
  cross-owner need.
- Do not centralize feature-owned styling merely to share a technology.

## Naming and placement guidance

- Use kebab-case filenames.
- Prefer names that reflect the durable owner or responsibility, not a
  legacy route or historical term.
- Use a feature-level `styles/` directory when multiple stylesheets share
  that feature boundary, or when a single stylesheet genuinely serves the
  whole feature rather than one component.
- Avoid speculative one-file folders unless the ownership boundary is
  meaningful.
- Avoid placing new files in `src/styles/` merely because they are CSS or
  SCSS — that alone is not global-infrastructure ownership.

`exercise-selection.scss` belongs to Learning Setup;
`exercises.scss` belongs to the Practice runtime. Despite similar names,
they represent different ownership domains — do not merge or treat them as
duplicates.

## Change-safety checklist

When moving or adding an owner-local stylesheet:

- [ ] Identify all selector consumers.
- [ ] Confirm the real import owner.
- [ ] Preserve stylesheet contents byte-for-byte during ownership-only
      moves.
- [ ] Use `git mv`.
- [ ] Remove obsolete central imports.
- [ ] Search the repository for stale paths.
- [ ] Preserve selectors, media queries, line endings, and cascade-layer
      status (unlayered stays unlayered).
- [ ] Visually inspect affected routes and responsive breakpoints.
- [ ] Avoid combining an ownership move with selector cleanup, Tailwind
      rewrites, breakpoint consolidation, or `!important` removal.

## Scope boundaries

The following are separate tasks and should not be mixed into ordinary
ownership moves:

- breakpoint-system consolidation;
- `theme.css` restructuring;
- Tailwind migration or removal;
- Sass removal;
- selector renaming;
- broad `!important` cleanup;
- visual redesign.
