# App Hooks

## 1. Purpose

`src/app/hooks/` contains React hooks for genuinely **application-wide**
orchestration and infrastructure — behavior whose state, effects, or
outputs are consumed across unrelated page or feature owners. Examples
currently living here:

- authentication/session lifecycle;
- cross-route language synchronization;
- persisted application preferences;
- route synchronization;
- app-shell account flows;
- state shared across unrelated pages or features (e.g. a popup triggered
  from one page family and rendered on another).

This folder is **not** a general-purpose dumping ground for every hook in
the app. A hook with a single page, feature, or component owner belongs
beside that owner, not here.

## 2. Core ownership rule

**Colocate a hook with its narrowest stable owner.** Keep a hook in
`src/app/hooks/` only when its state, effects, or outputs are genuinely
consumed across unrelated page or feature owners.

Being called from `App.tsx` is **not**, by itself, enough reason for a
hook to live here — `App.tsx` is often just the current orchestration
point, not the real owner. The test is where the hook's behavior and
outputs are actually *consumed* (which component renders its state, which
routes its effects touch), not where it happens to be called.

## 3. What belongs here

**Authentication and profile infrastructure**
- `useAuthSession` — global Supabase session lifecycle, read by the header
  and every other account-related hook.
- `useUserProfileLoad` — loads/merges the signed-in profile, consumed by
  the header (nickname) and the profile route on every page.

**App-shell account flows**
- `useAccountOnboarding` — drives a dialog rendered from nearly every
  route branch.
- `useAccountLanguageConfirm` — drives a dialog gated on cross-cutting
  auth/profile/language state (see §9).

**Cross-route language and routing coordination**
- `useRouteLanguageSync` — syncs UI language from several unrelated route
  families (word pages, SEO hubs, vocabulary, verb lists, level-test SEO).
- `usePracticeRouteLanguageSync` — canonical practice-route ↔ language
  state sync.
- `useStoredLanguageAutoRedirect` — one-shot navigation from stored
  language preferences.

**Application-wide persisted state**
- `useStoredAppPreferences` — language pair and exercise-filter selections,
  read/written across most interactive routes.

**Cross-page orchestration**
- `useLanguageContinuePopup` — see §9; triggered from unrelated page
  families, rendered on the home page.

This is not meant to be a line-by-line API reference — read each file's
own header comment for exact inputs/outputs.

## 4. What does not belong here

The following should be colocated elsewhere instead:

- hooks used by only one page family;
- hooks used by only one feature;
- hooks used by only one component;
- pure helpers that don't use React state, effects, refs, or context —
  those belong in `app/utils/` or `lib/`, not wrapped in a hook;
- service or data-fetching modules disguised as hooks;
- hooks placed here only because `App.tsx` currently calls them.

**Concrete example:** `useExploreItems` was removed from this folder and
moved to
[`src/app/pages/explore/useExploreItems.ts`](../pages/explore/useExploreItems.ts)
because it was owned exclusively by the Explore page family — its output
fed only `ExplorePage.tsx`, and nothing else in the app consumed it.

## 5. Placement decision checklist

Before adding a new hook here, ask:

1. Which page, feature, component, or app-shell concern owns the behavior?
2. Is the hook consumed across unrelated route families?
3. Would removing one feature or page make the hook useless?
4. Does the hook depend on private page or feature contracts?
5. Is it genuinely React-specific, or should part of the logic be a pure
   utility?
6. Does it coordinate global lifecycle, routing, persistence, or session
   state?

Then place it:

- one page owner → colocate with that page (`src/app/pages/<family>/`);
- one feature owner → place under that feature (`src/features/<feature>/`);
- one component owner → colocate with that component;
- genuine cross-route app-shell concern → `src/app/hooks/`.

## 6. Dependency rules

App-level hooks here may depend on:

- `contexts/`;
- `lib/`;
- `app/utils/`;
- routing utilities (e.g. `app/utils/pageRouting.ts`);
- browser APIs, when properly guarded (`canUseLocalStorage()`,
  `typeof window !== "undefined"`);
- data genuinely needed by app-wide behavior.

They should **not** normally depend on:

- private page-family implementation details;
- private feature implementation details;
- UI components;
- route-specific presentation code.

