# Utils

## Purpose

`src/utils/` contains **repository-wide, framework-independent**
utilities — plain functions with no dependency on React, the app shell,
or any app-private contract. Code here may legitimately be shared by
`src/app/`, `src/data/`, `src/seo/`, and Node-based `scripts/` without
introducing a wrong dependency direction, because none of those areas is
this folder's owner or its consumer-of-record — all of them are peers
that may use it.

This folder existing at the repository root, as a peer of `src/app/`
rather than inside it, is intentional: placing repository-wide code
inside `src/app/utils/` would make `src/data/`, `src/seo/`, and
`scripts/` depend on an app-private folder, which is the wrong direction
for code those layers don't own.

## Ownership Rule

A file belongs here only if it:

- is framework-independent (no React, no app-private types);
- has no dependency on app-private contracts (`contexts/`, page/feature
  internals, application-shell state);
- may legitimately be used by multiple top-level areas of the repository
  (`app/`, `data/`, `seo/`, `scripts/`), not just one;
- is not owned by a page, a feature, or the application shell.

Narrow ownership always wins. A file with real consumers in only one of
those top-level areas belongs with that area instead — this folder is not
a default home for "generic-looking" code.

## Current Example

`fixMojibake.ts` is the current occupant. At a high level, it repairs
corrupted text and is consumed by both the SEO/data layer and application
pages that render that data — its real consumers span more than one
top-level area of the repository. It is intentionally outside `src/app/`
for that reason: it is not app-shell logic that happens to be reusable,
it is genuinely repository-wide logic that `src/app/` is only one
consumer of.

This folder containing only one file is not evidence that it should be
merged elsewhere — the ownership rule above, not file count, decides
whether a file lives here.

## Dependency Rules

Files here may be depended on by:

- `data/`;
- `seo/`;
- `app/`;
- `scripts/`.

Files here must **not** depend on:

- React components or hooks;
- `contexts/`;
- page-specific logic;
- feature-specific logic;
- application-shell contracts (routing, account/profile policy, or
  anything defined in `src/app/utils/`).

A file here must remain usable without `src/app/` present at all.

## Placement Checklist

Before adding a file here, ask:

1. Is it truly repository-wide, or does it just look generic?
2. Does it avoid all app-private dependencies?
3. Could it belong beside a page? → `src/app/pages/<family>/`.
4. Could it belong beside a feature? → `src/features/<feature>/`.
5. Could it belong in `lib/` (data access, external services)?
6. Could it belong in `data/` or `seo/` (datasets, data transforms, SEO
   infrastructure)?

Only if the answer to every alternative is "no," and it is genuinely
repository-wide, should it live here.

## Anti-patterns

- Moving a page-owned helper here because it "seems reusable."
- Moving app-shell policy here instead of `src/app/utils/`.
- Using this folder as a miscellaneous dumping ground.
- Introducing a dependency on React, `contexts/`, or any app-specific
  contract.
- Assuming a small file count means the folder should be merged away.

## Related Documentation

- [`../app/utils/README.md`](../app/utils/README.md) — the app-shell
  counterpart of this folder; explains the boundary between the two.
- [`../app/pages/README.md`](../app/pages/README.md) — page/page-family
  ownership rules.
- [`../app/hooks/README.md`](../app/hooks/README.md) — hook ownership
  rules.
- [`../app/components/README.md`](../app/components/README.md) —
  component ownership rules.
