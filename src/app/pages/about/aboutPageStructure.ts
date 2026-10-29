// Structure of the About page (/about): section order, anchor ids, the item
// keys each section renders, and the actions it offers.
//
// This module holds keys and routes, never text. Every string About.tsx
// renders is the key path built here under `aboutPage.*` in the interface
// locale files (e.g. aboutPage.paths.customPractice.title). Adding,
// removing, or renaming a key here requires the same change in all seven
// *_interface.json files.
//
// Anchor ids become public URLs once shipped (/about#ways-to-learn).

export type AboutActionId = "startPractice" | "createAccount" | "openLearning";

export type AboutSectionId = "approach" | "ways-to-learn" | "platform" | "get-started";

export interface AboutLearningPath {
  // Key under paths.<key>.
  key: "customPractice" | "personalizedLearning";
  // Highlight keys under paths.<key>.highlights, in order.
  highlights: readonly string[];
}

// Principle keys under approach.principles, rendered as a numbered list.
// Order also picks each principle's accent color in about-page.scss.
export const ABOUT_PRINCIPLES = ["activeRecall", "repetition", "meaningfulUse"] as const;

export const ABOUT_LEARNING_PATHS: readonly AboutLearningPath[] = [
  {
    key: "customPractice",
    highlights: ["chooseLanguages", "chooseFilters", "flexibleSessions"],
  },
  {
    key: "personalizedLearning",
    highlights: ["guidedNewWords", "spacedReview", "progressTracking"],
  },
];

// Capability keys under platform.items. Order also picks each item's accent
// color in about-page.scss (nth-child), so reordering changes colors too.
export const ABOUT_CAPABILITIES = [
  "languagesLevels",
  "exercisesPronunciation",
  "listsFavorites",
  "progressReviews",
] as const;

// Static destinations, all existing routes. createAccount opens the header's
// sign-up dialog instead of navigating, so About.tsx handles it itself.
// openLearning keeps the profile route's own signed-out redirect.
export const ABOUT_ACTION_ROUTES: Partial<Record<AboutActionId, string>> = {
  startPractice: "/custom-practice",
  openLearning: "/profile?section=learning",
};
