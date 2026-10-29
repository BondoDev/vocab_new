# Learning Setup

## Purpose

`learning-setup/` owns the workflow that prepares a practice session
before it begins: selecting language filters, levels, categories, word
types, and exercise types, plus the feature-owned setup configuration
those selections read from.

The feature prepares a session. It does not execute one — that is
Practice's responsibility (see "Relationship with Practice" below).

## Current Structure

```
learning-setup/
  ExerciseSelection.tsx
  ExerciseOptionTiles.tsx
  exerciseOptions.ts
  LevelCategorySelection.tsx
  CefrLevelTiles.tsx
  filterSelection.ts
  filterLabels.ts
  useFilterVocabulary.ts
  data/
    categories.json
  styles/
```

- `LevelCategorySelection.tsx` — level, category, and word-type
  selection.
- `CefrLevelTiles.tsx` — controlled CEFR level tiles shared by the
  filters page and the Custom Practice setup page. Both write the same
  `App.tsx`-owned level list, so the pages cannot drift apart.
- `filterSelection.ts` — import-free selection helpers for the vocabulary
  filters: selection state and summaries (one / several / all /
  unrestricted), toggles, and plural-aware count copy. It documents why
  levels keep an explicit list while topics and word types use `[]` for
  "all".
- `filterLabels.ts` — filter option lists (levels, topics from
  `data/categories.json`) and their localized labels and summaries, shared
  by both pages.
- `useFilterVocabulary.ts` — loads the practice language's vocabulary
  metadata and answers "does this filter combination still match words?",
  the guard both pages apply before changing a filter.
- `ExerciseSelection.tsx` — exercise-type selection.
- `ExerciseOptionTiles.tsx` — controlled exercise tiles shared by the existing
  Exercises page and the Custom Practice setup page; owns the unchanged
  last-selected-exercise guard and the original exercise-card presentation.
- `exerciseOptions.ts` — the existing setup option metadata, shared by both
  entry points and checked against the canonical exercise-id contract.
- `data/categories.json` — feature-owned category configuration (see
  "Feature-owned Data" below).

This README does not enumerate implementation details — read the files
themselves for exact current behavior.

## Feature Entry

`ExerciseSelection.tsx` and `LevelCategorySelection.tsx` are independent,
route-level feature entry components, each composed directly by
`App.tsx`. They remain feature-owned workflow components rather than
generic application UI.

`ExerciseSelection` also supports an embedded mode for setup pages. It reuses
the original cards and help dialogs without rendering the standalone page's
heading, navigation, or start action. State remains controlled by `App.tsx`;
the embedding page owns its final practice action.

## Feature-owned Data

`data/categories.json` is feature-owned configuration:

- it is read only through `filterLabels.ts`, within this feature (the
  Custom Practice setup page reaches topic labels through that module,
  not the file);
- it is intentionally colocated with its owner rather than centralized;
- it holds a static list of topic labels for this feature's category
  filter, not a shared vocabulary dataset.

Contrast this with `src/data/`, which owns shared vocabulary and
metadata datasets consumed across the app (including, separately, by
this feature's dynamic per-language metadata loading). `categories.json`
does not belong there — its only reader is inside this feature.

## Relationship with Practice

- Learning Setup gathers configuration (level, category, word types,
  which exercises are enabled).
- `App.tsx` transfers that configuration as plain state/props.
- Practice executes the configured session.

Learning Setup must never import Practice implementation. Practice must
never import Learning Setup implementation. The two communicate only
through `App.tsx`-carried state and the neutral shared contracts in
`src/exercises/` (see below).

## Shared Contracts

Learning Setup depends on `src/exercises/` for canonical exercise
identifiers and presentation/theme mappings — it does not own that
contract.

Learning Setup chooses identifiers (which exercises the user enabled);
Practice executes them. Neither feature owns the identifier contract
itself — it lives in `src/exercises/` precisely because both features
depend on it.

## Relationship with App

`App.tsx` owns route composition, navigation, lifecycle, and the state
transfer between feature workflows (learning-setup → practice). Learning
Setup owns only the setup workflow — it does not own, and must not
absorb, application-shell responsibility merely because `App.tsx`
renders it.

## Internal Ownership Rules

- Configuration UI belongs here.
- Feature-specific data belongs here.
- Feature-specific presentation belongs here.
- Do not move a feature-owned file out just because this feature is
  small — a feature does not need many files to justify its existence.

## Internal Structure

This feature intentionally remains mostly flat. Its current size and
complexity do not justify additional folders such as `components/`,
`hooks/`, or `utils/`. Avoid adding internal structure preemptively —
wait for genuine ownership complexity (a second file that clearly shares
a boundary with an existing one) before introducing a subfolder.

## Dependency Rules

Learning Setup may depend on:

- shared contexts (`src/contexts/`);
- shared datasets (`src/data/`);
- the neutral shared contracts in `src/exercises/`;
- the application shell (`App.tsx` composition).

Learning Setup should not depend on:

- Practice internals;
- unrelated features;
- application-wide infrastructure ownership (that belongs in `src/app/`).

## Placement Checklist

Before adding a file under `learning-setup/`, ask:

- Is Learning Setup its narrowest stable owner?
- Is it only used during session preparation?
- Does it belong to Practice instead?
- Does it belong to shared data?
- Does it belong to App?

## Anti-patterns

- Moving `categories.json` into shared data without another real
  consumer.
- Importing Practice implementation.
- Creating subfolders without a genuine ownership need.
- Promoting setup-specific logic into the app shell prematurely.
- Adding internal structure purely for symmetry with other features.

## Documentation Maintenance

Review this README when:

- ownership changes;
- feature boundaries change;
- internal responsibilities change;
- dependency rules change.

Routine implementation changes do not require documentation edits.

## Related Documentation

- [`../README.md`](../README.md)
- [`../practice/README.md`](../practice/README.md)
- [`../user-profile/README.md`](../user-profile/README.md)
- [`../../app/pages/README.md`](../../app/pages/README.md)
- [`../../app/components/README.md`](../../app/components/README.md)
- [`../../../docs/architecture.md`](../../../docs/architecture.md)
- [`../../../docs/import-boundaries.md`](../../../docs/import-boundaries.md)
