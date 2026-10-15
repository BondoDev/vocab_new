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

The server rebuilds the client into ignored `.playwright-build/` with the
existing React/Tailwind plugins and alias, then uses Vite preview at
`http://127.0.0.1:4173` with `strictPort`. It never reuses another server or
production `dist/`. Leave port 4173 free. It skips production prebuild and SSR.
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
to the exact preview origin pass through. The exact Google Fonts stylesheet
in `index.html` receives a local empty CSS response; no font service is contacted.
The seven exact country-flag SVG URLs used by the language picker receive a
local placeholder SVG. These are closed response fixtures, not permission to
contact a CDN. The loopback mock namespace is intercepted before ordinary local
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
rather than letting a visitor create an empty selection. Back from a running
session and Home from results both return to Custom Practice under the existing
contract, despite the Back button's accessible label being "Back to filters".

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

Remaining limitations: live Supabase/database permissions, actual speech and
OS keyboards, natural exhaustion of the entire corpus, visual parity,
fonts/flags, browser SSR hydration, other browser engines, and deployment.
Mobile emulation does not establish physical-device or iOS Safari behavior.
Console messages are not treated as uncaught exceptions;
the fixture fails on actual browser errors and unexpected network requests.
