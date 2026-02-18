import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import "../styles/index.css";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight } from "lucide-react";
import { Header } from "./components/Header";
import { LanguageSelector } from "./components/LanguageSelector";
import { FloatingWords } from "./components/FloatingWords";
import { LevelCategorySelection } from "./components/LevelCategorySelection";
import { ExerciseSelection } from "./components/ExerciseSelection";
import { VocabularyPractice } from "./components/VocabularyPractice";
import { VocabularyLevelExam } from "./components/VocabularyLevelExam";
import { About } from "./components/About";
import { Help } from "./components/Help";
import {
  LanguageContinuePopup,
  type LanguageContinuePopupHandle,
} from "./components/LanguageContinuePopup";
import { LanguageProvider, useLanguage } from "../contexts/LanguageContext";

const languages = [
  { code: "en", name: "English", flagCode: "gb" },
  { code: "es", name: "Spanish", flagCode: "es" },
  { code: "fr", name: "French", flagCode: "fr" },
  { code: "de", name: "German", flagCode: "de" },
  { code: "it", name: "Italian", flagCode: "it" },
  { code: "pt", name: "Portuguese", flagCode: "pt" },
  { code: "ru", name: "Russian", flagCode: "ru" },
];

const ROUTES = {
  language: "/languages",
  levelCategory: "/languages/filters",
  exerciseSelection: "/languages/filters/exercises",
  practice: "/languages/filters/exercises/practice",
  exam: "/languages/level-test",
  about: "/about",
  help: "/help",
} as const;

type PageKey = keyof typeof ROUTES;

const pageFromPath = (path: string): PageKey | null => {
  switch (path) {
    case "/":
    case ROUTES.language:
      return "language";
    case ROUTES.levelCategory:
      return "levelCategory";
    case ROUTES.exerciseSelection:
      return "exerciseSelection";
    case ROUTES.practice:
      return "practice";
    case ROUTES.exam:
      return "exam";
    case ROUTES.about:
      return "about";
    case ROUTES.help:
      return "help";
    default:
      return null;
  }
};

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function createDistributedStarFieldImage(starCount: number): string {
  const cols = Math.ceil(Math.sqrt(starCount));
  const rows = Math.ceil(starCount / cols);
  const sizeOptions = [1.2, 1.4, 1.8, 2.2];
  const colorOptions = [
    "#fff",
    "#fff",
    "#fff",
    "#f3f3f3",
    "rgba(255,255,255,0.9)",
  ];
  const layers: string[] = [];

  for (let i = 0; i < starCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellWidth = 100 / cols;
    const cellHeight = 100 / rows;
    const xMin = col * cellWidth + 10;
    const xMax = (col + 1) * cellWidth - 10;
    const yMin = row * cellHeight + 14;
    const yMax = (row + 1) * cellHeight - 14;
    const x = randomBetween(Math.max(5, xMin), Math.min(95, xMax)).toFixed(1);
    const y = randomBetween(Math.max(8, yMin), Math.min(92, yMax)).toFixed(1);
    const size = sizeOptions[Math.floor(Math.random() * sizeOptions.length)];
    const color = colorOptions[Math.floor(Math.random() * colorOptions.length)];

    layers.push(
      `radial-gradient(${size}px ${size}px at ${x}% ${y}%, ${color}, rgba(0,0,0,0))`,
    );
  }

  return layers.join(",\n    ");
}

function detectBrowserLanguage(): string {
  const browserLang = navigator.language.split("-")[0];
  const matchedLang = languages.find((lang) => lang.code === browserLang);
  return matchedLang ? matchedLang.code : "en";
}

