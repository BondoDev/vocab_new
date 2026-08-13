"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion } from "motion/react";
import "./styles/exercises.scss";
import { Volume2, ChevronDown, ChevronUp } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { ConnectWordsExercise } from "./exercises/ConnectWordsExercise";
import { ListeningExercise } from "./exercises/ListeningExercise";
import { BrokenWordExercise } from "./exercises/BrokenWordExercise";
import { WordTypingExercise } from "./exercises/WordTypingExercise";
import { HalfWrittenExercise } from "./exercises/HalfWrittenExercise";
import { shuffleArray } from "../../utils/shuffleArray";
import { highlightInflectedWords } from "./utils/highlightInflectedWords";
import {
  advanceTypingRepeatQueue,
  getEligibleTypingExercisesForWord,
  type TypingRepeatEntry,
} from "./utils/typingRepeatQueue";
import { PracticeHeader } from "./components/PracticeHeader";
import { PracticeLoading } from "./components/PracticeLoading";
import { PracticeEmptyState } from "./components/PracticeEmptyState";
import { PracticeResults } from "./components/PracticeResults";
import {
  exerciseCardBorders,
  type MotionCssVars,
} from "../../exercises/exerciseTheme";
import { FOUR_WORD_EXERCISE_IDS } from "../../exercises/exerciseIds";
import { createActiveWordTimer, type ActiveWordTimer } from "../../data/learning/activeWordTimer";
import { getStoredSupabaseSession } from "../../lib/supabaseAuth";
import { completeCustomPracticeWord } from "../../lib/customPracticeProgress";

type PracticeCardCssVars = MotionCssVars<"--practice-card-bg" | "--practice-card-border">;

const FOUR_WORD_EXERCISE_ID_SET = new Set<string>(FOUR_WORD_EXERCISE_IDS);

interface VocabularyPracticeProps {
  practiceLanguage: string;
  yourLanguage: string;
  selectedLevel: string;
  selectedLevels: string[];
  selectedCategories: string[];
  selectedWordTypes: string[];
  selectedExercises: string[];
  onBack: () => void;
  onGoFilters: () => void;
  // Practice List (My Lists Phase 3): when provided (non-empty), this exact
  // ordered set of concept ids is practiced instead of the level/category/
  // word-type-filtered vocabulary set below — selectedLevels/
  // selectedCategories/selectedWordTypes are ignored entirely in that case.
  // The order is trusted verbatim (never reshuffled here): My Lists'
  // setup dialog already resolved "Random" vs "List order" into this exact
  // sequence (see selectListPracticeWords in
  // src/features/user-profile/sections/my-lists/practiceListSelection.ts)
  // before this component ever mounts. This is still the same Custom
  // Practice engine/persistence path (completeCustomPracticeWord below) —
  // only which words are eligible changes; no SRS effect is introduced.
  restrictToConceptIds?: string[] | null;
}

const VOCABULARY_IMPORTERS: Record<string, () => Promise<any>> = {
  en: () => import("../../data/vocabulary/english/vocabulary.json"),
  es: () => import("../../data/vocabulary/spanish/vocabulary.json"),
  fr: () => import("../../data/vocabulary/french/vocabulary.json"),
  de: () => import("../../data/vocabulary/german/vocabulary.json"),
  it: () => import("../../data/vocabulary/italian/vocabulary.json"),
  pt: () => import("../../data/vocabulary/portuguese/vocabulary.json"),
  ru: () => import("../../data/vocabulary/russian/vocabulary.json"),
};

interface InflectedEntry {
  concept_id: string;
  // Naming varies by language data file (e.g. "word_inflected1" for English,
  // "word_inflected-1"/"word_inflected-2" for German) — only the exact
  // "word_inflected" key, present for several languages, is read here.
  word_inflected?: string;
}

function isInflectedEntry(value: unknown): value is InflectedEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { concept_id?: unknown }).concept_id === "string"
  );
}

const INFLECTED_IMPORTERS: Record<string, () => Promise<any>> = {
  en: () => import("../../data/inflected/english/inflected.json"),
  es: () => import("../../data/inflected/spanish/inflected.json"),
  fr: () => import("../../data/inflected/french/inflected.json"),
  de: () => import("../../data/inflected/german/inflected.json"),
  it: () => import("../../data/inflected/italian/inflected.json"),
  pt: () => import("../../data/inflected/portuguese/inflected.json"),
  ru: () => import("../../data/inflected/russian/inflected.json"),
};

