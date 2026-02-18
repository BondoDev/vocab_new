import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

interface VocabularyLevelExamProps {
  practiceLanguage: string;
  yourLanguage: string;
  onComplete: (level: string) => void;
  onCancel: () => void;
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

const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const QUESTIONS_PER_LEVEL = 6;
const MAX_WRONG_ANSWERS = 3;

export function VocabularyLevelExam({
  practiceLanguage,
  yourLanguage,
  onComplete,
  onCancel,
}: VocabularyLevelExamProps) {
  const { t } = useLanguage();
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
  const [currentQuestion, setCurrentQuestion] = useState<{
    word: Word;
    options: string[];
    correctAnswer: string;
  } | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

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

        // Filter words with 4+ characters only
        const filteredWords = practiceWords.filter(
          (word) => word.word_lemma.length >= 4,
        );

        setAllWords(filteredWords);

        // Load user's language words for options
        const yourLangModule = await wordsMap[yourLanguage]();
        const yourLangWords: Word[] = Array.isArray(yourLangModule.default)
          ? yourLangModule.default
          : [];

        // Create translation map using concept_id
        const map: { [key: string]: string } = {};
        yourLangWords.forEach((word) => {
          map[word.concept_id] = word.word_lemma;
        });
        setTranslationMap(map);
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

    // Combine and shuffle all options
    const allOptions = [correctAnswer, ...wrongOptions];
    const shuffledOptions = allOptions.sort(() => Math.random() - 0.5);

    setCurrentQuestion({
      word: randomWord,
      options: shuffledOptions,
      correctAnswer,
    });
    setSelectedAnswer(null);
    setShowFeedback(false);
  };

  const handleAnswerSelect = (answer: string) => {
    if (showFeedback) return; // Prevent selecting again during feedback

    setSelectedAnswer(answer);
    setShowFeedback(true);

    const isCorrect = answer === currentQuestion?.correctAnswer;

    // Wait 1 second to show feedback, then move to next question
    setTimeout(() => {
      if (isCorrect) {
        // Correct answer - move to next question
        moveToNextQuestion();
      } else {
        // Wrong answer - increment wrong count
        const newWrongCount = wrongAnswersInLevel + 1;
        setWrongAnswersInLevel(newWrongCount);

        if (newWrongCount >= MAX_WRONG_ANSWERS) {
          // Failed this level - exam ends
          endExam();
        } else {
          // Continue with next question
          moveToNextQuestion();
        }
      }
    }, 1000);
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
  };

  const handleStartPractice = () => {
    onComplete(finalLevel);
  };

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
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Bar */}
      <div className="px-4 py-2 md:px-8 md:py-4 border-b border-border">
        <div className="relative flex items-center justify-between mb-2">
          <button
            onClick={onCancel}
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
              {t("exam.chooseOption")}
            </h1>

            {/* Target Word */}
            <motion.div
              key={currentQuestion.word.id}
              className="mb-10"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                opacity: { duration: 0.2 },
                scale: { duration: 0.2 },
              }}
            >
              <h2 className="text-4xl md:text-5xl font-bold text-foreground">
                {currentQuestion.word.word_lemma}
              </h2>
            </motion.div>
          </div>

          {/* Answer Options */}
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

        </div>
      </main>
    </div>
  );
}










