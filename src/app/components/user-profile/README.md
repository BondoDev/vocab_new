This folder is the UI ownership boundary for the profile page (`/profile`) —
the account-dashboard view rendered by `UserProfileDashboardPage` and reached
via `App.tsx`'s `profile` route.

## Current structure

The folder is intentionally flat because it is small:

- `UserProfileDashboardPage.tsx` — the route-level page component
- `UserProfileSidebar.tsx` — the profile navigation sidebar, rendered inside
  the dashboard page
- `user-profile-sidebar.scss` — styling for both of the above, colocated here
  and imported directly by `UserProfileSidebar.tsx`

It's fine for this folder to stay flat. Don't add empty `components/`,
`hooks/`, or `utils/` subdirectories ahead of need. Introduce a subdirectory
only when there's a genuine ownership boundary or enough related code to
justify one — e.g. several profile-only hooks, or enough sub-components that
a flat listing stops being readable. Until then, add new profile-only files
flat alongside the two above.

## Styling

Profile-specific styles are colocated with the component that owns them and
imported directly, as `user-profile-sidebar.scss` is. This differs from most
of the app's route-level SCSS, which is imported centrally from
`src/main.tsx` — both patterns are valid. A colocated component stylesheet
does not need to move to `src/styles/` or be wired into `main.tsx`.

## What lives elsewhere

This folder owns profile *presentation* only. Auth session state and the
profile data model are owned outside it and passed in as props:

- `src/lib/supabaseAuth.ts`, `src/lib/userProfile.ts` — auth session and
  profile service calls
- `src/app/hooks/useUserProfileLoad.ts`, `useAccountOnboarding.ts` — profile
  loading/onboarding state, wired up in `App.tsx`
- `App.tsx` loads the profile and passes `nickname`, `practiceLanguage`, and
  `languageLevel` into `UserProfileDashboardPage` as props

Don't import `lib/userProfile.ts` or auth session state directly into a new
component in this folder unless it genuinely needs the same data — keep
data-fetching in the hooks above and presentation here.

## Commenting rule

Add short comments above non-obvious functions, state flows, and data
transforms. Do not add comments for self-explanatory JSX or trivial
assignments.
