import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { Link } from "react-router-dom";
import "../styles/index.css";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight, ChevronDown, Search } from "lucide-react";
import { Header } from "./components/Header";
import { AccountOnboardingDialog } from "./components/AccountOnboardingDialog";
import { LanguageSelector } from "./components/LanguageSelector";
import { FloatingWords } from "./components/FloatingWords";
import { NotFoundPage } from "./components/NotFoundPage";
import { ScrollToTopButton } from "./components/ScrollToTopButton";
import { UserProfileDashboardPage } from "./components/user-profile/UserProfileDashboardPage";
import { VocabularyLevelPage } from "./components/VocabularyLevelPage";
import { LevelTestSeoPage } from "./components/LevelTestSeoPage";
import { SeoHubPage } from "./components/SeoHubPage";
import { WordSeoPage } from "./components/WordSeoPage";
import { DevSeoCefrPlaceholderPage } from "./components/DevSeoCefrPlaceholderPage";
import {
  LanguageContinuePopup,
  type LanguageContinuePopupHandle,
} from "./components/LanguageContinuePopup";
import { LanguageProvider, useLanguage, type UILanguage } from "../contexts/LanguageContext";
import {
  buildLocalizedVocabularyPath,
  isSupportedUiLanguage,
  resolveVocabularyRoute,
  type Level as CefrLevelCode,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../data/seo/slugs";
import {
  parseWordRoute as parseSeoWordRoute,
  resolveWordRoute,
  type WordRouteMatch,
} from "../data/seo/wordSlugs";
import type { LevelBrowsePreviewData } from "../data/seo/levelBrowseWords";
import { resolveSeoHubRoute } from "../data/seo/hub";
import { SEOHead, SeoProvider, type SeoManager, useSeoSiteOrigin } from "../seo/SeoContext";
import { DEFAULT_SITE_ORIGIN } from "../seo/site";
import { buildRouteMetadata } from "../seo/routeMetadataPolicy";
import { getLevelTestSeoPath, resolveLevelTestSeoRoute } from "../data/levelTests";
import { findSeoCefrPreviewItem } from "./components/devSeoCefrPreviewData";
import type { ResolvedWordPageData } from "../data/seo/wordPageData";
import {
  getStoredSupabaseSession,
  handleSupabaseAuthRedirect,
  subscribeToSupabaseSessionChanges,
  type StoredSupabaseSession,
} from "../lib/supabaseAuth";
import {
  EMPTY_USER_PROFILE,
  isUserProfileComplete,
  normalizeUserProfile,
  readSupabaseUserProfile,
  readStoredUserProfile,
  startsWithLetter,
  writeSupabaseUserProfile,
  writeStoredUserProfile,
  type UserProfile,
} from "../lib/userProfile";

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
const supportedLanguages = [
  { code: "en", flagCode: "gb" },
  { code: "es", flagCode: "es" },
  { code: "fr", flagCode: "fr" },
  { code: "de", flagCode: "de" },
  { code: "it", flagCode: "it" },
  { code: "pt", flagCode: "pt" },
  { code: "ru", flagCode: "ru" },
];

const DEFAULT_EXERCISES = [
  "wordTyping",
  "halfWritten",
  "brokenWord",
  "connectWords",
  "listening",
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

const VALID_LEVEL_CODES = new Set(["A1", "A2", "B1", "B2", "C1", "C2"]);

function RouteLoadingFallback() {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-12 text-sm text-muted-foreground">
      Loading...
    </div>
  );
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStoredString(
  key: string,
  isValid: (value: string) => boolean,
): string | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const value = window.localStorage.getItem(key);
  if (!value || !isValid(value)) {
    return null;
  }

  return value;
}

function readStoredStringArray(
  key: string,
  isValidItem?: (value: string) => boolean,
): string[] | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return null;
    }

    const normalized = parsed.filter((item): item is string => typeof item === "string");
    return isValidItem ? normalized.filter(isValidItem) : normalized;
  } catch {
    return null;
  }
}

function getSessionUserId(session: StoredSupabaseSession | null): string | null {
  return typeof session?.user?.id === "string" && session.user.id.trim()
    ? session.user.id
    : null;
}

interface ParsedVocabularyRoute {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: CefrLevelCode;
}

interface ParsedLevelTestSeoRoute {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
}

interface ParsedPracticeRoute {
  yourLanguage: UILanguage;
  practiceLanguage: UILanguage;
}

interface ExploreTopic {
  level: CefrLevelCode | "test";
  label: string;
  path: string;
  kind: "level" | "test";
  targetLanguage: TargetLanguageSlug;
}

const TARGET_LANGUAGE_TO_UI_CODE: Record<TargetLanguageSlug, UILanguage> = {
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  russian: "ru",
};

