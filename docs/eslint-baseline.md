# ESLint setup baseline

Recorded 2026-10-15 with `eslint.config.mjs` and the npm lockfile's ESLint
10.12.0, @eslint/js 10.0.1, typescript-eslint 8.71.2,
eslint-plugin-react-hooks 7.1.1, and globals 17.13.0. These five packages are
development-only additions; no existing locked package versions changed.

Command: `npm run lint`. This initial pass checks 512 files and reports
**15 errors and 48 warnings across 39 files**, with no parse/configuration errors.
The command exits **1**, intentionally preserving the findings for review rather
than suppressing them to create an artificial green baseline. No autofix ran.
Counts and line numbers are a point-in-time snapshot, not permanent invariants.

## Round 1 remediation

The CEFR page now mounts a non-null resolved-content child with unconditional
Hooks. MobileKeyboard memoizes the complete long-press callback dependency chain;
its document-listener effect follows that chain and cleans up before rebinding.
Unchanged callback inputs retain listener identity across unrelated renders.

`npm run test:react-hook-remediation` covers fallback/resolved transitions and
current value, callback, disabled, shift/language, and listener-cleanup contracts.
Its opt-in `-- --browser` mode mounts React with isolated page/data fixtures;
see `scripts/README.md` for the browser prerequisites and scope.

After these two fixes, ESLint checks **513 files** and reports **10 errors and
47 warnings across 37 files**. The five conditional-Hook errors and the keyboard
dependency warning are resolved without rule suppressions. The original inventory
below remains the historical setup snapshot; other findings are outside Round 1.

## Round 2 remediation

Current lint result: **0 errors and 0 warnings across 514 files**, down from
10 errors and 47 warnings across 37 files after Round 1. ESLint configuration
and dependency versions are unchanged; no automatic fixes or broad exclusions
were used.

### Corrections and lifecycle contracts

- Removed four dead assignments without changing branches, array traversal,
  timer/persistence calls, or test assertions. Character styles remain assigned
  by the same exhaustive branches.
- Replaced three constant test expressions with calculations from their actual
  stored-language fixtures. Existing expected outcomes remain independent.
- Resolved 15 unused-declaration warnings. Retained migration file reads and
  strengthened the migration-readability, single-flight request-count, and
  Custom Practice persistence-import assertions instead of discarding useful
  instrumentation. Public exports were not removed.
- Completed 27 Hook dependency arrays or stabilized their callback/memo inputs.
  App passes the module-level ROUTES object; state setters, ref identities,
  translation functions, route paths, and storage-key strings are explicit
  inputs. Stored-preference loading and profile fetching retain their existing
  triggers because the added inputs are stable at their application call sites.
- Memoized exam question generation only over its existing data/level inputs;
  question-index changes still generate a question and completion still skips
  generation. Feedback and answer renders cannot reshuffle questions.
- Memoized BrokenWord initialization and the Practice advance/Next/label callback
  chain. Word/status changes still update the appropriate closures; unrelated
  renders do not reset exercises or churn the Enter listener. The 180ms advance
  retains its invocation-time snapshot rather than reading a later render.
- Stabilized empty chart/list arrays and removed the unused wordSlug metadata
  memo dependency. No metadata builder, visible markup, or fetch body changed.
- Removed exactly five obsolete Hooks directives (Header, ReviewSession,
  ReviewWordsPreparation, NewWordStudyPreparation, NewWordStudySession).
  Other intentional existing lifecycle directives remain unchanged.

Three profile/onboarding guards previously encoded the literal dependency
spelling [authUserId]. They now locate the profile-loading effect structurally
and assert its exact account-id-plus-stable-setters dependency set. All existing
signed-out, no-session-signup, stale-response, onboarding, and security
assertions remain; live language values still cannot become fetch triggers.

### Intentional exceptions

Exactly three new statement-level no-control-regex exceptions preserve the
original negated ASCII expressions byte-for-byte:

| File | Reason |
|---|---|
| scripts/seo-baseline/fixtures.mjs | Select a Unicode/diacritic slug fixture. |
| scripts/tests/routing/test-word-route-manifest.mjs | Assert that accented slugs retain non-ASCII characters. |
| workers/word-ssr/generation/generate-full-corpus.mjs | Select the existing accent fixture without changing corpus generation. |

Each directive explains why the zero-codepoint ASCII boundary is intentional.
No new Hooks suppression or rule-configuration exclusion was added.

### Regression coverage and limits

