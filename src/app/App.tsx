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
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight } from "lucide-react";
import { Header } from "./components/Header";
import { ExplorePage } from "./components/ExplorePage";
import { AccountOnboardingDialog } from "./components/AccountOnboardingDialog";
import { LanguageSelector } from "./components/LanguageSelector";
import { LevelTestLanguageModal } from "./components/LevelTestLanguageModal";
import { FloatingWords } from "./components/FloatingWords";
import { NotFoundPage } from "./components/NotFoundPage";
import { ScrollToTopButton } from "./components/ScrollToTopButton";
import { UserProfileDashboardPage } from "./components/user-profile/UserProfileDashboardPage";
import { VocabularyLevelPage } from "./components/VocabularyLevelPage";
import { LevelTestSeoPage } from "./components/LevelTestSeoPage";
import { SeoHubPage } from "./components/SeoHubPage";
import { VerbListSeoPage } from "./components/VerbListSeoPage";
import { WordSeoPage } from "./components/WordSeoPage";
import { WordPageLayout } from "./components/WordPageLayout";
import { DevSeoCefrPlaceholderPage } from "./components/DevSeoCefrPlaceholderPage";
import {
  LanguageContinuePopup,
  type LanguageContinuePopupHandle,
} from "./components/LanguageContinuePopup";
import {
  LanguageProvider,
  useLanguage,
  type UILanguage,
} from "../contexts/LanguageContext";
import type { TargetLanguageSlug } from "../data/seo/slugs";
import type { CanonicalWordPageRouteMatch } from "../data/seo/wordSlugs";
import type { LevelBrowsePreviewData } from "../data/seo/levelBrowseWords";
import {
  SEOHead,
  SeoProvider,
  type SeoManager,
  useSeoSiteOrigin,
} from "../seo/SeoContext";
import { DEFAULT_SITE_ORIGIN } from "../seo/site";
import { buildRouteMetadata } from "../seo/routeMetadataPolicy";
import { findSeoCefrPreviewItem } from "./components/devSeoCefrPreviewData";
import type { ResolvedWordPageData } from "../data/seo/wordPageData";
import { handleSupabaseAuthRedirect } from "../lib/supabaseAuth";
import type { UserProfile } from "../lib/userProfile";
import {
  TARGET_LANGUAGE_TO_UI_CODE,
  buildPracticeRoute,
  getRouteUILanguage,
  pageFromPath,
  parseDevSeoCefrPlaceholderRoute,
  parseLevelTestSeoRoute,
  parsePracticeRoute,
  parseSeoHubRoute,
  parseVerbListSeoRoute,
  parseVocabularyRoute,
  parseWordRoute,
  parseWordSeoHubRoute,
  type RouteKey,
} from "./utils/pageRouting";
import { createDistributedStarFieldImage } from "./utils/starField";
import { useAuthSession } from "./hooks/useAuthSession";
import { useAccountOnboarding } from "./hooks/useAccountOnboarding";
import { useStoredAppPreferences } from "./hooks/useStoredAppPreferences";
import { useUserProfileLoad } from "./hooks/useUserProfileLoad";
import { useUserProfileSync } from "./hooks/useUserProfileSync";
import { useRouteLanguageSync } from "./hooks/useRouteLanguageSync";
import { useExploreItems } from "./hooks/useExploreItems";

