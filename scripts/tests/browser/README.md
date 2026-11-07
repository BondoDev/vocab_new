# Isolated browser tests

This folder owns Playwright specs (`*.spec.ts`), shared browser fixtures, and
the dedicated test build/preview entry point. Follow the repository tooling
rules in [`../../README.md`](../../README.md). Import `test` and `expect` from
`./fixtures` or its `./practice-fixtures` wrapper in every spec so network and
uncaught-error checks always apply.
Do not add these specs to offline regression commands or CI in Rounds 1–3.

From the repository root:

```bash
npm ci
npx playwright install chromium
npm run test:browser
# Optional debugging/report viewing:
npm run test:browser -- --headed
npx playwright show-report
```

On Linux, `npx playwright install --with-deps chromium` installs required OS
libraries as well. Use the Playwright-managed browser; do not set a system
browser channel or executable path.

The server builds the client into ignored `.playwright-build/` with the
existing React/Tailwind plugins and alias, then uses Vite preview at
`http://127.0.0.1:4173` with `strictPort`. Locally, it skips the build when a
SHA-256 content hash of every build input (`src/`, `public/`, `index.html`,
`package-lock.json`, `postcss.config.mjs`, `tsconfig.json`, `serve.mjs`)
matches the fingerprint saved by the last successful build; any edit,
addition, or deletion there rebuilds. Set `PLAYWRIGHT_FORCE_BUILD=1` to force a
rebuild; CI (`CI` set) always rebuilds. It never reuses another running server
or production `dist/`. Run one browser-test process at a time: the server holds
port 4173 from before the cache check, so a concurrent run fails immediately
instead of reading or rebuilding the shared build. Leave port 4173 free. It skips production prebuild and SSR.
The independent inline Vite config deliberately avoids the production config's
`loadEnv`: `envDir: false` and an empty `envPrefix` prevent local `.env*` files or
shell `VITE_*` values from entering the client. The build explicitly defines an
empty analytics ID, the fixed loopback Supabase URL
`http://127.0.0.1:4173/__mock-supabase`, and the literal dummy key
`browser-tests-only`. This enables realistic auth/list HTTP requests without
production credentials or a backend server. No environment file is needed.

Every test gets a fresh context; anonymous tests start without a session, while
My Lists seeds a synthetic browser-only session. Before any page is created, the
fixture installs context-wide HTTP and WebSocket interception and uncaught
browser-error collection. Service workers are blocked. Only GET/HEAD requests
to the exact preview origin pass through. Fonts and the language picker's
country flags are self-hosted (`src/assets/fonts/`, `src/assets/flags/`), so
they load from the preview origin like any other bundled asset; there are no
external asset fixtures, and no font service or CDN is contacted. The loopback
mock namespace is intercepted before ordinary local
assets: only a test's explicit method/path handlers may fulfill requests, and
unknown mock requests abort and fail, including GETs. `mock-backend.ts` implements
per-test in-memory auth/profile/list/membership responses; it never forwards a
request. No external backend endpoint is allowed. Any other
request is aborted and fails fixture teardown; WebSockets are closed without
connecting. A dead loopback proxy with only the preview host bypassed also
blocks external preconnects and redirects outside request routing. External
redirect requests are recorded as failures. Do not use `route.fetch` for external
mocks or broaden the allowlist to production hosts.

HTML reports are in `playwright-report/`; failure traces and screenshots are in
`test-results/`. These, `blob-report/`, and the test build are ignored outputs.
The root TypeScript check includes this folder and `playwright.config.ts`.

The first smoke test covers anonymous homepage content and navigation into the
language/exercise setup. The requested Free Practice action is currently labelled
"Start Practicing" in the homepage's Custom Practice card; the test follows that
existing accessible button name without changing UI copy.

Round 2 adds `practice.spec.ts` and its imported `practice-fixtures.ts` helper:

- Language selection, changes, duplicate-language guard, reversal, return from
  filters, and persistence across reload.
- Level/topic/grammar filters, topic modal clear/apply, configuration summaries,
  filter edits surviving Back, all five exercise options, toggling, and the
  disabled final-selection guard. A filtered session verifies the expected word
  and returns to preserved setup.
- Full-word typing with incorrect/correct answers, the existing Skip/Next
  feedback, Enter gating/advancement, answer reset, reveal, manual Finish,
  anonymous account-intro dismissal, results, practiced words, and return.

Practice tests reuse the same network/error fixture. They use real bundled
English/Spanish vocabulary and metadata, with no backend or module replacement.
Browser-only `Math.random` is fixed just below 1 so Fisher-Yates retains source
order. Expected examples (`sobre` → `about`, `encima de` → `above`, and filtered
`manzana` → `apple`) deliberately pin a small known corpus contract; vocabulary
changes may require updating these examples. Speech synthesis is a browser-local
no-op to avoid platform voice/audio services. Calendar time is fixed using
Playwright's clock while app timers and animations run normally; tests wait on
observable state, never fixed sleeps. No production source is altered.

