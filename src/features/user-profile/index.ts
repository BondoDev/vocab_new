// Public entry point for the user-profile feature. Consumers outside this
// folder must import from here, not from sections/ or components/ directly —
// UserProfileSidebar is an internal implementation detail of
// UserProfileDashboardPage and has no external consumer, so it is
// deliberately not re-exported.
export { UserProfileDashboardPage } from "./sections/UserProfileDashboardPage";