const LevelCategorySelection = lazy(() =>
  import("./components/LevelCategorySelection").then((module) => ({
    default: module.LevelCategorySelection,
  })),
);
const ExerciseSelection = lazy(() =>
  import("./components/ExerciseSelection").then((module) => ({
    default: module.ExerciseSelection,
  })),
);
const VocabularyPractice = lazy(() =>
  import("./components/VocabularyPractice").then((module) => ({
    default: module.VocabularyPractice,
  })),
);
const VocabularyLevelExam = lazy(() =>
  import("./components/VocabularyLevelExam").then((module) => ({
    default: module.VocabularyLevelExam,
  })),
);
const About = lazy(() =>
  import("./components/About").then((module) => ({
    default: module.About,
  })),
);
const Help = lazy(() =>
  import("./components/Help").then((module) => ({
    default: module.Help,
  })),
);
const WordSeoHubPage = lazy(() =>
  import("./components/WordSeoHubPage").then((module) => ({
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
// scripts/test-interactive-contracts.mjs parses App.tsx's source text for it
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
} as const;

function randomBetween(min: number, max: number): number {
  return min + (max - min) * 0.5;
}

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
  // Explore-topic data building is pure and lives in ./utils/exploreTopics;
  // the 14 useMemo calls (and their exact dependency arrays) live in
  // ./hooks/useExploreItems so memoization behavior is unchanged.
  const exploreItemsByLanguageCode = useExploreItems(uiLanguage, t, ROUTES.exam);
  const languages = useMemo(
    () =>
      supportedLanguages.map((lang) => ({
        ...lang,
        name: t(`languageNames.${lang.code}`),
      })),
    [t],
  );
  const starFieldStyle = useMemo(
    () => ({
      backgroundColor: "#4a2b82",
      backgroundImage: createDistributedStarFieldImage(10),
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
    }),
    [],
  );
  const nextButtonStarFieldStyle = useMemo(
    () => ({
      ...starFieldStyle,
      backgroundColor: "#4a2b82",
      backgroundImage: createDistributedStarFieldImage(3),
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
    }),
    [starFieldStyle],
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
    supportedLanguageCodes,
  });
  const { authSession, authUserId, handleAuthSessionChange } =
    useAuthSession();
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
  const { userProfile, setUserProfile } = useUserProfileLoad({
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
  useUserProfileSync({
    authSession,
    authUserId,
    userProfile,
    setUserProfile,
    yourLanguage,
    practiceLanguage,
  });
  const navigate = useNavigate();
  const levelTestSeoRoute = useMemo(
    () => parseLevelTestSeoRoute(location.pathname),
    [location.pathname],
  );
  const verbListSeoRoute = useMemo(
    () => parseVerbListSeoRoute(location.pathname),
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
  const practiceRoute = useMemo(
    () => parsePracticeRoute(location.pathname),
    [location.pathname],
  );
  const currentPage = useMemo(
    () => pageFromPath(location.pathname, ROUTES),
    [location.pathname],
  );
  const [openExploreLanguage, setOpenExploreLanguage] =
    useState<UILanguage | null>(null);
  const [popupQueuedForLanguage, setPopupQueuedForLanguage] = useState(false);
  const [isLevelTestLanguageModalOpen, setIsLevelTestLanguageModalOpen] =
    useState(false);
  const [
    levelTestModalSeedTargetLanguage,
    setLevelTestModalSeedTargetLanguage,
  ] = useState("");
  const [levelTestModalSwapRotation, setLevelTestModalSwapRotation] =
    useState(0);
  const popupRef = useRef<LanguageContinuePopupHandle | null>(null);
  const hasAutoRedirectedRef = useRef(false);
  const initialPathRef = useRef(location.pathname);
  const startedFromReloadRef = useRef(
    typeof window !== "undefined" &&
      window.performance
        .getEntriesByType("navigation")
        .some(
          (entry) =>
            "type" in entry &&
            (entry as PerformanceNavigationTiming).type === "reload",
        ),
  );
  const previousAuthUserIdRef = useRef<string | null>(null);
  const [swapRotation, setSwapRotation] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const resolvedPage = ssrRouteOverride?.page ?? currentPage;
  const wordRoute = ssrRouteOverride?.wordRoute ?? detectedWordRoute;
  const siteOrigin = useSeoSiteOrigin();
  const routeMetadata = useMemo(() => {
    switch (resolvedPage) {
      case "wordPage":
      case "vocabularyLevel":
      case "levelTestSeo":
      case "verbListSeo":
      case "seoHub":
      case "wordSeoHub":
      case "devSeoCefrPlaceholder":
        return null;
      default:
        return buildRouteMetadata(location.pathname, siteOrigin);
    }
  }, [location.pathname, resolvedPage, siteOrigin]);

  useEffect(() => {
    if (resolvedPage !== "practice" && resolvedPage !== "exam") {
      return;
    }

    let cancelled = false;

    void handleSupabaseAuthRedirect()
      .then((result) => {
        if (cancelled || !result.session) {
          return;
        }

        handleAuthSessionChange(result.session);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [handleAuthSessionChange, resolvedPage]);

  const handleStartPracticing = () => {
    if (isContinueDisabled) {
      popupRef.current?.show({ delayMs: 0 });
      return;
    }
    navigate(ROUTES.levelCategory);
  };

  const handleStartVocabularyPractice = (
    _targetLanguage: TargetLanguageSlug,
    level: string,
  ) => {
    resetFiltersForLevel(level);

    if (isContinueDisabled) {
      navigate(ROUTES.language);
      setPopupQueuedForLanguage(true);
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
        seoHubRoute,
        wordSeoHubRoute,
        wordRoute,
      }),
    [
      resolvedPage,
      vocabularyRoute,
      levelTestSeoRoute,
      verbListSeoRoute,
      seoHubRoute,
      wordSeoHubRoute,
      wordRoute,
    ],
  );
  useRouteLanguageSync(routeUILanguage, uiLanguage, setUILanguage);

  useEffect(() => {
    if (resolvedPage !== "practice" || !practiceRoute) {
      return;
    }

    if (yourLanguage !== practiceRoute.yourLanguage) {
      setYourLanguage(practiceRoute.yourLanguage);
    }

    if (practiceLanguage !== practiceRoute.practiceLanguage) {
      setPracticeLanguage(practiceRoute.practiceLanguage);
    }
  }, [practiceLanguage, practiceRoute, resolvedPage, yourLanguage]);

  useEffect(() => {
    if (resolvedPage !== "practice" || !yourLanguage || !practiceLanguage) {
      return;
    }

    const expectedPath = buildPracticeRoute(
      yourLanguage as UILanguage,
      practiceLanguage as UILanguage,
      ROUTES,
    );
    if (location.pathname !== expectedPath) {
      navigate(expectedPath, { replace: true });
    }
  }, [
    location.pathname,
    navigate,
    practiceLanguage,
    resolvedPage,
    yourLanguage,
  ]);

  useEffect(() => {
    if (hasAutoRedirectedRef.current) {
      return;
    }

    if (!shouldAutoRedirectFromStoredLanguagesRef.current) {
      return;
    }

    const initialPage = pageFromPath(initialPathRef.current, ROUTES);
    const startedOnLanguagePage = initialPage === "language";
    const startedOnLegacyPracticePage =
      initialPathRef.current === ROUTES.practice;

    if (
      resolvedPage === "language" &&
      !isContinueDisabled &&
      startedOnLanguagePage &&
      !startedFromReloadRef.current
    ) {
      hasAutoRedirectedRef.current = true;
      navigate(ROUTES.exerciseSelection, { replace: true });
      return;
    }

    if (
      !isContinueDisabled &&
      startedOnLegacyPracticePage &&
      resolvedPage === "practice"
    ) {
      hasAutoRedirectedRef.current = true;
      navigate(ROUTES.exerciseSelection, { replace: true });
    }
  }, [isContinueDisabled, navigate, resolvedPage]);

  // Cleanup when leaving page or changing languages
  useEffect(() => {
    if (resolvedPage !== "language" || !isContinueDisabled) {
      setPopupQueuedForLanguage(false);
      popupRef.current?.hide();
    }
  }, [resolvedPage, isContinueDisabled]);

  // Show queued popup after language page renders
  useEffect(() => {
    if (resolvedPage !== "language" || !popupQueuedForLanguage) {
      return;
    }
    setPopupQueuedForLanguage(false);
    popupRef.current?.show({ delayMs: 100 });
  }, [resolvedPage, popupQueuedForLanguage]);

  const handleContinueToExerciseSelection = () => {
    navigate(ROUTES.exerciseSelection);
  };

  const handleRequireLanguages = (nextPage: RouteKey) => {
    if (isContinueDisabled) {
      const suppressPopup = resolvedPage === "about";
      navigate(ROUTES.language);
      if (!suppressPopup) {
        setPopupQueuedForLanguage(true);
      }
      return;
    }
    navigate(ROUTES[nextPage]);
  };

  const handleContinueToPractice = () => {
    if (isContinueDisabled) {
      popupRef.current?.show({ delayMs: 0 });
      return;
    }

    navigate(
      buildPracticeRoute(
        yourLanguage as UILanguage,
        practiceLanguage as UILanguage,
        ROUTES,
      ),
    );
  };

  useEffect(() => {
    const previousAuthUserId = previousAuthUserIdRef.current;

    // Only redirect to profile if user actually logged in during this session.
    // On initial load, previousAuthUserId is null (initial state) and authUserId becomes truthy from
    // the stored session. This is NOT a login action, so we skip the redirect.
    // We only redirect when authUserId changed from one user to another user (actual login during session).
    if (previousAuthUserId && previousAuthUserId !== authUserId && authUserId) {
      navigate(ROUTES.profile);
    }

    previousAuthUserIdRef.current = authUserId;
  }, [authUserId, navigate]);

  const sharedHeaderProps = {
    onAbout: () => navigate(ROUTES.about),
    onHelp: () => navigate(ROUTES.help),
    onLevelTest: () => handleRequireLanguages("exam"),
    onLanguages: () => navigate(ROUTES.language),
    onFilters: () => handleRequireLanguages("levelCategory"),
    onExercises: () => handleRequireLanguages("exerciseSelection"),
    onExplore: () => navigate(ROUTES.explore),
    onProfile: () => navigate(ROUTES.profile),
    authSession,
    accountNickname: userProfile.nickname,
    onAuthSessionChange: handleAuthSessionChange,
  };

  const handleStartExam = () => {
    if (isContinueDisabled) {
      const suppressPopup = resolvedPage === "about";
      navigate(ROUTES.language);
      if (!suppressPopup) {
        setPopupQueuedForLanguage(true);
      }
      return;
    }
    navigate(ROUTES.exam);
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

  const swapButton = (
    <motion.button
      onClick={handleReverseLanguages}
      className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full border border-border/70 bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/70 shadow-sm transition-all opacity-90 md:opacity-100"
      aria-label="Reverse languages"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.span
        animate={shouldReduceMotion ? undefined : { rotate: swapRotation }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { duration: 0.25, ease: "easeInOut" }
        }
        className="inline-flex"
      >
        <ArrowLeftRight className="w-4 h-4 rotate-90 md:rotate-0 text-foreground/80" />
      </motion.span>
    </motion.button>
  );

  const accountOnboardingDialog = authUserId ? (
    <AccountOnboardingDialog
      open={isAccountOnboardingOpen}
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
            onBack={() => navigate(ROUTES.levelCategory)}
            onContinue={handleContinueToPractice}
          />
        </Suspense>
        {accountOnboardingDialog}
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
        />
        {accountOnboardingDialog}
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
          onReverse={() =>
            setLevelTestModalSwapRotation((prev) => prev + 180)
          }
          onClose={() => setIsLevelTestLanguageModalOpen(false)}
          onConfirm={(nextYourLanguage, nextPracticeLanguage) => {
            setYourLanguage(nextYourLanguage);
            setPracticeLanguage(nextPracticeLanguage);
            setIsLevelTestLanguageModalOpen(false);
            navigate(ROUTES.exam);
          }}
        />
        {accountOnboardingDialog}
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
      </>
    );
  }

  if (resolvedPage === "vocabularyLevel") {
    if (!vocabularyRoute) {
      return (
        <div className="min-h-screen flex flex-col bg-background">
          <Header {...sharedHeaderProps} activePage="notFound" />
          <NotFoundPage message="Invalid vocabulary practice page." />
          {accountOnboardingDialog}
        </div>
      );
    }

    const jsonBackedVocabularyItem = findSeoCefrPreviewItem({
      uiLanguage: vocabularyRoute.uiLang,
      targetLanguage: vocabularyRoute.targetLanguage,
      level: vocabularyRoute.level,
    });

    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header {...sharedHeaderProps} activePage="vocabularyLevel" />
        <Suspense fallback={<RouteLoadingFallback />}>
          {jsonBackedVocabularyItem ? (
            <DevSeoCefrPlaceholderPage
              item={jsonBackedVocabularyItem}
              onStartPractice={handleStartVocabularyPractice}
              pathPrefix=""
              initialBrowsePreview={initialBrowsePreviewData}
            />
          ) : (
            <VocabularyLevelPage
              uiLang={vocabularyRoute.uiLang}
              targetLanguage={vocabularyRoute.targetLanguage}
              level={vocabularyRoute.level}
              onStartPractice={handleStartVocabularyPractice}
              initialBrowsePreview={initialBrowsePreviewData}
            />
          )}
        </Suspense>
        {accountOnboardingDialog}
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
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header {...sharedHeaderProps} activePage="explore" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <WordSeoHubPage route={wordSeoHubRoute} uiLang={wordSeoHubRoute.uiLang} />
        </Suspense>
        {accountOnboardingDialog}
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
      </div>
    );
  }

  return (
    <div className="language-page min-h-[100svh] w-full min-w-0 flex flex-col overflow-x-hidden bg-background">
      {routeMetadata ? <SEOHead metadata={routeMetadata} /> : null}
      <Header {...sharedHeaderProps} activePage="language" />

      <main className="flex-1 min-h-0 flex flex-col items-center justify-center px-[clamp(1rem,3vw,2.5rem)] pt-[clamp(0.5rem,2vw,1.5rem)] pb-[clamp(2.5rem,6vw,5rem)] relative">
        <FloatingWords />

        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute top-20 left-10 w-64 h-64 rounded-full blur-3xl"
            style={{
              backgroundColor: "rgba(192, 132, 252, 0.1)",
            }}
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          ></motion.div>
          <motion.div
            className="absolute bottom-20 right-10 w-96 h-96 rounded-full blur-3xl"
            style={{
              backgroundColor: "rgba(96, 165, 250, 0.1)",
            }}
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
          ></motion.div>
          <motion.div
            className="absolute top-1/2 left-1/3 w-72 h-72 rounded-full blur-3xl"
            style={{
              backgroundColor: "rgba(244, 114, 182, 0.1)",
            }}
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.2, 0.4, 0.2],
            }}
            transition={{
              duration: 7,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 0.5,
            }}
          ></motion.div>
        </div>

        <div className="language-content-container w-full max-w-2xl relative z-10">
          <motion.div
            className="md:hidden w-full max-w-2xl text-center space-y-[clamp(0.5rem,1.2vw,1rem)] z-10 -mt-4 mb-[clamp(1rem,3vw,1.5rem)]"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h2 className="text-[clamp(2rem,7vw,3rem)] text-foreground leading-tight">
              {t("home.headline")}
            </h2>
            <p className="text-[clamp(1.15rem,4.1vw,1.8rem)] text-muted-foreground/80 max-w-xl mx-auto">
              {t("home.subheadline")}
            </p>
          </motion.div>
          <motion.div
            className="hidden md:block text-center space-y-[clamp(0.75rem,1.6vw,1.25rem)]"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h2 className="text-[clamp(2.25rem,4vw,3.5rem)] text-foreground leading-tight">
              {t("home.headline")}
            </h2>
            <p className="text-[clamp(1.35rem,2.7vw,2.2rem)] text-muted-foreground/80 max-w-xl mx-auto">
              {t("home.subheadline")}
            </p>
          </motion.div>

          <motion.div
            className="language-form-stack space-y-[clamp(1.25rem,3vw,2.5rem)] mt-[clamp(1.5rem,4vw,2rem)]"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="language-selectors-shell max-w-4xl mx-auto pt-[clamp(0.5rem,2vw,1rem)]"
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="md:hidden relative space-y-10">
                <LanguageSelector
                  label={t("home.yourLanguage")}
                  value={yourLanguage}
                  onChange={setYourLanguage}
                  placeholder={t("home.selectYourLanguage")}
                  languages={languages}
                  disabledLanguages={[practiceLanguage]}
                />
                <div className="absolute left-1/2 top-[calc(50%+16px)] -translate-x-1/2 -translate-y-1/2 z-10">
                  {swapButton}
                </div>
                <LanguageSelector
                  label={t("home.practiceLanguage")}
                  value={practiceLanguage}
                  onChange={setPracticeLanguage}
                  placeholder={t("home.selectPracticeLanguage")}
                  languages={languages}
                  disabledLanguages={[yourLanguage]}
                />
              </div>
              <div className="language-inputs-grid hidden md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-6">
                <LanguageSelector
                  label={t("home.yourLanguage")}
                  value={yourLanguage}
                  onChange={setYourLanguage}
                  placeholder={t("home.selectYourLanguage")}
                  languages={languages}
                  disabledLanguages={[practiceLanguage]}
                />
                <div className="language-swap-wrap flex justify-center mt-8">
                  {swapButton}
                </div>
                <LanguageSelector
                  label={t("home.practiceLanguage")}
                  value={practiceLanguage}
                  onChange={setPracticeLanguage}
                  placeholder={t("home.selectPracticeLanguage")}
                  languages={languages}
                  disabledLanguages={[yourLanguage]}
                />
              </div>
            </motion.div>

            <motion.p
              className="language-change-note text-[clamp(0.75rem,1.6vw,0.95rem)] text-center text-muted-foreground pt-[clamp(0.25rem,1vw,0.5rem)]"
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              {t("home.changeNote")}
            </motion.p>

            <motion.div
              className="language-continue-wrap language-continue-wrap-inside flex justify-center pt-[clamp(0.75rem,2vw,1rem)]"
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.7 }}
            >
              <motion.button
                onClick={handleStartPracticing}
                aria-disabled={isContinueDisabled}
                style={nextButtonStarFieldStyle}
                className={`language-continue-button text-white px-12 py-4 text-lg rounded-lg shadow-lg shadow-primary/30 ${
                  isContinueDisabled
                    ? "opacity-60 cursor-not-allowed shadow-none"
                    : ""
                }`}
                whileHover={{
                  scale: 1.05,
                  boxShadow: "0 20px 40px rgba(99, 102, 241, 0.3)",
                }}
                whileTap={{ scale: 0.95 }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 17,
                }}
              >
                {t("home.next")}
              </motion.button>
            </motion.div>

            <LanguageContinuePopup ref={popupRef} autoHideMs={3000} />

            <motion.div
              className="language-stats-grid hidden md:grid md:grid-cols-3 gap-[clamp(1.5rem,4vw,2rem)] pt-[clamp(2.5rem,6vw,3.5rem)] text-center"
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.9 }}
            >
              <div className="space-y-2">
                <div className="text-[clamp(1.25rem,2.5vw,1.5rem)] bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                  10,000+
                </div>
                <div className="text-[clamp(0.75rem,1.5vw,0.9rem)] text-muted-foreground">
                  {t("home.stat.words")}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[clamp(1.25rem,2.5vw,1.5rem)] font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
                  7
                </div>
                <div className="text-[clamp(0.75rem,1.5vw,0.9rem)] text-muted-foreground">
                  {t("home.stat.languages")}
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[clamp(1.25rem,2.5vw,1.5rem)] bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                  {t("home.stat.noSignup")}
                </div>
                <div className="text-[clamp(0.75rem,1.5vw,0.9rem)] text-muted-foreground">
                  {t("home.stat.noSignupDesc")}
                </div>
              </div>
            </motion.div>

            <motion.div
              className="md:hidden fixed bottom-5 left-0 right-0 flex items-center justify-center gap-[clamp(1rem,3vw,1.75rem)] text-[clamp(0.75rem,2.5vw,0.9rem)] text-muted-foreground/80 pointer-events-none"
              initial={false}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.8 }}
            >
              <span className="flex items-baseline gap-1">
                <span className="font-semibold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                  10k+
                </span>
                <span>words</span>
              </span>
              <span className="flex items-baseline gap-1">
                <span className="font-bold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
                  7
                </span>
                <span>languages</span>
              </span>
              <span className="font-semibold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                No signup
              </span>
            </motion.div>
          </motion.div>

          <motion.div
            className="language-continue-wrap language-continue-wrap-outside justify-center pt-[clamp(0.75rem,2vw,1rem)]"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <motion.button
              onClick={handleStartPracticing}
              aria-disabled={isContinueDisabled}
              style={nextButtonStarFieldStyle}
              className={`language-continue-button text-white px-12 py-4 text-lg rounded-lg shadow-lg shadow-primary/30 ${
                isContinueDisabled
                  ? "opacity-60 cursor-not-allowed shadow-none"
                  : ""
              }`}
              whileHover={{
                scale: 1.05,
                boxShadow: "0 20px 40px rgba(99, 102, 241, 0.3)",
              }}
              whileTap={{ scale: 0.95 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 17,
              }}
            >
              {t("home.next")}
            </motion.button>
          </motion.div>
        </div>
      </main>
      {accountOnboardingDialog}
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
