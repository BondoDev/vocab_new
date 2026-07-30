# User-profile feature

## 1. Purpose

This feature owns the user-profile experience only: the `/profile` route,
profile-specific pages, profile-only reusable components, and profile-specific
styles. It does not own authentication, session state, the profile data
model, or any onboarding/account flow that other parts of the app also
depend on — those are shared infrastructure and stay outside this folder
(see section 4).

## 2. Current structure

- `sections/` — route-level profile sections, one subfolder per section id:
  - `UserProfileDashboardPage.tsx` — the shell rendered by `src/app/App.tsx`'s
    `profile` route; owns the sidebar layout, the active-section state, and
    switches between section components
  - `dashboard/DashboardSection.tsx` — the `dashboard` section's content
  - `dashboard/dashboard-section.scss` — its styles, colocated in the same
    section folder
  - `learning/LearningSection.tsx` — the `learning` section's content
  - `learning/DailyGoalSelector.tsx` — learning-only Daily Goal control,
    consumed exclusively by `LearningSection`
  - `learning/learning-section.scss` — one shared stylesheet for both
    components above (not one file per component); its own section
    comments mark which rules belong to `LearningSection` vs.
    `DailyGoalSelector`, imported once by `LearningSection.tsx`
  Each section subfolder owns its own `.scss` file(s) rather than sharing
  the feature-level `styles/` folder. Add a new `sections/<id>/` subfolder
  only once that section has real content to hold — do not create empty
  section folders in advance (see section 6).
- `components/` — profile-only reusable components shared across more than
  one section (currently `UserProfileSidebar.tsx`, used only by
  `UserProfileDashboardPage`)
- `styles/` — styles shared across the feature that are not owned by a
  single section (currently `user-profile-sidebar.scss`, which also holds
  the profile shell's own layout classes)
- `index.ts` — the feature's public entry point; the only path external
  consumers should import from

## 3. Ownership rules

A file belongs in this feature only if it is exclusively used by the
user-profile experience. Examples that belong here:

- profile route pages
- profile-specific UI (sidebar, dashboard sections, profile-only widgets)
- profile-only helper components
- profile-only styles

If a file is also needed by another feature, a shared dialog, or the app
shell, it does not belong here — see section 4.

## 4. What does NOT belong here

The following remain outside this feature, even though they relate to
"profile" or "account" concepts:

- Authentication/session infrastructure (e.g. `src/lib/supabaseAuth.ts`)
- Supabase client setup and generic persistence (e.g. `src/lib/userProfile.ts`
  and its `UserProfile`/`LanguageLevelCode` types)
- Onboarding flows (e.g. `useAccountOnboarding.ts`, `AccountOnboardingDialog.tsx`)
- Account-language synchronization (e.g. `useAccountLanguageConfirm.ts`,
  `useUserProfileLoad.ts`, `AccountLanguageConfirmDialog.tsx`)
- Shared dialogs rendered from the app shell rather than from a profile page
- Shared UI components and primitives (e.g. `src/app/components/ui/`,
  `LanguageSelector.tsx`)
- Reusable hooks or utilities consumed by more than one feature

These belong to shared infrastructure (`src/lib/`, `src/app/hooks/`,
`src/app/utils/`) or to the app shell (`src/app/App.tsx`,
`src/app/components/`), because they are consumed by more than just the
profile page. `App.tsx` loads this shared state and passes only the props
this feature's pages need (e.g. `nickname`, `practiceLanguage`,
`languageLevel`).

## 5. Import rules

External consumers must import through the feature's public entry point:

```ts
import { UserProfileDashboardPage } from "../features/user-profile";
```

Never import a deep internal path (e.g. `../features/user-profile/sections/UserProfileDashboardPage`)
from outside this feature. Only export from `index.ts` what an external
consumer genuinely needs — internal components like `UserProfileSidebar`
stay unexported until something outside this feature actually needs them.

Internal files should use direct relative imports to each other (`sections/`
importing from `components/`, `components/` importing from `styles/`). A
section subfolder (e.g. `sections/learning/`) may hold files private to that
section alone, like `DailyGoalSelector.tsx`; only promote a file to the
shared `components/` folder once a second section genuinely needs it.
Do not import the feature's own `index.ts` barrel from inside the feature —
it adds an unnecessary indirection and risks a circular import.

## 6. Future growth

Add new profile-exclusive files to the existing folder matching their role.
Create additional folders — `hooks/`, `types/`, `data/`, etc. — only when a
real profile-owned file needs one. Do not create empty folders preemptively
in anticipation of future work.

## 7. Decision checklist

- If deleting the profile feature would make this file useless, it probably
  belongs here.
- If another feature or the application shell also needs this file, it
  probably belongs elsewhere.