The new file scripts/tests/runtime/test-eslint-effect-lifecycles.mjs follows
scripts/README.md's runtime-test ownership and named-npm-entry conventions,
exposed as npm run test:eslint-effect-lifecycles. No folders were added.
It executes source-derived memo callbacks/effect dependencies with isolated
fixtures, including one-shot redirects, stable fetch/load triggers, all seven
Explore item lists, exam feedback/completion, BrokenWord reset boundaries,
HalfWritten validation, Practice Enter-listener identity and delayed snapshots,
and stable chart/list data inputs.

This deterministic scheduler is not React's mounted effect scheduler and does
not contact Supabase. Round 1's opt-in Chrome test remains the mounted check for
CEFR transitions and MobileKeyboard popup updates; it is not a full-application,
mobile-device, exam, authentication, or backend integration test.

### Verification results

| Check | Final result |
|---|---|
| npm run lint | Pass, exit 0: 514 files, zero errors and zero warnings. |
| Root TypeScript, including unused locals/parameters | Pass: tsc --noEmit --noUnusedLocals --noUnusedParameters. |
| Worker TypeScript | Pass: tsc --noEmit -p workers/word-ssr/tsconfig.json. |
| Production build and SSR package verification | Pass; 2,776 prerendered SEO pages, SSR package verified. |
| Offline regression scripts | 165/165 final passes: 163 original scripts plus the Round 1 React and Round 2 lifecycle scripts. |
| Source-only subset | 149/149 final passes, including practice routes, exercise/exam lifecycle fixtures, My Lists, and profile/onboarding contracts. |
| Artifact-dependent subset | 16/16 passes, including prerender parity, SEO/routing, SSR HTTP, and Worker safety checks. |
| Mounted Chrome (Round 1 regression script, --browser) | Pass: CEFR fallback/resolved transitions and open-popup value/callback/disabled updates. |
| In-memory negative controls | Pass: missing Explore translation dependencies, a frozen BrokenWord initializer, and missing normalized-answer validation dependencies each fail the new regression as intended. |

The first focused profile check and two source-suite auth/onboarding guards
rejected the old literal dependency spelling after stable setters were added.
All three were updated structurally, with exact dependency-set/security checks
preserved or strengthened; the two full-suite failures passed on focused reruns.
There are no remaining failures in the final results. Production Vite still
prints the pre-existing mixed static/dynamic import and large-chunk advisories,
also present in the Round 1 build; no unrelated bundling changes were made.

### Exact modified-file inventory

45 files, including one newly added regression script; no dependencies added
or upgraded and no deployment. Generated build outputs are not included.

```text
docs/eslint-baseline.md
package.json
scripts/README.md
scripts/generation/generate-sitemap.mjs
scripts/seo-baseline/compare.mjs
scripts/seo-baseline/fixtures.mjs
scripts/tests/account/test-onboarding-required-guard.mjs
scripts/tests/account/test-profile-load-and-onboarding.mjs
scripts/tests/architecture/test-auth-dialog-hardening.mjs
scripts/tests/architecture/test-learning-profile-data-flow.mjs
scripts/tests/architecture/test-settings-security-boundary.mjs
scripts/tests/learning/test-review-mistake-detection.mjs
scripts/tests/learning/test-review-session.mjs
scripts/tests/learning/test-svg-line-chart.mjs
scripts/tests/lib/test-refresh-single-flight.mjs
scripts/tests/practice/test-practice-route-sync.mjs
scripts/tests/routing/test-word-route-manifest.mjs
scripts/tests/runtime/test-eslint-effect-lifecycles.mjs
scripts/tests/runtime/validate-worker-browser.mjs
scripts/tests/seo/test-conjugated-verb-forms-page.mjs
scripts/tests/vocabulary/test-my-lists-contract.mjs
scripts/tests/vocabulary/test-practice-list-contract.mjs
scripts/word-render-benchmark/benchmark-word-render.mjs
src/app/App.tsx
src/app/components/layout/Header.tsx
src/app/hooks/usePracticeRouteLanguageSync.ts
src/app/hooks/useStoredAppPreferences.ts
src/app/hooks/useStoredLanguageAutoRedirect.ts
src/app/hooks/useUserProfileLoad.ts
src/app/pages/VocabularyLevelExam.tsx
src/app/pages/explore/useExploreItems.ts
src/app/pages/word-pages/detail/WordSeoPageView.tsx
src/features/practice/VocabularyPractice.tsx
src/features/practice/exercises/BrokenWordExercise.tsx
src/features/practice/exercises/HalfWrittenExercise.tsx
src/features/practice/exercises/WordTypingExercise.tsx
src/features/review-words/ReviewSession.tsx
src/features/review-words/ReviewWordsPreparation.tsx
src/features/study-new-words/NewWordStudyPreparation.tsx
src/features/study-new-words/NewWordStudySession.tsx
src/features/user-profile/sections/progress/VocabularyGrowthSection.tsx
src/features/user-profile/sections/vocabulary/AddWordToListDialog.tsx
workers/word-ssr/diagnostics/census-full-corpus.mjs
workers/word-ssr/diagnostics/measure-shard-formats.mjs
workers/word-ssr/generation/generate-full-corpus.mjs
```

