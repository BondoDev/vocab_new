import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { shuffleArray } from "../../utils/shuffleArray";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";

interface VocabularyLevelExamProps {
  practiceLanguage: string;
  yourLanguage: string;
  onComplete: (level: string) => void;
  onCancel: () => void;
  // Fires exactly once per genuine test completion - at the same two call
  // sites that set examComplete true (all levels finished, or 3 wrong
  // answers ends the current level), right as the Result Screen becomes
  // visible. Never on open/an individual answer/abandoning via the exit
  // dialog, and never before a result exists. Distinct from onComplete
  // above, which only fires later if/when the user clicks "Start
  // practicing" - this fires as soon as there is a result to see. Optional
  // and side-effect-free from this component's perspective: the caller
  // (App.tsx) decides what, if anything, happens (currently: offering the
  // anonymous account-intro popup - see accountIntroPolicy.ts). This
  // component owns no auth/anonymous-detection logic itself.
  onExamComplete?: () => void;
}

interface Word {
  id: number;
  concept_id: string;
  word_lemma: string;
  definiton: string;
  sentence: string;
  type: string;
  category: string;
  level: string;
}

type QuestionMode = "multipleChoice" | "chunkAssemble";

interface ExamQuestion {
  mode: QuestionMode;
  word: Word;
  prompt: string;
  options: string[];
  correctAnswer: string;
  shuffledChunks: string[];
}

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const QUESTIONS_PER_LEVEL = 6;
const MAX_WRONG_ANSWERS = 3;

function splitWordIntoChunks(word: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < word.length; i += 2) {
    if (i + 1 < word.length) {
      chunks.push(word.substring(i, i + 2));
    } else {
      chunks.push(word.substring(i));
    }
  }
  return chunks;
}