A type-only dependency on a page/feature type may be tolerated when
justified (e.g. a ref handle type), but should not become a pattern that
obscures ownership — if a hook needs more than a type from one page or
feature, that's a signal it may not belong here.

## 7. Folder shape

`src/app/hooks/` stays **flat**. Do not create topic subfolders such as
`auth/`, `account/`, `language/`, or `routing/` merely to group files —
grouping by topic alone doesn't clarify ownership and adds navigation
overhead for a folder this size.

A subfolder here is justified only when several genuinely app-wide hooks
share a distinct ownership boundary *and* the grouping materially improves
dependency clarity — not simply because their names sound related.

The same restraint applies outside this folder: avoid one-file `hooks/`
subfolders beside pages or features. A single owned hook should usually
sit flat beside its owner (see the `explore/` and `home/` examples in
[`../pages/README.md`](../pages/README.md)).

## 8. Lifecycle and call-order invariants

Several hooks here have effects whose correctness depends on the order
`App.tsx` calls them in. Moving or refactoring any of these must preserve
that call order:

- `useStoredAppPreferences` must run **before** `useStoredLanguageAutoRedirect`
  — the redirect decision reads a ref that the preferences hook's
  storage-load effect populates.
- `usePracticeRouteLanguageSync` must remain **after** `useRouteLanguageSync`
  and **before** `useStoredLanguageAutoRedirect`.
- Extracting or relocating a hook must preserve `App.tsx`'s existing call
  order wherever effects depend on declaration order — React fires a
  component's effects in declaration order, so reordering call sites can
  silently change behavior even if no hook's internals change.
- Canonical practice-route state must take precedence over stored language
  preferences (a valid canonical practice URL must not be overwritten by a
  different stored pair).
- Account-language changes must only be persisted through the explicit
  "Save to account" flow — do not reintroduce automatic Supabase
  synchronization on every language change.

These invariants are enforced by focused regression scripts rather than
restated here in full:

- `scripts/test-practice-route-sync.mjs`
- `scripts/test-account-language-sync.mjs`

## 9. Current exceptions that are intentional

Some hook names or adjacent components suggest a narrower scope than the
hook actually has. Do not move these based on filename or component
adjacency alone:

**`useAccountLanguageConfirm`**
- Drives a single dialog (`AccountLanguageConfirmDialog`).
- But depends on app-wide authentication, profile, and language state, and
  is documented app-shell infrastructure (see
  [`../../../docs/architecture.md`](../../../docs/architecture.md) and
  [`../../features/user-profile/README.md`](../../features/user-profile/README.md)).
- Intentionally remains here, not beside the dialog or inside a feature.

**`useLanguageContinuePopup`**
- Its popup renders through the home page.
- But it can be *triggered* from multiple unrelated route families
  (vocabulary and SEO pages navigating toward the language page), not just
  the home page itself.
- It therefore remains cross-page orchestration, not homepage-owned.

## 10. Anti-patterns

- Placing every new hook in `app/hooks/` by default.
- Grouping hooks by topic without a real ownership boundary.
- Moving a hook based only on matching component or page names.
- Merging related hooks into one oversized orchestration hook.
- Changing hook call order in `App.tsx` without reviewing effect-order
  assumptions (see §8).
- Keeping pure policy logic inside a hook when it can be safely separated
  into a testable utility (most hooks here already delegate decisions to
  `app/utils/*Policy.ts` helpers — follow that pattern).
- Importing private page or feature implementation details into a generic
  app hook.

## 11. Related documentation

- [`../pages/README.md`](../pages/README.md) — page/page-family ownership
  rules, including the `explore/` and `home/` colocation examples
  referenced in §4 and §7.
- [`../components/README.md`](../components/README.md) — ownership rules
  for the `AccountOnboardingDialog`/`AccountLanguageConfirmDialog`
  components driven by hooks in this folder.
- [`../../../docs/architecture.md`](../../../docs/architecture.md) — full
  repository architecture and ownership history.
- [`../../../docs/import-boundaries.md`](../../../docs/import-boundaries.md)
  — `import.meta.glob` path-sensitivity guards to check before moving any
  consumer file or data directory.
- [`../../features/user-profile/README.md`](../../features/user-profile/README.md)
  — explains why account/profile hooks stay here instead of moving into
  the user-profile feature.
