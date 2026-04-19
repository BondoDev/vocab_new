import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronDown, Check, X } from "lucide-react";
import categoriesData from "../../data/categories.json";
import { useLanguage } from "../../contexts/LanguageContext";

interface LevelCategorySelectionProps {
  selectedLevel: string;
  setSelectedLevel: (level: string) => void;
  practiceLanguage: string;
  selectedCategories: string[];
  setSelectedCategories: (categories: string[]) => void;
  selectedLevels: string[];
  setSelectedLevels: (levels: string[]) => void;
  selectedWordTypes: string[];
  setSelectedWordTypes: (types: string[]) => void;
  onBack: () => void;
  onContinue: () => void;
  onTakeLevelTest: () => void;
}

const levels = [
  { code: "A1" },
  { code: "A2" },
  { code: "B1" },
  { code: "B2" },
  { code: "C1" },
  { code: "C2" },
];

const categories = (Array.isArray(categoriesData) ? categoriesData : []).map(
  (cat: any) => ({
    id: cat.category,
  }),
);

const DEFAULT_WORD_TYPES: string[] = [
  "preposition",
  "noun",
  "verb",
  "adjective",
  "adverb",
  "determiner",
  "conjunction",
  "pronoun",
  "exclamation",
  "expression",
];
type VocabularyWord = {
  type?: string | null;
  level?: string | null;
  category?: string | null;
};
type FilterWord = {
  type: string;
  level: string;
  category: string;
};

const navbarColorRgb = "74, 43, 130";
const levelOpacities = [0.05, 0.15, 0.3, 0.5, 0.65, 0.75];
const levelTextColors = [
  "rgba(2, 6, 23, 1)",
  "rgba(2, 6, 23, 0.98)",
  "rgba(2, 6, 23, 0.95)",
  "rgba(255, 255, 255, 0.92)",
  "rgba(255, 255, 255, 0.97)",
  "rgba(255, 255, 255, 1)",
];
const levelSubTextColors = [
  "rgba(2, 6, 23, 0.82)",
  "rgba(2, 6, 23, 0.78)",
  "rgba(2, 6, 23, 0.72)",
  "rgba(255, 255, 255, 0.78)",
  "rgba(255, 255, 255, 0.88)",
  "rgba(255, 255, 255, 0.95)",
];

const allLevelCodes = levels.map((level) => level.code);

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