function AppContent() {
  const { t } = useLanguage();
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
  const [yourLanguage, setYourLanguage] = useState("");
  const [practiceLanguage, setPracticeLanguage] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const currentPage = useMemo(
    () => pageFromPath(location.pathname),
    [location.pathname],
  );
  const [selectedLevel, setSelectedLevel] = useState("A1");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedWordTypes, setSelectedWordTypes] = useState<string[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<string[]>([
    "wordTyping",
    "halfWritten",
    "brokenWord",
    "connectWords",
    "listening",
  ]);
  const isContinueDisabled = !yourLanguage || !practiceLanguage;
  const [popupQueuedForLanguage, setPopupQueuedForLanguage] = useState(false);
  const popupRef = useRef<LanguageContinuePopupHandle | null>(null);
  const [swapRotation, setSwapRotation] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const resolvedPage = currentPage ?? "language";

  useEffect(() => {
    if (!currentPage) {
      navigate(ROUTES.language, { replace: true });
    }
  }, [currentPage, navigate]);

  const handleStartPracticing = () => {
    if (isContinueDisabled) {
      popupRef.current?.show({ delayMs: 0 });
      return;
    }
    navigate(ROUTES.levelCategory);
  };

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

  const handleRequireLanguages = (nextPage: PageKey) => {
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
    navigate(ROUTES.practice);
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

  const handleExamComplete = (level: string) => {
    setSelectedLevels([level]);
    navigate(ROUTES.levelCategory);
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

  if (resolvedPage === "practice") {
    return (
      <VocabularyPractice
        practiceLanguage={practiceLanguage}
        yourLanguage={yourLanguage}
        selectedLevel={selectedLevel}
        selectedLevels={selectedLevels}
        selectedCategories={selectedCategories}
        selectedWordTypes={selectedWordTypes}
        selectedExercises={selectedExercises}
        onBack={() => navigate(ROUTES.exerciseSelection)}
      />
    );
  }

  if (resolvedPage === "exerciseSelection") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header
          onAbout={() => navigate(ROUTES.about)}
          onHelp={() => navigate(ROUTES.help)}
          onLevelTest={() => handleRequireLanguages("exam")}
          onLanguages={() => navigate(ROUTES.language)}
          onFilters={() => handleRequireLanguages("levelCategory")}
          onExercises={() => handleRequireLanguages("exerciseSelection")}
        />
        <ExerciseSelection
          selectedExercises={selectedExercises}
          setSelectedExercises={setSelectedExercises}
          onBack={() => navigate(ROUTES.levelCategory)}
          onContinue={handleContinueToPractice}
        />
      </div>
    );
  }

  if (resolvedPage === "levelCategory") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header
          onAbout={() => navigate(ROUTES.about)}
          onHelp={() => navigate(ROUTES.help)}
          onLevelTest={() => handleRequireLanguages("exam")}
          onLanguages={() => navigate(ROUTES.language)}
          onFilters={() => handleRequireLanguages("levelCategory")}
          onExercises={() => handleRequireLanguages("exerciseSelection")}
        />
        <div className="flex-1 min-h-0">
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
        </div>
      </div>
    );
  }

  if (resolvedPage === "exam") {
    return (
      <VocabularyLevelExam
        practiceLanguage={practiceLanguage}
        yourLanguage={yourLanguage}
        onComplete={handleExamComplete}
        onCancel={() => navigate(ROUTES.levelCategory)}
      />
    );
  }

  if (resolvedPage === "about") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header
          onAbout={() => navigate(ROUTES.about)}
          onHelp={() => navigate(ROUTES.help)}
          onLevelTest={() => handleRequireLanguages("exam")}
          onLanguages={() => navigate(ROUTES.language)}
          onFilters={() => handleRequireLanguages("levelCategory")}
          onExercises={() => handleRequireLanguages("exerciseSelection")}
        />
        <About onBack={() => navigate(ROUTES.language)} />
      </div>
    );
  }

  if (resolvedPage === "help") {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header
          onAbout={() => navigate(ROUTES.about)}
          onHelp={() => navigate(ROUTES.help)}
          onLevelTest={() => handleRequireLanguages("exam")}
          onLanguages={() => navigate(ROUTES.language)}
          onFilters={() => handleRequireLanguages("levelCategory")}
          onExercises={() => handleRequireLanguages("exerciseSelection")}
        />
        <Help onBack={() => navigate(ROUTES.language)} />
      </div>
    );
  }

  return (
    <div className="language-page h-[100svh] w-full min-w-0 md:h-screen md:w-[100vw] md:min-w-[100vw] flex flex-col bg-background">
      <Header
        onAbout={() => navigate(ROUTES.about)}
        onHelp={() => navigate(ROUTES.help)}
        onLevelTest={() => handleRequireLanguages("exam")}
        onLanguages={() => navigate(ROUTES.language)}
        onFilters={() => handleRequireLanguages("levelCategory")}
        onExercises={() => handleRequireLanguages("exerciseSelection")}
      />

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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h2 className="text-[clamp(2rem,7vw,3rem)] text-foreground leading-tight">
              {t("home.headline")}
            </h2>
            <p className="text-[clamp(1.25rem,4.5vw,2rem)] text-muted-foreground/80 max-w-xl mx-auto">
              {t("home.subheadline")}
            </p>
          </motion.div>
          <motion.div
            className="hidden md:block text-center space-y-[clamp(0.75rem,1.6vw,1.25rem)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h2 className="text-[clamp(2.25rem,4vw,3.5rem)] text-foreground leading-tight">
              {t("home.headline")}
            </h2>
            <p className="text-[clamp(1.5rem,3vw,2.5rem)] text-muted-foreground/80 max-w-xl mx-auto">
              {t("home.subheadline")}
            </p>
          </motion.div>

          <motion.div
            className="language-form-stack space-y-[clamp(1.25rem,3vw,2.5rem)] mt-[clamp(1.5rem,4vw,2rem)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="language-selectors-shell max-w-4xl mx-auto pt-[clamp(0.5rem,2vw,1rem)]"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="md:hidden relative space-y-10">
                <LanguageSelector
                  label={t("home.yourLanguage")}
                  value={yourLanguage}
                  onChange={setYourLanguage}
                  placeholder="Select your language"
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
                  placeholder="Select practice language"
                  languages={languages}
                  disabledLanguages={[yourLanguage]}
                />
              </div>
              <div className="language-inputs-grid hidden md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-6">
                <LanguageSelector
                  label={t("home.yourLanguage")}
                  value={yourLanguage}
                  onChange={setYourLanguage}
                  placeholder="Select your language"
                  languages={languages}
                  disabledLanguages={[practiceLanguage]}
                />
                <div className="language-swap-wrap flex justify-center mt-8">{swapButton}</div>
                <LanguageSelector
                  label={t("home.practiceLanguage")}
                  value={practiceLanguage}
                  onChange={setPracticeLanguage}
                  placeholder="Select practice language"
                  languages={languages}
                  disabledLanguages={[yourLanguage]}
                />
              </div>
            </motion.div>

            <motion.p
              className="language-change-note text-[clamp(0.75rem,1.6vw,0.95rem)] text-center text-muted-foreground pt-[clamp(0.25rem,1vw,0.5rem)]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
            >
              {t("home.changeNote")}
            </motion.p>

            <motion.div
              className="language-continue-wrap language-continue-wrap-inside flex justify-center pt-[clamp(0.75rem,2vw,1rem)]"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.7 }}
            >
              <motion.button
                onClick={handleStartPracticing}
                aria-disabled={isContinueDisabled}
                style={nextButtonStarFieldStyle}
                className={`language-continue-button text-white px-[clamp(2.5rem,6vw,3.5rem)] py-[clamp(0.75rem,2vw,1.25rem)] text-[clamp(1rem,2.2vw,1.25rem)] rounded-lg shadow-lg shadow-primary/30 ${
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
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
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
                <div className="text-[clamp(1.25rem,2.5vw,1.5rem)] bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
                  15+
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
            >
              <span className="flex items-baseline gap-1">
                <span className="font-semibold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                  10k+
                </span>
                <span>words</span>
              </span>
              <span className="flex items-baseline gap-1">
                <span className="font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
                  15+
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <motion.button
              onClick={handleStartPracticing}
              aria-disabled={isContinueDisabled}
              style={nextButtonStarFieldStyle}
              className={`language-continue-button text-white px-[clamp(2.5rem,6vw,3.5rem)] py-[clamp(0.75rem,2vw,1.25rem)] text-[clamp(1rem,2.2vw,1.25rem)] rounded-lg shadow-lg shadow-primary/30 ${
                isContinueDisabled ? "opacity-60 cursor-not-allowed shadow-none" : ""
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
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  );
}