function parseVocabularyRoute(path: string): ParsedVocabularyRoute | null {
  const match = path.match(/^\/([a-z]{2})\/([^/?#]+)$/);
  if (!match) {
    return null;
  }

  const [, uiLangRaw, slug] = match;
  const resolved = resolveVocabularyRoute(uiLangRaw, slug);
  if (!resolved) {
    return null;
  }

  return {
    uiLang: resolved.uiLang,
    targetLanguage: resolved.targetLanguage,
    level: resolved.level,
  };
}

function parseDevSeoCefrPlaceholderRoute(path: string): ParsedVocabularyRoute | null {
  if (!path.startsWith("/test/")) {
    return null;
  }

  return parseVocabularyRoute(path.slice("/test".length));
}

function parseLevelTestSeoRoute(path: string): ParsedLevelTestSeoRoute | null {
  return resolveLevelTestSeoRoute(path);
}

function parseSeoHubRoute(path: string): UiLanguageCode | null {
  return resolveSeoHubRoute(path);
}

function parseWordRoute(path: string): WordRouteMatch | null {
  const match = path.match(/^\/([a-z]{2})\/([^/?#]+)$/);
  if (!match) return null;
  const [, uiLangRaw, slug] = match;
  return resolveWordRoute(uiLangRaw, slug);
}

function parseAnyWordRoute(path: string) {
  const match = path.match(/^\/([a-z]{2})\/([^/?#]+)$/);
  if (!match) return null;
  const [, uiLangRaw, slug] = match;
  return parseSeoWordRoute(uiLangRaw, slug);
}
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

type RouteKey = keyof typeof ROUTES;
type PageKey =
  | RouteKey
  | "vocabularyLevel"
  | "levelTestSeo"
  | "seoHub"
  | "wordPage"
  | "devSeoCefrPlaceholder"
  | "notFound";

function buildPracticeRoute(yourLanguage: UILanguage, practiceLanguage: UILanguage): string {
  return `${ROUTES.exerciseSelection}/${yourLanguage}-${practiceLanguage}/practice`;
}

function parsePracticeRoute(path: string): ParsedPracticeRoute | null {
  const match = path.match(/^\/languages\/filters\/exercises\/([a-z]{2})-([a-z]{2})\/practice$/);
  if (!match) {
    return null;
  }

  const [, yourLanguageRaw, practiceLanguageRaw] = match;
  if (!isSupportedUiLanguage(yourLanguageRaw) || !isSupportedUiLanguage(practiceLanguageRaw)) {
    return null;
  }

  return {
    yourLanguage: yourLanguageRaw,
    practiceLanguage: practiceLanguageRaw,
  };
}

const pageFromPath = (path: string): PageKey => {
  if (parsePracticeRoute(path)) {
    return "practice";
  }

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
    case ROUTES.explore:
      return "explore";
    case ROUTES.exam:
      return "exam";
    case ROUTES.about:
      return "about";
    case ROUTES.help:
      return "help";
    case ROUTES.profile:
      return "profile";
    default: {
      if (import.meta.env.DEV && parseDevSeoCefrPlaceholderRoute(path)) {
        return "devSeoCefrPlaceholder";
      }
      if (parseSeoHubRoute(path)) {
        return "seoHub";
      }
      if (parseLevelTestSeoRoute(path)) {
        return "levelTestSeo";
      }
      if (parseAnyWordRoute(path)) {
        return "wordPage";
      }
      if (parseVocabularyRoute(path)) {
        return "vocabularyLevel";
      }
      return "notFound";
    }
  }
};

function randomBetween(min: number, max: number): number {
  return min + (max - min) * 0.5;
}

function createSeededRandom(seed: number): () => number {
  let value = seed >>> 0;

  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function createDistributedStarFieldImage(starCount: number, seed = starCount): string {
  const cols = Math.ceil(Math.sqrt(starCount));
  const rows = Math.ceil(starCount / cols);
  const sparkleScaleOptions = [0.8, 1, 1.2, 1.4];
  const colorOptions = [
    "#fff",
    "#fff",
    "#fff",
    "#f3f3f3",
    "rgba(255,255,255,0.9)",
  ];
  const layers: string[] = [];
  const nextRandom = createSeededRandom(seed);

  for (let i = 0; i < starCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cellWidth = 100 / cols;
    const cellHeight = 100 / rows;
    const xMin = col * cellWidth + 10;
    const xMax = (col + 1) * cellWidth - 10;
    const yMin = row * cellHeight + 14;
    const yMax = (row + 1) * cellHeight - 14;
    const x = (
      Math.max(5, xMin) + (Math.min(95, xMax) - Math.max(5, xMin)) * nextRandom()
    ).toFixed(1);
    const y = (
      Math.max(8, yMin) + (Math.min(92, yMax) - Math.max(8, yMin)) * nextRandom()
    ).toFixed(1);
    const sparkleScale =
      sparkleScaleOptions[Math.floor(nextRandom() * sparkleScaleOptions.length)];
    const color = colorOptions[Math.floor(nextRandom() * colorOptions.length)];
    const longArm = ((4.8 + (6.6 - 4.8) * nextRandom()) * sparkleScale).toFixed(1);
    const shortArm = ((1.05 + (1.45 - 1.05) * nextRandom()) * sparkleScale).toFixed(2);
    const core = ((0.9 + (1.3 - 0.9) * nextRandom()) * sparkleScale).toFixed(2);

    layers.push(
      `radial-gradient(ellipse ${longArm}px ${shortArm}px at ${x}% ${y}%, ${color}, rgba(0,0,0,0) 72%)`,
      `radial-gradient(ellipse ${shortArm}px ${longArm}px at ${x}% ${y}%, ${color}, rgba(0,0,0,0) 72%)`,
      `radial-gradient(${core}px ${core}px at ${x}% ${y}%, rgba(255,255,255,0.98), rgba(0,0,0,0))`,
    );
  }

  return layers.join(",\n    ");
}

function AppContent({
  initialWordPageData,
  initialBrowsePreviewData,
}: {
  initialWordPageData?: ResolvedWordPageData | null;
  initialBrowsePreviewData?: LevelBrowsePreviewData | null;
}) {
  const { t, uiLanguage, setUILanguage } = useLanguage();
  const supportedLanguageCodes = useMemo(
    () => new Set(supportedLanguages.map((language) => language.code)),
    [],
  );
  const vocabularyPracticeByUiLanguage: Record<string, string> = {
    en: "Vocabulary Practice",
    es: "práctica de vocabulario",
    fr: "Pratique du vocabulaire",
    de: "Wortschatzubung",
    it: "Pratica del vocabolario",
    pt: "Pratica de vocabulario",
    ru: "Практика словарного запаса",
  };
  const buildExploreLevelTestLabel = (targetLanguage: TargetLanguageSlug) => {
    const languageCode = TARGET_LANGUAGE_TO_UI_CODE[targetLanguage];
    const languageName = t(`languageNames.${languageCode}`);
    const levelTestLabel = t("header.levelTest");

    switch (uiLanguage) {
      case "en":
      case "de":
        return `${languageName} ${levelTestLabel}`;
      default:
        return `${levelTestLabel}: ${languageName.toLowerCase()}`;
    }
  };

  const withLevelTestExploreTopic = (
    topics: Array<{ level: CefrLevelCode; label: string; path: string | null | undefined }>,
    targetLanguage: TargetLanguageSlug,
  ): ExploreTopic[] => [
    ...topics.map((topic) => ({
      level: topic.level,
      label: topic.label,
      path: topic.path ?? "#",
      kind: "level" as const,
      targetLanguage,
    })),
    {
      level: "test",
      label: buildExploreLevelTestLabel(targetLanguage),
      path: getLevelTestSeoPath(uiLanguage, targetLanguage) ?? ROUTES.exam,
      kind: "test",
      targetLanguage,
    },
  ];
  const englishExploreTopics = useMemo(() => {
    const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

    if (uiLanguage === "fr") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulaire d’anglais ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "de") {
      return levels
        .map((level) => ({
          level,
          label: `Englisch Wortschatz ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "it") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabolario di inglese ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "pt") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulário de inglês ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "ru") {
      return levels
        .map((level) => ({
          level,
          label: `Словарный запас английского ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }

    const englishLabel = t("languageNames.en");

    if (uiLanguage === "en") {
      return levels
        .map((level) => ({
          level,
          label: `${englishLabel} ${level.toUpperCase()} Vocabulary`,
          path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }

    const practiceLabel =
      vocabularyPracticeByUiLanguage[uiLanguage] ??
      vocabularyPracticeByUiLanguage.en;

    return levels
      .map((level) => ({
        level,
        label: `${englishLabel} ${level.toUpperCase()} ${practiceLabel}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "english", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }, [t, uiLanguage]);
  const spanishExploreTopics = useMemo(() => {
    const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

    if (uiLanguage === "es") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulario de español ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "de") {
      return levels
        .map((level) => ({
          level,
          label: `Spanisch Wortschatz ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "fr") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulaire d’espagnol ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "pt") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulário de espanhol ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "it") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabolario di spagnolo ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "ru") {
      return levels
        .map((level) => ({
          level,
          label: `Словарный запас испанского ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }

    return levels
      .map((level) => ({
        level,
        label: `Spanish Vocabulary ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "spanish", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }, [uiLanguage]);
  const frenchExploreTopics = useMemo(() => {
    const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

    if (uiLanguage === "es") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulario de francés ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "de") {
      return levels
        .map((level) => ({
          level,
          label: `Französisch Wortschatz ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "ru") {
      return levels
        .map((level) => ({
          level,
          label: `Словарный запас французского ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "fr") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulaire de français ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "pt") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulário de francês ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "it") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabolario di francese ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }

    return levels
      .map((level) => ({
        level,
        label: `French Vocabulary ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "french", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }, [uiLanguage]);
  const germanExploreTopics = useMemo(() => {
    const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

    if (uiLanguage === "es") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulario de alemán ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "de") {
      return levels
        .map((level) => ({
          level,
          label: `Deutsch Wortschatz ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "ru") {
      return levels
        .map((level) => ({
          level,
          label: `Словарный запас немецкого ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "fr") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulaire d’allemand ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "pt") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulário de alemão ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "it") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabolario di tedesco ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }

    return levels
      .map((level) => ({
        level,
        label: `German Vocabulary ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "german", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }, [uiLanguage]);
  const italianExploreTopics = useMemo(() => {
    const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

    if (uiLanguage === "es") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulario de italiano ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "de") {
      return levels
        .map((level) => ({
          level,
          label: `Italienisch Wortschatz ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "ru") {
      return levels
        .map((level) => ({
          level,
          label: `Словарный запас итальянского ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "fr") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulaire d’italien ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "pt") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulário de italiano ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "it") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabolario di italiano ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }

    return levels
      .map((level) => ({
        level,
        label: `Italian Vocabulary ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "italian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }, [uiLanguage]);
  const portugueseExploreTopics = useMemo(() => {
    const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

    if (uiLanguage === "es") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulario de portugués ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "de") {
      return levels
        .map((level) => ({
          level,
          label: `Portugiesisch Wortschatz ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "ru") {
      return levels
        .map((level) => ({
          level,
          label: `Словарный запас португальского ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "fr") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulaire de portugais ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "pt") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulário de português ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "it") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabolario di portoghese ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }

    return levels
      .map((level) => ({
        level,
        label: `Portuguese Vocabulary ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "portuguese", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }, [uiLanguage]);
  const russianExploreTopics = useMemo(() => {
    const levels: CefrLevelCode[] = ["a1", "a2", "b1", "b2", "c1", "c2"];

    if (uiLanguage === "es") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulario de ruso ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "de") {
      return levels
        .map((level) => ({
          level,
          label: `Russisch Wortschatz ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "ru") {
      return levels
        .map((level) => ({
          level,
          label: `Словарный запас русского ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "fr") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulaire de russe ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "pt") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabulário de russo ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }
    if (uiLanguage === "it") {
      return levels
        .map((level) => ({
          level,
          label: `Vocabolario di russo ${level.toUpperCase()}`,
          path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
        }))
        .filter((topic) => Boolean(topic.path));
    }

    return levels
      .map((level) => ({
        level,
        label: `Russian Vocabulary ${level.toUpperCase()}`,
        path: buildLocalizedVocabularyPath(uiLanguage, "russian", level),
      }))
      .filter((topic) => Boolean(topic.path));
  }, [uiLanguage]);
  const englishExploreItems = useMemo(
    () => withLevelTestExploreTopic(englishExploreTopics, "english"),
    [englishExploreTopics],
  );
  const spanishExploreItems = useMemo(
    () => withLevelTestExploreTopic(spanishExploreTopics, "spanish"),
    [spanishExploreTopics],
  );
  const frenchExploreItems = useMemo(
    () => withLevelTestExploreTopic(frenchExploreTopics, "french"),
    [frenchExploreTopics],
  );
  const germanExploreItems = useMemo(
    () => withLevelTestExploreTopic(germanExploreTopics, "german"),
    [germanExploreTopics],
  );
  const italianExploreItems = useMemo(
    () => withLevelTestExploreTopic(italianExploreTopics, "italian"),
    [italianExploreTopics],
  );
  const portugueseExploreItems = useMemo(
    () => withLevelTestExploreTopic(portugueseExploreTopics, "portuguese"),
    [portugueseExploreTopics],
  );
  const russianExploreItems = useMemo(
    () => withLevelTestExploreTopic(russianExploreTopics, "russian"),
    [russianExploreTopics],
  );
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
  const initialPracticeRouteRef = useRef(parsePracticeRoute(location.pathname));
  const [yourLanguage, setYourLanguage] = useState(
    () => initialPracticeRouteRef.current?.yourLanguage ?? "",
  );
  const [practiceLanguage, setPracticeLanguage] = useState(
    () => initialPracticeRouteRef.current?.practiceLanguage ?? "",
  );
  const [authSession, setAuthSession] = useState<StoredSupabaseSession | null>(() =>
    getStoredSupabaseSession(),
  );
  const [userProfile, setUserProfile] = useState<UserProfile>(EMPTY_USER_PROFILE);
  const [isAccountOnboardingOpen, setIsAccountOnboardingOpen] = useState(false);
  const [isAccountOnboardingSubmitting, setIsAccountOnboardingSubmitting] = useState(false);
  const [accountOnboardingError, setAccountOnboardingError] = useState<string | null>(null);
  const navigate = useNavigate();
  const levelTestSeoRoute = useMemo(
    () => parseLevelTestSeoRoute(location.pathname),
    [location.pathname],
  );
  const seoHubRoute = useMemo(() => parseSeoHubRoute(location.pathname), [location.pathname]);
  const vocabularyRoute = useMemo(() => parseVocabularyRoute(location.pathname), [location.pathname]);
  const wordRoute = useMemo(() => parseWordRoute(location.pathname), [location.pathname]);
  const practiceRoute = useMemo(() => parsePracticeRoute(location.pathname), [location.pathname]);
  const currentPage = useMemo(() => pageFromPath(location.pathname), [location.pathname]);
  const [selectedLevel, setSelectedLevel] = useState("A1");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedLevels, setSelectedLevels] = useState<string[]>([]);
  const [selectedWordTypes, setSelectedWordTypes] = useState<string[]>([]);
  const [isEnglishExploreOpen, setIsEnglishExploreOpen] = useState(false);
  const [isSpanishExploreOpen, setIsSpanishExploreOpen] = useState(false);
  const [isFrenchExploreOpen, setIsFrenchExploreOpen] = useState(false);
  const [isGermanExploreOpen, setIsGermanExploreOpen] = useState(false);
  const [isItalianExploreOpen, setIsItalianExploreOpen] = useState(false);
  const [isPortugueseExploreOpen, setIsPortugueseExploreOpen] = useState(false);
  const [isRussianExploreOpen, setIsRussianExploreOpen] = useState(false);
  const [selectedExercises, setSelectedExercises] = useState<string[]>([...DEFAULT_EXERCISES]);
  const isContinueDisabled = !yourLanguage || !practiceLanguage;
  const [popupQueuedForLanguage, setPopupQueuedForLanguage] = useState(false);
  const [isLevelTestLanguageModalOpen, setIsLevelTestLanguageModalOpen] = useState(false);
  const [levelTestDraftYourLanguage, setLevelTestDraftYourLanguage] = useState("");
  const [levelTestDraftPracticeLanguage, setLevelTestDraftPracticeLanguage] = useState("");
  const [levelTestModalSwapRotation, setLevelTestModalSwapRotation] = useState(0);
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
  const shouldAutoRedirectFromStoredLanguagesRef = useRef(false);
  const previousAuthUserIdRef = useRef<string | null>(getSessionUserId(getStoredSupabaseSession()));
  const [swapRotation, setSwapRotation] = useState(0);
  const shouldReduceMotion = useReducedMotion();
  const resolvedPage = currentPage;
  const authUserId = getSessionUserId(authSession);
  const siteOrigin = useSeoSiteOrigin();
  const routeMetadata = useMemo(() => {
    switch (resolvedPage) {
      case "wordPage":
      case "vocabularyLevel":
      case "levelTestSeo":
      case "seoHub":
      case "devSeoCefrPlaceholder":
        return null;
      default:
        return buildRouteMetadata(location.pathname, siteOrigin);
    }
  }, [location.pathname, resolvedPage, siteOrigin]);

  useEffect(() => {
    const persistedYourLanguage = readStoredString(
      STORAGE_KEYS.yourLanguage,
      (value) => supportedLanguageCodes.has(value),
    );
    const persistedPracticeLanguage = readStoredString(
      STORAGE_KEYS.practiceLanguage,
      (value) => supportedLanguageCodes.has(value),
    );
    const persistedSelectedLevel = readStoredString(
      STORAGE_KEYS.selectedLevel,
      (value) => VALID_LEVEL_CODES.has(value.toUpperCase()),
    );
    const persistedSelectedCategories =
      readStoredStringArray(STORAGE_KEYS.selectedCategories) ?? [];
    const persistedSelectedLevels =
      (
        readStoredStringArray(
          STORAGE_KEYS.selectedLevels,
          (value) => VALID_LEVEL_CODES.has(value.toUpperCase()),
        ) ?? []
      ).map((value) => value.toUpperCase());
    const persistedSelectedWordTypes =
      readStoredStringArray(STORAGE_KEYS.selectedWordTypes) ?? [];
    const allowedExercises = new Set(DEFAULT_EXERCISES);
    const persistedSelectedExercises = readStoredStringArray(
      STORAGE_KEYS.selectedExercises,
      (value) => allowedExercises.has(value),
    );

    if (persistedYourLanguage) {
      setYourLanguage(persistedYourLanguage);
    }
    if (persistedPracticeLanguage) {
      setPracticeLanguage(persistedPracticeLanguage);
    }
    if (persistedSelectedLevel) {
      setSelectedLevel(persistedSelectedLevel.toUpperCase());
    }
    if (persistedSelectedCategories.length > 0) {
      setSelectedCategories(persistedSelectedCategories);
    }
    if (persistedSelectedLevels.length > 0) {
      setSelectedLevels(persistedSelectedLevels);
    }
    if (persistedSelectedWordTypes.length > 0) {
      setSelectedWordTypes(persistedSelectedWordTypes);
    }
    if (persistedSelectedExercises && persistedSelectedExercises.length > 0) {
      setSelectedExercises(persistedSelectedExercises);
    }

    shouldAutoRedirectFromStoredLanguagesRef.current = Boolean(
      persistedYourLanguage && persistedPracticeLanguage,
    );
  }, [supportedLanguageCodes]);

  useEffect(() => {
    const unsubscribe = subscribeToSupabaseSessionChanges(setAuthSession);
    return unsubscribe;
  }, []);

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

        setAuthSession(result.session);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [resolvedPage]);

  useEffect(() => {
    if (!authUserId) {
      setUserProfile(EMPTY_USER_PROFILE);
      setIsAccountOnboardingOpen(false);
      setAccountOnboardingError(null);
      return;
    }

    let cancelled = false;
    const storedProfile = readStoredUserProfile(authUserId);

    void (async () => {
      try {
        const supabaseProfile = authSession
          ? await readSupabaseUserProfile(authSession)
          : null;
        const hasSupabaseProfileRow = Boolean(supabaseProfile);
        if (cancelled) {
          return;
        }

        const nextProfile = normalizeUserProfile({
          ...storedProfile,
          ...supabaseProfile,
          nickname: supabaseProfile?.nickname || storedProfile?.nickname || "",
          nativeLanguage:
            supabaseProfile?.nativeLanguage ||
            storedProfile?.nativeLanguage ||
            yourLanguage ||
            "",
          practiceLanguage:
            supabaseProfile?.practiceLanguage ||
            storedProfile?.practiceLanguage ||
            practiceLanguage ||
            "",
        });

        if (!yourLanguage && nextProfile.nativeLanguage) {
          setYourLanguage(nextProfile.nativeLanguage);
        }
        if (!practiceLanguage && nextProfile.practiceLanguage) {
          setPracticeLanguage(nextProfile.practiceLanguage);
        }

        setUserProfile(nextProfile);
        setIsAccountOnboardingOpen(
          !hasSupabaseProfileRow || !isUserProfileComplete(nextProfile),
        );
        setAccountOnboardingError(null);
      } catch {
        if (cancelled) {
          return;
        }

        const fallbackProfile = normalizeUserProfile({
          ...storedProfile,
          nativeLanguage: storedProfile?.nativeLanguage || yourLanguage || "",
          practiceLanguage: storedProfile?.practiceLanguage || practiceLanguage || "",
        });

        setUserProfile(fallbackProfile);
        setIsAccountOnboardingOpen(!isUserProfileComplete(fallbackProfile));
        setAccountOnboardingError(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authSession, authUserId, practiceLanguage, yourLanguage]);

  useEffect(() => {
    if (!authUserId) {
      return;
    }

    setUserProfile((current) => {
      const nextProfile = normalizeUserProfile({
        ...current,
        nativeLanguage: yourLanguage || current.nativeLanguage,
        practiceLanguage: practiceLanguage || current.practiceLanguage,
      });

      return JSON.stringify(nextProfile) === JSON.stringify(current) ? current : nextProfile;
    });
  }, [authUserId, practiceLanguage, yourLanguage]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.yourLanguage, yourLanguage);
  }, [yourLanguage]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.practiceLanguage, practiceLanguage);
  }, [practiceLanguage]);

  useEffect(() => {
    if (
      !authSession ||
      !authUserId ||
      !userProfile.onboardingCompleted ||
      !yourLanguage ||
      !practiceLanguage
    ) {
      return;
    }

    if (
      userProfile.nativeLanguage === yourLanguage &&
      userProfile.practiceLanguage === practiceLanguage
    ) {
      return;
    }

    const nextProfile = writeStoredUserProfile(authUserId, {
      ...userProfile,
      nativeLanguage: yourLanguage as UILanguage,
      practiceLanguage: practiceLanguage as UILanguage,
    });

    setUserProfile(nextProfile);
    void writeSupabaseUserProfile(authSession, nextProfile).catch(() => {});
  }, [authSession, authUserId, practiceLanguage, userProfile, yourLanguage]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(STORAGE_KEYS.selectedLevel, selectedLevel);
  }, [selectedLevel]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEYS.selectedCategories,
      JSON.stringify(selectedCategories),
    );
  }, [selectedCategories]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEYS.selectedLevels,
      JSON.stringify(selectedLevels),
    );
  }, [selectedLevels]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEYS.selectedWordTypes,
      JSON.stringify(selectedWordTypes),
    );
  }, [selectedWordTypes]);

  useEffect(() => {
    if (!canUseLocalStorage()) {
      return;
    }
    window.localStorage.setItem(
      STORAGE_KEYS.selectedExercises,
      JSON.stringify(selectedExercises),
    );
  }, [selectedExercises]);

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
    setSelectedLevel(level.toUpperCase());
    setSelectedLevels([level.toUpperCase()]);
    setSelectedCategories([]);
    setSelectedWordTypes([]);
    setSelectedExercises([...DEFAULT_EXERCISES]);

    if (isContinueDisabled) {
      navigate(ROUTES.language);
      setPopupQueuedForLanguage(true);
      return;
    }

    navigate(ROUTES.levelCategory);
  };

  useEffect(() => {
    if (resolvedPage !== "vocabularyLevel" || !vocabularyRoute) {
      return;
    }

    if (uiLanguage !== vocabularyRoute.uiLang) {
      setUILanguage(vocabularyRoute.uiLang);
    }
  }, [resolvedPage, setUILanguage, uiLanguage, vocabularyRoute]);

  useEffect(() => {
    if (resolvedPage !== "levelTestSeo" || !levelTestSeoRoute) {
      return;
    }

    if (uiLanguage !== levelTestSeoRoute.uiLang) {
      setUILanguage(levelTestSeoRoute.uiLang);
    }
  }, [levelTestSeoRoute, resolvedPage, setUILanguage, uiLanguage]);

  useEffect(() => {
    if (resolvedPage !== "seoHub" || !seoHubRoute) {
      return;
    }

    if (uiLanguage !== seoHubRoute) {
      setUILanguage(seoHubRoute);
    }
  }, [resolvedPage, seoHubRoute, setUILanguage, uiLanguage]);

  useEffect(() => {
    if (resolvedPage !== "wordPage" || !wordRoute) {
      return;
    }

    if (uiLanguage !== wordRoute.uiLang) {
      setUILanguage(wordRoute.uiLang);
    }
  }, [resolvedPage, setUILanguage, uiLanguage, wordRoute]);

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
    );
    if (location.pathname !== expectedPath) {
      navigate(expectedPath, { replace: true });
    }
  }, [location.pathname, navigate, practiceLanguage, resolvedPage, yourLanguage]);

  useEffect(() => {
    if (hasAutoRedirectedRef.current) {
      return;
    }

    if (!shouldAutoRedirectFromStoredLanguagesRef.current) {
      return;
    }

    const initialPage = pageFromPath(initialPathRef.current);
    const startedOnLanguagePage = initialPage === "language";
    const startedOnLegacyPracticePage = initialPathRef.current === ROUTES.practice;

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

    if (!isContinueDisabled && startedOnLegacyPracticePage && resolvedPage === "practice") {
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

    navigate(buildPracticeRoute(yourLanguage as UILanguage, practiceLanguage as UILanguage));
  };

  const handleAuthSessionChange = useCallback((session: StoredSupabaseSession | null) => {
    setAuthSession(session);
  }, []);

  useEffect(() => {
    const previousAuthUserId = previousAuthUserIdRef.current;

    // Redirect only on a live login transition, not on initial page load with an existing session.
    if (!previousAuthUserId && authUserId && resolvedPage !== "profile") {
      navigate(ROUTES.profile);
    }

    previousAuthUserIdRef.current = authUserId;
  }, [authUserId, navigate, resolvedPage]);

  const handleUserProfileChange = (patch: Partial<UserProfile>) => {
    setAccountOnboardingError(null);
    setUserProfile((current) => normalizeUserProfile({ ...current, ...patch }));

    if (patch.nativeLanguage !== undefined) {
      setYourLanguage(patch.nativeLanguage);
    }

    if (patch.practiceLanguage !== undefined) {
      setPracticeLanguage(patch.practiceLanguage);
    }
  };

  const handleAccountOnboardingSubmit = async () => {
    const nickname = userProfile.nickname.trim();
    const age = userProfile.age;
    const birthMonth = userProfile.birthMonth;
    const birthDay = userProfile.birthDay;
    const nativeLanguage = (userProfile.nativeLanguage || yourLanguage) as UserProfile["nativeLanguage"];
    const nextPracticeLanguage = (userProfile.practiceLanguage || practiceLanguage) as UserProfile["practiceLanguage"];

    if (!authUserId) {
      setAccountOnboardingError("Sign in again to finish your profile.");
      return;
    }

    if (!nickname) {
      setAccountOnboardingError("Please choose a nickname.");
      return;
    }

    if (!startsWithLetter(nickname)) {
      setAccountOnboardingError("Nickname must start with a letter.");
      return;
    }

    if (!userProfile.languageLevel) {
      setAccountOnboardingError("Please choose your language level.");
      return;
    }

    if (age === null) {
      setAccountOnboardingError("Please set your age.");
      return;
    }

    if (!birthMonth || !birthDay) {
      setAccountOnboardingError("Please choose your birth month and day.");
      return;
    }

    if (!nativeLanguage || !nextPracticeLanguage) {
      setAccountOnboardingError("Please choose both languages.");
      return;
    }

    setIsAccountOnboardingSubmitting(true);

    try {
      const profileToSave = {
        ...userProfile,
        nickname,
        age,
        birthMonth,
        birthDay,
        nativeLanguage,
        practiceLanguage: nextPracticeLanguage,
        onboardingCompleted: true,
      };
      const supabaseProfile = authSession
        ? await writeSupabaseUserProfile(authSession, profileToSave)
        : {};
      const nextProfile = writeStoredUserProfile(authUserId, {
        ...profileToSave,
        ...supabaseProfile,
      });

      setUserProfile(nextProfile);
      setYourLanguage(nativeLanguage);
      setPracticeLanguage(nextPracticeLanguage);
      setIsAccountOnboardingOpen(false);
      setAccountOnboardingError(null);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : "We could not save your profile. Please try again.";
      setAccountOnboardingError(message);
    } finally {
      setIsAccountOnboardingSubmitting(false);
    }
  };

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
    setLevelTestDraftYourLanguage(yourLanguage);
    setLevelTestDraftPracticeLanguage(practiceLanguage || targetLanguageCode);
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

  const handleConfirmLevelTestLanguages = () => {
    if (
      !levelTestDraftYourLanguage ||
      !levelTestDraftPracticeLanguage ||
      levelTestDraftYourLanguage === levelTestDraftPracticeLanguage
    ) {
      return;
    }

    setYourLanguage(levelTestDraftYourLanguage);
    setPracticeLanguage(levelTestDraftPracticeLanguage);
    setIsLevelTestLanguageModalOpen(false);
    navigate(ROUTES.exam);
  };

  const handleExamComplete = (level: string) => {
    setSelectedLevels([level]);
    navigate(ROUTES.levelCategory);
  };

  const closeAllExploreDropdowns = () => {
    setIsEnglishExploreOpen(false);
    setIsSpanishExploreOpen(false);
    setIsFrenchExploreOpen(false);
    setIsGermanExploreOpen(false);
    setIsItalianExploreOpen(false);
    setIsPortugueseExploreOpen(false);
    setIsRussianExploreOpen(false);
  };

  const renderExploreTopicItem = (topic: ExploreTopic) => {
    if (topic.kind === "test") {
      if (topic.path !== ROUTES.exam) {
        return (
          <Link
            key={`${topic.targetLanguage}-${topic.level}`}
            to={topic.path}
            onClick={closeAllExploreDropdowns}
            className="block w-full border-b border-primary/10 px-4 py-3 text-left text-sm text-foreground/90 transition-colors hover:bg-primary/5 last:border-b-0"
          >
            {topic.label}
          </Link>
        );
      }

      return (
        <button
          key={`${topic.targetLanguage}-${topic.level}`}
          type="button"
          onClick={() => {
            closeAllExploreDropdowns();
            if (topic.path === ROUTES.exam) {
              setPracticeLanguage(TARGET_LANGUAGE_TO_UI_CODE[topic.targetLanguage]);
              handleStartExam();
              return;
            }

            navigate(topic.path);
          }}
          className="block w-full border-b border-primary/10 px-4 py-3 text-left text-sm text-foreground/90 transition-colors hover:bg-primary/5 last:border-b-0"
        >
          {topic.label}
        </button>
      );
    }

    return (
      <Link
        key={`${topic.targetLanguage}-${topic.level}`}
        to={topic.path}
        onClick={closeAllExploreDropdowns}
        className="block w-full border-b border-primary/10 px-4 py-3 text-left text-sm text-foreground/90 transition-colors hover:bg-primary/5 last:border-b-0"
      >
        {topic.label}
      </Link>
    );
  };

  const handleReverseLanguages = () => {
    const temp = yourLanguage;
    setYourLanguage(practiceLanguage);
    setPracticeLanguage(temp);
    setSwapRotation((prev) => prev + 180);
  };

  const handleReverseLevelTestModalLanguages = () => {
    const temp = levelTestDraftYourLanguage;
    setLevelTestDraftYourLanguage(levelTestDraftPracticeLanguage);
    setLevelTestDraftPracticeLanguage(temp);
    setLevelTestModalSwapRotation((prev) => prev + 180);
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

  const levelTestModalSwapButton = (
    <motion.button
      type="button"
      onClick={handleReverseLevelTestModalLanguages}
      className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full border border-border/70 bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/70 shadow-sm transition-all opacity-90 md:opacity-100"
      aria-label="Reverse languages"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.span
        animate={shouldReduceMotion ? undefined : { rotate: levelTestModalSwapRotation }}
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

  const isLevelTestLanguageSelectionDisabled =
    !levelTestDraftYourLanguage ||
    !levelTestDraftPracticeLanguage ||
    levelTestDraftYourLanguage === levelTestDraftPracticeLanguage;

  const levelTestLanguageModal = isLevelTestLanguageModalOpen ? (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label={t("languageContinuePopup.closePopup")}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={() => setIsLevelTestLanguageModalOpen(false)}
      />
      <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-2xl md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl text-foreground">{t("languageContinuePopup.title")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("home.selectYourLanguage")} and {t("home.selectPracticeLanguage").toLowerCase()}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsLevelTestLanguageModalOpen(false)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label={t("languageContinuePopup.close")}
          >
            X
          </button>
        </div>

        <div className="mt-6">
          <div className="md:hidden relative space-y-10">
            <LanguageSelector
              label={t("home.yourLanguage")}
              value={levelTestDraftYourLanguage}
              onChange={setLevelTestDraftYourLanguage}
              placeholder={t("home.selectYourLanguage")}
              languages={languages}
              disabledLanguages={[levelTestDraftPracticeLanguage]}
            />
            <div className="absolute left-1/2 top-[calc(50%+16px)] -translate-x-1/2 -translate-y-1/2 z-10">
              {levelTestModalSwapButton}
            </div>
            <LanguageSelector
              label={t("home.practiceLanguage")}
              value={levelTestDraftPracticeLanguage}
              onChange={setLevelTestDraftPracticeLanguage}
              placeholder={t("home.selectPracticeLanguage")}
              languages={languages}
              disabledLanguages={[levelTestDraftYourLanguage]}
            />
          </div>
          <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-6">
            <LanguageSelector
              label={t("home.yourLanguage")}
              value={levelTestDraftYourLanguage}
              onChange={setLevelTestDraftYourLanguage}
              placeholder={t("home.selectYourLanguage")}
              languages={languages}
              disabledLanguages={[levelTestDraftPracticeLanguage]}
            />
            <div className="flex justify-center mt-8">{levelTestModalSwapButton}</div>
            <LanguageSelector
              label={t("home.practiceLanguage")}
              value={levelTestDraftPracticeLanguage}
              onChange={setLevelTestDraftPracticeLanguage}
              placeholder={t("home.selectPracticeLanguage")}
              languages={languages}
              disabledLanguages={[levelTestDraftYourLanguage]}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleConfirmLevelTestLanguages}
            disabled={isLevelTestLanguageSelectionDisabled}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
              isLevelTestLanguageSelectionDisabled
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "border border-primary/45 bg-primary/10 text-primary hover:bg-primary/15"
            }`}
          >
            Start Level Test
          </button>
        </div>
      </div>
    </div>
  ) : null;

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
        <main className="flex-1 px-4 py-8 md:px-8 md:py-12">
          <div className="mx-auto w-full max-w-5xl">
            <div className="mb-5">
              <label
                htmlFor="explore-language-search"
                className="sr-only"
              >
                {t("languageSelector.search")}
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="explore-language-search"
                  type="text"
                  placeholder={t("languageSelector.search")}
                  className="h-12 w-full rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card/95 to-card/80 pl-11 pr-4 text-foreground shadow-[0_10px_24px_-16px_rgba(74,43,130,0.7)] outline-none transition-all duration-300 placeholder:text-muted-foreground/80 focus:border-primary/60 focus:shadow-[0_16px_34px_-14px_rgba(74,43,130,0.55)]"
                />
              </div>
            </div>
            <div className="columns-1 gap-4 space-y-4 sm:columns-2 lg:columns-3">
              {languages.map((language) =>
                language.code === "en" ? (
                  <div key={language.code} className="mb-4 break-inside-avoid space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsEnglishExploreOpen((prev) => !prev);
                        setIsSpanishExploreOpen(false);
                        setIsFrenchExploreOpen(false);
                        setIsGermanExploreOpen(false);
                        setIsItalianExploreOpen(false);
                        setIsPortugueseExploreOpen(false);
                        setIsRussianExploreOpen(false);
                      }}
                      className="group relative flex h-16 w-full items-center justify-between overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card/95 to-card/80 px-5 text-left shadow-[0_10px_24px_-16px_rgba(74,43,130,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_16px_34px_-14px_rgba(74,43,130,0.55)]"
                    >
                      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.22),transparent_45%)]" />
                      <span className="flex items-center gap-3">
                        <span className="inline-flex h-5 w-7 items-center justify-center overflow-hidden rounded-sm">
                          <span className={`fi fi-${language.flagCode}`} aria-hidden="true" />
                        </span>
                        <span className="text-base text-foreground relative">
                          {language.name}
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${
                          isEnglishExploreOpen ? "rotate-180" : "group-hover:translate-y-0.5"
                        }`}
                      />
                    </button>
                    {isEnglishExploreOpen ? (
                      <div className="overflow-hidden rounded-xl border border-primary/25 bg-card/90 shadow-[0_12px_26px_-18px_rgba(74,43,130,0.65)]">
                        {englishExploreItems.map(renderExploreTopicItem)}
                      </div>
                    ) : null}
                  </div>
                ) : language.code === "es" ? (
                  <div key={language.code} className="mb-4 break-inside-avoid space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSpanishExploreOpen((prev) => !prev);
                        setIsEnglishExploreOpen(false);
                        setIsFrenchExploreOpen(false);
                        setIsGermanExploreOpen(false);
                        setIsItalianExploreOpen(false);
                        setIsPortugueseExploreOpen(false);
                        setIsRussianExploreOpen(false);
                      }}
                      className="group relative flex h-16 w-full items-center justify-between overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card/95 to-card/80 px-5 text-left shadow-[0_10px_24px_-16px_rgba(74,43,130,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_16px_34px_-14px_rgba(74,43,130,0.55)]"
                    >
                      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.22),transparent_45%)]" />
                      <span className="flex items-center gap-3">
                        <span className="inline-flex h-5 w-7 items-center justify-center overflow-hidden rounded-sm">
                          <span className={`fi fi-${language.flagCode}`} aria-hidden="true" />
                        </span>
                        <span className="text-base text-foreground relative">
                          {language.name}
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${
                          isSpanishExploreOpen ? "rotate-180" : "group-hover:translate-y-0.5"
                        }`}
                      />
                    </button>
                    {isSpanishExploreOpen ? (
                      <div className="overflow-hidden rounded-xl border border-primary/25 bg-card/90 shadow-[0_12px_26px_-18px_rgba(74,43,130,0.65)]">
                        {spanishExploreItems.map(renderExploreTopicItem)}
                      </div>
                    ) : null}
                  </div>
                ) : language.code === "fr" ? (
                  <div key={language.code} className="mb-4 break-inside-avoid space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsFrenchExploreOpen((prev) => !prev);
                        setIsEnglishExploreOpen(false);
                        setIsSpanishExploreOpen(false);
                        setIsGermanExploreOpen(false);
                        setIsItalianExploreOpen(false);
                        setIsPortugueseExploreOpen(false);
                        setIsRussianExploreOpen(false);
                      }}
                      className="group relative flex h-16 w-full items-center justify-between overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card/95 to-card/80 px-5 text-left shadow-[0_10px_24px_-16px_rgba(74,43,130,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_16px_34px_-14px_rgba(74,43,130,0.55)]"
                    >
                      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.22),transparent_45%)]" />
                      <span className="flex items-center gap-3">
                        <span className="inline-flex h-5 w-7 items-center justify-center overflow-hidden rounded-sm">
                          <span className={`fi fi-${language.flagCode}`} aria-hidden="true" />
                        </span>
                        <span className="text-base text-foreground relative">
                          {language.name}
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${
                          isFrenchExploreOpen ? "rotate-180" : "group-hover:translate-y-0.5"
                        }`}
                      />
                    </button>
                    {isFrenchExploreOpen ? (
                      <div className="overflow-hidden rounded-xl border border-primary/25 bg-card/90 shadow-[0_12px_26px_-18px_rgba(74,43,130,0.65)]">
                        {frenchExploreItems.map(renderExploreTopicItem)}
                      </div>
                    ) : null}
                  </div>
                ) : language.code === "de" ? (
                  <div key={language.code} className="mb-4 break-inside-avoid space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsGermanExploreOpen((prev) => !prev);
                        setIsEnglishExploreOpen(false);
                        setIsSpanishExploreOpen(false);
                        setIsFrenchExploreOpen(false);
                        setIsItalianExploreOpen(false);
                        setIsPortugueseExploreOpen(false);
                        setIsRussianExploreOpen(false);
                      }}
                      className="group relative flex h-16 w-full items-center justify-between overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card/95 to-card/80 px-5 text-left shadow-[0_10px_24px_-16px_rgba(74,43,130,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_16px_34px_-14px_rgba(74,43,130,0.55)]"
                    >
                      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.22),transparent_45%)]" />
                      <span className="flex items-center gap-3">
                        <span className="inline-flex h-5 w-7 items-center justify-center overflow-hidden rounded-sm">
                          <span className={`fi fi-${language.flagCode}`} aria-hidden="true" />
                        </span>
                        <span className="text-base text-foreground relative">
                          {language.name}
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${
                          isGermanExploreOpen ? "rotate-180" : "group-hover:translate-y-0.5"
                        }`}
                      />
                    </button>
                    {isGermanExploreOpen ? (
                      <div className="overflow-hidden rounded-xl border border-primary/25 bg-card/90 shadow-[0_12px_26px_-18px_rgba(74,43,130,0.65)]">
                        {germanExploreItems.map(renderExploreTopicItem)}
                      </div>
                    ) : null}
                  </div>
                ) : language.code === "it" ? (
                  <div key={language.code} className="mb-4 break-inside-avoid space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsItalianExploreOpen((prev) => !prev);
                        setIsEnglishExploreOpen(false);
                        setIsSpanishExploreOpen(false);
                        setIsFrenchExploreOpen(false);
                        setIsGermanExploreOpen(false);
                        setIsPortugueseExploreOpen(false);
                        setIsRussianExploreOpen(false);
                      }}
                      className="group relative flex h-16 w-full items-center justify-between overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card/95 to-card/80 px-5 text-left shadow-[0_10px_24px_-16px_rgba(74,43,130,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_16px_34px_-14px_rgba(74,43,130,0.55)]"
                    >
                      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.22),transparent_45%)]" />
                      <span className="flex items-center gap-3">
                        <span className="inline-flex h-5 w-7 items-center justify-center overflow-hidden rounded-sm">
                          <span className={`fi fi-${language.flagCode}`} aria-hidden="true" />
                        </span>
                        <span className="text-base text-foreground relative">
                          {language.name}
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${
                          isItalianExploreOpen ? "rotate-180" : "group-hover:translate-y-0.5"
                        }`}
                      />
                    </button>
                    {isItalianExploreOpen ? (
                      <div className="overflow-hidden rounded-xl border border-primary/25 bg-card/90 shadow-[0_12px_26px_-18px_rgba(74,43,130,0.65)]">
                        {italianExploreItems.map(renderExploreTopicItem)}
                      </div>
                    ) : null}
                  </div>
                ) : language.code === "pt" ? (
                  <div key={language.code} className="mb-4 break-inside-avoid space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsPortugueseExploreOpen((prev) => !prev);
                        setIsEnglishExploreOpen(false);
                        setIsSpanishExploreOpen(false);
                        setIsFrenchExploreOpen(false);
                        setIsGermanExploreOpen(false);
                        setIsItalianExploreOpen(false);
                        setIsRussianExploreOpen(false);
                      }}
                      className="group relative flex h-16 w-full items-center justify-between overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card/95 to-card/80 px-5 text-left shadow-[0_10px_24px_-16px_rgba(74,43,130,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_16px_34px_-14px_rgba(74,43,130,0.55)]"
                    >
                      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.22),transparent_45%)]" />
                      <span className="flex items-center gap-3">
                        <span className="inline-flex h-5 w-7 items-center justify-center overflow-hidden rounded-sm">
                          <span className={`fi fi-${language.flagCode}`} aria-hidden="true" />
                        </span>
                        <span className="text-base text-foreground relative">
                          {language.name}
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${
                          isPortugueseExploreOpen ? "rotate-180" : "group-hover:translate-y-0.5"
                        }`}
                      />
                    </button>
                    {isPortugueseExploreOpen ? (
                      <div className="overflow-hidden rounded-xl border border-primary/25 bg-card/90 shadow-[0_12px_26px_-18px_rgba(74,43,130,0.65)]">
                        {portugueseExploreItems.map(renderExploreTopicItem)}
                      </div>
                    ) : null}
                  </div>
                ) : language.code === "ru" ? (
                  <div key={language.code} className="mb-4 break-inside-avoid space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsRussianExploreOpen((prev) => !prev);
                        setIsEnglishExploreOpen(false);
                        setIsSpanishExploreOpen(false);
                        setIsFrenchExploreOpen(false);
                        setIsGermanExploreOpen(false);
                        setIsItalianExploreOpen(false);
                        setIsPortugueseExploreOpen(false);
                      }}
                      className="group relative flex h-16 w-full items-center justify-between overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card/95 to-card/80 px-5 text-left shadow-[0_10px_24px_-16px_rgba(74,43,130,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_16px_34px_-14px_rgba(74,43,130,0.55)]"
                    >
                      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.22),transparent_45%)]" />
                      <span className="flex items-center gap-3">
                        <span className="inline-flex h-5 w-7 items-center justify-center overflow-hidden rounded-sm">
                          <span className={`fi fi-${language.flagCode}`} aria-hidden="true" />
                        </span>
                        <span className="text-base text-foreground relative">
                          {language.name}
                        </span>
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${
                          isRussianExploreOpen ? "rotate-180" : "group-hover:translate-y-0.5"
                        }`}
                      />
                    </button>
                    {isRussianExploreOpen ? (
                      <div className="overflow-hidden rounded-xl border border-primary/25 bg-card/90 shadow-[0_12px_26px_-18px_rgba(74,43,130,0.65)]">
                        {russianExploreItems.map(renderExploreTopicItem)}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div key={language.code} className="mb-4 break-inside-avoid">
                  <button
                    type="button"
                    className="group relative flex h-16 w-full items-center justify-between overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-r from-card via-card/95 to-card/80 px-5 text-left shadow-[0_10px_24px_-16px_rgba(74,43,130,0.7)] transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-[0_16px_34px_-14px_rgba(74,43,130,0.55)]"
                  >
                    <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_top_right,rgba(167,139,250,0.22),transparent_45%)]" />
                    <span className="flex items-center gap-3">
                      <span className="inline-flex h-5 w-7 items-center justify-center overflow-hidden rounded-sm">
                        <span className={`fi fi-${language.flagCode}`} aria-hidden="true" />
                      </span>
                      <span className="text-base text-foreground relative">
                        {language.name}
                      </span>
                    </span>
                    <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform duration-300 group-hover:translate-y-0.5" />
                  </button>
                  </div>
                ),
              )}
            </div>
          </div>
        </main>
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
        {levelTestLanguageModal}
        {accountOnboardingDialog}
      </div>
    );
  }


  if (resolvedPage === "wordPage") {
    if (!wordRoute) {
      return (
        <div className="min-h-screen flex flex-col bg-background">
          <Header {...sharedHeaderProps} activePage="notFound" />
          <NotFoundPage message="Invalid word page." />
          {accountOnboardingDialog}
        </div>
      );
    }

    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header {...sharedHeaderProps} activePage="vocabularyLevel" />
        <Suspense fallback={<RouteLoadingFallback />}>
          <WordSeoPage
            uiLang={wordRoute.uiLang}
            targetLanguage={wordRoute.targetLanguage}
            wordSlug={wordRoute.wordSlug}
            conceptId={wordRoute.conceptId}
            onStartPractice={handleStartVocabularyPractice}
            initialData={initialWordPageData}
          />
        </Suspense>
        {accountOnboardingDialog}
      </div>
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
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
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
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
                <div className="language-swap-wrap flex justify-center mt-8">{swapButton}</div>
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <motion.button
              onClick={handleStartPracticing}
              aria-disabled={isContinueDisabled}
              style={nextButtonStarFieldStyle}
              className={`language-continue-button text-white px-12 py-4 text-lg rounded-lg shadow-lg shadow-primary/30 ${
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
}

export default function App({
  initialUILanguage,
  initialTranslationData,
  seoManager,
  siteOrigin = DEFAULT_SITE_ORIGIN,
  initialWordPageData,
  initialBrowsePreviewData,
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
          />
          <ScrollToTopButton />
        </>
      </LanguageProvider>
    </SeoProvider>
  );
}