export function VocabularyPractice({
  practiceLanguage,
  yourLanguage,
  selectedLevels,
  selectedCategories,
  selectedWordTypes,
  selectedExercises,
  onBack,
  onGoFilters,
  restrictToConceptIds,
}: VocabularyPracticeProps) {
  const { t } = useLanguage();
  const [words, setWords] = useState<any[]>([]);
  const [translations, setTranslations] = useState<{
    [key: string]: string;
  }>({});
  const [definitions, setDefinitions] = useState<{
    [key: string]: string;
  }>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSentence, setShowSentence] = useState(false);
  const [showDefinition, setShowDefinition] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [currentExerciseType, setCurrentExerciseType] =
    useState<string>("wordTyping");
  const [inflectedEntries, setInflectedEntries] = useState<any[]>([]);
  const [exerciseStatus, setExerciseStatus] = useState({
    isCorrect: false,
    hasTypedAnswer: false,
    usedShowWord: false,
    usedHintForBrokenWord: false,
  });
  const [cardBlinkKey, setCardBlinkKey] = useState(0);
  const [isCardSwitching, setIsCardSwitching] = useState(false);
  const [cycleWords, setCycleWords] = useState<any[]>([]);
  const [reinforcementWords, setReinforcementWords] = useState<any[]>([]);
  const [cycleStage, setCycleStage] = useState<"collection" | "reinforcement">(
    "collection",
  );
  const cardSwitchTimeoutRef = useRef<number | null>(null);
  const forcedTypingRepeatQueueRef = useRef<TypingRepeatEntry[]>([]);
  const resumeIndexAfterForcedRepeatRef = useRef<number | null>(null);
  // Active-time tracking for Custom Practice (Phase 1): one shared timer
  // instance per component (lazily created once — same pattern as
  // NewWordStudySession.tsx/ReviewSession.tsx, see either file's own
  // comment for why the `if (current === null)` guard is what matters
  // under StrictMode), reset+restarted per single-word exercise. Only
  // brokenWord/halfWritten/wordTyping (single-word typing exercises) are
  // timed and persisted — connectWords/listening (four-word group
  // exercises) are excluded in this phase, matching Review Words' own
  // precedent of never persisting its group exercises.
  const customPracticeTimerRef = useRef<ActiveWordTimer | null>(null);
  if (customPracticeTimerRef.current === null) {
    customPracticeTimerRef.current = createActiveWordTimer();
  }
  // Fresh per-exercise-encounter id, minted alongside the timer reset below
  // and reused for exactly one completeCustomPracticeWord call — never
  // regenerated for the same on-screen exercise, so a duplicate submission
  // (e.g. a StrictMode double-invoked effect) is idempotent server-side.
  const customPracticeEventIdRef = useRef<string | null>(null);
  const isUsableLemma = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0 && value.trim() !== "-";

  const isFourWordExercise = useCallback(
    (exerciseType: string) => FOUR_WORD_EXERCISE_ID_SET.has(exerciseType),
    [],
  );
  const typingExerciseTypes = useMemo(
    () => selectedExercises.filter((exercise) => !isFourWordExercise(exercise)),
    [isFourWordExercise, selectedExercises],
  );
  const reinforcementExerciseTypes = useMemo(
    () => selectedExercises.filter((exercise) => isFourWordExercise(exercise)),
    [isFourWordExercise, selectedExercises],
  );
  const isCycleModeEnabled = typingExerciseTypes.length > 0;
  const getNonFourWordFallback = useCallback(
    () =>
      selectedExercises.find((exercise) => !isFourWordExercise(exercise)) ||
      "wordTyping",
    [isFourWordExercise, selectedExercises],
  );
  const pickRandomExercise = useCallback((exerciseTypes: string[]) => {
    if (exerciseTypes.length === 0) {
      return null;
    }
    const randomIndex = Math.floor(Math.random() * exerciseTypes.length);
    return exerciseTypes[randomIndex];
  }, []);

  // Track detailed attempt history for statistics
  const [attemptHistory, setAttemptHistory] = useState<
    Array<{
      conceptId: string;
      level: string;
      type: string;
      result: "correct" | "incorrect" | "skipped";
      wasTyped: boolean;
      wasRevealed: boolean;
    }>
  >([]);

  // Helper function to randomly select next exercise type from enabled exercises
  const selectRandomExercise = useCallback(() => {
    return pickRandomExercise(selectedExercises) ?? "wordTyping";
  }, [pickRandomExercise, selectedExercises]);

  // Helper function to check if word is eligible for current exercise type
  const isWordEligibleForExercise = useCallback(
    (word: any, exerciseType: string): boolean => {
      if (exerciseType === "halfWritten") {
        // Half-written exercise only uses words with 4+ letters
        return word.word_lemma.length >= 4;
      }
      if (exerciseType === "brokenWord") {
        // Broken-word exercise only uses words with 5+ letters
        return word.word_lemma.length >= 5;
      }
      // Full word typing accepts all words
      return true;
    },
    [],
  );
  const getNextLinearIndex = useCallback(
    (index: number) => (index < words.length - 1 ? index + 1 : 0),
    [words.length],
  );
  const getNextCollectionIndex = useCallback(
    (index: number) =>
      resumeIndexAfterForcedRepeatRef.current ?? getNextLinearIndex(index),
    [getNextLinearIndex],
  );
  const clearPendingResumeIndex = useCallback(() => {
    resumeIndexAfterForcedRepeatRef.current = null;
  }, []);
  const selectTypingExerciseForWord = useCallback(
    (word: any) =>
      pickRandomExercise(
        getEligibleTypingExercisesForWord(
          word,
          typingExerciseTypes,
          isWordEligibleForExercise,
        ),
      ),
    [isWordEligibleForExercise, pickRandomExercise, typingExerciseTypes],
  );
  const getRandomRepeatDelay = useCallback(
    () => 3 + Math.floor(Math.random() * 3),
    [],
  );
  useEffect(() => {
    // Dynamically load the words for the practice language and user's language
    const loadWords = async () => {
      setIsLoading(true);
      try {
        const normalizedPracticeLanguage = (practiceLanguage ?? "").trim();
        const normalizedYourLanguage = (yourLanguage ?? "").trim();

        // Wait until both languages are initialized.
        if (!normalizedPracticeLanguage || !normalizedYourLanguage) {
          setWords([]);
          setTranslations({});
          setDefinitions({});
          setInflectedEntries([]);
          return;
        }

        if (
          !VOCABULARY_IMPORTERS[normalizedPracticeLanguage] ||
          !VOCABULARY_IMPORTERS[normalizedYourLanguage]
        ) {
          console.warn(
            `Unsupported language: ${normalizedPracticeLanguage} or ${normalizedYourLanguage}`,
          );
          setWords([]);
          return;
        }

        const [practiceModule, yourLangModule, inflectedModule] = await Promise.all([
          VOCABULARY_IMPORTERS[normalizedPracticeLanguage](),
          VOCABULARY_IMPORTERS[normalizedYourLanguage](),
          (INFLECTED_IMPORTERS[normalizedPracticeLanguage]
            ? INFLECTED_IMPORTERS[normalizedPracticeLanguage]!().catch(() => ({ default: [] }))
            : Promise.resolve({ default: [] })),
        ]);

        let loadedWords = Array.isArray(practiceModule.default)
          ? practiceModule.default
          : [];
        const yourLangWords = Array.isArray(yourLangModule.default)
          ? yourLangModule.default
          : [];

        const validPracticeConceptIds = new Set(
          loadedWords
            .filter(
              (word: any) =>
                word?.concept_id && isUsableLemma(word?.word_lemma),
            )
            .map((word: any) => String(word.concept_id)),
        );

        // Create prompt map (user's language words) using concept_id
        const translationMap: { [key: string]: string } = {};
        const definitionMap: { [key: string]: string } = {};
        yourLangWords.forEach((word: any) => {
          const conceptId = String(word?.concept_id ?? "");
          if (!conceptId || !validPracticeConceptIds.has(conceptId)) return;
          if (!isUsableLemma(word?.word_lemma)) return;
          translationMap[word.concept_id] = word.word_lemma;
          definitionMap[word.concept_id] =
            word.definition || word.definiton || "";
        });
        setTranslations(translationMap);
        setDefinitions(definitionMap);

        const validConceptIds = new Set(Object.keys(translationMap));
        loadedWords = loadedWords.filter(
          (word: any) =>
            word?.concept_id &&
            validConceptIds.has(String(word.concept_id)) &&
            isUsableLemma(word?.word_lemma),
        );

        const loadedInflectedEntries: InflectedEntry[] = Array.isArray(inflectedModule.default)
          ? inflectedModule.default.filter(isInflectedEntry)
          : [];
        setInflectedEntries(loadedInflectedEntries);

        // Apply inflected forms to loadedWords if available (especially for English)
        if (loadedInflectedEntries.length > 0) {
          const inflectedByConceptId = new Map<string, InflectedEntry>(
            loadedInflectedEntries.map((entry) => [entry.concept_id, entry]),
          );
          loadedWords = loadedWords.map((word: any) => {
            const inflected = inflectedByConceptId.get(word.concept_id);
            return {
              ...word,
              word_inflected: inflected?.word_inflected || word.word_lemma,
            };
          });
        }

        const hasConceptIdRestriction = Boolean(restrictToConceptIds && restrictToConceptIds.length > 0);

        if (hasConceptIdRestriction) {
          // Practice List: restrict to exactly this ordered concept-id set —
          // level/category/word-type filters do not apply (My Lists' setup
          // dialog exposes none of them; a list may legitimately span
          // multiple levels/categories/types). Reorder to match the caller's
          // exact sequence (Array.filter preserves vocabulary.json's own
          // order, not the caller's), so "List order" and an already-
          // shuffled "Random" selection both survive verbatim.
          const wordByConceptId = new Map(
            loadedWords.map((word: any) => [String(word.concept_id), word]),
          );
          loadedWords = restrictToConceptIds!
            .map((conceptId) => wordByConceptId.get(conceptId))
            .filter((word: any): word is any => Boolean(word));
        } else {
          // Filter by levels if selected (multiple levels)
          if (selectedLevels.length > 0) {
            loadedWords = loadedWords.filter((word: any) =>
              selectedLevels.includes(word.level),
            );
          }

          // Filter by categories if selected
          if (selectedCategories.length > 0) {
            loadedWords = loadedWords.filter((word: any) =>
              selectedCategories.includes(word.category),
            );
          }

          // Filter by word types if selected
          if (selectedWordTypes.length > 0) {
            loadedWords = loadedWords.filter((word: any) =>
              selectedWordTypes.includes(word.type),
            );
          }
        }

        // Shuffle the words to randomize order — skipped for a concept-id
        // restriction, whose order is already final (see above).
        const shuffledWords = hasConceptIdRestriction ? loadedWords : shuffleArray(loadedWords);
        forcedTypingRepeatQueueRef.current = [];
        resumeIndexAfterForcedRepeatRef.current = null;
        setCycleWords([]);
        setReinforcementWords([]);
        setCycleStage("collection");
        setWords(shuffledWords);

        // Select initial exercise type
        let initialExercise = isCycleModeEnabled
          ? selectTypingExerciseForWord(shuffledWords[0])
          : selectRandomExercise();
        let initialIndex = 0;
        if (!initialExercise && isCycleModeEnabled) {
          for (let i = 0; i < shuffledWords.length; i += 1) {
            const candidateExercise = selectTypingExerciseForWord(shuffledWords[i]);
            if (candidateExercise) {
              initialIndex = i;
              initialExercise = candidateExercise;
              break;
            }
          }
        }
        if (!initialExercise) {
          initialExercise = "wordTyping";
        }
        if (!isCycleModeEnabled && isFourWordExercise(initialExercise) && shuffledWords.length < 4) {
          initialExercise = getNonFourWordFallback();
        }
        setCurrentIndex(initialIndex);
        setCurrentExerciseType(initialExercise);
      } catch (error) {
        console.error("Error loading words:", error);
        // Fallback to empty array
        setWords([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadWords();
  }, [
    practiceLanguage,
    yourLanguage,
    selectedLevels,
    selectedCategories,
    selectedWordTypes,
    restrictToConceptIds,
    selectRandomExercise,
    selectTypingExerciseForWord,
    isCycleModeEnabled,
    getNonFourWordFallback,
    isFourWordExercise,
  ]);

  const currentWord = words[currentIndex];
  const currentReinforcementWords =
    cycleStage === "reinforcement" ? reinforcementWords : null;
  const currentPrompt = currentWord ? translations[currentWord.concept_id] : ""; // Word in user's language
  const currentDefinition = currentWord
    ? definitions[currentWord.concept_id]
    : ""; // Definition in user's language
  const highlightedSentence = useMemo(() => {
    if (!currentWord) return "";
    const sentence =
      typeof currentWord.sentence === "string" ? currentWord.sentence : "";
    if (!sentence) return "";
    const relevantEntries = inflectedEntries.filter(
      (entry) => entry?.concept_id === currentWord.concept_id,
    );
    return highlightInflectedWords(sentence, practiceLanguage, relevantEntries);
  }, [currentWord, practiceLanguage, inflectedEntries]);

  useEffect(() => {
    setExerciseStatus({
      isCorrect: false,
      hasTypedAnswer: false,
      usedShowWord: false,
      usedHintForBrokenWord: false,
    });
  }, [currentExerciseType, currentIndex]);

  // Starts a fresh timer + fresh event id for every new single-word
  // exercise presentation — keyed on cardBlinkKey (not just
  // currentIndex/currentExerciseType) because a forced repeat can re-show
  // the exact same word+exercise combination later in the session;
  // cardBlinkKey increments on every handleNext call (see below), so it's
  // the true "this is a new on-screen exercise instance" signal, matching
  // the visual remount key each exercise component already uses. Four-word
  // group exercises (connectWords/listening) never start a timer — see this
  // file's own header comment on customPracticeTimerRef above.
  useEffect(() => {
    if (isLoading || words.length === 0 || isFourWordExercise(currentExerciseType)) {
      return;
    }
    customPracticeTimerRef.current?.reset();
    customPracticeTimerRef.current?.start();
    customPracticeEventIdRef.current = crypto.randomUUID();
  }, [currentIndex, currentExerciseType, cardBlinkKey, isLoading, words.length, isFourWordExercise]);

  // Stops accumulation and detaches the visibility listener on unmount/
  // navigation (Back, route change) — same precedent as
  // NewWordStudySession.tsx/ReviewSession.tsx.
  useEffect(() => {
    return () => {
      customPracticeTimerRef.current?.dispose();
    };
  }, []);

  const runNextStep = (wasExplicitSkip = false) => {
    let result: "correct" | "incorrect" | "skipped";
    const wasTyped = exerciseStatus.hasTypedAnswer;
    const wasRevealed = exerciseStatus.usedShowWord;

    // Freeze + persist this single-word exercise's active duration the
    // instant it's being left — regardless of correct/incorrect/revealed/
    // skipped outcome (per the confirmed Phase 1 scope: every completed
    // single-word exercise advance is one timed event). Four-word group
    // exercises are excluded — no timer was ever started for them above, so
    // there is nothing to freeze. This never blocks advancing to the next
    // exercise: unlike Study New Words/Review Words, Custom Practice has no
    // save-boundary screen today, and this phase does not add one — the
    // RPC call is fire-and-forget, its own idempotency (event id) is what
    // keeps a lost/duplicated call safe, not a blocking retry UI.
    if (currentWord && !isFourWordExercise(currentExerciseType)) {
      const customPracticeTimeSeconds = customPracticeTimerRef.current?.freeze() ?? 0;
      const eventId = customPracticeEventIdRef.current;
      const session = getStoredSupabaseSession();
      if (eventId && session) {
        void completeCustomPracticeWord({
          session,
          eventId,
          targetLanguage: practiceLanguage,
          customPracticeTimeSeconds,
        }).catch((error) => {
          // Best-effort: a failed practice-time save never surfaces to the
          // UI or blocks the exercise flow in this phase — only logged for
          // diagnostics, matching completeNewWordStudy/completeWordReview's
          // own structured-diagnostics-only-on-failure precedent.
          console.warn("VocabularyPractice: failed to save custom practice time.", error);
        });
      }
    }

    if (isFourWordExercise(currentExerciseType)) {
      result = exerciseStatus.isCorrect ? "correct" : "skipped";
    } else if (
      exerciseStatus.usedShowWord ||
      exerciseStatus.usedHintForBrokenWord
    ) {
      result = "incorrect";
    } else if (currentExerciseType === "brokenWord") {
      result = exerciseStatus.isCorrect ? "correct" : "skipped";
    } else if (exerciseStatus.hasTypedAnswer) {
      result = exerciseStatus.isCorrect ? "correct" : "incorrect";
    } else {
      result = "skipped";
    }

    if (isFourWordExercise(currentExerciseType)) {
      const fourWords =
        currentReinforcementWords ?? words.slice(currentIndex, currentIndex + 4);
      const newAttempts = fourWords.slice(0, 4).map((word) => ({
        conceptId: String(word.concept_id),
        level: word.level,
        type: word.type,
        result,
        wasTyped: false,
        wasRevealed: false,
      }));
      setAttemptHistory((prev) => [...prev, ...newAttempts]);
    } else if (currentWord) {
      setAttemptHistory((prev) => [
        ...prev,
        {
          conceptId: String(currentWord.concept_id),
          level: currentWord.level,
          type: currentWord.type,
          result,
          wasTyped,
          wasRevealed,
        },
      ]);
    }

    const shouldScheduleRepeat =
      !wasExplicitSkip &&
      exerciseStatus.usedShowWord &&
      !isFourWordExercise(currentExerciseType);
    const { queue: advancedQueue, dueConceptId: dueRepeatConceptId } =
      advanceTypingRepeatQueue({
        queue: forcedTypingRepeatQueueRef.current,
        currentExerciseType,
        currentConceptId:
          currentWord?.concept_id !== undefined &&
          currentWord?.concept_id !== null
            ? String(currentWord.concept_id)
            : null,
        shouldScheduleRepeat,
        repeatDelayTypingExercises: getRandomRepeatDelay(),
      });
    forcedTypingRepeatQueueRef.current = advancedQueue;

    setShowSentence(false);
    setShowDefinition(false);
    setExerciseStatus({
      isCorrect: false,
      hasTypedAnswer: false,
      usedShowWord: false,
      usedHintForBrokenWord: false,
    });

    const moveToNextCollectionTyping = () => {
      let resolvedNextIndex = getNextCollectionIndex(currentIndex);
      if (resumeIndexAfterForcedRepeatRef.current !== null) {
        clearPendingResumeIndex();
      }

      let nextWord = words[resolvedNextIndex];
      let nextExercise = nextWord
        ? selectTypingExerciseForWord(nextWord)
        : null;

      if (dueRepeatConceptId) {
        const repeatedWordIndex = words.findIndex(
          (word) => String(word?.concept_id ?? "") === dueRepeatConceptId,
        );
        if (repeatedWordIndex !== -1) {
          const repeatedWord = words[repeatedWordIndex];
          const repeatedExercise = selectTypingExerciseForWord(repeatedWord);
          if (repeatedExercise) {
            if (repeatedWordIndex !== resolvedNextIndex) {
              resumeIndexAfterForcedRepeatRef.current = resolvedNextIndex;
            }
            resolvedNextIndex = repeatedWordIndex;
            nextWord = repeatedWord;
            nextExercise = repeatedExercise;
          }
        }
      }

      if (!nextExercise && words.length > 0) {
        for (let i = 0; i < words.length; i += 1) {
          const checkIndex = (resolvedNextIndex + i) % words.length;
          const candidateWord = words[checkIndex];
          const candidateExercise = selectTypingExerciseForWord(candidateWord);
          if (candidateExercise) {
            resolvedNextIndex = checkIndex;
            nextWord = candidateWord;
            nextExercise = candidateExercise;
            break;
          }
        }
      }

      if (!nextWord) {
        setSessionComplete(true);
        return;
      }

      setCycleStage("collection");
      setCurrentIndex(resolvedNextIndex);
      setCurrentExerciseType(nextExercise ?? "wordTyping");
    };

    if (!isCycleModeEnabled) {
      let nextIndex;
      if (resumeIndexAfterForcedRepeatRef.current !== null) {
        nextIndex = resumeIndexAfterForcedRepeatRef.current;
        resumeIndexAfterForcedRepeatRef.current = null;
      } else if (isFourWordExercise(currentExerciseType)) {
        nextIndex = currentIndex + 4 < words.length ? currentIndex + 4 : 0;
      } else {
        nextIndex = getNextLinearIndex(currentIndex);
      }

      let resolvedNextIndex = nextIndex;
      let nextExercise = selectRandomExercise();
      let nextWord = words[resolvedNextIndex];

      if (isFourWordExercise(nextExercise)) {
        if (resolvedNextIndex + 4 > words.length) {
          nextExercise = getNonFourWordFallback();
        }
      } else if (nextWord && !isWordEligibleForExercise(nextWord, nextExercise)) {
        for (let i = 0; i < words.length; i += 1) {
          const checkIndex = (resolvedNextIndex + i) % words.length;
          if (isWordEligibleForExercise(words[checkIndex], nextExercise)) {
            resolvedNextIndex = checkIndex;
            nextWord = words[checkIndex];
            break;
          }
        }
      }

      setCurrentIndex(resolvedNextIndex);
      setCurrentExerciseType(nextExercise);
      return;
    }

    if (cycleStage === "reinforcement") {
      setCycleWords([]);
      setReinforcementWords([]);
      moveToNextCollectionTyping();
      return;
    }

    const shouldAddToCycle =
      Boolean(currentWord) &&
      (exerciseStatus.isCorrect ||
        exerciseStatus.usedShowWord ||
        exerciseStatus.usedHintForBrokenWord);

    const nextCycleWords = shouldAddToCycle
      ? cycleWords.some(
          (word) =>
            String(word?.concept_id ?? "") ===
            String(currentWord?.concept_id ?? ""),
        )
        ? cycleWords
        : [...cycleWords, currentWord]
      : cycleWords;

    setCycleWords(nextCycleWords);

    if (nextCycleWords.length === 4) {
      setReinforcementWords(nextCycleWords);

      const nextCollectionIndex = getNextCollectionIndex(currentIndex);
      if (resumeIndexAfterForcedRepeatRef.current === null) {
        resumeIndexAfterForcedRepeatRef.current = nextCollectionIndex;
      }

      if (reinforcementExerciseTypes.length > 0) {
        setCycleStage("reinforcement");
        setCurrentExerciseType(
          pickRandomExercise(reinforcementExerciseTypes) ?? "connectWords",
        );
        return;
      }

      setCycleWords([]);
      setReinforcementWords([]);
    }

    moveToNextCollectionTyping();
  };

  const handleNext = () => {
    if (isCardSwitching) return;
    // Moving to the next exercise is a genuine interaction — refreshes the
    // active-time idle deadline (see activeWordTimer.ts's own header).
    // Fired here (once per Next action, whether by click or the Enter-key
    // handler below) rather than inside runNextStep itself, since this is
    // the single point every "advance" path already funnels through.
    customPracticeTimerRef.current?.recordInteraction();
    setIsCardSwitching(true);

    if (cardSwitchTimeoutRef.current !== null) {
      window.clearTimeout(cardSwitchTimeoutRef.current);
    }

    cardSwitchTimeoutRef.current = window.setTimeout(() => {
      setCardBlinkKey((prev) => prev + 1);
      runNextStep(!isNextActionAvailable);
      setIsCardSwitching(false);
      cardSwitchTimeoutRef.current = null;
    }, 180);
  };

  const handleSwitchListeningToConnectWords = () => {
    if (currentExerciseType !== "listening" || isCardSwitching) return;
    setShowSentence(false);
    setShowDefinition(false);
    setExerciseStatus({
      isCorrect: false,
      hasTypedAnswer: false,
      usedShowWord: false,
      usedHintForBrokenWord: false,
    });
    setCurrentExerciseType("connectWords");
  };

  const isNextActionAvailable =
    isFourWordExercise(currentExerciseType) ||
    currentExerciseType === "brokenWord"
      ? exerciseStatus.isCorrect
      : exerciseStatus.isCorrect ||
        exerciseStatus.usedShowWord ||
        exerciseStatus.usedHintForBrokenWord;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== "Enter" ||
        event.repeat ||
        event.shiftKey ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      ) {
        return;
      }
      if (!isNextActionAvailable || isCardSwitching) {
        return;
      }
      event.preventDefault();
      handleNext();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isNextActionAvailable, isCardSwitching, handleNext]);

  const handleFinishTest = () => {
    setSessionComplete(true);
  };

  // Calculate statistics for the matrix table
  const calculateStatistics = () => {
    // Get unique levels and types from attempt history
    const levels = [...new Set(attemptHistory.map((a) => a.level))].sort();
    const types = [...new Set(attemptHistory.map((a) => a.type))].sort();

    // Build matrix data
    const matrix: {
      [level: string]: {
        [type: string]: {
          guessed: number;
          total: number;
        };
      };
    } = {};

    // Initialize matrix
    levels.forEach((level) => {
      matrix[level] = {};
      types.forEach((type) => {
        matrix[level][type] = {
          guessed: 0,
          total: 0,
        };
      });
    });

    // Populate matrix with attempt data
    attemptHistory.forEach((attempt) => {
      const cell = matrix[attempt.level]?.[attempt.type];
      if (cell) {
        if (attempt.result === "correct") {
          cell.guessed++;
        }
        if (attempt.result !== "skipped") {
          cell.total++;
        }
      }
    });

    return { levels, types, matrix };
  };

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

  const sessionWords = useMemo(() => {
    const wordsByConceptId = new Map(
      words.map((word) => [String(word?.concept_id ?? ""), word]),
    );
    const sessionWordMap = new Map<
      string,
      {
        conceptId: string;
        nativeWord: string;
        targetWord: string;
        wordType: string;
        wordTopic: string;
        status: "guessed" | "viewed" | "skipped";
      }
    >();

    attemptHistory.forEach((attempt) => {
      const matchedWord = wordsByConceptId.get(attempt.conceptId);
      if (!matchedWord) {
        return;
      }

      const previousEntry = sessionWordMap.get(attempt.conceptId);
      const nextStatus = attempt.wasTyped
        ? "guessed"
        : attempt.wasRevealed
          ? "viewed"
          : attempt.result === "skipped"
            ? "skipped"
            : null;

      if (!nextStatus && !previousEntry) {
        return;
      }

      sessionWordMap.set(attempt.conceptId, {
        conceptId: attempt.conceptId,
        nativeWord: translations[attempt.conceptId] ?? "",
        targetWord: matchedWord.word_lemma ?? "",
        wordType: matchedWord.type ? getWordTypeLabel(matchedWord.type) : "",
        wordTopic: matchedWord.category ?? "",
        status:
          previousEntry?.status === "guessed" || nextStatus === "guessed"
            ? "guessed"
            : previousEntry?.status === "viewed" || nextStatus === "viewed"
              ? "viewed"
              : "skipped",
      });
    });

    return Array.from(sessionWordMap.values());
  }, [attemptHistory, getWordTypeLabel, translations, words]);

  const handleStartAgain = () => {
    // Shuffle words for a new random order
    const shuffledWords = shuffleArray(words);
    forcedTypingRepeatQueueRef.current = [];
    resumeIndexAfterForcedRepeatRef.current = null;
    setWords(shuffledWords);

    // Reset all states
    setCurrentIndex(0);
    setShowSentence(false);
    setShowDefinition(false);
    setSessionComplete(false);
    setAttemptHistory([]);
    setCycleWords([]);
    setReinforcementWords([]);
    setCycleStage("collection");
    setExerciseStatus({
      isCorrect: false,
      hasTypedAnswer: false,
      usedShowWord: false,
      usedHintForBrokenWord: false,
    });
    setCardBlinkKey((prev) => prev + 1);

    // Select initial exercise type for the new session
    let initialExercise = isCycleModeEnabled
      ? selectTypingExerciseForWord(shuffledWords[0])
      : selectRandomExercise();
    if (!initialExercise && isCycleModeEnabled) {
      for (let i = 0; i < shuffledWords.length; i += 1) {
        const candidateExercise = selectTypingExerciseForWord(shuffledWords[i]);
        if (candidateExercise) {
          setCurrentIndex(i);
          initialExercise = candidateExercise;
          break;
        }
      }
    }
    if (!initialExercise) {
      initialExercise = "wordTyping";
    }
    if (!isCycleModeEnabled && isFourWordExercise(initialExercise) && shuffledWords.length < 4) {
      initialExercise = getNonFourWordFallback();
    }
    setCurrentExerciseType(initialExercise);
  };

  useEffect(() => {
    return () => {
      if (cardSwitchTimeoutRef.current !== null) {
        window.clearTimeout(cardSwitchTimeoutRef.current);
      }
    };
  }, []);

  const speakWord = () => {
    if (currentWord) {
      speakSpecificWord(currentWord.word_lemma);
    }
  };

  const speakSpecificWord = (word: string) => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = getLanguageCode(practiceLanguage);
      window.speechSynthesis.speak(utterance);
    }
  };

  const getLanguageCode = (code: string): string => {
    const langMap: { [key: string]: string } = {
      en: "en-US",
      es: "es-ES",
      fr: "fr-FR",
      de: "de-DE",
      it: "it-IT",
      pt: "pt-PT",
      ru: "ru-RU",
    };
    return langMap[code] || "en-US";
  };

  const getLanguageName = (code: string): string => {
    const normalized = code.trim().toLowerCase();
    const aliases: Record<string, string> = {
      en: "en",
      "en-us": "en",
      english: "en",
      es: "es",
      "es-es": "es",
      spanish: "es",
      espanol: "es",
      fr: "fr",
      "fr-fr": "fr",
      french: "fr",
      francais: "fr",
      de: "de",
      "de-de": "de",
      german: "de",
      deutsch: "de",
      it: "it",
      "it-it": "it",
      italian: "it",
      italiano: "it",
      pt: "pt",
      "pt-pt": "pt",
      portuguese: "pt",
      portugues: "pt",
      ru: "ru",
      "ru-ru": "ru",
      russian: "ru",
      russkiy: "ru",
    };
    const key = aliases[normalized] ?? normalized;
    const translated = t(`languageNames.${key}`);
    if (!translated || translated === `languageNames.${key}`) {
      return code;
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
    if (!translated || translated === `levelCategory.topicNames.${categoryId}`) {
      return formatCategoryLabel(categoryId);
    }
    return translated;
  };

  const getExerciseInstruction = () => {
    if (currentExerciseType === "connectWords") {
      return `${t("practice.connectInstructionPrefix")} ${getLanguageName(practiceLanguage)}, ${t("practice.connectInstructionThen")} ${getLanguageName(yourLanguage)}`;
    }
    if (currentExerciseType === "listening") {
      return `${t("practice.listeningInstructionPrefix")} ${getLanguageName(practiceLanguage)}, ${t("practice.connectInstructionThen")} ${getLanguageName(yourLanguage)}`;
    }
    if (currentExerciseType === "halfWritten") {
      return t("practice.halfWrittenInstruction");
    }
    if (currentExerciseType === "brokenWord") {
      return t("practice.brokenWordInstruction");
    }
    return t("practice.wordTypingInstruction");
  };

  if (isLoading) {
    return <PracticeLoading message={t("practice.loadingWords")} />;
  }

  if (words.length === 0) {
    return <PracticeEmptyState onBack={onBack} />;
  }

  const practiceCardStyle: PracticeCardCssVars = {
    "--practice-card-bg": "#F8FAFC",
    "--practice-card-border": exerciseCardBorders[currentExerciseType] ?? "#7A68D8",
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PracticeHeader
        onBack={onBack}
        onStartAgain={handleStartAgain}
        sessionComplete={sessionComplete}
        onFinishTest={handleFinishTest}
        getLanguageName={getLanguageName}
        yourLanguage={yourLanguage}
        practiceLanguage={practiceLanguage}
      />

      {/* Main Content */}
      <main
        className="practice-main flex-1 flex items-center justify-center px-4 py-8 md:py-12
             transition-[padding,margin] duration-300 ease-in-out"
      >
        <div className="practice-card-shell w-full max-w-2xl">
          {sessionComplete ? (
            <PracticeResults
              attemptHistory={attemptHistory}
              stats={calculateStatistics()}
              sessionWords={sessionWords}
              yourLanguageLabel={getLanguageName(yourLanguage)}
              practiceLanguageLabel={getLanguageName(practiceLanguage)}
            />
          ) : (
            <>
              {/* Practice Card */}
              {currentWord && (
                <motion.div
                    key={`${currentIndex}-${currentExerciseType}-${cardBlinkKey}`}
                    className={`practice-card bg-card border border-border rounded-2xl p-3 md:p-5 shadow-sm transition-all duration-300 ease-in-out flex flex-col relative ${
                      isCardSwitching ? "practice-card-switching" : ""
                    }`}
                    style={practiceCardStyle}
                >
                  <p
                    className={`mx-auto max-w-[34rem] text-center text-sm text-gray-500 leading-relaxed font-medium ${
                      isFourWordExercise(currentExerciseType) ? "mb-4" : "mb-0"
                    }`}
                  >
                    {getExerciseInstruction()}
                  </p>
                  {currentExerciseType === "listening" && (
                    <button
                      type="button"
                      onClick={handleSwitchListeningToConnectWords}
                      disabled={isCardSwitching}
                      className="exercise-switch-listening-button"
                    >
                      {t("practice.switchToConnectWords")}
                    </button>
                  )}
                  {!isFourWordExercise(currentExerciseType) && (
                    <div className="w-[95%] mx-auto pt-2 md:pt-3">
                      <div className="exercise-meta-row flex items-center justify-between">
                        <div
                          className="exercise-meta-cefr min-w-[2.25rem] h-9 px-2 inline-flex items-center justify-center rounded-full text-sm font-semibold uppercase border-2 text-muted-foreground/70"
                          style={{
                            borderColor: "rgba(74, 43, 130, 0.35)",
                          }}
                        >
                          {currentWord?.level ?? ""}
                        </div>
                        <div className="exercise-meta-category text-sm font-semibold uppercase text-muted-foreground/70 text-right">
                          {currentWord?.category
                            ? getCategoryLabel(currentWord.category)
                            : ""}
                        </div>
                      </div>
                      <div className="exercise-meta-word-type mt-4 text-center text-lg font-semibold text-muted-foreground">
                        {currentWord?.type
                          ? getWordTypeLabel(currentWord.type)
                          : ""}
                      </div>
                    </div>
                  )}

                  <div
                    className={`exercise-main-content flex-1 ${
                      isFourWordExercise(currentExerciseType)
                        ? "pt-0 md:pt-0 flex items-center justify-center"
                        : "pt-0"
                    }`}
                  >
                    {/* Main Word Area */}
                    <div
                      className={`exercise-word-area space-y-6 ${
                        isFourWordExercise(currentExerciseType)
                          ? "flex-1 w-full flex items-center justify-center mb-0"
                          : "mb-0"
                      }`}
                    >
                      {/* Word in User's Language - Always Visible (hide for pairing exercises) */}
                      {!isFourWordExercise(currentExerciseType) && (
                        <div className="exercise-guess-word-container min-h-[60px] flex items-center justify-center">
                          <div className="text-center">
                            <h2 className="exercise-guess-word text-4xl md:text-5xl font-bold text-foreground">
                              {currentPrompt}
                            </h2>
                          </div>
                        </div>
                      )}

                      {/* Input Field / Broken-word Unified Field / Pairing Exercises */}
                      {currentExerciseType === "connectWords" ? (
                        <ConnectWordsExercise
                          words={words}
                          currentIndex={currentIndex}
                          exerciseWords={currentReinforcementWords ?? undefined}
                          translations={translations}
                          sourceLabel={getLanguageName(practiceLanguage)}
                          targetLabel={getLanguageName(yourLanguage)}
                          onSpeakWord={speakSpecificWord}
                          onStatusChange={setExerciseStatus}
                        />
                      ) : currentExerciseType === "listening" ? (
                        <ListeningExercise
                          words={words}
                          currentIndex={currentIndex}
                          exerciseWords={currentReinforcementWords ?? undefined}
                          translations={translations}
                          sourceLabel={getLanguageName(practiceLanguage)}
                          targetLabel={getLanguageName(yourLanguage)}
                          onSpeakWord={speakSpecificWord}
                          onStatusChange={setExerciseStatus}
                        />
                      ) : currentExerciseType === "brokenWord" ? (
                        <BrokenWordExercise
                          currentWord={currentWord}
                          speakWord={speakWord}
                          onStatusChange={setExerciseStatus}
                        />
                      ) : currentExerciseType === "halfWritten" ? (
                        <HalfWrittenExercise
                          currentWord={currentWord}
                          currentPrompt={currentPrompt}
                          practiceLanguage={practiceLanguage}
                          speakWord={speakWord}
                          onStatusChange={setExerciseStatus}
                        />
                      ) : (
                        <WordTypingExercise
                          currentWord={currentWord}
                          currentPrompt={currentPrompt}
                          practiceLanguage={practiceLanguage}
                          speakWord={speakWord}
                          onStatusChange={setExerciseStatus}
                        />
                      )}
                    </div>

                    {/* Expandable Help Sections - Hide for pairing exercises */}
                    {!isFourWordExercise(currentExerciseType) && (
                      <div className="exercise-help-sections space-y-2 mb-4 sm:mb-6 md:mb-8">
                        {/* See Definition */}
                        <div className="border border-border rounded-lg overflow-hidden">
                          <button
                            onClick={() => setShowDefinition(!showDefinition)}
                            className="exercise-see-definition-button w-full flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm hover:bg-muted active:bg-muted/80 transition-colors text-left"
                          >
                            <span className="font-medium">
                              {t("practice.seeDefinition")}
                            </span>
                            {showDefinition ? (
                              <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                            )}
                          </button>

                          {/* Definition content with smooth max-height transition */}
                          <div
                            className="transition-all duration-300 ease-in-out overflow-hidden"
                            style={{
                              maxHeight: showDefinition ? "150px" : "0px",
                              opacity: showDefinition ? 1 : 0,
                            }}
                          >
                            <div className="exercise-definition-content px-3 py-2.5 sm:px-4 sm:py-3 bg-muted/40 sm:bg-muted/50 text-xs sm:text-sm border-t">
                              {currentDefinition}
                            </div>
                          </div>
                        </div>

                        {(exerciseStatus.isCorrect ||
                          exerciseStatus.usedShowWord) && (
                          <div className="border border-border rounded-lg overflow-hidden">
                            <button
                              onClick={() => setShowSentence(!showSentence)}
                              className="exercise-see-sentence-button w-full flex items-center justify-between px-3 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm hover:bg-muted active:bg-muted/80 transition-colors text-left"
                            >
                              <span className="font-medium">
                                {t("practice.seeInSentence")}
                              </span>
                              {showSentence ? (
                                <ChevronUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                              )}
                            </button>

                            {/* Sentence content with smooth max-height transition */}
                            <div
                              className="transition-all duration-300 ease-in-out overflow-hidden"
                              style={{
                                maxHeight: showSentence ? "180px" : "0px",
                                opacity: showSentence ? 1 : 0,
                              }}
                            >
                              <div className="exercise-sentence-content px-3 py-2.5 sm:px-4 sm:py-3 bg-muted/40 sm:bg-muted/50 text-xs sm:text-sm border-t italic">
                                {/* Sentence text wrapper */}
                                <div className="relative">
                                  <span className="block leading-relaxed pr-10">
                                    {'"'}
                                    <span
                                      dangerouslySetInnerHTML={{
                                        __html: highlightedSentence,
                                      }}
                                    />
                                    {'"'}
                                  </span>
                                  <button
                                    onClick={() => {
                                      if ("speechSynthesis" in window) {
                                        const utterance =
                                          new SpeechSynthesisUtterance(
                                            currentWord.sentence,
                                          );
                                        utterance.lang =
                                          getLanguageCode(practiceLanguage);
                                        window.speechSynthesis.speak(utterance);
                                      }
                                    }}
                                    className="absolute top-1/2 -translate-y-1/2 right-0 p-1.5 sm:p-2 hover:bg-muted rounded-lg text-muted-foreground transition-colors"
                                    aria-label={t("practice.listenToSentence")}
                                  >
                                    <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                                    {/* Progress & Navigation */}
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <button
                      onClick={onGoFilters}
                      className="px-4 py-2.5 rounded-lg font-medium transition-all bg-muted text-muted-foreground hover:bg-muted/80"
                    >
                      {/* Practice List (My Lists Phase 3): this button
                          leaves to that list's own detail view, not a
                          filters step that doesn't exist in this context —
                          reuses the existing "Back to My Lists" copy rather
                          than the ordinary flow's "Filters" label, which
                          would otherwise describe a page this button
                          doesn't actually go to. */}
                      {restrictToConceptIds && restrictToConceptIds.length > 0
                        ? t("userProfile.myListsSection.detail.backToMyLists")
                        : t("header.filters")}
                    </button>

                    {/* For pairing exercises, allow Skip until completed */}
                    {isFourWordExercise(currentExerciseType) ? (
                      <button
                        onClick={handleNext}
                        disabled={isCardSwitching}
                        className={`practice-next-button px-6 py-2.5 rounded-lg font-medium transition-all ${
                          isNextActionAvailable
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        }`}
                      >
                        {isNextActionAvailable
                          ? t("practice.nextAction")
                          : t("practice.skipAction")}
                      </button>
                    ) : (
                      <button
                        onClick={handleNext}
                        disabled={isCardSwitching}
                        className={`practice-next-button px-6 py-2.5 rounded-lg font-medium transition-all ${
                          isNextActionAvailable
                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                            : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                        }`}
                      >
                        {isNextActionAvailable
                          ? t("practice.nextAction")
                          : t("practice.skipAction")}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
