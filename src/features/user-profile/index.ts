// Public entry point for the user-profile feature. Consumers outside this
// folder must import from here, not from sections/ or components/ directly —
// UserProfileSidebar is an internal implementation detail of
// UserProfileDashboardPage and has no external consumer, so it is
// deliberately not re-exported.
export { UserProfileDashboardPage } from "./sections/UserProfileDashboardPage";
// The Vocabulary section's "Add to list" popup, also used by the full
// vocabulary list SEO pages (src/app/pages/list-pages/full-vocabulary-list/). It owns
// its own data fetching and styles, so it works outside the profile page.
export { AddWordToListDialog, type AddToListWord } from "./sections/vocabulary/AddWordToListDialog";
// Add to list / favorites row actions for the Study New Words and Review
// Words completion screens' word lists (src/app/components/session-word-list/).
export {
  useSessionWordActions,
  type SessionWordActionLabels,
  type SessionWordForActions,
} from "./sections/vocabulary/useSessionWordActions";