## Severity and interpretation

| ESLint severity | Rule/category | Count | Assessment |
|---|---|---:|---|
| Error | react-hooks/rules-of-hooks | 5 | Highest-priority follow-up: five useMemo calls follow the unresolved-item early return in DevSeoCefrPlaceholderPage. A transition between unresolved/resolved renders could change Hook order. Despite its name, App.tsx also uses this component for production vocabulary-level rendering. Fixing its lifecycle requires a separately approved application change. |
| Error | no-useless-assignment | 4 | Three runtime initial assignments are overwritten before their values are read; one similar test assignment. Review as redundant logic, not proof of a user-visible defect. |
| Error | no-constant-binary-expression | 3 | Practice-route test fixtures combine literal nonempty language strings with &&. These are test-maintenance findings, not demonstrated routing defects. |
| Error | no-control-regex | 3 | All three patterns deliberately detect non-ASCII text using a negated ASCII range containing a zero-codepoint boundary. Reviewed as intentional regex behavior, not evidence of a control-character vulnerability. The generic rule still reports them; no per-file suppressions or spelling rewrites were made. |
| Warning | react-hooks/exhaustive-deps | 28 | Review effect ownership and stale-closure risks individually. Do not mechanically add dependencies: authentication, routing, loading, and exercise lifecycles may intentionally constrain reruns. |
| Warning | no-unused-vars | 15 | JavaScript tooling/test/diagnostic declarations; no application TypeScript unused-declaration warnings were reported. |
| Warning | unused eslint-disable directive | 5 | Existing Hooks suppressions no longer needed under the selected rules. Left untouched in this setup-only change. |

These are newly exposed findings in unchanged application/tooling code, not
runtime regressions introduced by adding ESLint. Rule severity is distinct from
confirmed product impact; the conditional-Hook scenario still needs focused
behavioral reproduction before any functionality change.

## Findings by file

E = error; W = warning. Paths are repository-relative. Every reported finding
is represented below; multiple line numbers identify separate findings.