export function VocabularyLevelExam({
  practiceLanguage,
  yourLanguage,
  onComplete,
  onCancel,
  onExamComplete,
}: VocabularyLevelExamProps) {
  const { t } = useLanguage();
  const getText = (key: string, fallback: string) => {
    const value = t(key);
    return value === key ? fallback : value;
  };
  const isUsableLemma = (value: unknown): value is string =>
    typeof value === "string" && value.trim().length > 0 && value.trim() !== "-";
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [translationMap, setTranslationMap] = useState<{
    [key: string]: string;
  }>({});
  const [currentLevel, setCurrentLevel] = useState(0); // Index in LEVELS array
  const [currentQuestionInLevel, setCurrentQuestionInLevel] = useState(0);
  const [wrongAnswersInLevel, setWrongAnswersInLevel] = useState(0);
  const [examComplete, setExamComplete] = useState(false);
  const [finalLevel, setFinalLevel] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [currentQuestion, setCurrentQuestion] = useState<ExamQuestion | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [isExitDialogOpen, setIsExitDialogOpen] = useState(false);
  const [placedChunks, setPlacedChunks] = useState<string[]>([]);
  const [placedChunkIndices, setPlacedChunkIndices] = useState<number[]>([]);
  const [usedChunks, setUsedChunks] = useState<boolean[]>([]);
  const [showAssemblyIncorrect, setShowAssemblyIncorrect] = useState(false);

  // Load words on mount
  useEffect(() => {
    const loadWords = async () => {
      setIsLoading(true);
      try {
        // Use a static map for imports to ensure Vite can resolve them correctly
        const wordsMap: Record<string, () => Promise<any>> = {
          en: () => import("../../data/vocabulary/english/vocabulary.json"),
          es: () => import("../../data/vocabulary/spanish/vocabulary.json"),
          fr: () => import("../../data/vocabulary/french/vocabulary.json"),
          de: () => import("../../data/vocabulary/german/vocabulary.json"),
          it: () => import("../../data/vocabulary/italian/vocabulary.json"),
          pt: () => import("../../data/vocabulary/portuguese/vocabulary.json"),
          ru: () => import("../../data/vocabulary/russian/vocabulary.json"),
        };

        if (!wordsMap[practiceLanguage] || !wordsMap[yourLanguage]) {
          throw new Error(
            `Unsupported language: ${practiceLanguage} or ${yourLanguage}`,
          );
        }

        const practiceModule = await wordsMap[practiceLanguage]();
        const practiceWords: Word[] = Array.isArray(practiceModule.default)
          ? practiceModule.default
          : [];

        // Load user's language words for options
        const yourLangModule = await wordsMap[yourLanguage]();
        const yourLangWords: Word[] = Array.isArray(yourLangModule.default)
          ? yourLangModule.default
          : [];

        const validPracticeConceptIds = new Set(
          practiceWords
            .filter(
              (word) =>
                word?.concept_id && isUsableLemma(word?.word_lemma),
            )
            .map((word) => String(word.concept_id)),
        );

        // Create translation map using concept_id
        const map: { [key: string]: string } = {};
        yourLangWords.forEach((word) => {
          const conceptId = String(word?.concept_id ?? "");
          if (!conceptId || !validPracticeConceptIds.has(conceptId)) return;
          if (!isUsableLemma(word?.word_lemma)) return;
          map[conceptId] = word.word_lemma;
        });
        setTranslationMap(map);

        // Keep only words that exist in both languages and are valid on both sides
        const validConceptIds = new Set(Object.keys(map));
        const filteredWords = practiceWords.filter(
          (word) =>
            word?.concept_id &&
            validConceptIds.has(String(word.concept_id)) &&
            isUsableLemma(word?.word_lemma) &&
            word.word_lemma.length >= 4,
        );

        setAllWords(filteredWords);
      } catch (error) {
        console.error("Error loading words:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadWords();
  }, [practiceLanguage, yourLanguage]);

  // Generate new question when level or question number changes
  useEffect(() => {
    if (allWords.length === 0 || Object.keys(translationMap).length === 0)
      return;
    if (examComplete) return;

    generateQuestion();
  }, [currentLevel, currentQuestionInLevel, allWords, translationMap]);

  const generateQuestion = () => {
    const levelName = LEVELS[currentLevel];
    const isChunkMode = currentLevel >= 2;

    // Get words for current level that have 4+ characters
    const wordsForLevel = allWords.filter(
      (word) => word.level === levelName && word.word_lemma.length >= 4,
    );

    if (wordsForLevel.length === 0) {
      console.error(`No words found for level ${levelName}`);
      return;
    }

    // Pick a random word for the question
    const randomWord =
      wordsForLevel[Math.floor(Math.random() * wordsForLevel.length)];
    const correctAnswer = translationMap[randomWord.concept_id];

    if (!correctAnswer) {
      console.error("No translation found for word");
      return;
    }

    if (isChunkMode) {
      const chunks = splitWordIntoChunks(randomWord.word_lemma);
      let shuffledChunks = shuffleArray(chunks);
      if (
        chunks.length > 1 &&
        shuffledChunks.join("|") === chunks.join("|")
      ) {
        shuffledChunks = shuffleArray(chunks);
      }

      setCurrentQuestion({
        mode: "chunkAssemble",
        word: randomWord,
        prompt: correctAnswer,
        options: [],
        correctAnswer: randomWord.word_lemma,
        shuffledChunks,
      });
      setPlacedChunks([]);
      setPlacedChunkIndices([]);
      setUsedChunks(new Array(shuffledChunks.length).fill(false));
      setShowAssemblyIncorrect(false);
    } else {
      // Generate 5 wrong options from the same level
      const wrongOptions: string[] = [];
      const usedConceptIds = new Set([randomWord.concept_id]);

      while (wrongOptions.length < 5 && wordsForLevel.length > 1) {
        const randomWrongWord =
          wordsForLevel[Math.floor(Math.random() * wordsForLevel.length)];

        if (!usedConceptIds.has(randomWrongWord.concept_id)) {
          const wrongAnswer = translationMap[randomWrongWord.concept_id];
          if (wrongAnswer && wrongAnswer !== correctAnswer) {
            wrongOptions.push(wrongAnswer);
            usedConceptIds.add(randomWrongWord.concept_id);
          }
        }
      }

      const shuffledOptions = shuffleArray([correctAnswer, ...wrongOptions]);

      setCurrentQuestion({
        mode: "multipleChoice",
        word: randomWord,
        prompt: randomWord.word_lemma,
        options: shuffledOptions,
        correctAnswer,
        shuffledChunks: [],
      });
    }

    setSelectedAnswer(null);
    setShowFeedback(false);
  };

  const resolveQuestionResult = (isCorrect: boolean) => {
    setShowFeedback(true);

    setTimeout(() => {
      if (isCorrect) {
        moveToNextQuestion();
      } else {
        const newWrongCount = wrongAnswersInLevel + 1;
        setWrongAnswersInLevel(newWrongCount);

        if (newWrongCount >= MAX_WRONG_ANSWERS) {
          endExam();
        } else {
          moveToNextQuestion();
        }
      }
    }, 1000);
  };

  const handleAnswerSelect = (answer: string) => {
    if (showFeedback || currentQuestion?.mode !== "multipleChoice") return;

    setSelectedAnswer(answer);
    const isCorrect = answer === currentQuestion?.correctAnswer;
    resolveQuestionResult(isCorrect);
  };

  const handleChunkSelect = (chunkIndex: number) => {
    if (
      !currentQuestion ||
      currentQuestion.mode !== "chunkAssemble" ||
      showFeedback ||
      usedChunks[chunkIndex]
    ) {
      return;
    }

    const nextPlacedChunks = [...placedChunks, currentQuestion.shuffledChunks[chunkIndex]];
    const nextPlacedChunkIndices = [...placedChunkIndices, chunkIndex];
    const nextUsedChunks = [...usedChunks];
    nextUsedChunks[chunkIndex] = true;

    setPlacedChunks(nextPlacedChunks);
    setPlacedChunkIndices(nextPlacedChunkIndices);
    setUsedChunks(nextUsedChunks);

    if (nextPlacedChunks.length === currentQuestion.shuffledChunks.length) {
      const isCorrect = nextPlacedChunks.join("") === currentQuestion.correctAnswer;
      setShowAssemblyIncorrect(!isCorrect);
      resolveQuestionResult(isCorrect);
    }
  };

  const handlePlacedChunkRemove = (slotIndex: number) => {
    if (
      !currentQuestion ||
      currentQuestion.mode !== "chunkAssemble" ||
      showFeedback ||
      slotIndex !== placedChunks.length - 1
    ) {
      return;
    }

    const sourceChunkIndex = placedChunkIndices[slotIndex];
    if (sourceChunkIndex === undefined) return;

    const nextPlacedChunks = placedChunks.filter((_, index) => index !== slotIndex);
    const nextPlacedChunkIndices = placedChunkIndices.filter(
      (_, index) => index !== slotIndex,
    );
    const nextUsedChunks = [...usedChunks];
    nextUsedChunks[sourceChunkIndex] = false;

    setPlacedChunks(nextPlacedChunks);
    setPlacedChunkIndices(nextPlacedChunkIndices);
    setUsedChunks(nextUsedChunks);
    setShowAssemblyIncorrect(false);
  };

  const moveToNextQuestion = () => {
    const nextQuestionNum = currentQuestionInLevel + 1;

    if (nextQuestionNum >= QUESTIONS_PER_LEVEL) {
      // Completed all questions in this level - move to next level
      if (currentLevel < LEVELS.length - 1) {
        setCurrentLevel(currentLevel + 1);
        setCurrentQuestionInLevel(0);
        setWrongAnswersInLevel(0);
      } else {
        // Completed all levels!
        setFinalLevel(LEVELS[currentLevel]);
        setExamComplete(true);
        onExamComplete?.();
      }
    } else {
      // Move to next question in same level
      setCurrentQuestionInLevel(nextQuestionNum);
    }
  };

  const endExam = () => {
    // Set final level to the previous completed level
    const completedLevel = currentLevel > 0 ? LEVELS[currentLevel - 1] : "A1";
    setFinalLevel(completedLevel);
    setExamComplete(true);
    onExamComplete?.();
  };

  const handleStartPractice = () => {
    onComplete(finalLevel);
  };

  const handleRequestCancel = () => {
    setIsExitDialogOpen(true);
  };

  const confirmExitTitle = getText("exam.confirmExitTitle", "Leave the level test?");
  const confirmExitDescription = getText(
    "exam.confirmExitDescription",
    "Your current progress in the test will be lost.",
  );
  const confirmExitStay = getText("exam.confirmExitStay", "Stay in test");
  const confirmExitLeave = getText("exam.confirmExitLeave", "Leave test");
  const chooseOptionLabel = getText("exam.chooseOption", "Choose correct option");
  const buildWordLabel = getText(
    "practice.brokenWordInstruction",
    "Build the correct word from the given chunks.",
  );
  const incorrectOrderLabel = getText(
    "practice.incorrectOrderTryAgain",
    "Incorrect order.",
  );
  const grammarTypeLabel =
    currentQuestion?.mode === "chunkAssemble"
      ? getText(
          `wordType.${String(currentQuestion.word.type ?? "").toLowerCase()}`,
          String(currentQuestion.word.type ?? ""),
        )
      : "";

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{t("exam.loading")}</p>
      </div>
    );
  }

  if (examComplete) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {/* Top Bar */}
        <div className="px-4 py-4 md:px-8 md:py-6 flex items-center justify-between border-b border-border">
          <button
            onClick={onCancel}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label={t("exam.close")}
          >
            <X className="w-6 h-6" />
          </button>
          <div className="text-sm font-medium text-muted-foreground">
            {t("exam.complete")}
          </div>
        </div>

        {/* Result Screen */}
        <main className="flex-1 flex items-center justify-center px-4 py-8">
          <motion.div
            className="w-full max-w-md text-center space-y-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              opacity: { duration: 0.3 },
              y: { duration: 0.3 },
            }}
          >
            <div className="space-y-6">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                {t("exam.estimatedLevel")}
              </h1>
              <div className="inline-block px-8 py-4 bg-primary/10 border-2 border-primary rounded-xl">
                <span className="text-5xl font-bold text-primary">
                  {finalLevel}
                </span>
              </div>
            </div>

            <p className="text-muted-foreground">
              {t("exam.resultNote")}
            </p>

            <div className="space-y-3 pt-4">
              <button
                onClick={handleStartPractice}
                className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors font-medium"
              >
                {t("exam.startPracticing")}
              </button>
              <button
                onClick={onCancel}
                className="w-full px-6 py-3 border border-border rounded-xl hover:bg-muted transition-colors font-medium"
              >
                {t("exam.backToSelection")}
              </button>
            </div>
          </motion.div>
        </main>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">{t("exam.preparing")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen flex flex-col bg-background">
      {/* Top Bar */}
      <div className="px-4 py-2 md:px-8 md:py-4 border-b border-border">
        <div className="relative flex items-center justify-between mb-2">
          <button
            onClick={handleRequestCancel}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
            aria-label={t("exam.close")}
          >
            <X className="w-6 h-6" />
          </button>
          <div className="absolute left-1/2 -translate-x-1/2 text-sm font-medium text-muted-foreground hidden max-[380px]:block">
            {currentQuestionInLevel + 1}/{QUESTIONS_PER_LEVEL}
          </div>
          <div className="ml-auto text-right text-sm font-medium text-muted-foreground">
            {t("exam.levelLabel")}: {LEVELS[currentLevel]}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground max-[380px]:hidden">
            <span>
              {t("exam.question")} {currentQuestionInLevel + 1} {t("exam.of")}{" "}
              {QUESTIONS_PER_LEVEL}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 max-[380px]:hidden">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{
                width: `${((currentQuestionInLevel + 1) / QUESTIONS_PER_LEVEL) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-4">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <h1 className="text-xl font-medium text-muted-foreground mb-6 max-[640px]:pb-8 max-[380px]:pb-0">
              {currentQuestion.mode === "chunkAssemble"
                ? buildWordLabel
                : chooseOptionLabel}
            </h1>

            {currentQuestion.mode === "chunkAssemble" && grammarTypeLabel ? (
              <div className="mb-5 flex justify-center">
                <div className="rounded-full border border-border bg-muted/50 px-4 py-1 text-sm font-medium text-muted-foreground">
                  {grammarTypeLabel}
                </div>
              </div>
            ) : null}

            {/* Target Word */}
            <motion.div
              key={`${currentQuestion.word.id}-${currentQuestion.mode}`}
              className="mb-10"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 },
              }}
            >
              <h2 className="text-4xl md:text-5xl font-bold text-foreground">
                {currentQuestion.prompt}
              </h2>
            </motion.div>
          </div>

          {currentQuestion.mode === "multipleChoice" ? (
            <div className="grid grid-cols-1 gap-3 md:grid-rows-3 md:grid-flow-col md:auto-cols-fr">
              <AnimatePresence mode="wait">
                {currentQuestion.options.map((option, index) => {
                  const isSelected = selectedAnswer === option;
                  const isCorrect = option === currentQuestion.correctAnswer;
                  const showAsCorrect = showFeedback && isCorrect;
                  const showAsWrong = showFeedback && isSelected && !isCorrect;

                  return (
                    <motion.button
                      key={`${currentQuestion.word.id}-${option}`}
                      onClick={() => handleAnswerSelect(option)}
                      disabled={showFeedback}
                      className={`w-full px-6 py-4 max-[380px]:py-2 text-lg rounded-xl border-2 transition-all font-medium text-left ${
                        showAsCorrect
                          ? "bg-green-50 border-green-500 text-green-700"
                          : showAsWrong
                            ? "bg-red-50 border-red-500 text-red-700"
                            : isSelected
                              ? "bg-primary/10 border-primary text-foreground"
                              : "bg-background border-border text-foreground hover:bg-muted hover:border-muted-foreground/30"
                      } ${showFeedback ? "cursor-not-allowed" : "cursor-pointer"}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        opacity: {
                          duration: 0.2,
                          delay: index * 0.05,
                        },
                        y: { duration: 0.2, delay: index * 0.05 },
                      }}
                    >
                      {option}
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div className="space-y-5">
              <div
                className={`min-h-16 rounded-2xl border-2 px-4 py-4 transition-colors ${
                  showAssemblyIncorrect
                    ? "border-red-500 bg-red-50/60"
                    : showFeedback
                      ? "border-green-500 bg-green-50/60"
                      : "border-border bg-background"
                }`}
              >
                <div className="flex flex-wrap justify-center gap-2">
                  {currentQuestion.shuffledChunks.map((_, slotIndex) => {
                    const chunk = placedChunks[slotIndex];
                    const isRemovable =
                      !showFeedback && slotIndex === placedChunks.length - 1;

                    return (
                      <button
                        key={`slot-${currentQuestion.word.id}-${slotIndex}`}
                        type="button"
                        onClick={() =>
                          chunk ? handlePlacedChunkRemove(slotIndex) : undefined
                        }
                        disabled={!chunk || !isRemovable}
                        className={`min-w-12 rounded-lg border px-3 py-2 text-lg font-medium transition-colors ${
                          chunk
                            ? "border-primary/35 bg-primary/10 text-foreground"
                            : "border-dashed border-border text-muted-foreground/45"
                        } ${isRemovable ? "cursor-pointer" : "cursor-default"}`}
                      >
                        {chunk ?? "…"}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-center">
                <div className="flex max-w-md flex-wrap justify-center gap-2">
                  {currentQuestion.shuffledChunks.map((chunk, chunkIndex) => (
                    <button
                      key={`chunk-${currentQuestion.word.id}-${chunkIndex}`}
                      type="button"
                      onClick={() => handleChunkSelect(chunkIndex)}
                      disabled={usedChunks[chunkIndex] || showFeedback}
                      className={`rounded-lg border-2 px-3 py-2 text-lg font-medium transition-all ${
                        usedChunks[chunkIndex]
                          ? "cursor-not-allowed border-muted bg-muted text-muted-foreground opacity-35"
                          : "border-[#34205f] bg-[#34205f] text-white hover:bg-[#46307a] active:bg-[#28174a]"
                      }`}
                    >
                      {chunk.toLocaleLowerCase()}
                    </button>
                  ))}
                </div>
              </div>

              {showAssemblyIncorrect && (
                <div className="text-center text-sm font-medium text-red-600">
                  {incorrectOrderLabel}
                </div>
              )}
            </div>
          )}

        </div>
      </main>
      </div>

      <AlertDialog open={isExitDialogOpen} onOpenChange={setIsExitDialogOpen}>
        <AlertDialogContent className="w-[90vw] max-w-[90vw] gap-3 px-5 py-5 sm:w-fit sm:max-w-fit">
          <AlertDialogHeader className="gap-2">
            <AlertDialogTitle>{confirmExitTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmExitDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-end">
            <AlertDialogCancel className="sm:flex-none">{confirmExitStay}</AlertDialogCancel>
            <AlertDialogAction onClick={onCancel} className="sm:flex-none">
              {confirmExitLeave}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}










