# User-profile feature

## 1. Purpose

This feature owns the user-profile experience only: the `/profile` route,
profile-specific pages, profile-only reusable components, and profile-specific
styles. It does not own authentication, session state, the profile data
model, or any onboarding/account flow that other parts of the app also
depend on — those are shared infrastructure and stay outside this folder
(see section 4).

## 2. Current structure

- `pages/` — route-level profile pages (currently `UserProfileDashboardPage.tsx`,
  rendered by `src/app/App.tsx`'s `profile` route)
- `components/` — profile-only reusable components consumed exclusively by
  files in this feature (currently `UserProfileSidebar.tsx`, used only by
  `UserProfileDashboardPage`)
- `styles/` — styles owned by and colocated with this feature's components
  (currently `user-profile-sidebar.scss`)
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

Never import a deep internal path (e.g. `../features/user-profile/pages/UserProfileDashboardPage`)
from outside this feature. Only export from `index.ts` what an external
consumer genuinely needs — internal components like `UserProfileSidebar`
stay unexported until something outside this feature actually needs them.

Internal files should use direct relative imports to each other (`pages/`
importing from `components/`, `components/` importing from `styles/`).
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