| File | E | W | Rules and lines |
|---|---:|---:|---|
| `scripts/generation/generate-sitemap.mjs` | 0 | 1 | no-unused-vars: 60 |
| `scripts/seo-baseline/compare.mjs` | 0 | 1 | no-unused-vars: 48 |
| `scripts/seo-baseline/fixtures.mjs` | 1 | 0 | no-control-regex: 125 |
| `scripts/tests/architecture/test-learning-profile-data-flow.mjs` | 0 | 1 | no-unused-vars: 26 |
| `scripts/tests/architecture/test-settings-security-boundary.mjs` | 0 | 1 | no-unused-vars: 20 |
| `scripts/tests/learning/test-review-mistake-detection.mjs` | 1 | 0 | no-useless-assignment: 154 |
| `scripts/tests/learning/test-review-session.mjs` | 0 | 1 | no-unused-vars: 19 |
| `scripts/tests/learning/test-svg-line-chart.mjs` | 0 | 1 | no-unused-vars: 39 |
| `scripts/tests/lib/test-refresh-single-flight.mjs` | 0 | 1 | no-unused-vars: 152 |
| `scripts/tests/practice/test-practice-route-sync.mjs` | 3 | 0 | no-constant-binary-expression: 214, 232, 240 |
| `scripts/tests/routing/test-word-route-manifest.mjs` | 1 | 0 | no-control-regex: 85 |
| `scripts/tests/runtime/validate-worker-browser.mjs` | 0 | 1 | no-unused-vars: 264 |
| `scripts/tests/seo/test-conjugated-verb-forms-page.mjs` | 0 | 1 | no-unused-vars: 9 |
| `scripts/tests/vocabulary/test-my-lists-contract.mjs` | 0 | 1 | no-unused-vars: 37 |
| `scripts/tests/vocabulary/test-practice-list-contract.mjs` | 0 | 1 | no-unused-vars: 302 |
| `scripts/word-render-benchmark/benchmark-word-render.mjs` | 0 | 1 | no-unused-vars: 62 |
| `src/app/components/layout/Header.tsx` | 0 | 1 | unused eslint-disable: 520 |
| `src/app/hooks/usePracticeRouteLanguageSync.ts` | 0 | 2 | react-hooks/exhaustive-deps: 64, 86 |
| `src/app/hooks/useStoredAppPreferences.ts` | 0 | 8 | react-hooks/exhaustive-deps: 189, 199, 209, 216, 226, 236, 246, 256 |
| `src/app/hooks/useStoredLanguageAutoRedirect.ts` | 0 | 1 | react-hooks/exhaustive-deps: 71 |
| `src/app/hooks/useUserProfileLoad.ts` | 0 | 1 | react-hooks/exhaustive-deps: 212 |
| `src/app/pages/VocabularyLevelExam.tsx` | 0 | 1 | react-hooks/exhaustive-deps: 187 |
| `src/app/pages/explore/useExploreItems.ts` | 0 | 7 | react-hooks/exhaustive-deps: 84, 107, 130, 153, 176, 199, 222 |
| `src/app/pages/vocabulary/DevSeoCefrPlaceholderPage.tsx` | 5 | 0 | react-hooks/rules-of-hooks: 359, 363, 367, 373, 379 |
| `src/app/pages/word-pages/detail/WordSeoPageView.tsx` | 0 | 1 | react-hooks/exhaustive-deps: 610 |
| `src/features/practice/VocabularyPractice.tsx` | 1 | 2 | no-useless-assignment: 681; react-hooks/exhaustive-deps: 740, 862 |
| `src/features/practice/exercises/BrokenWordExercise.tsx` | 0 | 1 | react-hooks/exhaustive-deps: 106 |
| `src/features/practice/exercises/HalfWrittenExercise.tsx` | 1 | 1 | no-useless-assignment: 371; react-hooks/exhaustive-deps: 206 |
| `src/features/practice/exercises/MobileKeyboard.tsx` | 0 | 1 | react-hooks/exhaustive-deps: 254 |
| `src/features/practice/exercises/WordTypingExercise.tsx` | 1 | 0 | no-useless-assignment: 376 |
| `src/features/review-words/ReviewSession.tsx` | 0 | 1 | unused eslint-disable: 74 |
| `src/features/review-words/ReviewWordsPreparation.tsx` | 0 | 1 | unused eslint-disable: 89 |
| `src/features/study-new-words/NewWordStudyPreparation.tsx` | 0 | 1 | unused eslint-disable: 119 |
| `src/features/study-new-words/NewWordStudySession.tsx` | 0 | 1 | unused eslint-disable: 103 |
| `src/features/user-profile/sections/progress/VocabularyGrowthSection.tsx` | 0 | 1 | react-hooks/exhaustive-deps: 141 |
| `src/features/user-profile/sections/vocabulary/AddWordToListDialog.tsx` | 0 | 1 | react-hooks/exhaustive-deps: 136 |
| `workers/word-ssr/diagnostics/census-full-corpus.mjs` | 0 | 1 | no-unused-vars: 25 |
| `workers/word-ssr/diagnostics/measure-shard-formats.mjs` | 0 | 2 | no-unused-vars: 76, 89 |
| `workers/word-ssr/generation/generate-full-corpus.mjs` | 1 | 0 | no-control-regex: 241 |

## Scope and exclusions

The config separates browser application code, Node SSR/build/test tooling,
Cloudflare Worker code, and Deno Edge Functions. Existing TypeScript checks own
undefined-name validation for TypeScript; linting is not type-aware and does not
replace either tsconfig. Generated/build outputs and local hidden state are
excluded. The config applies no formatting/import-order or strict-type-style
presets, and does not enable React Compiler lint rules.

Configuration adjustments were limited to genuine context/style mismatches:
the storage test's explicitly installed fake window, literal indentation in
source-contract test regexes, intentional Unicode/BOM regex literals, and the
declaration/regex-spelling style rules described in the root README. Core
programming errors and all remaining Hooks/unused findings remain visible.

In-memory lint fixtures verify TypeScript unused declarations, conditional
Hooks, Node globals, Worker web globals, rejection of Node globals in Worker
JavaScript, rejection of missing globals in tests, and generated-output
exclusions. No fixture files were added to the regression suite.
