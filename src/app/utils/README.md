# App Utils

## 1. Purpose

`src/app/utils/` contains framework-independent logic that supports the
**application shell** or **multiple unrelated app owners**: routing
contracts, account/profile policy, persisted-preference decisions, and
storage adapters. Everything here is a plain function or a small set of
pure/typed helpers — no React state, no rendering, no single-page or
single-feature business logic.

It is **not** a generic dumping ground for "helper" code. A file only
belongs here when its narrowest stable owner is genuinely the app shell
itself, not one page, one feature, or one component.

## Current structure

```
src/app/utils/
  accountLanguageSave.ts
  accountOnboarding.ts
  accountProfile.ts
  languageProfileSyncPolicy.ts
  pageRouting.ts
  practiceRouteCanonicalizationPolicy.ts
  starField.ts
  storage.ts
  storedLanguageAutoRedirectPolicy.ts
  storedLanguagePreferencePolicy.ts
```

## 2. Ownership Rule

**Colocate with the narrowest stable owner; keep here only what has none.**
A file belongs in `src/app/utils/` only if it:

- supports the application shell or is consumed by more than one
  unrelated app owner (multiple hooks, or a hook plus `App.tsx`);
- is not owned by a single page family;
- is not owned by a single feature;
- is not better classified as a data-access layer (`lib/`), a dataset or
  data-transform (`data/`), SEO infrastructure (`seo/`), or shared React
  state (`contexts/`).

Narrow ownership always wins. If a file's only consumers turn out to be
one page family's own files, it should move there — this folder is a
fallback for genuinely shared logic, not a first choice.

## 3. What Belongs Here

**Routing contract** — `pageRouting.ts` is the single pathname-to-page
classifier (`pageFromPath`) and the shared `PageKey`/`InteractiveRouteMap`
types that `App.tsx` and multiple routing hooks depend on. It must behave
identically across client routing, prerendering, and Worker SSR, which is
why it is centralized rather than duplicated per consumer.

**Account/profile policy** — `accountProfile.ts`, `accountOnboarding.ts`,
`accountLanguageSave.ts`, and `languageProfileSyncPolicy.ts` are pure
merge, validation, and decision functions that sit above `lib/userProfile.ts`
(the actual Supabase/localStorage data-access layer). They are shared
across more than one account-related hook, which is what keeps them here
instead of beside a single dialog.

**Persisted-preference and redirect policy** —
`practiceRouteCanonicalizationPolicy.ts`, `storedLanguageAutoRedirectPolicy.ts`,
and `storedLanguagePreferencePolicy.ts` each own one narrow decision about
what a stored/derived language state should do to the current route. They
compose together in the app-shell hooks that call them; none of them
duplicates another's decision.

**Storage adapter** — `storage.ts` provides SSR-guarded localStorage read
helpers, safe to call from any environment.

**App-shell visual support** — `starField.ts` is a deterministic (seeded,
not `Math.random`) background-image generator, kept here because it was
extracted as shared app-shell logic rather than a single component's
private helper.

## 4. What Does NOT Belong Here

A helper owned by exactly one page family, one feature, or one component
family should live beside that owner instead — not here "for
organization."

**Concrete example:** `exploreTopics.ts` was removed from this folder and
moved to
[`src/app/pages/explore/exploreTopics.ts`](../pages/explore/exploreTopics.ts),
beside `ExplorePage.tsx` and `useExploreItems.ts`, once it became
exclusively owned by the Explore page family — nothing outside that
family consumed it. The same reasoning applies to any future file added
here: if its only consumers converge on one page or feature folder, it
has already found its real owner.

## 5. Dependency Rules

Files here may depend on:

- `contexts/`;
- `lib/`;
- `data/`;
- `seo/`;
- sibling `app/utils/` files.

Files here must **not** depend on:

- private page-family internals (`src/app/pages/<family>/...`);
- private feature internals (`src/features/<feature>/...`);
- specific UI components.

Utilities support pages and hooks — they do not depend on them. A utility
that starts needing something from one page's private files is a signal
that the utility (or the responsibility) belongs with that page instead.

## 6. Policy Files

Several files intentionally separate pure decision logic from the React
hook that acts on it: `languageProfileSyncPolicy.ts`,
`practiceRouteCanonicalizationPolicy.ts`,
`storedLanguagePreferencePolicy.ts`, and
`storedLanguageAutoRedirectPolicy.ts`. Each exports a small decision
function (e.g. "should this redirect happen") with no React dependency.

This separation is deliberate, not incidental — it keeps the decision:

- easy to test in isolation;
- reusable independent of any specific hook's lifecycle;
- free of effect-ordering and re-render concerns.

Prefer this pattern for new app-shell decisions: put the decision in a
plain function here, and let the hook that owns the surrounding lifecycle
call it.

## 7. Script Compatibility

Several policy/orchestration files (`accountLanguageSave.ts`,
`languageProfileSyncPolicy.ts`, `practiceRouteCanonicalizationPolicy.ts`,
`storedLanguageAutoRedirectPolicy.ts`, `storedLanguagePreferencePolicy.ts`)
are deliberately import-free, or import only erasable types, because
Node-based regression scripts (`scripts/tests/account/test-account-language-sync.mjs`,
`scripts/tests/practice/test-practice-route-sync.mjs`) load them directly without a
bundler.

This constraint exists today and should be respected: before adding a
runtime import to one of these files, check whether a script under
`scripts/` loads it directly, and update that script if the import is
genuinely necessary.

## 8. Flat Folder Policy

`src/app/utils/` stays **flat**. The current files form a few loose
thematic clusters (account/profile, routing/preference), but no cluster
is large or distinct enough on its own to justify a subfolder, and a
one-file subfolder is never justified.

A subfolder here would only be justified if a cluster grew enough files
to share a genuinely distinct dependency boundary — not merely a similar
name or topic.

## 9. Placement Checklist

Before adding a new file here, ask:

1. Is this owned by exactly one page family? → colocate with that page.
2. Is this owned by exactly one feature? → place under that feature.
3. Is `lib/` the true owner (data access, external service calls)?
4. Is `data/` or `seo/` the true owner (datasets, data transforms, SEO
   infrastructure)?
5. Is this actually routing policy that belongs beside `pageRouting.ts`,
   or duplicates a decision an existing policy file already owns?
6. Is this genuinely application-shell infrastructure, consumed across
   unrelated app owners?
7. Does an existing utility here already own this responsibility?

If the answer to 1 or 2 is yes, this is not the right folder.

## 10. Anti-patterns

- Adding a page-owned or feature-owned helper here "for consistency."
- Creating a generic `misc.ts` or `helpers.ts` catch-all.
- Re-implementing a decision an existing policy file already makes.
- Importing private page, feature, or component internals into a file
  here.
- Adding a runtime import to a script-compatible policy file without
  checking `scripts/` first (see §7).

## 11. Related Documentation

- [`../pages/README.md`](../pages/README.md) — page/page-family ownership
  rules, including the `explore/` colocation example referenced in §4.
- [`../hooks/README.md`](../hooks/README.md) — the hook-level counterpart
  of this folder's ownership rule, including the same
  policy-function-under-a-hook pattern referenced in §6.
- [`../components/README.md`](../components/README.md) — ownership rules
  for app-level components.
- [`../../../docs/architecture.md`](../../../docs/architecture.md) — full
  repository architecture, including `pageRouting.ts`'s role as the
  shared route-classification contract.