export function LevelCategorySelection({
  practiceLanguage,
  selectedCategories,
  setSelectedCategories,
  selectedLevels,
  setSelectedLevels,
  selectedWordTypes,
  setSelectedWordTypes,
  onBack,
  onContinue,
  onTakeLevelTest,
}: LevelCategorySelectionProps) {
  const [isTopicsModalOpen, setIsTopicsModalOpen] = useState(false);
  const [pendingCategories, setPendingCategories] = useState<string[]>([]);
  const [isWordTypesModalOpen, setIsWordTypesModalOpen] = useState(false);
  const [pendingWordTypes, setPendingWordTypes] = useState<string[]>([]);
  const [allWordTypes, setAllWordTypes] =
    useState<string[]>(DEFAULT_WORD_TYPES);
  const [filterWords, setFilterWords] = useState<FilterWord[]>([]);
  const [isVocabularyMetadataReady, setIsVocabularyMetadataReady] =
    useState(false);
  const { t } = useLanguage();
  const lastTouchRef = useRef<{
    time: number;
    level: string | null;
  }>({
    time: 0,
    level: null,
  });
  const suppressClickUntilRef = useRef(0);
  const filteredCountCacheRef = useRef<Map<string, number>>(new Map());
  const nextButtonStarFieldStyle = useMemo(
    () => ({
      backgroundColor: "#4a2b82",
      backgroundImage: createDistributedStarFieldImage(3),
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
    }),
    [],
  );

  // Extra small mobile: 6 topics, 376-430.98px: 6 topics, small mobile: 9 topics, mobile: 12 topics, desktop: ~15 topics
  const TOPICS_EXTRA_SMALL_LIMIT = 6;
  const TOPICS_SMALL_NARROW_LIMIT = 9;
  const TOPICS_SMALL_MOBILE_LIMIT = 9;
  const TOPICS_MOBILE_LIMIT = 12;
  const TOPICS_DESKTOP_LIMIT = 15;

  const [isMobile, setIsMobile] = useState(false);
  const [isSmallMobile, setIsSmallMobile] = useState(false);
  const [isExtraSmallMobile, setIsExtraSmallMobile] = useState(false);
  const [isSmallNarrowMobile, setIsSmallNarrowMobile] = useState(false);
  const [isPhoneMobile, setIsPhoneMobile] = useState(false);
  const [isLaptopFilterRange, setIsLaptopFilterRange] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mobileMedia = window.matchMedia("(max-width: 767px)");
    const smallMobileMedia = window.matchMedia("(max-width: 639.98px)");
    const extraSmallMobileMedia = window.matchMedia("(max-width: 375.98px)");
    const smallNarrowMobileMedia = window.matchMedia(
      "(min-width: 376px) and (max-width: 430.98px)",
    );
    const phoneMobileMedia = window.matchMedia("(max-width: 430.98px)");
    const laptopFilterMedia = window.matchMedia(
      "(min-width: 1024px) and (max-width: 1535.98px)",
    );
    const update = () => {
      setIsMobile(mobileMedia.matches);
      setIsSmallMobile(smallMobileMedia.matches);
      setIsExtraSmallMobile(extraSmallMobileMedia.matches);
      setIsSmallNarrowMobile(smallNarrowMobileMedia.matches);
      setIsPhoneMobile(phoneMobileMedia.matches);
      setIsLaptopFilterRange(laptopFilterMedia.matches);
    };
    update();
    mobileMedia.addEventListener("change", update);
    smallMobileMedia.addEventListener("change", update);
    extraSmallMobileMedia.addEventListener("change", update);
    smallNarrowMobileMedia.addEventListener("change", update);
    phoneMobileMedia.addEventListener("change", update);
    laptopFilterMedia.addEventListener("change", update);
    return () => {
      mobileMedia.removeEventListener("change", update);
      smallMobileMedia.removeEventListener("change", update);
      extraSmallMobileMedia.removeEventListener("change", update);
      smallNarrowMobileMedia.removeEventListener("change", update);
      phoneMobileMedia.removeEventListener("change", update);
      laptopFilterMedia.removeEventListener("change", update);
    };
  }, []);

  const visibleLimit = isMobile
    ? isExtraSmallMobile
      ? TOPICS_EXTRA_SMALL_LIMIT
      : isSmallNarrowMobile
        ? TOPICS_SMALL_NARROW_LIMIT
        : isSmallMobile
          ? TOPICS_SMALL_MOBILE_LIMIT
          : TOPICS_MOBILE_LIMIT
    : TOPICS_DESKTOP_LIMIT;
  const visibleCategories = categories.slice(0, visibleLimit);

  const hiddenTopicsCount = Math.max(0, categories.length - visibleLimit);

  const prioritizedWordTypes = useMemo(() => {
    const priority = DEFAULT_WORD_TYPES;
    const prioritySet = new Set(priority);
    const normalized = Array.from(new Set(allWordTypes))
      .map((type) => type?.trim())
      .filter((type): type is string => Boolean(type));
    const prioritized = priority.filter((type) => normalized.includes(type));
    const rest = normalized
      .filter((type) => !prioritySet.has(type))
      .sort((a, b) => a.localeCompare(b));
    return [...prioritized, ...rest];
  }, [allWordTypes]);

  const visibleWordTypes = prioritizedWordTypes.slice(0, 4);
  const hiddenWordTypesCount = Math.max(0, prioritizedWordTypes.length - 4);

  const formatWordTypeLabel = (typeId: string) =>
    typeId
      .split(/[_-]+/g)
      .map((part) =>
        part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part,
      )
      .join(" ");

  const getWordTypeLabel = (typeId: string) => {
    const translated = t(`wordTypes.${typeId}`);
    if (!translated || translated === `wordTypes.${typeId}`) {
      return formatWordTypeLabel(typeId);
    }
    return translated;
  };

  const formatCategoryLabel = (categoryId: string) =>
    categoryId
      .split(" ")
      .map((part) =>
        part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part,
      )
      .join(" ");

  const getCategoryLabel = (categoryId: string) => {
    const translated = t(`levelCategory.topicNames.${categoryId}`);
    if (
      !translated ||
      translated === `levelCategory.topicNames.${categoryId}`
    ) {
      return formatCategoryLabel(categoryId);
    }
    return translated;
  };

  const getFilteredWordCount = (
    levelsToUse: string[],
    categoriesToUse: string[],
    wordTypesToUse: string[],
  ) => {
    if (!isVocabularyMetadataReady) {
      return 1;
    }
    const key = [
      [...levelsToUse].sort().join("|"),
      [...categoriesToUse].sort().join("|"),
      [...wordTypesToUse].sort().join("|"),
    ].join("::");
    const cached = filteredCountCacheRef.current.get(key);
    if (typeof cached === "number") {
      return cached;
    }
    const count = filterWords.filter((word) => {
      if (levelsToUse.length > 0 && !levelsToUse.includes(word.level)) {
        return false;
      }
      if (
        categoriesToUse.length > 0 &&
        !categoriesToUse.includes(word.category)
      ) {
        return false;
      }
      if (wordTypesToUse.length > 0 && !wordTypesToUse.includes(word.type)) {
        return false;
      }
      return true;
    }).length;
    filteredCountCacheRef.current.set(key, count);
    return count;
  };

  const resolveToggledLevels = (levelCode: string): string[] => {
    const nextLevels = selectedLevels.includes(levelCode)
      ? selectedLevels.filter((code) => code !== levelCode)
      : [...selectedLevels, levelCode];
    return nextLevels.length === 0 ? allLevelCodes : nextLevels;
  };

  const resolveToggledCategory = (
    categoryId: string,
    sourceCategories: string[],
  ): string[] =>
    sourceCategories.includes(categoryId)
      ? sourceCategories.filter((id) => id !== categoryId)
      : [...sourceCategories, categoryId];

  const resolveToggledWordType = (typeId: string, sourceTypes: string[]) =>
    sourceTypes.includes(typeId)
      ? sourceTypes.filter((id) => id !== typeId)
      : [...sourceTypes, typeId];

  const hasWordsAfterLevelToggle = (levelCode: string) =>
    getFilteredWordCount(
      resolveToggledLevels(levelCode),
      selectedCategories,
      selectedWordTypes,
    ) > 0;

  const hasWordsAfterCategoryToggle = (
    categoryId: string,
    sourceCategories: string[] = selectedCategories,
  ) =>
    getFilteredWordCount(
      selectedLevels,
      resolveToggledCategory(categoryId, sourceCategories),
      selectedWordTypes,
    ) > 0;

  const hasWordsAfterWordTypeToggle = (
    typeId: string,
    sourceTypes: string[] = selectedWordTypes,
  ) =>
    getFilteredWordCount(
      selectedLevels,
      selectedCategories,
      resolveToggledWordType(typeId, sourceTypes),
    ) > 0;

  const toggleCategory = (categoryId: string) => {
    if (!hasWordsAfterCategoryToggle(categoryId)) {
      return;
    }
    setSelectedCategories(resolveToggledCategory(categoryId, selectedCategories));
  };

  const togglePendingCategory = (categoryId: string) => {
    if (!hasWordsAfterCategoryToggle(categoryId, pendingCategories)) {
      return;
    }
    setPendingCategories(resolveToggledCategory(categoryId, pendingCategories));
  };

  const togglePendingWordType = (typeId: string) => {
    if (!hasWordsAfterWordTypeToggle(typeId, pendingWordTypes)) {
      return;
    }
    setPendingWordTypes(resolveToggledWordType(typeId, pendingWordTypes));
  };

  const toggleLevel = (levelCode: string) => {
    if (!hasWordsAfterLevelToggle(levelCode)) {
      return;
    }
    setSelectedLevels(resolveToggledLevels(levelCode));
  };

  const toggleWordType = (typeId: string) => {
    if (!hasWordsAfterWordTypeToggle(typeId)) {
      return;
    }
    setSelectedWordTypes(resolveToggledWordType(typeId, selectedWordTypes));
  };

  const handleSelectOnlyLevel = (levelCode: string) => {
    if (
      getFilteredWordCount([levelCode], selectedCategories, selectedWordTypes) ===
      0
    ) {
      return;
    }
    setSelectedLevels([levelCode]);
  };

  useEffect(() => {
    if (selectedLevels.length === 0) {
      setSelectedLevels(allLevelCodes);
    }
  }, [selectedLevels.length, setSelectedLevels]);

  useEffect(() => {
    filteredCountCacheRef.current.clear();
  }, [filterWords]);

  useEffect(() => {
    let isMounted = true;
    setIsVocabularyMetadataReady(false);

    const loadWordTypes = async () => {
      try {
        const vocabularyMap: Record<string, () => Promise<any>> = {
          en: () => import("../../data/vocabulary/english/vocabulary.json"),
          es: () => import("../../data/vocabulary/spanish/vocabulary.json"),
          fr: () => import("../../data/vocabulary/french/vocabulary.json"),
          de: () => import("../../data/vocabulary/german/vocabulary.json"),
          it: () => import("../../data/vocabulary/italian/vocabulary.json"),
          pt: () => import("../../data/vocabulary/portuguese/vocabulary.json"),
          ru: () => import("../../data/vocabulary/russian/vocabulary.json"),
        };

        const loadVocabulary = vocabularyMap[practiceLanguage];
        if (!loadVocabulary) {
          if (isMounted) setAllWordTypes(DEFAULT_WORD_TYPES);
          return;
        }

        const module = await loadVocabulary();
        const words: VocabularyWord[] = Array.isArray(module.default)
          ? (module.default as VocabularyWord[])
          : [];
        const normalizedFilterWords: FilterWord[] = words
          .map((word) => ({
            type:
              typeof word?.type === "string" ? word.type.trim().toLowerCase() : "",
            level:
              typeof word?.level === "string" ? word.level.trim().toUpperCase() : "",
            category:
              typeof word?.category === "string"
                ? word.category.trim().toLowerCase()
                : "",
          }))
          .filter((word) => word.type && word.level && word.category);
        const discoveredTypes: string[] = [
          ...new Set(
            words
              .map((word) => word?.type)
              .filter((type): type is string => typeof type === "string")
              .map((type) => type.trim())
              .filter((type): type is string => type.length > 0),
          ),
        ];

        if (!isMounted) return;
        const nextWordTypes: string[] =
          discoveredTypes.length > 0
            ? [...discoveredTypes]
            : [...DEFAULT_WORD_TYPES];
        setAllWordTypes(nextWordTypes);
        setFilterWords(normalizedFilterWords);
        setIsVocabularyMetadataReady(true);
      } catch {
        if (isMounted) {
          setAllWordTypes(DEFAULT_WORD_TYPES);
          setFilterWords([]);
          setIsVocabularyMetadataReady(true);
        }
      }
    };

    loadWordTypes();
    return () => {
      isMounted = false;
    };
  }, [practiceLanguage]);

  const hasAnyFilterSelected =
    selectedCategories.length > 0 ||
    selectedWordTypes.length > 0 ||
    selectedLevels.length !== allLevelCodes.length;
  const hasWordsForCurrentFilters =
    getFilteredWordCount(selectedLevels, selectedCategories, selectedWordTypes) >
    0;

  return (
    <div className="filters-page flex flex-col flex-1 bg-background">
      {/* Fixed back button */}
      <button
        onClick={onBack}
        className="fixed top-14 left-4 md:top-20 md:left-8 z-50 hidden md:flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="w-5 h-5" />
        <span>{t("levelCategory.back")}</span>
      </button>

      <main className="flex-1 flex justify-center px-4 pt-4 sm:pt-6 pb-6 sm:pb-8 md:px-[clamp(1rem,2vw,1.5rem)] md:pt-[clamp(1rem,2vw,1.5rem)] md:pb-[clamp(1.5rem,3vw,2rem)] relative">
        {/* Decorative background elements */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute top-20 left-10 w-48 h-48 md:w-64 md:h-64 rounded-full blur-3xl"
            style={{
              backgroundColor: "rgba(74, 43, 130, 0.13)",
            }}
            animate={{
              scale: [1, 1.08, 1],
              opacity: [0.16, 0.26, 0.16],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          ></motion.div>
          <motion.div
            className="absolute bottom-20 right-10 w-64 h-64 md:w-96 md:h-96 rounded-full blur-3xl"
            style={{
              backgroundColor: "rgba(118, 90, 184, 0.10)",
            }}
            animate={{
              scale: [1, 1.1, 1],
              opacity: [0.16, 0.26, 0.16],
            }}
            transition={{
              duration: 12,
              repeat: Infinity,
              ease: "easeInOut",
              delay: 1,
            }}
          ></motion.div>
        </div>

        <motion.div
          className="filters-elements-container w-full max-w-[900px] flex flex-col flex-1 min-h-0 justify-start md:justify-start lg:justify-start relative z-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Headline */}
          <motion.div
            className="text-center space-y-1.5 sm:space-y-2 lg:space-y-3"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h2 className="text-3xl md:text-[clamp(2.25rem,3.5vw,3rem)] text-foreground leading-tight">
              {t("levelCategory.titleWithSkipAhead")}
            </h2>
          </motion.div>

          {/* Level Selection */}
          <motion.div
            className="space-y-2.5 sm:space-y-3 lg:space-y-2.5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <h3 className="text-xl md:text-[clamp(1.25rem,2vw,1.5rem)] text-foreground text-center">
              {t("levelCategory.vocabularyLevel")}
            </h3>
            <p className="!mt-0 text-sm md:text-[clamp(0.9rem,1.2vw,1rem)] text-center text-muted-foreground">
              {selectedLevels.length === allLevelCodes.length
                ? t("levelCategory.allLevelsSelected")
                : `${selectedLevels.length} ${selectedLevels.length > 1 ? t("levelCategory.levelsSelectedPlural") : t("levelCategory.levelsSelected")}`}
            </p>
            <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 md:gap-[clamp(0.75rem,1.6vw,1rem)] lg:gap-[clamp(0.65rem,1vw,0.625rem)]">
              {levels.map((level, index) => {
                const isSelected = selectedLevels.includes(level.code);
                const isDisabled = !hasWordsAfterLevelToggle(level.code);
                return (
                  <motion.button
                    key={level.code}
                    disabled={isDisabled}
                    onClick={() => {
                      if (isDisabled) return;
                      if (suppressClickUntilRef.current > Date.now()) return;
                      toggleLevel(level.code);
                    }}
                    onPointerUp={(event) => {
                      if (event.pointerType !== "touch") return;
                      const now = Date.now();
                      const isDoubleTap =
                        lastTouchRef.current.level === level.code &&
                        now - lastTouchRef.current.time < 320;
                      if (isDoubleTap) {
                        suppressClickUntilRef.current = now + 400;
                        handleSelectOnlyLevel(level.code);
                        lastTouchRef.current = {
                          time: 0,
                          level: null,
                        };
                        return;
                      }
                      lastTouchRef.current = {
                        time: now,
                        level: level.code,
                      };
                    }}
                    onDoubleClick={() => handleSelectOnlyLevel(level.code)}
                    title={t("levelCategory.levelSingleSelectHint")}
                    className={`relative p-2 sm:p-2.5 md:p-[clamp(0.62rem,1.05vw,0.68rem)] rounded-xl sm:rounded-lg border-2 transition-all ${
                      isSelected
                        ? "border-primary shadow-lg shadow-primary/20"
                        : "border-primary/60 hover:border-primary bg-transparent"
                    } ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
                    whileHover={isDisabled ? undefined : { scale: 1.05 }}
                    whileTap={isDisabled ? undefined : { scale: 0.95 }}
                    style={{
                      backgroundColor: isSelected
                        ? `rgba(${navbarColorRgb}, ${levelOpacities[index] ?? 0.1})`
                        : "transparent",
                    }}
                  >
                    {isSelected && (
                      <span
                        className="absolute top-1 right-1 sm:top-2 sm:right-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
                        style={{
                          color: `rgb(${navbarColorRgb})`,
                        }}
                      >
                        <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                      </span>
                    )}
                    <div
                      className="text-sm sm:text-base md:text-[clamp(0.95rem,1.3vw,1rem)] font-medium"
                      style={{
                        color: isSelected
                          ? (levelTextColors[index] ?? "rgba(2, 6, 23, 1)")
                          : "rgba(15, 23, 42, 0.95)",
                      }}
                    >
                      {level.code}
                    </div>
                    <div
                      className="text-[10px] sm:text-xs md:text-[clamp(0.7rem,1vw,0.75rem)] mt-0 hidden sm:block"
                      style={{
                        color: isSelected
                          ? (levelSubTextColors[index] ??
                            "rgba(2, 6, 23, 0.82)")
                          : "rgba(30, 41, 59, 0.75)",
                      }}
                    >
                      {t(`level.${level.code}.name`)}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Helper text and level test button */}
            <div className="flex flex-col items-center gap-2 sm:gap-3 md:gap-[clamp(0.5rem,1vw,0.75rem)] pt-1">
              <p className="text-sm sm:text-base md:text-[clamp(0.95rem,1.2vw,1rem)] text-center text-muted-foreground">
                <span className="md:hidden">Not sure? Take a level test.</span>
                <span className="hidden md:inline">
                  {t("levelCategory.notSureLevel")}
                </span>
              </p>
              <motion.button
                className="px-5 py-2 sm:px-6 sm:py-2.5 md:px-[clamp(1.4rem,2vw,1.5rem)] md:py-[clamp(0.6rem,1vw,0.625rem)] bg-card border-2 text-primary hover:bg-primary/5 rounded-xl sm:rounded-lg transition-all shadow-sm text-sm sm:text-base md:text-[clamp(0.95rem,1.2vw,1rem)]"
                style={{ borderColor: "#6366f14d" }}
                whileHover={{
                  scale: 1.03,
                  borderColor: "#6366f180",
                }}
                whileTap={{ scale: 0.98 }}
                onClick={onTakeLevelTest}
              >
                {t("levelCategory.takeLevelTest")}
              </motion.button>
            </div>
          </motion.div>

          {/* Category Selection */}
          <motion.div
            className="space-y-2.5 sm:space-y-3 lg:space-y-2.5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <h3 className="text-xl md:text-[clamp(1.25rem,2vw,1.5rem)] text-foreground text-center mb-1">
              {t("levelCategory.topicsToPractice")}
            </h3>
            <p className="!mt-0 text-sm md:text-[clamp(0.9rem,1.2vw,1rem)] text-center text-muted-foreground">
              {t("levelCategory.allTopicsSelected")}
            </p>
            {isPhoneMobile ? (
              <motion.button
                type="button"
                onClick={() => {
                  setPendingCategories(selectedCategories);
                  setIsTopicsModalOpen(true);
                }}
                className="filters-topics-open-button w-full rounded-xl border-2 border-primary/35 bg-card px-4 py-3 text-center text-primary font-semibold transition-all hover:bg-primary/5"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {t("levelCategory.topics.filterButton")}
              </motion.button>
            ) : (
              <div className="flex flex-wrap justify-center gap-2 md:gap-[clamp(0.6rem,1.2vw,0.75rem)] lg:gap-[clamp(0.55rem,1vw,0.625rem)] max-h-[110px] md:max-h-[180px] lg:max-h-none">
                {visibleCategories.map((category) => {
                  const isSelected = selectedCategories.includes(category.id);
                  const isDisabled = !hasWordsAfterCategoryToggle(category.id);
                  return (
                    <motion.button
                      key={category.id}
                      disabled={isDisabled}
                      onClick={() => toggleCategory(category.id)}
                      className={`px-3 py-1.5 sm:px-3 sm:py-2 md:px-[clamp(0.85rem,1.3vw,0.75rem)] md:py-[clamp(0.45rem,0.8vw,0.5rem)] rounded-xl sm:rounded-lg border-2 transition-all flex items-center gap-1.5 sm:gap-2 md:gap-[clamp(0.4rem,0.8vw,0.5rem)] ${
                        isSelected
                          ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                          : "border-border bg-card hover:border-primary/50"
                      } ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
                      whileHover={isDisabled ? undefined : { scale: 1.05 }}
                      whileTap={isDisabled ? undefined : { scale: 0.95 }}
                    >
                      <span className="text-sm sm:text-sm md:text-[clamp(0.85rem,1.1vw,0.875rem)] text-foreground">
                        {getCategoryLabel(category.id)}
                      </span>
                    </motion.button>
                  );
                })}
                {hiddenTopicsCount > 0 && (
                  <button
                    className="px-3 py-1.5 md:px-[clamp(0.85rem,1.3vw,0.75rem)] md:py-[clamp(0.45rem,0.8vw,0.5rem)] flex items-center gap-1.5 md:gap-[clamp(0.4rem,0.8vw,0.5rem)] text-sm sm:text-sm md:text-[clamp(0.85rem,1.1vw,0.875rem)] text-primary hover:underline transition-all"
                    onClick={() => {
                      setPendingCategories(selectedCategories);
                      setIsTopicsModalOpen(true);
                    }}
                  >
                    <>
                      <span className="hidden md:inline">
                        {t("levelCategory.showAllTopics")} (+
                        {hiddenTopicsCount} {t("levelCategory.moreTopics")})
                      </span>
                      <span className="md:hidden">
                        {t("levelCategory.topics.showAllShort")}
                      </span>
                      <ChevronDown className="w-4 h-4 sm:w-4 sm:h-4" />
                    </>
                  </button>
                )}
              </div>
            )}
            {isTopicsModalOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
                role="dialog"
                aria-modal="true"
                aria-label={t("levelCategory.topicsToPractice")}
                onClick={() => setIsTopicsModalOpen(false)}
              >
                <div
                  className="w-full max-w-2xl max-h-[80vh] bg-card border border-border rounded-xl shadow-xl p-5"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <h4 className="text-lg font-semibold text-foreground">
                      {t("levelCategory.topicsToPractice")}
                    </h4>
                    <button
                      className="text-3xl -mt-2 leading-none text-muted-foreground hover:text-foreground transition"
                      onClick={() => setIsTopicsModalOpen(false)}
                      aria-label={t("levelCategory.actions.close")}
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[60vh] pr-1">
                    {categories.map((category) => {
                      const isSelected = pendingCategories.includes(category.id);
                      const isDisabled = !hasWordsAfterCategoryToggle(
                        category.id,
                        pendingCategories,
                      );
                      return (
                        <motion.button
                          key={category.id}
                          disabled={isDisabled}
                          onClick={() => togglePendingCategory(category.id)}
                          className={`px-3 py-2 rounded-lg border-2 transition-all flex items-center gap-2 ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                              : "border-border bg-card hover:border-primary/50"
                          } ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
                          whileHover={{ scale: 1 }}
                          whileTap={{ scale: 1 }}
                        >
                          <span className="text-sm text-foreground">
                            {getCategoryLabel(category.id)}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition"
                      onClick={() => setPendingCategories([])}
                    >
                      {t("levelCategory.actions.clear")}
                    </button>
                    <button
                      className="px-5 py-2 bg-card border-2 text-primary hover:bg-primary/5 rounded-lg transition-all shadow-sm"
                      style={{ borderColor: "#6366f14d" }}
                      disabled={
                        getFilteredWordCount(
                          selectedLevels,
                          pendingCategories,
                          selectedWordTypes,
                        ) === 0
                      }
                      onClick={() => {
                        setSelectedCategories(pendingCategories);
                        setIsTopicsModalOpen(false);
                      }}
                    >
                      {t("levelCategory.actions.apply")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Word Type Selection */}
          <motion.div
            className="space-y-2.5 mb-0 sm:space-y-3 lg:space-y-2.5"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <h3 className="text-xl md:text-[clamp(1.25rem,2vw,1.5rem)] text-foreground text-center">
              {t("levelCategory.wordTypes")}
            </h3>
            <p className="!mt-0 text-sm md:text-[clamp(0.9rem,1.2vw,1rem)] text-center text-muted-foreground">
              {t("levelCategory.allGrammarTypesSelected")}
            </p>
            {isPhoneMobile ? (
              <motion.button
                type="button"
                onClick={() => {
                  setPendingWordTypes(selectedWordTypes);
                  setIsWordTypesModalOpen(true);
                }}
                className="filters-topics-open-button w-full rounded-xl border-2 border-primary/35 bg-card px-4 py-3 text-center text-primary font-semibold transition-all hover:bg-primary/5"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {t("levelCategory.types.filterButton")}
              </motion.button>
            ) : (
              <div
                className={
                  isLaptopFilterRange ? "relative w-fit mx-auto" : undefined
                }
              >
                <div className="flex flex-wrap justify-center gap-2 pb-0 mb-0 md:gap-[clamp(0.6rem,1.2vw,0.75rem)] lg:gap-[clamp(0.55rem,1vw,0.625rem)]">
                  {visibleWordTypes.map((typeId) => {
                    const isSelected = selectedWordTypes.includes(typeId);
                    const isDisabled = !hasWordsAfterWordTypeToggle(typeId);
                    return (
                      <motion.button
                        key={typeId}
                        disabled={isDisabled}
                        onClick={() => toggleWordType(typeId)}
                        className={`px-4 py-2 sm:px-6 sm:py-3 md:px-[clamp(1rem,1.8vw,1.5rem)] md:py-[clamp(0.55rem,1vw,0.75rem)] rounded-full border transition-all ${
                          isSelected
                            ? "border-primary bg-primary/5 text-primary shadow-md"
                            : "border-muted-foreground/20 bg-background text-foreground hover:border-primary/40"
                        } ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
                        whileHover={isDisabled ? undefined : { scale: 1.05 }}
                        whileTap={isDisabled ? undefined : { scale: 0.95 }}
                      >
                        <span className="text-sm md:text-[clamp(0.95rem,1.2vw,1rem)] font-medium">
                          {getWordTypeLabel(typeId)}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
                {isLaptopFilterRange && prioritizedWordTypes.length > 0 && (
                  <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2">
                    <button
                      className="inline-flex items-center gap-1.5 md:gap-[clamp(0.4rem,0.8vw,0.5rem)] px-2 py-1 text-sm md:text-[clamp(0.95rem,1.2vw,1rem)] text-primary hover:underline transition-all whitespace-nowrap"
                      onClick={() => {
                        setPendingWordTypes(selectedWordTypes);
                        setIsWordTypesModalOpen(true);
                      }}
                    >
                      <span>{t("levelCategory.types.showMore")}</span>
                      <ChevronDown className="w-4 h-4 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
            {!isPhoneMobile &&
              !isLaptopFilterRange &&
              prioritizedWordTypes.length > 0 && (
                <div
                  className={`flex mt-0 mb-0 sm:mt-1 ${
                    isLaptopFilterRange ? "justify-end" : "justify-center"
                  }`}
                >
                    <button
                      className="flex items-center gap-1.5 md:gap-[clamp(0.4rem,0.8vw,0.5rem)] text-sm md:text-[clamp(0.95rem,1.2vw,1rem)] text-primary hover:underline transition-all"
                      onClick={() => {
                        setPendingWordTypes(selectedWordTypes);
                        setIsWordTypesModalOpen(true);
                      }}
                    >
                      <>
                        <span className="hidden md:inline">
                          {isLaptopFilterRange
                            ? t("levelCategory.types.showMore")
                            : hiddenWordTypesCount > 0
                              ? `${t("levelCategory.types.showMoreWithCountPrefix")} (+${hiddenWordTypesCount})`
                              : t("levelCategory.types.showAll")}
                        </span>
                        <span className="md:hidden">
                          {t("levelCategory.types.showAllShort")}
                        </span>
                      <ChevronDown className="w-4 h-4 sm:w-4 sm:h-4" />
                    </>
                  </button>
                </div>
              )}

            {isWordTypesModalOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
                role="dialog"
                aria-modal="true"
                aria-label={t("levelCategory.wordTypes")}
                onClick={() => setIsWordTypesModalOpen(false)}
              >
                <div
                  className="w-full max-w-2xl max-h-[80vh] bg-card border border-border rounded-xl shadow-xl p-5"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-4 mb-4">
                    <h4 className="text-lg font-semibold text-foreground">
                      {t("levelCategory.wordTypes")}
                    </h4>
                    <button
                      className="text-muted-foreground hover:text-foreground transition"
                      onClick={() => setIsWordTypesModalOpen(false)}
                      aria-label={t("levelCategory.actions.close")}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2 overflow-y-auto max-h-[60vh] pr-1">
                    {prioritizedWordTypes.map((typeId) => {
                      const isSelected = pendingWordTypes.includes(typeId);
                      const isDisabled = !hasWordsAfterWordTypeToggle(
                        typeId,
                        pendingWordTypes,
                      );
                      return (
                        <motion.button
                          key={typeId}
                          disabled={isDisabled}
                          onClick={() => togglePendingWordType(typeId)}
                          className={`px-3 py-2 rounded-lg border-2 transition-all flex items-center gap-2 ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-lg shadow-primary/20"
                              : "border-border bg-card hover:border-primary/50"
                          } ${isDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
                          whileHover={{ scale: 1 }}
                          whileTap={{ scale: 1 }}
                        >
                          <span className="text-sm text-foreground">
                            {getWordTypeLabel(typeId)}
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <button
                      className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition"
                      onClick={() => setPendingWordTypes([])}
                    >
                      {t("levelCategory.actions.clear")}
                    </button>
                    <button
                      className="px-5 py-2 bg-card border-2 text-primary hover:bg-primary/5 rounded-lg transition-all shadow-sm"
                      style={{ borderColor: "#6366f14d" }}
                      disabled={
                        getFilteredWordCount(
                          selectedLevels,
                          selectedCategories,
                          pendingWordTypes,
                        ) === 0
                      }
                      onClick={() => {
                        setSelectedWordTypes(pendingWordTypes);
                        setIsWordTypesModalOpen(false);
                      }}
                    >
                      {t("levelCategory.actions.apply")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>

          {/* Continue Button */}
          <motion.div
            className="mt-auto pb-0 sm:mt-4 flex justify-center items-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
          >
            <motion.button
              onClick={onContinue}
              disabled={!hasWordsForCurrentFilters}
              style={{
                ...nextButtonStarFieldStyle,
                boxShadow:
                  "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)",
              }}
              className="filters-continue-button text-white px-12 py-4 md:px-[clamp(2.5rem,5vw,3rem)] md:py-[clamp(0.9rem,1.6vw,1rem)] text-lg md:text-[clamp(1rem,1.4vw,1.125rem)] rounded-xl sm:rounded-lg font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              whileHover={
                hasWordsForCurrentFilters
                  ? {
                      scale: 1.05,
                      boxShadow: "0 20px 40px #6366f14d",
                    }
                  : undefined
              }
              whileTap={hasWordsForCurrentFilters ? { scale: 0.95 } : undefined}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 17,
              }}
            >
              {hasAnyFilterSelected
                ? t("levelCategory.next")
                : t("levelCategory.skipToNext")}
            </motion.button>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}

