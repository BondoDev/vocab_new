# Non-SEO regression checklist

Audited 2026-07-15, source commit `a744486b` (branch `master`, clean tree).
Companion to [`docs/generated-data.md`](generated-data.md) and
[`docs/import-boundaries.md`](import-boundaries.md), which cover data/SEO
architecture. This document covers **interactive application behavior** —
auth, language selection, practice, exams, the profile shell, navigation,
and the custom keyboard — so a future `App.tsx` extraction or folder
reorganization has a concrete "did I break anything" checklist that isn't
SEO/sitemap/Worker output (already protected by
`scripts/seo-baseline/current/` and `test:seo-output`).

Automated guard: `npm run test:interactive-contracts`
(`scripts/tests/routing/test-interactive-contracts.mjs`) — cheap, deterministic, file- and
route-string-level checks only. It cannot replace the manual checklists
below; see [Phase 8/9](#automation-candidates) for why.

## Important corrections to assumed scope

Two features referenced in this document's original task template turned
out **not to exist** in the current codebase, verified by a full-repository
search (`git grep`, not a guess):

- **Daily target / streak / word-progress tracking does not exist anywhere.**
  No component, route, localStorage key, or Supabase table for it was
  found. The "Daily target" sections below are retained as **structural
  placeholders for future work** (`TARGET-DEFERRED-*`), not as checks
  against real behavior.
- **No practice or exam progress is ever persisted.** There is no
  `supabase.from(...)` call anywhere in `src/` — all Supabase access is raw
  `fetch()` to PostgREST, and the only table ever written is
  `user_profiles` (onboarding data only). `VocabularyPractice.tsx` and
  `VocabularyLevelExam.tsx` keep `attemptHistory`/exam state in React state
  only; a refresh mid-session loses it. "Progress and persistence" checks
  below are scoped to what's real: **filter-selection localStorage keys**
  and **the onboarding profile write** — not practice answers.

Treat both as ground truth for this audit's date. If either is implemented
later, update this document (and add real `TARGET-*`/`PROGRESS-*` IDs) in
the same change that implements it — do not let this document quietly go
stale in the direction of *understating* what exists, either.

---

## 1. Feature-status inventory

| Feature | Route(s) | Auth required? | Data source | Current status | Risk |
|---|---|---|---|---|---|
| Language/home selection | `/`, `/languages` | no | `LanguageContext` + `localStorage` (`uiLanguage`, `app.yourLanguage`, `app.practiceLanguage`) | complete | high — entry point for every flow |
| Level/category/word-type filters | `/languages/filters` | no | `src/features/learning-setup/data/categories.json`, `src/data/vocabularyMetadata/*.json` | complete | high |
| Exercise-type selection | `/languages/filters/exercises` | no | in-memory + `localStorage` (`app.selectedExercises`) | complete | high |
| Vocabulary practice | `/languages/filters/exercises/:pair/practice` | no | `src/data/vocabulary/*/vocabulary.json`; session state is **ephemeral, not persisted** | complete, but no persistence by design (not a bug — see corrections above) | high — core product flow |
| Vocabulary-level exam | `/languages/level-test` | no | generated in-app; **not persisted** | complete, ephemeral | medium-high |
| Explore | `/explore` | no | `LanguageContext`, SEO vocabulary-level data | complete | medium |
| About | `/about` | no | static | complete | low |
| Help | `/help` | no | static | complete | low |
| Custom mobile keyboard | embedded in WordTyping/HalfWritten exercises | no | `src/features/practice/exercises/layouts.ts` | complete, mobile-scoped | medium |
| Login / signup / logout | modal in `Header.tsx`, no dedicated route | no (to open) | Supabase Auth REST | complete | high — security-adjacent |
| Password recovery | link inside the same auth modal | no | Supabase Auth REST (`/auth/v1/recover`) | functional but partial — send-email step confirmed implemented; post-recovery session/redirect handling not fully traced in this audit | medium |
| Account onboarding dialog | global overlay, any page | yes (only opens for a logged-in, incomplete profile) | Supabase `user_profiles` table + `localStorage` mirror | complete — the only real "write" flow in the interactive app | high |
| **Profile page** | `/profile` | **no — route renders unauthenticated, unguarded** | props only (`userProfile` state from `App.tsx`); no fetch inside the page itself | **unfinished shell** — see [§3](#3-profile-page-ground-truth) | medium |
| Daily target / streak | — | — | — | **does not exist** | n/a — deferred |
| Word/session progress persistence | — | — | — | **does not exist** | n/a — deferred |
| SEO/vocabulary-level content pages, word pages, verb-list pages, level-test SEO pages, SEO hub pages | many, see `src/app/App.tsx` `PageKey` union | no | `src/data/seo/**`, generated data | complete, **out of scope for this document** | covered by `scripts/seo-baseline/current/` + `test:seo-output` |

---

## 2. Test scope classification

### A. Current regression checks (exists now, must not break)
Language/home selection, filters, exercise selection, practice flow
(interaction, not persistence), vocabulary-level exam, explore, about, help,
login/signup/logout, password-recovery email send, account onboarding
(full flow incl. Supabase write), profile route access + auth-less
rendering + hardcoded sidebar + mobile drawer, navigation, custom keyboard.

### B. Deferred checks (confirmed absent in code — do not test as done)
- Profile dashboard main content (any real widgets/data)
- Profile sidebar nav links actually navigating anywhere (buttons have no
  `onClick`)
- Editing profile data from the profile page itself (only the onboarding
  dialog can write profile data)
- Avatar upload, bio, email display/edit, subscriptions, achievements —
  **none of these exist in code; do not add checks implying they do**
- Daily target / streak / word-progress tracking (feature does not exist)
- Practice/exam answer persistence, session history, resumable sessions

### C. Future acceptance criteria (template only — no assumed requirements)

| Future capability | Acceptance criteria status | Owner/input needed |
|---|---|---|
| Profile dashboard main content | Not defined | Product decision required |
| Profile sidebar destinations (Practice/Vocabulary/My Lists/Progress/Settings) | Not defined — currently `disabled: true` in `Header.tsx` and inert (`onClick`-less) in `UserProfileSidebar.tsx` | Confirm route/feature plan per item |
| Profile data editing (post-onboarding) | Not defined | Confirm whether onboarding dialog is reused or a new form is built |
| Daily target / streak | Not defined | Confirm data model, reset cadence, timezone handling |
| Practice/exam progress persistence | Not defined | Confirm data model (Supabase table, RLS policy), retention |

---

## 3. Profile-page ground truth

Route: `/profile` (`ROUTES.profile` in `src/app/App.tsx`, mirrored in
`NAV_HREFS` in `src/app/components/layout/Header.tsx`). The `resolvedPage ===
"profile"` branch in `AppContent` renders `<UserProfileDashboardPage>`.

> **The profile page is an unfinished shell.** Current regression coverage
> protects only route access, absence-of-guard behavior, basic rendering,
> sidebar stability, navigation, refresh behavior, and absence of crashes.
> Data display and editing workflows are deferred until implemented.

Verified facts:

- **No auth guard.** `resolvedPage === "profile"` renders
  `<UserProfileDashboardPage>` unconditionally — no redirect, no block, no
  loading gate for unauthenticated visitors. If logged out, the sidebar
  falls back to hardcoded placeholder values (`"Bondo"` / `"German"` /
  `"A2"` — `UserProfileSidebar.tsx:72,76-77`), not real data, not an error.
- **Sidebar is hardcoded and links are dead.** `SIDEBAR_NAV_GROUPS` in
  `UserProfileSidebar.tsx:26-49` is static data. Each nav item is a
  `<button type="button">` with **no `onClick` handler** — clicking does
  nothing. Only "Dashboard" is marked `isActive: true`, always, regardless
  of anything.
- **No profile data is fetched inside the page.** All three props
  (`nickname`, `practiceLanguage`, `languageLevel`) come from `App.tsx`'s
  `userProfile` state, which is populated by the onboarding flow, not by
  the profile page.
- **No editing flow on the page itself.** The only way to change profile
  data is the global `AccountOnboardingDialog`, not anything on `/profile`.
- **No loading, empty, or error state components exist.** The "content"
  pane is a single near-empty `<section>` with only a visually-hidden
  `<span>{nickname}</span>` when a nickname exists
  (`UserProfileDashboardPage.tsx:26-28`).
- **Mobile behavior exists and is real**, not just responsive CSS: a
  "Profile Menu" trigger opens a drawer/dialog overlay
  (`UserProfileSidebar.tsx:141-187`) rendering the same (still-dead) nav.
- **Refresh / back-forward**: ordinary SPA route, no special-cased guard or
  redirect logic tied to navigation type — expected to behave like any
  other client route (see `NAV-*` checks).

Do not invent profile fields such as avatar, bio, email edit, streaks,
achievements, or subscriptions — none exist in code as of this audit.

---

## 4. Manual smoke checklist

Target duration: **10–20 minutes.** Run after routine refactors that touch
shared UI, routing, or context providers.

### Application startup
- [ ] App loads without a blank screen
- [ ] No fatal console error on load
- [ ] Header/primary navigation renders
- [ ] Current UI language loads (labels in the selected language)
- [ ] Current target language loads (if previously selected, persists)
- [ ] Refresh does not crash

### Authentication
Only implemented behaviors are listed — see [§1](#1-feature-status-inventory).
- [ ] Auth dialog opens from the header (desktop + mobile)
- [ ] Valid login works using a **dedicated non-production test account**
- [ ] Invalid login shows an error message, does not crash
- [ ] Session persists after refresh (`localStorage["supabase.auth.session"]`)
- [ ] Logout works and clears the session
- [ ] "Forgot password?" sends a recovery email without crashing (do not
      complete a real password change against a production account)
- [ ] No private data (nickname, email, level) is visible before login

Account creation and full password-reset completion are **not** required in
the routine smoke pass — cover them in the full regression pass instead
(`AUTH-*` below), since they mutate account state.

### Language selection
- [ ] UI language changes via the header switcher; labels update
- [ ] Target/practice language changes via `LanguageSelector`
- [ ] Route/state remains coherent after a language change (no stuck
      loading state, no mismatched labels)
- [ ] Refresh preserves the UI language (`localStorage["uiLanguage"]`) and
      last-selected languages (`app.yourLanguage`/`app.practiceLanguage`)
- [ ] No unrelated target-language vocabulary corpus loads (lazy
      `import.meta.glob` per `docs/import-boundaries.md`)

### Vocabulary-level test (exam)
- [ ] Exam opens from `/languages/level-test` or the "Take level test" entry
      point in `LevelCategorySelection`
- [ ] Question renders (multiple-choice for A1/A2, word-assembly for B1+)
- [ ] Answer selection advances the exam
- [ ] Exam ends early after 3 wrong answers in a level (documented
      behavior, not a bug)
- [ ] Result screen shows an estimated level
- [ ] "Start Practicing" from the result screen feeds the level into filters
- [ ] Exiting mid-exam shows a confirm dialog warning progress is lost
      (**progress is genuinely lost** — this is correct, not a regression)
- [ ] No crash if vocabulary data for a language pair is missing

### Exercise selection
- [ ] Filters/exercise-type toggles open and respond
- [ ] At least one exercise type stays selected (cannot deselect the last one)
- [ ] Level/category selection from the previous screen carries through
- [ ] "Start Practice" label reflects the current selection count
- [ ] "Start Practice" is disabled when zero exercise types are selected
- [ ] Mobile controls remain usable (no overlap, tappable targets)

### Practice flow
- [ ] Practice session starts from the exercise-selection screen
- [ ] Prompt/word renders for the selected exercise type(s)
- [ ] Answer interaction works (typing, drag/connect, listening playback, as applicable)
- [ ] Correct-answer state is shown
- [ ] Incorrect-answer state is shown
- [ ] "Next"/"Skip" advances correctly (label reflects whether an answer
      was given)
- [ ] Session-complete screen (`PracticeResults`) appears at the end
- [ ] "Start again" resets and reshuffles
- [ ] Exit mid-session works without crash
- [ ] **Refresh mid-session resets progress — this is current, correct
      behavior, not a regression** (no persistence exists)
- [ ] Browser back mid-session does not crash
- [ ] Rapid double-click/double-Enter does not double-advance (180ms lock
      in `VocabularyPractice.tsx`)

### Progress and persistence
Only real persisted data is listed — see the corrections at the top of
this document.
- [ ] Filter selections persist across refresh (`app.selectedLevel`,
      `app.selectedCategories`, `app.selectedLevels`,
      `app.selectedWordTypes`, `app.selectedExercises`)
- [ ] Account onboarding submit calls the `complete_user_profile_onboarding`
      RPC and the dialog closes on success
- [ ] Account onboarding submit shows a visible error on network failure,
      does not silently fail
- [ ] Repeated onboarding submits do not create duplicate rows and do not
      reset an already-saved daily goal or timezone
- [ ] Account-language confirmation ("Save to account") calls the
      `update_user_profile_languages` RPC and updates only the language
      pair
- [ ] **Practice/exam answers are not expected to persist anywhere** — do
      not flag this as a bug

### Daily target
**Deferred — feature does not exist.** See `TARGET-DEFERRED-01` in
[§6](#6-full-regression-checklist). No smoke checks apply.

### Profile shell
Marked explicitly as unfinished — see [§3](#3-profile-page-ground-truth).
- [ ] `/profile` opens without crash, logged in or out
- [ ] No auth guard fires (current behavior — confirm it hasn't silently
      changed to a guarded route without this document being updated)
- [ ] Hardcoded sidebar renders (desktop)
- [ ] Sidebar layout does not overlap the (empty) content area
- [ ] Sidebar nav buttons are inert — clicking does not navigate (current,
      correct behavior)
- [ ] Mobile "Profile Menu" trigger opens the drawer; close button/overlay
      closes it
- [ ] Refresh on `/profile` works
- [ ] Browser back/forward from `/profile` works
- [ ] Empty main-content area is accepted as current, correct, unfinished
      state — **do not mark missing profile content as a regression until
      that content is implemented**

### Navigation
- [ ] Desktop navbar renders and links work
- [ ] Mobile menu opens/closes
- [ ] Active-route styling matches the current page
- [ ] Internal links (`Link`/`navigate`) route correctly
- [ ] Browser back/forward works across at least 3 hops
- [ ] Direct URL load works for at least: `/`, `/languages/filters`,
      `/profile`, an exam route
- [ ] Unknown route renders `NotFoundPage` (404), not a crash

### Custom keyboard
- [ ] Appears only on mobile viewport + focused text input during
      WordTyping/HalfWritten exercises — not on desktop, not elsewhere
- [ ] Does not visually cover the focused input (`visualViewport`-based
      positioning)
- [ ] Shift, backspace, space, and symbol-layer toggle work
- [ ] Long-press produces accented-character variants
- [ ] Space is blocked where the template word has no space at that
      position (do not treat this as a bug)
- [ ] Closing/blurring restores normal layout
- [ ] Orientation change does not break positioning

### Error and empty states
- [ ] No-data state in practice (missing vocabulary data) does not crash
- [ ] Route-level `<Suspense>` loading fallback shows during lazy-page load
- [ ] Invalid/unknown route shows 404, not a blank screen or crash
- [ ] Auth dialog shows a clear error on invalid credentials
- [ ] Network failure during onboarding submit shows a visible error, not
      a silent failure

---

## 5. Full regression checklist

Target duration: **30–60+ minutes.** Run before major releases, `App.tsx`
extraction, or route reorganization.

Columns: `ID | Feature | Preconditions | Steps | Expected result | Status | Automation candidate`

### AUTH

| ID | Feature | Preconditions | Steps | Expected result | Status | Automation candidate |
|---|---|---|---|---|---|---|
| AUTH-01 | Login (valid) | Dedicated non-production test account exists | Open auth dialog → enter valid credentials → submit | Session stored, dialog closes, header shows account state | current | manual only |
| AUTH-02 | Login (invalid) | — | Enter wrong password → submit | Inline error shown, no session created | current | manual only |
| AUTH-03 | Signup | Use a disposable test address, never a real user's | Open signup mode → fill fields → submit | New Supabase user created, session stored | current | manual only |
| AUTH-04 | Logout | Logged in | Trigger sign-out from desktop and mobile menus | `localStorage["supabase.auth.session"]` and PKCE verifier cleared, header reverts to signed-out state | current | manual only |
| AUTH-05 | Session persistence | Logged in | Refresh page | Session restored from `localStorage`, no forced re-login | current | manual only |
| AUTH-06 | Password recovery send | — | Trigger "Forgot password?" with a test address | Recovery email request succeeds without crash | current | manual only |
| AUTH-07 | Google OAuth entry point | — | Click "Continue with Google" | PKCE flow starts (redirect to Google) | current, partial — full completion needs a real Google account | manual only |
| AUTH-08 | Auth redirect/callback | After OAuth or magic-link-style redirect | Land back on `/languages/filters/exercises/practice` or `/languages/level-test` with `#access_token`/`?code=` | `handleSupabaseAuthRedirect` consumes it once, session set | current | manual only — narrow trigger surface (`practice`/`exam` pages only) |
| AUTH-09 | No route guards exist | — | Visit any route (including `/profile`) while logged out | Page renders; no redirect occurs anywhere in the app | current (documented absence, not a bug) | `test:interactive-contracts` (checks this stays a deliberate, documented state) |

### LANG

| ID | Feature | Preconditions | Steps | Expected result | Status | Automation candidate |
|---|---|---|---|---|---|---|
| LANG-01 | UI language switch | — | Change UI language via header, for each of the 7 supported (`en/es/fr/de/it/pt/ru`) | Labels update, no crash | current | manual (spot-check subset each run) |
| LANG-02 | Target language switch | — | Change practice/target language via `LanguageSelector` | Selection updates, correct corpus lazy-loads | current | manual |
| LANG-03 | Refresh preserves language | UI + target language set | Refresh | `uiLanguage`, `app.yourLanguage`, `app.practiceLanguage` restored from `localStorage` | current | `test:interactive-contracts` (key-contract check only, not runtime behavior) |
| LANG-04 | No cross-language corpus bleed | Target language = X | Load practice for X | Only X's `vocabulary.json` chunk loads (network panel) | current | covered by `test:import-boundaries` (G1 eager/lazy contract) |

### TEST (vocabulary-level exam)

| ID | Feature | Preconditions | Steps | Expected result | Status | Automation candidate |
|---|---|---|---|---|---|---|
| TEST-01 | Exam opens | — | Navigate to `/languages/level-test` or "Take level test" | Question 1 (A1 multiple-choice) renders | current | manual |
| TEST-02 | Multiple-choice question (A1/A2) | Exam open | Select an answer | Correctness recorded, advances | current | manual |
| TEST-03 | Word-assembly question (B1+) | Reach level B1 in exam | Assemble word from chunks | Correctness recorded, advances | current | manual |
| TEST-04 | Early exit on 3 wrong | 3 wrong answers in one level | — | Exam ends, reports last completed level | current | manual |
| TEST-05 | Full completion | Pass through all 6 levels | — | Reports top level reached | current | manual |
| TEST-06 | Exit confirmation | Exam in progress | Click exit/cancel | Confirm dialog warns progress will be lost | current | manual |
| TEST-07 | No persistence | Exam in progress | Refresh | Exam state is lost (expected, not a bug) | current, documented | manual |

### FILTER (level/category/exercise selection)

| ID | Feature | Preconditions | Steps | Expected result | Status | Automation candidate |
|---|---|---|---|---|---|---|
| FILTER-01 | Level multi-select | — | Toggle multiple CEFR levels | Selection updates, word count updates | current | manual |
| FILTER-02 | Level double-tap exclusive select | Multiple levels selected | Double-tap/double-click one level | Only that level remains selected | current | manual |
| FILTER-03 | Zero-result guard | — | Choose a filter combo yielding 0 words | Continue is disabled | current | manual |
| FILTER-04 | Exercise type toggle | — | Toggle each of the 5 exercise types | Selection updates; last one cannot be deselected | current | manual (id-set/partition covered by `test:exercise-id-contract`) |
| FILTER-05 | Filter persistence | Filters set | Refresh | Restored from `app.selectedLevel`/`selectedCategories`/`selectedLevels`/`selectedWordTypes`/`selectedExercises` | current | `test:interactive-contracts` (key-contract only) |

The five exercise ids (`wordTyping`, `halfWritten`, `brokenWord`, `connectWords`,
`listening`) are persisted under `app.selectedExercises` and are also i18n-key
segments, so they are a stable, backward-compatible contract, not just UI
copy. They are canonicalized in `src/exercises/exerciseIds.ts`
(`EXERCISE_IDS`/`ExerciseId`), which both `learning-setup` and `practice`
import — adding a 6th exercise means updating that file's id list *and* its
typing/four-word classification *and* the setup option list in
`ExerciseSelection.tsx`, or `test:exercise-id-contract` will fail.

### PRACTICE

| ID | Feature | Preconditions | Steps | Expected result | Status | Automation candidate |
|---|---|---|---|---|---|---|
| PRACTICE-01 | Session start | Filters + exercises selected | Click Start Practice | First prompt renders | current | manual |
| PRACTICE-02 | Correct-answer path | Practice active | Enter correct answer | Correct state shown | current | manual |
| PRACTICE-03 | Incorrect-answer path | Practice active | Enter incorrect answer | Incorrect state shown, correct answer revealed per exercise rules | current | manual |
| PRACTICE-04 | Next/Skip button label | Practice active | Observe before/after answering | Label reflects answered vs. skipped state | current | manual |
| PRACTICE-05 | Double-submit guard | Practice active | Rapid double-click Next / double-Enter | Only one advance occurs (180ms lock) | current | manual |
| PRACTICE-06 | Session completion | All words exhausted | — | `PracticeResults` renders with attempt history/matrix | current | manual |
| PRACTICE-07 | Start again | Session complete | Click "Start again" | Reshuffles, resets state | current | manual |
| PRACTICE-08 | Refresh mid-session | Practice active | Refresh | Session state lost (expected, not a bug) | current, documented | manual |
| PRACTICE-09 | Cycle mode | Multiple exercise types selected | Progress through session | Mixes association/listening with typing per cycle logic | current | manual |

### PROGRESS (persistence — scoped to what's real)

| ID | Feature | Preconditions | Steps | Expected result | Status | Automation candidate |
|---|---|---|---|---|---|---|
| PROGRESS-01 | Onboarding write | Logged in, incomplete profile | Complete onboarding dialog | `POST /rest/v1/rpc/complete_user_profile_onboarding` succeeds (request contains only `p_nickname`/`p_native_language`/`p_learning_language`/`p_current_level`/`p_user_age`/`p_birth_month`/`p_birth_day` — no user ID, `p_daily_goal`, or timezone field), dialog closes, returned profile reflected in the UI | current | manual only (writes real data — use test account) |
| PROGRESS-02 | Onboarding upsert idempotency | Onboarding already complete, a daily goal and timezone are already saved | Trigger onboarding again (e.g. edit + resubmit) | No duplicate row (`INSERT ... ON CONFLICT (id) DO UPDATE` makes this idempotent by construction); the previously-saved daily goal and timezone remain unchanged | current | manual only |
| PROGRESS-03 | Onboarding network failure | Simulate offline/failed request | Submit onboarding | Visible error, dialog stays open, no partial write assumed | current | manual |
| PROGRESS-04 | Account-language confirmation write | Logged in, saved language pair differs from the current selection | Trigger "Save to account" from the Languages-page confirmation popup | `POST /rest/v1/rpc/update_user_profile_languages` succeeds (request contains only `p_native_language`/`p_learning_language` — no complete profile object, no user ID), updated language pair appears in the UI, and daily goal/timezone/nickname/level/age/birth fields remain unchanged | current | manual only (writes real data — use test account) |
| PROGRESS-DEFERRED-01 | Practice answer persistence | — | — | **Not implemented** — do not test as if it exists | deferred | n/a |
| PROGRESS-DEFERRED-02 | Session/attempt history persistence | — | — | **Not implemented** | deferred | n/a |

### TARGET (daily target — does not exist)

| ID | Feature | Preconditions | Steps | Expected result | Status | Automation candidate |
|---|---|---|---|---|---|---|
| TARGET-DEFERRED-01 | Daily target rendering | — | — | **Feature does not exist in current code** | deferred — future acceptance criteria needed | n/a |

### PROFILE-SHELL (current, unfinished-shell behavior only)

| ID | Feature | Preconditions | Steps | Expected result | Status | Automation candidate |
|---|---|---|---|---|---|---|
| PROFILE-SHELL-01 | Route opens, logged out | Logged out | Visit `/profile` | Renders without crash, placeholder sidebar values shown | current | `test:interactive-contracts` (existence/wiring only) |
| PROFILE-SHELL-02 | Route opens, logged in | Logged in, profile incomplete or complete | Visit `/profile` | Renders with real nickname/practiceLanguage/level from `userProfile` state where available | current | manual |
| PROFILE-SHELL-03 | Sidebar renders (desktop) | — | Visit `/profile` at desktop width | `SIDEBAR_NAV_GROUPS` render, "Dashboard" shown active | current | manual |
| PROFILE-SHELL-04 | Sidebar nav is inert | — | Click any sidebar nav button | Nothing happens (no `onClick` wired) — current, correct | current, documented | manual |
| PROFILE-SHELL-05 | Mobile drawer | Mobile width | Tap "Profile Menu" trigger | Drawer opens with same sidebar content; overlay/close button closes it | current | manual |
| PROFILE-SHELL-06 | Refresh | On `/profile` | Refresh | Page reloads correctly, no crash | current | manual |
| PROFILE-SHELL-07 | Back/forward | Navigate to `/profile` from elsewhere | Browser back, then forward | Works like any other route | current | manual |
| PROFILE-SHELL-08 | Empty content area accepted | — | Visit `/profile` | Main content pane is empty except a hidden nickname span — **this is correct, not a bug** | current, documented | manual |

### PROFILE-DEFERRED (explicitly deferred — do not test as complete)

| ID | Feature | Status |
|---|---|---|
| PROFILE-DEFERRED-01 | Real dashboard content/widgets | not implemented |
| PROFILE-DEFERRED-02 | Sidebar links navigating anywhere | not implemented |
| PROFILE-DEFERRED-03 | Editing profile data from the profile page | not implemented (only the onboarding dialog writes) |
| PROFILE-DEFERRED-04 | Avatar upload | not implemented |
| PROFILE-DEFERRED-05 | User statistics on profile | not implemented |
| PROFILE-DEFERRED-06 | Preferences/settings UI | not implemented |

### NAV

| ID | Feature | Preconditions | Steps | Expected result | Status | Automation candidate |
|---|---|---|---|---|---|---|
| NAV-01 | Desktop navbar links | — | Click each nav item | Routes correctly, active state updates | current | manual |
| NAV-02 | Mobile menu | Mobile width | Open/close mobile menu | Opens and closes correctly | current | manual |
| NAV-03 | Direct URL load | — | Load `/`, `/languages/filters`, `/profile`, `/languages/level-test` directly | Each renders correctly (SPA + SSR/prerender where applicable) | current | manual |
| NAV-04 | Back/forward | Navigate 3+ hops | Use browser back/forward | History steps correctly, no stale UI | current | manual |
| NAV-05 | Unknown route | — | Visit a nonsense path | `NotFoundPage` renders (404), no crash | current | manual |
| NAV-06 | Scroll-to-top button | Scrolled down, desktop width ≥1024px | Click the scroll button | Scrolls to top; button hides on mobile viewports by design | current | manual |

### KEYBOARD

| ID | Feature | Preconditions | Steps | Expected result | Status | Automation candidate |
|---|---|---|---|---|---|---|
| KEYBOARD-01 | Appears only on mobile + focused input | Mobile viewport, WordTyping/HalfWritten exercise | Focus the answer input | Custom keyboard appears via portal | current | manual |
| KEYBOARD-02 | Does not cover input | Keyboard open | Observe input visibility | Input stays visible above the keyboard (`visualViewport` positioning) | current | manual |
| KEYBOARD-03 | Shift/backspace/space/symbols | Keyboard open | Use each control | Behaves as expected; space blocked where template has no space at that position | current | manual |
| KEYBOARD-04 | Long-press accents | Keyboard open | Long-press a base letter (280ms) | Accented-variant popup appears | current | manual |
| KEYBOARD-05 | Orientation change | Keyboard open | Rotate device/emulator | Layout repositions without breaking | current | manual |
| KEYBOARD-06 | Desktop gets special-characters helper, not full keyboard | Desktop width | Focus the answer input | `DesktopSpecialCharacters` shown instead of `MobileKeyboard` | current | manual |

### ERROR

| ID | Feature | Preconditions | Steps | Expected result | Status | Automation candidate |
|---|---|---|---|---|---|---|
| ERROR-01 | Lazy-route loading fallback | Slow network (throttle) | Navigate to a lazy-loaded page | `RouteLoadingFallback` ("Loading...") shows briefly, no blank flash | current | manual |
| ERROR-02 | Invalid route | — | Visit a nonsense path | 404, no crash | current | manual |
| ERROR-03 | Auth failure | — | Submit wrong credentials | Inline error, dialog stays open | current | manual |
| ERROR-04 | Onboarding network failure | Simulate failed request | Submit onboarding | Visible error (`accountOnboardingError`), no crash | current | manual |
| ERROR-05 | Missing vocabulary data | Contrived: request a filter combo with no matching words | Attempt to start practice | Continue stays disabled (see `FILTER-03`) rather than crashing at runtime | current | manual |

---

## 6. Persistence and side-effect matrix

| Feature | Persistence layer | Write event | Refresh expectation | Logout expectation | Regression risk |
|---|---|---|---|---|---|
| UI language | `localStorage["uiLanguage"]` | on every language change | restored | not cleared (language is not account data) | low |
| Native/practice language selection | `localStorage["app.yourLanguage"]`, `["app.practiceLanguage"]` | on every change | restored | not cleared | low |
| Level/category/word-type/exercise filters | `localStorage["app.selectedLevel"]`, `["app.selectedCategories"]`, `["app.selectedLevels"]`, `["app.selectedWordTypes"]`, `["app.selectedExercises"]` | on every change | restored | not cleared | medium — many consumers read these on mount |
| Auth session | `localStorage["supabase.auth.session"]` | on login/refresh-token | restored | **cleared** by `signOutSupabase` | high — security-relevant |
| OAuth PKCE verifier | `localStorage["supabase.auth.pkce.verifier"]` | on OAuth start | consumed once during callback | cleared on logout | medium |
| User profile (onboarding) | Supabase `user_profiles` table (source of truth) + `localStorage["app.userProfile.<userId>"]` (cache) | onboarding dialog submit only | restored from cache, then reconciled against Supabase | localStorage cache is **not explicitly cleared** on logout — verify this doesn't leak the previous user's cached profile into a new session on a shared device (flag for manual check, not confirmed as a bug in this audit) | medium — **another user must not see this data** |
| Practice/exam session state | React state only (no persistence layer) | never written to storage | **lost** | n/a | low — by design, but must stay documented so nobody "fixes" this into an inconsistent half-persisted state |

No credentials, tokens, or private user data are reproduced in this
document or should be reproduced in any test report generated from it.

---

## 7. Automation candidates

Inspected: no unit-test framework (Vitest/Jest/etc.) is configured in this
repo (confirmed via `package.json` — only `vite`/`typescript`/`sass`
devDependencies, no test runner). Existing "tests" in `scripts/` are plain
Node `.mjs` guard scripts that do source-text/file-tree assertions, not a
component-testing framework. This document does not add one — see the
"automate now" candidates below, which follow that same existing pattern
instead.

| Candidate | Classification | Notes |
|---|---|---|
| Primary interactive route strings exist and match between `App.tsx` and `Header.tsx` | automate now | implemented in `scripts/tests/routing/test-interactive-contracts.mjs` |
| No duplicate route paths within `App.tsx`'s `ROUTES` | automate now | same script |
| Profile route + profile shell components still exist and are wired (file existence + `<UserProfileDashboardPage` render call present) | automate now | same script |
| This document contains all required sections and ID prefixes | automate now | same script (doc-completeness check, same pattern as `test-generated-data-ownership.mjs`) |
| `localStorage` key contracts (the exact key strings above still appear in source) | automate now | same script |
| Auth guard existence check | **not applicable** | there are no route guards anywhere in the app (see AUTH-09) — nothing to assert except that this stays a *documented*, not silent, state |
| Practice/exam module files still exist | automate now (file existence only) | see rejected approach below |
| Practice-route/stored-language-preference reconciliation (no oscillation, URL stays authoritative, legacy language-less alias stays single-navigator) | automate now | implemented in `scripts/tests/practice/test-practice-route-sync.mjs`, chained via `npm run test:feature-contracts` |
| Account/profile language-sync policy (Languages-page confirmation-popup gate, profile-load hydration priority, Save-to-account write/retry contract) | automate now | implemented in `scripts/tests/account/test-account-language-sync.mjs`, chained via `npm run test:feature-contracts` |
| Canonical exercise-id contract (FILTER-04 — the five-value id set, typing/four-word partition, `ExerciseSelection.tsx` option coverage) | automate now | implemented in `scripts/tests/practice/test-exercise-id-contract.mjs`, chained via `npm run test:feature-contracts`; this composite now also runs in CI (`.github/workflows/ci.yml`) |
| Runtime `import()` of practice/exam `.tsx` modules to prove they're loadable | **rejected — automate later, if ever** | these modules import `.scss` and browser-only globals; requiring them under plain Node without a bundler/DOM shim is unreliable and would need a real test framework to do safely. File-existence + route-string checks give most of the same regression signal at a fraction of the risk of a brittle, flaky guard. |
| Full interaction flows (typing answers, exam scoring, keyboard behavior) | manual only | genuinely needs a browser; not attempted here, not worth a new E2E framework for this task (see Phase 9 constraint against adding Playwright/Cypress/Selenium without proving necessity — not proven here) |
| Unfinished profile content | unstable because feature unfinished | do not automate against a shell that's expected to change shape once real content lands |

---

## 8. Test-data policy

- Use a **dedicated non-production Supabase test account** for all
  login/logout/onboarding checks. Never use a real user's account for
  destructive or write-path tests.
- Do not commit passwords, tokens, or session values to Git, in this
  document, in commit messages, or in test-run reports.
- Do not include tokens, session cookies, or full request/response bodies
  in screenshots or logs attached to a test report.
- Do not write automated tests against the production Supabase project or
  production Cloudflare deployment. Manual verification against production
  should be **read-only** where practical (e.g. confirm `/profile` loads,
  do not submit onboarding against production with a throwaway account
  unless specifically cleaning it up afterward).
- After manual runs that create practice sessions, exam attempts, or
  onboarding rows against a test account, reset/clean that account's state
  where possible so the next run starts from a known baseline.
- Distinguish local (`npm run dev` / `server-build`), preview, and
  production verification explicitly in the test-run report — a pass
  locally is not evidence of a pass in Cloudflare's remote-built Worker.

---

## 9. Test cadence by change type

| Change type | Required checks |
|---|---|
| Documentation-only | none from this document; run relevant `docs/*` guard scripts if the doc has one |
| Data-path change (vocabulary JSON, level data, etc.) | `test:architecture-guards` + relevant smoke flow (LANG, FILTER, PRACTICE) |
| UI component cleanup (non-profile) | manual smoke checklist (§4) + affected feature's full-regression rows |
| Auth change | full `AUTH-*` suite + `PROFILE-SHELL-01`/`02` (auth state feeds the shell) |
| Practice-flow change | full `PRACTICE-*` + `TEST-*` + `KEYBOARD-*` suites |
| Profile-shell change | `PROFILE-SHELL-*` checks only — do not test `PROFILE-DEFERRED-*` items as if implemented |
| Future profile feature implementation | new acceptance criteria written first (§2C), then this document's profile section is expanded with real `PROFILE-*` IDs in the same change |
| `App.tsx` extraction | full manual smoke checklist (§4) + `test:interactive-contracts` + `test:architecture-guards` |
| Route reorganization | full `NAV-*` suite (direct load, back/forward, unknown-route) + `AUTH-09` (route-guard state didn't silently change) |
| Major release | full regression checklist (§5), all sections |

---

## 10. Test-run report template

```text
Build/commit:
Environment:
Browser/device:
Tester:
Date:

Passed:
Failed:
Blocked:
Deferred:

Known unfinished features:
- Profile page main content: unfinished
- Profile sidebar navigation: inert (no onClick handlers)
- Daily target / streak: does not exist
- Practice/exam progress persistence: does not exist
- Profile checks executed: shell-only (PROFILE-SHELL-*)

Failures:
| ID | Description | Severity | Reproduction | Screenshot/log |
|---|---|---|---|---|
```