Typing does not display a separate wrong-answer banner: incorrect input retains
Skip and disallows Enter advancement; a correct answer exposes Next and removes
hint/reveal controls. The selection UI prevents removing its last exercise
rather than letting a visitor create an empty selection. The running session's
"Filters" button opens the detailed filters page, whose "Back to Custom
Practice" returns to the preserved setup; Home from results returns to Custom
Practice directly. In a Practice List session the same card button reads "Back
to My Lists" and returns to the originating list. The setup page opens the
detailed filters page through "More detailed filters"; topics and word types
there are inline chip groups, not dialogs. Practiced words are listed inline
on the results screen and include only words the learner wrote, not words
revealed with Show me word. The card's decorative arrow is excluded from the
Next/Skip accessible names, so tests match them exactly.

Round 3 adds focused journeys:

- `exercises.spec.ts`: half-written completion, broken-word assembly, connect
  words, and listening. Each checks wrong/correct interaction, Next, fresh
  question state, Skip, Finish/results, and return. Matching tests advance the
  controlled browser clock through the product's 600 ms wrong-pair reset rather
  than inspecting transient CSS. Listening uses a speech stub, not actual audio.
- `mobile.spec.ts`: Chromium Android emulation at 375×844 and 390×844. Checks
  homepage/menu keyboard activation, mobile language pickers, scrolling and
  dismissal of topic/type dialogs, exercise setup, the custom mobile keyboard,
  Next/reset, return, and document horizontal overflow at major steps. Timers
  use an installed running clock so gesture suppression deadlines can expire.
- `my-lists.spec.ts`: in-memory list create/rename/delete, list search and both
  name-sort directions, member add/search/remove, absence of practice entry on
  empty and populated cards/empty details, populated-detail practice configuration,
  and return to the owning list. The practice prompt must belong to the selected
  apple/banana memberships, not the ordinary session's first word. Real bundled
  vocabulary resolves display data. Mock session,
  API state, and mutations are synthetic; this does not verify database RLS.
- `auth.spec.ts`: login/registration navigation and validation, mocked auth
  errors, reset-email transition without mail, recovery URL cleanup while
  preserving unrelated parameters, non-dismissible recovery, incomplete-profile
  onboarding suppression, failed password update/retry, and onboarding after
  recovery completes. No real account or email is created.
- `word-pagination.spec.ts`: word-page "Browse More" grid pagination is
  client-side buttons. Checks there are no `/browse/page/N` links, exact
  54-word slices in all seven learning languages (including the shorter final
  page), a single level-shard fetch and no full-vocabulary download,
  `#browse-page-N` Back/Forward and deep links, keyboard activation and
  focus, legacy `/browse/page/N` URLs, separate search pagination, and
  failed-load messaging with retry. The preview is client-only, so
  server-rendered markup is covered by `test:word-browse-pagination`.

`learning-routes.spec.ts` covers `/learning/new-words` and `/learning/review`
at desktop and 390px mobile: with a mocked session each opens directly and
survives a reload; signed out, each redirects to Custom Practice without
showing the learning page; and in-app navigation from the profile's Learning
section survives reload and Back. The preview answers every path with the
SPA, so production's asset-first `410 Gone` for routes without a static shell
is guarded by `test:interactive-contracts` and
`test:prerendered-html-integrity` instead.

`toast-navigation.spec.ts` checks the shared toast after in-app navigation:
with a mocked session it reaches the 100-nouns page from Learning Resources
by link, adds and later removes a word through "Add to list" (mocked list
RPCs), and expects the toast to show and auto-dismiss, with exactly one live
region after navigating to the full vocabulary list and back. The toast's
hydration-safe first render needs server markup, which this client-only
preview lacks; `test:toast-hydration` covers it.

`logout-privacy.spec.ts` checks account-scoped browser data after sign-out:
cached `app.userProfile.*` profiles and the `app.practiceListSession`
snapshot are removed after header and profile-sidebar sign-out, cross-tab
sign-out, a rejected refresh (expired session), onboarding cancel, a Google
PKCE login/logout, and sequential or cross-tab account switches, while
anonymous preferences, the `zaraz-consent` cookie, and unrelated storage keys
survive and no server write is sent. Its per-test backend mocks several
synthetic accounts. Google's authorize redirect is answered by a page-level
route, because the app resolves `/auth/v1/authorize` as an absolute path
that drops the mock-backend prefix.

`automatic-age.spec.ts` covers automatic age against a mocked backend that
mirrors the migration's rules through `src/app/utils/accountAge.ts` (fixed
browser date 2026-10-15): existing accounts without a birth year are never
prompted and show their stored age until a voluntary Settings save
initializes automatic age; Settings shows the server-computed `current_age`
and re-infers the birth year on edits; impossible dates and February 29
checks; the 16+ rule for legacy under-16 accounts; and the fallback when the
database lacks the migration (`42703`).

Remaining limitations: live Supabase/database permissions, actual speech and
OS keyboards, natural exhaustion of the entire corpus, visual parity,
fonts/flags, browser SSR hydration, other browser engines, and deployment.
Mobile emulation does not establish physical-device or iOS Safari behavior.
Console messages are not treated as uncaught exceptions;
the fixture fails on actual browser errors and unexpected network requests.
