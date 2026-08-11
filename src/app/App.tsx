import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useLocation, useNavigate } from "react-router";
import "../styles/index.css";
import { Header } from "./components/layout/Header";
import { ExplorePage } from "./pages/explore/ExplorePage";
import { AccountOnboardingDialog } from "./components/dialogs/AccountOnboardingDialog";
import { AccountLanguageConfirmDialog } from "./components/dialogs/AccountLanguageConfirmDialog";
import { PasswordRecoveryDialog } from "./components/dialogs/PasswordRecoveryDialog";
import { LevelTestLanguageModal } from "./pages/level-test/LevelTestLanguageModal";
import { HomePage } from "./pages/home/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ScrollToTopButton } from "./components/layout/ScrollToTopButton";
import { UserProfileDashboardPage } from "../features/user-profile";
import { LevelTestSeoPage } from "./pages/level-test/LevelTestSeoPage";
import { SeoHubPage } from "./pages/SeoHubPage";
import { VerbListSeoPage } from "./pages/verb-lists/common100Verbs/VerbListSeoPage";
import { PastVerbFormsSeoPage } from "./pages/verb-lists/pastForms100Verbs/PastVerbFormsSeoPage";
import { WordSeoPage } from "./pages/word-pages/detail/WordSeoPage";
import { WordPageLayout } from "./pages/word-pages/detail/WordPageLayout";
import { DevSeoCefrPlaceholderPage } from "./pages/vocabulary/DevSeoCefrPlaceholderPage";
import {
  LanguageProvider,
  useLanguage,
  type UILanguage,
} from "../contexts/LanguageContext";
import type { TargetLanguageSlug } from "../data/seo/shared/slugs";
import type { CanonicalWordPageRouteMatch } from "../data/seo/wordPages/wordSlugs";
import type { LevelBrowsePreviewData } from "../data/seo/vocabularyLevels/levelBrowseWords";
import {
  SEOHead,
  SeoProvider,
  type SeoManager,
  useSeoSiteOrigin,
} from "../seo/SeoContext";
import { DEFAULT_SITE_ORIGIN } from "../seo/site";
import { buildRouteMetadata } from "../seo/routeMetadataPolicy";
import { findSeoCefrPreviewItem } from "./pages/vocabulary/devSeoCefrPreviewData";
import type { ResolvedWordPageData } from "../data/seo/wordPages/wordPageData";
import type { UserProfile } from "../lib/userProfile";
import { signOutSupabase } from "../lib/supabaseAuth";
import { describeSupabaseError } from "../lib/supabaseError";
import {
  TARGET_LANGUAGE_TO_UI_CODE,
  buildPracticeRoute,
  getRouteUILanguage,
  pageFromPath,
  parseDevSeoCefrPlaceholderRoute,
  parseLevelTestSeoRoute,
  parsePastVerbFormsSeoRoute,
  parsePracticeRoute,
  parseSeoHubRoute,
  parseVerbListSeoRoute,
  parseVocabularyRoute,
  parseWordRoute,
  parseWordSeoHubRoute,
  type RouteKey,
} from "./utils/pageRouting";
import { resolveVocabularyLevelRenderDecision } from "./utils/vocabularyLevelRenderDecision";
import { useAuthSession } from "./hooks/useAuthSession";
import { useSupabaseAuthRedirect } from "./hooks/useSupabaseAuthRedirect";
import { useAccountOnboarding } from "./hooks/useAccountOnboarding";
import { useStoredAppPreferences } from "./hooks/useStoredAppPreferences";
import { useUserProfileLoad } from "./hooks/useUserProfileLoad";
import { useAccountLanguageConfirm } from "./hooks/useAccountLanguageConfirm";
import { useRouteLanguageSync } from "./hooks/useRouteLanguageSync";
import { usePracticeRouteLanguageSync } from "./hooks/usePracticeRouteLanguageSync";
import { useStoredLanguageAutoRedirect } from "./hooks/useStoredLanguageAutoRedirect";
import { useExploreItems } from "./pages/explore/useExploreItems";
import { useLanguageContinuePopup } from "./hooks/useLanguageContinuePopup";

