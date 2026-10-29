// Structure of the Help Center (/help): section order, anchor ids, the
// translation keys each section renders, and its contextual actions.
//
// Copy lives only in the interface locale files under `helpCenter.*`; this
// module holds keys and routes, never text. Anchor ids are public URLs
// (/help#personalized-learning) — renaming one breaks existing deep links.
//
// The older `helpPage.*` namespace is NOT used here: the exercise explanation
// dialog on /custom-practice (ExerciseSelection.tsx) still reads it.

export type HelpCenterActionId =
  | "startPractice"
  | "createAccount"
  | "openLearning"
  | "openMyLists"
  | "exploreVocabulary"
  | "learningResources"
  | "takeLevelTest"
  | "openSettings";

export interface HelpCenterSection {
  id: string;
  // Key under helpCenter.navigation and helpCenter.sections.
  key: string;
  // Subsection keys rendered as H3 + body, in order.
  topics: readonly string[];
  // Expandable entries under sections.<key>.exerciseTypes (Custom Practice).
  exerciseTypes?: readonly string[];
  // Expandable entries under sections.<key>.items (Common Questions).
  faqItems?: readonly string[];
  actions?: readonly HelpCenterActionId[];
}

export const HELP_CENTER_SECTIONS: readonly HelpCenterSection[] = [
  {
    id: "getting-started",
    key: "gettingStarted",
    topics: ["choosePath", "withoutAccount", "withAccount"],
    actions: ["startPractice", "createAccount"],
  },
  {
    id: "custom-practice",
    key: "customPractice",
    topics: ["languages", "filters", "exerciseSelection", "sessions"],
    exerciseTypes: ["wordTyping", "halfWritten", "brokenWord", "connectWords", "listening"],
    actions: ["startPractice"],
  },
  {
    id: "personalized-learning",
    key: "personalizedLearning",
    topics: ["studyNewWords", "reviewWords", "dailyGoal", "learningProgress"],
    actions: ["openLearning"],
  },
  {
    id: "my-lists",
    key: "myLists",
    topics: ["manageLists", "addWords", "practiceList"],
    actions: ["openMyLists"],
  },
  {
    id: "vocabulary-progress",
    key: "vocabularyProgress",
    topics: ["vocabulary", "statuses", "favorites", "dashboard", "milestones"],
  },
  {
    id: "resources",
    key: "resources",
    topics: ["explore", "cefr", "wordDetails", "verbs", "levelTest"],
    actions: ["exploreVocabulary", "learningResources", "takeLevelTest"],
  },
  {
    id: "account-settings",
    key: "accountSettings",
    topics: ["registration", "profileSetup", "languages", "timezone", "resetProgress", "deleteAccount"],
    actions: ["openSettings"],
  },
  {
    id: "faq",
    key: "faq",
    topics: [],
    faqItems: ["accountRequired", "practiceProgress", "reviewSystem", "changeLanguage", "audio", "finishSession"],
  },
];

// Static destinations. Learning Resources is locale-aware and createAccount
// opens the existing sign-up dialog, so Help.tsx resolves those two itself.
// Profile destinations keep the app's own signed-out redirect.
export const HELP_CENTER_ACTION_ROUTES: Partial<Record<HelpCenterActionId, string>> = {
  startPractice: "/custom-practice",
  openLearning: "/profile?section=learning",
  openMyLists: "/profile?section=myLists",
  exploreVocabulary: "/explore",
  takeLevelTest: "/languages/level-test",
  openSettings: "/profile?section=settings",
};