const LevelCategorySelection = lazy(() =>
  import("../features/learning-setup/LevelCategorySelection").then((module) => ({
    default: module.LevelCategorySelection,
  })),
);
const ExerciseSelection = lazy(() =>
  import("../features/learning-setup/ExerciseSelection").then((module) => ({
    default: module.ExerciseSelection,
  })),
);
const VocabularyPractice = lazy(() =>
  import("../features/practice/VocabularyPractice").then((module) => ({
    default: module.VocabularyPractice,
  })),
);
const NewWordStudyPreparation = lazy(() =>
  import("../features/study-new-words/NewWordStudyPreparation").then((module) => ({
    default: module.NewWordStudyPreparation,
  })),
);
const ReviewWordsPreparation = lazy(() =>
  import("../features/review-words/ReviewWordsPreparation").then((module) => ({
    default: module.ReviewWordsPreparation,
  })),
);
const VocabularyLevelExam = lazy(() =>
  import("./pages/VocabularyLevelExam").then((module) => ({
    default: module.VocabularyLevelExam,
  })),
);
const About = lazy(() =>
  import("./pages/About").then((module) => ({
    default: module.About,
  })),
);
const Help = lazy(() =>
  import("./pages/Help").then((module) => ({
    default: module.Help,
  })),
);
const WordSeoHubPage = lazy(() =>
  import("./pages/word-pages/hub/WordSeoHubPage").then((module) => ({
    default: module.WordSeoHubPage,
  })),
);
const supportedLanguages = [
  { code: "en", flagCode: "gb" },
  { code: "es", flagCode: "es" },
  { code: "fr", flagCode: "fr" },
  { code: "de", flagCode: "de" },
  { code: "it", flagCode: "it" },
  { code: "pt", flagCode: "pt" },
  { code: "ru", flagCode: "ru" },
];

const STORAGE_KEYS = {
  yourLanguage: "app.yourLanguage",
  practiceLanguage: "app.practiceLanguage",
  selectedLevel: "app.selectedLevel",
  selectedCategories: "app.selectedCategories",
  selectedLevels: "app.selectedLevels",
  selectedWordTypes: "app.selectedWordTypes",
  selectedExercises: "app.selectedExercises",
} as const;

function RouteLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12 text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

// ROUTES must stay defined in this file as a literal `as const` block:
// scripts/tests/routing/test-interactive-contracts.mjs parses App.tsx's source text for it
// (and Header.tsx's NAV_HREFS is checked against it). The pure route helpers
// live in ./utils/pageRouting and receive this map as a parameter instead of
// importing App.tsx.
const ROUTES = {
  language: "/languages",
  levelCategory: "/languages/filters",
  exerciseSelection: "/languages/filters/exercises",
  practice: "/languages/filters/exercises/practice",
  explore: "/explore",
  exam: "/languages/level-test",
  about: "/about",
  help: "/help",
  profile: "/profile",
  newWordStudy: "/learning/new-words",
  reviewWords: "/learning/review",
} as const;

function AppContent({
  initialWordPageData,
  initialBrowsePreviewData,
  ssrRouteOverride,
}: {
  initialWordPageData?: ResolvedWordPageData | null;
  initialBrowsePreviewData?: LevelBrowsePreviewData | null;
  ssrRouteOverride?: {
    page: "wordPage" | "notFound";
    wordRoute?: CanonicalWordPageRouteMatch | null;
  };
}) {
  const { t, uiLanguage, setUILanguage } = useLanguage();
  const supportedLanguageCodes = useMemo(
    () => new Set(supportedLanguages.map((language) => language.code)),
    [],
  );
  // Explore-topic data building is pure and lives in
  // ./pages/explore/exploreTopics; the 14 useMemo calls (and their exact
  // dependency arrays) live in ./pages/explore/useExploreItems so
  // memoization behavior is unchanged.
  const exploreItemsByLanguageCode = useExploreItems(
    uiLanguage,
    t,
    ROUTES.exam,
  );
  const languages = useMemo(
    () =>
      supportedLanguages.map((lang) => ({
        ...lang,
        name: t(`languageNames.${lang.code}`),
      })),
    [t],
  );
  const location = useLocation();
  // initialPracticeRouteRef stays here (route parsing); only the two
  // derived fallback strings are handed to the preferences hook below.
  const initialPracticeRouteRef = useRef(parsePracticeRoute(location.pathname));
  const {
    yourLanguage,
    setYourLanguage,
    practiceLanguage,
    setPracticeLanguage,
    selectedLevel,
    setSelectedLevel,
    selectedCategories,
    setSelectedCategories,
    selectedLevels,
    setSelectedLevels,
    selectedWordTypes,
    setSelectedWordTypes,
    selectedExercises,
    setSelectedExercises,
    isContinueDisabled,
    shouldAutoRedirectFromStoredLanguagesRef,
    resetFiltersForLevel,
  } = useStoredAppPreferences({
    storageKeys: STORAGE_KEYS,
    initialYourLanguage: initialPracticeRouteRef.current?.yourLanguage ?? "",
    initialPracticeLanguage:
      initialPracticeRouteRef.current?.practiceLanguage ?? "",
    hasInitialCanonicalPracticeRoute: initialPracticeRouteRef.current !== null,
    supportedLanguageCodes,
  });
  const { authSession, authUserId, handleAuthSessionChange } = useAuthSession();
  // Sole owner of "did this page load just consume a Supabase auth
  // redirect" - see useSupabaseAuthRedirect.ts for why this replaces both
  // Header's old internal redirect effect and this component's previous
  // practice/exam-only one.
  const {
    isPasswordRecoveryActive,
    redirectError: authRedirectError,
    clearRedirectError: clearAuthRedirectError,
    exitPasswordRecovery,
  } = useSupabaseAuthRedirect({ onSessionEstablished: handleAuthSessionChange });
  let loadedUserProfile!: UserProfile;
  let setLoadedUserProfile!: Dispatch<SetStateAction<UserProfile>>;
  const {
    isAccountOnboardingOpen,
    setIsAccountOnboardingOpen,
    isAccountOnboardingSubmitting,
    accountOnboardingError,
    setAccountOnboardingError,
    handleUserProfileChange,
    handleAccountOnboardingSubmit,
  } = useAccountOnboarding({
    authSession,
    authUserId,
    getUserProfile: () => loadedUserProfile,
    setUserProfile: (value) => setLoadedUserProfile(value),
    yourLanguage,
    practiceLanguage,
    setYourLanguage,
    setPracticeLanguage,
  });
  const { userProfile, setUserProfile, isProfileLoaded } = useUserProfileLoad({
    authUserId,
    yourLanguage,
    practiceLanguage,
    setYourLanguage,
    setPracticeLanguage,
    setIsAccountOnboardingOpen,
    setAccountOnboardingError,
  });
  loadedUserProfile = userProfile;
  setLoadedUserProfile = setUserProfile;
  const navigate = useNavigate();
  const levelTestSeoRoute = useMemo(
    () => parseLevelTestSeoRoute(location.pathname),
    [location.pathname],
  );
  const verbListSeoRoute = useMemo(
    () => parseVerbListSeoRoute(location.pathname),
    [location.pathname],
  );
  const pastVerbFormsSeoRoute = useMemo(
    () => parsePastVerbFormsSeoRoute(location.pathname),
    [location.pathname],
  );
  const seoHubRoute = useMemo(
    () => parseSeoHubRoute(location.pathname),
    [location.pathname],
  );
  const wordSeoHubRoute = useMemo(
    () => parseWordSeoHubRoute(location.pathname),
    [location.pathname],
  );
  const vocabularyRoute = useMemo(
    () => parseVocabularyRoute(location.pathname),
    [location.pathname],
  );
  const detectedWordRoute = useMemo(
    () => parseWordRoute(location.pathname),
    [location.pathname],
  );
  const currentPage = useMemo(
    () => pageFromPath(location.pathname, ROUTES),
    [location.pathname],
  );
  // Explicit source of truth for "did this Exercises visit originate from the
  // authenticated Learning page's Custom Practice card": read straight from
  // the URL (never inferred from auth/history/state), so it survives a
  // refresh and stays correct if the query string picks up other params.
  const isCustomPracticeSource = useMemo(
    () => new URLSearchParams(location.search).get("source") === "custom-practice",
    [location.search],
  );
  const [openExploreLanguage, setOpenExploreLanguage] =
    useState<UILanguage | null>(null);
  const [isLevelTestLanguageModalOpen, setIsLevelTestLanguageModalOpen] =
    useState(false);
  const [
    levelTestModalSeedTargetLanguage,
    setLevelTestModalSeedTargetLanguage,
  ] = useState("");
  const [levelTestModalSwapRotation, setLevelTestModalSwapRotation] =
    useState(0);
  const [swapRotation, setSwapRotation] = useState(0);
  const resolvedPage = ssrRouteOverride?.page ?? currentPage;
  const wordRoute = ssrRouteOverride?.wordRoute ?? detectedWordRoute;
  const siteOrigin = useSeoSiteOrigin();
  const routeMetadata = useMemo(() => {
    switch (resolvedPage) {
      case "wordPage":
      case "vocabularyLevel":
      case "levelTestSeo":
      case "verbListSeo":
      case "pastVerbFormsSeo":
      case "seoHub":
      case "wordSeoHub":
      case "devSeoCefrPlaceholder":
        return null;
      default:
        return buildRouteMetadata(location.pathname, siteOrigin);
    }
  }, [location.pathname, resolvedPage, siteOrigin]);

  const handleStartPracticing = () => {
    if (isContinueDisabled) {
      popupRef.current?.show({ delayMs: 0 });
      return;
    }
    accountLanguageConfirm.attemptContinue();
  };

  const handleStartVocabularyPractice = (
    _targetLanguage: TargetLanguageSlug,
    level: string,
  ) => {
    resetFiltersForLevel(level);

    if (isContinueDisabled) {
      navigate(ROUTES.language);
      queueForLanguagePage();
      return;
    }

    navigate(ROUTES.levelCategory);
  };

  const routeUILanguage = useMemo(
    () =>
      getRouteUILanguage(resolvedPage, {
        vocabularyRoute,
        levelTestSeoRoute,
        verbListSeoRoute,
        pastVerbFormsSeoRoute,
        seoHubRoute,
        wordSeoHubRoute,
        wordRoute,
      }),
    [
      resolvedPage,
      vocabularyRoute,
      levelTestSeoRoute,
      verbListSeoRoute,
      pastVerbFormsSeoRoute,
      seoHubRoute,
      wordSeoHubRoute,
      wordRoute,
    ],
  );
  useRouteLanguageSync(routeUILanguage, uiLanguage, setUILanguage);

  usePracticeRouteLanguageSync({
    pathname: location.pathname,
    resolvedPage,
    yourLanguage,
    practiceLanguage,
    setYourLanguage,
    setPracticeLanguage,
    navigate,
    routes: {
      exerciseSelection: ROUTES.exerciseSelection,
    },
  });

  useStoredLanguageAutoRedirect({
    resolvedPage,
    initialPathname: location.pathname,
    startedOnLanguagePage: pageFromPath(location.pathname, ROUTES) === "language",
    isContinueDisabled,
    shouldAutoRedirectFromStoredLanguagesRef,
    navigate,
    legacyPracticePath: ROUTES.practice,
    exerciseSelectionPath: ROUTES.exerciseSelection,
  });

  const { popupRef, queueForLanguagePage } = useLanguageContinuePopup({
    resolvedPage,
    isContinueDisabled,
  });

  const accountLanguageConfirm = useAccountLanguageConfirm({
    authSession,
    authUserId,
    isProfileLoaded,
    userProfile,
    setUserProfile,
    yourLanguage,
    practiceLanguage,
    proceed: () => navigate(ROUTES.levelCategory),
  });

  const handleContinueToExerciseSelection = () => {
    navigate(ROUTES.exerciseSelection);
  };

  // Shared "languages required" policy: if the user hasn't picked both
  // languages yet, redirect to the Languages page (optionally queuing the
  // continue popup there) instead of proceeding. Mechanical consolidation of
  // what were three near-duplicate implementations (see the App.tsx
  // architecture audit) — handleRequireLanguages and handleStartExam shared
  // this branch verbatim; handleStartSeoLevelTest implements a different
  // policy (inline language collection via LevelTestLanguageModal) and is
  // deliberately not part of this helper.
  const requireLanguagesBeforeContinue = (onReady: () => void) => {
    if (isContinueDisabled) {
      const suppressPopup = resolvedPage === "about";
      navigate(ROUTES.language);
      if (!suppressPopup) {
        queueForLanguagePage();
      }
      return;
    }
    onReady();
  };

  const handleRequireLanguages = (nextPage: RouteKey) => {
    requireLanguagesBeforeContinue(() => navigate(ROUTES[nextPage]));
  };

  // Same "languages required" gate as handleRequireLanguages("exerciseSelection"),
  // but tags the destination with ?source=custom-practice so the Exercises
  // page can show Custom Practice context. Reuses the existing Exercises
  // route/gate rather than a new one.
  const handleStartCustomPractice = () => {
    requireLanguagesBeforeContinue(() =>
      navigate(`${ROUTES.exerciseSelection}?source=custom-practice`),
    );
  };

  // Study New Words needs no query-param tagging (unlike Custom Practice) —
  // it has its own dedicated route, so plain handleRequireLanguages is enough.
  const handleStartNewWordStudy = () => handleRequireLanguages("newWordStudy");

  // Review Words is its own dedicated structured-learning route — never the
  // ordinary configurable Exercises page and never Custom Practice's route.
  const handleStartReviewWords = () => handleRequireLanguages("reviewWords");

  const handleProfileSignOut = async () => {
    const currentSession = authSession;

    try {
      handleAuthSessionChange(null);
      await signOutSupabase(currentSession);
    } catch (error) {
      console.warn(
        "App: signOutSupabase failed (local sign-out already completed).",
        describeSupabaseError("sign out", error),
      );
    } finally {
      navigate(ROUTES.exerciseSelection);
    }
  };

  const handleContinueToPractice = () => {
    if (isContinueDisabled) {
      popupRef.current?.show({ delayMs: 0 });
      return;
    }

    const practiceRoute = buildPracticeRoute(
      yourLanguage as UILanguage,
      practiceLanguage as UILanguage,
      ROUTES,
    );
    // Carries the Custom Practice origin into the session URL (not just
    // component state) so it survives a page refresh; this is frontend-only
    // context and is not written to Supabase.
    navigate(
      isCustomPracticeSource ? `${practiceRoute}?source=custom-practice` : practiceRoute,
    );
  };

  // Authentication preserves the current route; users open their profile
  // explicitly from the account menu (see sharedHeaderProps.onProfile below).
  const sharedHeaderProps = {
    onAbout: () => navigate(ROUTES.about),
    onHelp: () => navigate(ROUTES.help),
    onLevelTest: () => handleRequireLanguages("exam"),
    onLanguages: () => navigate(ROUTES.language),
    onFilters: () => handleRequireLanguages("levelCategory"),
    onExercises: () => handleRequireLanguages("exerciseSelection"),
    onExplore: () => navigate(ROUTES.explore),
    onProfile: (section?: "dashboard" | "learning" | "vocabulary" | "progress") => {
      navigate(section ? `${ROUTES.profile}?section=${section}` : ROUTES.profile);
    },
    authSession,
    accountNickname: userProfile.nickname,
    accountPracticeLanguage: userProfile.practiceLanguage,
    accountLanguageLevel: userProfile.languageLevel,
    onAuthSessionChange: handleAuthSessionChange,
    onSignedOut: () => navigate(ROUTES.exerciseSelection),
    authRedirectError,
    onAuthRedirectErrorHandled: clearAuthRedirectError,
  };

  // Rendered on every route (appended alongside accountOnboardingDialog
  // below) since password recovery must complete regardless of which page
  // the redirect happened to land on - including practice/exam, where
  // Header (and therefore Header's own dialogs) isn't mounted at all.
  const passwordRecoveryDialog = (
    <PasswordRecoveryDialog
      open={isPasswordRecoveryActive}
      session={authSession}
      onSuccess={() => {
        exitPasswordRecovery();
        navigate(ROUTES.profile);
      }}
    />
  );

  const handleStartExam = () => {
    requireLanguagesBeforeContinue(() => navigate(ROUTES.exam));
  };

  const openLevelTestLanguageModal = (targetLanguageCode: UILanguage) => {
    setLevelTestModalSeedTargetLanguage(targetLanguageCode);
    setIsLevelTestLanguageModalOpen(true);
  };

  const handleStartSeoLevelTest = (targetLanguageCode: UILanguage) => {
    if (!yourLanguage || !practiceLanguage) {
      openLevelTestLanguageModal(targetLanguageCode);
      return;
    }

    if (yourLanguage === targetLanguageCode) {
      openLevelTestLanguageModal(targetLanguageCode);
      return;
    }

    if (practiceLanguage !== targetLanguageCode) {
      setPracticeLanguage(targetLanguageCode);
    }

    navigate(ROUTES.exam);
  };

  const handleExamComplete = (level: string) => {
    setSelectedLevels([level]);
    navigate(ROUTES.levelCategory);
  };

  const toggleExploreLanguage = (language: UILanguage) => {
    setOpenExploreLanguage((prev) => (prev === language ? null : language));
  };

  const handleReverseLanguages = () => {
    const temp = yourLanguage;
    setYourLanguage(practiceLanguage);
    setPracticeLanguage(temp);
    setSwapRotation((prev) => prev + 180);
  };

  // Recovery is the higher-priority modal state: the `open` prop is gated
  // by !isPasswordRecoveryActive so onboarding can never render open at the
  // same time as PasswordRecoveryDialog, but isAccountOnboardingOpen itself
  // (and the profile load feeding it) is untouched - if the profile is
  // still incomplete once recovery exits, this re-evaluates to open on its
  // own, no extra wiring needed.
  const accountOnboardingDialog = authUserId ? (
    <AccountOnboardingDialog
      open={isAccountOnboardingOpen && !isPasswordRecoveryActive}
      onOpenChange={setIsAccountOnboardingOpen}
      profile={userProfile}
      languages={languages}
      isSubmitting={isAccountOnboardingSubmitting}
      error={accountOnboardingError}
      onProfileChange={handleUserProfileChange}
      onSubmit={handleAccountOnboardingSubmit}
    />
  ) : null;

  if (resolvedPage === "practice") {
    return (
      <>
        {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
        <Suspense fallback={<RouteLoadingFallback />}>
          <VocabularyPractice
            practiceLanguage={practiceLanguage}
            yourLanguage={yourLanguage}
            selectedLevel={selectedLevel}
            selectedLevels={selectedLevels}
            selectedCategories={selectedCategories}
            selectedWordTypes={selectedWordTypes}
            selectedExercises={selectedExercises}
            onBack={() => navigate(ROUTES.exerciseSelection)}
            onGoFilters={() => navigate(ROUTES.levelCategory)}
          />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </>
    );
  }

  if (resolvedPage === "exerciseSelection") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
        <Header {...sharedHeaderProps} activePage="exerciseSelection" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <ExerciseSelection
            selectedExercises={selectedExercises}
            setSelectedExercises={setSelectedExercises}
            // A Custom Practice entry bypasses the ordinary
            // language/filters -> exercises path, so Back returns to the
            // Learning page it came from instead of the filters step.
            onBack={() =>
              isCustomPracticeSource
                ? navigate(`${ROUTES.profile}?section=learning`)
                : navigate(ROUTES.levelCategory)
            }
            onContinue={handleContinueToPractice}
            isCustomPracticeContext={isCustomPracticeSource}
          />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "levelCategory") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
        <Header {...sharedHeaderProps} activePage="levelCategory" />
        <div className="flex-1 min-h-0">
          <Suspense fallback={<RouteLoadingFallback />}>
            <LevelCategorySelection
              selectedLevel={selectedLevel}
              setSelectedLevel={setSelectedLevel}
              practiceLanguage={practiceLanguage}
              selectedCategories={selectedCategories}
              setSelectedCategories={setSelectedCategories}
              selectedLevels={selectedLevels}
              setSelectedLevels={setSelectedLevels}
              selectedWordTypes={selectedWordTypes}
              setSelectedWordTypes={setSelectedWordTypes}
              onBack={() => navigate(ROUTES.language)}
              onContinue={handleContinueToExerciseSelection}
              onTakeLevelTest={handleStartExam}
            />
          </Suspense>
        </div>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "exam") {
    return (
      <>
        {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
        <Suspense fallback={<RouteLoadingFallback />}>
          <VocabularyLevelExam
            practiceLanguage={practiceLanguage}
            yourLanguage={yourLanguage}
            onComplete={handleExamComplete}
            onCancel={() => navigate(ROUTES.levelCategory)}
          />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </>
    );
  }

  if (resolvedPage === "about") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
        <Header {...sharedHeaderProps} activePage="about" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <About onBack={() => navigate(ROUTES.language)} />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "profile") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
        <Header {...sharedHeaderProps} activePage="profile" />
        <UserProfileDashboardPage
          nickname={userProfile.nickname}
          practiceLanguage={userProfile.practiceLanguage}
          languageLevel={userProfile.languageLevel}
          userProfile={userProfile}
          isProfileLoaded={isProfileLoaded}
          onStartCustomPractice={handleStartCustomPractice}
          onStartNewWordStudy={handleStartNewWordStudy}
          onStartReviewWords={handleStartReviewWords}
          onSignOut={authSession ? handleProfileSignOut : undefined}
          onDailyGoalChange={(dailyGoal) =>
            setUserProfile((previous) => ({ ...previous, dailyGoal }))
          }
        />
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "newWordStudy") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
        <Header {...sharedHeaderProps} activePage="profile" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <NewWordStudyPreparation
            authUserId={authUserId}
            isProfileLoaded={isProfileLoaded}
            practiceLanguage={practiceLanguage}
            yourLanguage={yourLanguage}
            dailyGoal={userProfile.dailyGoal}
            onBack={() => navigate(`${ROUTES.profile}?section=learning`)}
          />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "reviewWords") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
        <Header {...sharedHeaderProps} activePage="profile" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <ReviewWordsPreparation
            authUserId={authUserId}
            isProfileLoaded={isProfileLoaded}
            practiceLanguage={practiceLanguage}
            yourLanguage={yourLanguage}
            onBack={() => navigate(`${ROUTES.profile}?section=learning`)}
            onStartNewWordStudy={handleStartNewWordStudy}
          />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "explore") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
        <Header {...sharedHeaderProps} activePage="explore" />
        <ExplorePage
          languages={languages}
          itemsByLanguageCode={exploreItemsByLanguageCode}
          openLanguage={openExploreLanguage}
          onToggleLanguage={toggleExploreLanguage}
          onCloseDropdown={() => setOpenExploreLanguage(null)}
          onStartLevelTest={(targetLanguage) => {
            setPracticeLanguage(TARGET_LANGUAGE_TO_UI_CODE[targetLanguage]);
            handleStartExam();
          }}
          examPath={ROUTES.exam}
        />
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "help") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
        <Header {...sharedHeaderProps} activePage="help" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <Help onBack={() => navigate(ROUTES.language)} />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "levelTestSeo") {
    if (!levelTestSeoRoute) {
      return (
        <div className="min-h-screen flex flex-col bg-background">
          <Header {...sharedHeaderProps} activePage="notFound" />
          <NotFoundPage message="Invalid level test page." />
          {accountOnboardingDialog}
          {passwordRecoveryDialog}
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header {...sharedHeaderProps} activePage="vocabularyLevel" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <LevelTestSeoPage
            uiLang={levelTestSeoRoute.uiLang}
            targetLanguage={levelTestSeoRoute.targetLanguage}
            onStartTest={() =>
              handleStartSeoLevelTest(
                TARGET_LANGUAGE_TO_UI_CODE[levelTestSeoRoute.targetLanguage],
              )
            }
          />
        </Suspense>
        <LevelTestLanguageModal
          open={isLevelTestLanguageModalOpen}
          initialYourLanguage={yourLanguage}
          initialPracticeLanguage={
            practiceLanguage || levelTestModalSeedTargetLanguage
          }
          languages={languages}
          swapRotation={levelTestModalSwapRotation}
          onReverse={() => setLevelTestModalSwapRotation((prev) => prev + 180)}
          onClose={() => setIsLevelTestLanguageModalOpen(false)}
          onConfirm={(nextYourLanguage, nextPracticeLanguage) => {
            setYourLanguage(nextYourLanguage);
            setPracticeLanguage(nextPracticeLanguage);
            setIsLevelTestLanguageModalOpen(false);
            navigate(ROUTES.exam);
          }}
        />
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "verbListSeo") {
    if (!verbListSeoRoute) {
      return (
        <div className="min-h-screen flex flex-col bg-background">
          <Header {...sharedHeaderProps} activePage="notFound" />
          <NotFoundPage message="Invalid verbs page." />
          {accountOnboardingDialog}
          {passwordRecoveryDialog}
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header {...sharedHeaderProps} activePage="vocabularyLevel" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <VerbListSeoPage
            uiLang={verbListSeoRoute.uiLang}
            targetLanguage={verbListSeoRoute.targetLanguage}
            onStartPractice={handleStartVocabularyPractice}
          />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "pastVerbFormsSeo") {
    if (!pastVerbFormsSeoRoute) {
      return (
        <div className="min-h-screen flex flex-col bg-background">
          <Header {...sharedHeaderProps} activePage="notFound" />
          <NotFoundPage message="Invalid past-verb-forms page." />
          {accountOnboardingDialog}
          {passwordRecoveryDialog}
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header {...sharedHeaderProps} activePage="vocabularyLevel" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <PastVerbFormsSeoPage
            uiLang={pastVerbFormsSeoRoute.uiLang}
            targetLanguage={pastVerbFormsSeoRoute.targetLanguage}
            onStartPractice={handleStartVocabularyPractice}
          />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "wordPage") {
    if (!wordRoute) {
      return (
        <>
          <WordPageLayout {...sharedHeaderProps} activePage="notFound">
            <NotFoundPage message="Invalid word page." />
          </WordPageLayout>
          {accountOnboardingDialog}
          {passwordRecoveryDialog}
        </>
      );
    }

    return (
      <>
        <WordPageLayout {...sharedHeaderProps}>
          <Suspense fallback={<RouteLoadingFallback />}>
            <WordSeoPage
              uiLang={wordRoute.uiLang}
              targetLanguage={wordRoute.targetLanguage}
              wordSlug={wordRoute.wordSlug}
              conceptId={wordRoute.conceptId}
              browsePage={wordRoute.browsePage}
              onStartPractice={handleStartVocabularyPractice}
              initialData={initialWordPageData}
            />
          </Suspense>
        </WordPageLayout>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </>
    );
  }

  if (resolvedPage === "vocabularyLevel") {
    const jsonBackedVocabularyItem = vocabularyRoute
      ? findSeoCefrPreviewItem({
          uiLanguage: vocabularyRoute.uiLang,
          targetLanguage: vocabularyRoute.targetLanguage,
          level: vocabularyRoute.level,
        })
      : null;
    const vocabularyLevelRenderDecision = resolveVocabularyLevelRenderDecision(
      Boolean(vocabularyRoute),
      Boolean(jsonBackedVocabularyItem),
    );

    if (vocabularyLevelRenderDecision.kind === "not-found") {
      return (
        <div className="min-h-screen flex flex-col bg-background">
          <Header {...sharedHeaderProps} activePage="notFound" />
          <NotFoundPage message={vocabularyLevelRenderDecision.message} />
          {accountOnboardingDialog}
          {passwordRecoveryDialog}
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header {...sharedHeaderProps} activePage="vocabularyLevel" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <DevSeoCefrPlaceholderPage
            item={jsonBackedVocabularyItem}
            onStartPractice={handleStartVocabularyPractice}
            pathPrefix=""
            initialBrowsePreview={initialBrowsePreviewData}
          />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "seoHub") {
    if (!seoHubRoute) {
      return (
        <div className="min-h-screen flex flex-col bg-background">
          <Header {...sharedHeaderProps} activePage="notFound" />
          <NotFoundPage message="Invalid SEO page index." />
          {accountOnboardingDialog}
          {passwordRecoveryDialog}
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header {...sharedHeaderProps} activePage="explore" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <SeoHubPage uiLang={seoHubRoute} />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "wordSeoHub") {
    if (!wordSeoHubRoute) {
      return (
        <div className="min-h-screen flex flex-col bg-background">
          <Header {...sharedHeaderProps} activePage="notFound" />
          <NotFoundPage message="Invalid word SEO page index." />
          {accountOnboardingDialog}
          {passwordRecoveryDialog}
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header {...sharedHeaderProps} activePage="explore" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <WordSeoHubPage
            route={wordSeoHubRoute}
            uiLang={wordSeoHubRoute.uiLang}
          />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "devSeoCefrPlaceholder") {
    const devPreviewRoute = parseDevSeoCefrPlaceholderRoute(location.pathname);

    if (!devPreviewRoute) {
      return (
        <div className="min-h-screen flex flex-col bg-background">
          <Header {...sharedHeaderProps} activePage="notFound" />
          <NotFoundPage message="Invalid preview page." />
          {accountOnboardingDialog}
          {passwordRecoveryDialog}
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header {...sharedHeaderProps} activePage="vocabularyLevel" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <DevSeoCefrPlaceholderPage
            routeParams={{
              uiLanguage: devPreviewRoute.uiLang,
              targetLanguage: devPreviewRoute.targetLanguage,
              level: devPreviewRoute.level,
            }}
            onStartPractice={handleStartVocabularyPractice}
          />
        </Suspense>
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  if (resolvedPage === "notFound") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
        <Header {...sharedHeaderProps} activePage="notFound" />
        <NotFoundPage />
        {accountOnboardingDialog}
        {passwordRecoveryDialog}
      </div>
    );
  }

  return (
    <div className="language-page min-h-[100svh] w-full min-w-0 flex flex-col overflow-x-hidden bg-background">
      {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
      <Header {...sharedHeaderProps} activePage="language" />

      <HomePage
        yourLanguage={yourLanguage}
        practiceLanguage={practiceLanguage}
        onYourLanguageChange={setYourLanguage}
        onPracticeLanguageChange={setPracticeLanguage}
        languages={languages}
        isContinueDisabled={isContinueDisabled}
        swapRotation={swapRotation}
        onReverseLanguages={handleReverseLanguages}
        onStartPracticing={handleStartPracticing}
        popupRef={popupRef}
      />

      {accountOnboardingDialog}
      {passwordRecoveryDialog}
      {authUserId ? (
        <AccountLanguageConfirmDialog
          open={accountLanguageConfirm.isOpen}
          isSaving={accountLanguageConfirm.isSaving}
          error={accountLanguageConfirm.saveError}
          onUseSelectedLanguages={accountLanguageConfirm.handleUseSelectedLanguages}
          onSaveToAccount={accountLanguageConfirm.handleSaveToAccount}
          onCancel={accountLanguageConfirm.handleCancel}
        />
      ) : null}
    </div>
  );
}

interface AppProps {
  initialUILanguage?: UILanguage;
  initialTranslationData?: unknown;
  seoManager?: SeoManager;
  siteOrigin?: string;
  initialWordPageData?: ResolvedWordPageData | null;
  initialBrowsePreviewData?: LevelBrowsePreviewData | null;
  ssrRouteOverride?: {
    page: "wordPage" | "notFound";
    wordRoute?: CanonicalWordPageRouteMatch | null;
  };
}

export default function App({
  initialUILanguage,
  initialTranslationData,
  seoManager,
  siteOrigin = DEFAULT_SITE_ORIGIN,
  initialWordPageData,
  initialBrowsePreviewData,
  ssrRouteOverride,
}: AppProps) {
  return (
    <SeoProvider manager={seoManager} siteOrigin={siteOrigin}>
      <LanguageProvider
        initialUILanguage={initialUILanguage}
        initialTranslationData={initialTranslationData}
      >
        <>
          <AppContent
            initialWordPageData={initialWordPageData}
            initialBrowsePreviewData={initialBrowsePreviewData}
            ssrRouteOverride={ssrRouteOverride}
          />
          <ScrollToTopButton />
        </>
      </LanguageProvider>
    </SeoProvider>
  );
}
