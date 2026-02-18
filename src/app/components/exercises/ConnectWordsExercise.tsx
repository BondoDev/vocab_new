import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { shuffleArray } from "../../utils/shuffleArray";
import { useLanguage } from "../../../contexts/LanguageContext";

interface ConnectWordsExerciseProps {
  words: any[];
  currentIndex: number;
  translations: { [key: string]: string };
  sourceLabel: string;
  targetLabel: string;
  onStatusChange: (status: {
    isCorrect: boolean;
    hasTypedAnswer: boolean;
    usedShowWord: boolean;
    usedHintForBrokenWord: boolean;
  }) => void;
}

export function ConnectWordsExercise({
  words,
  currentIndex,
  translations,
  sourceLabel,
  targetLabel,
  onStatusChange,
}: ConnectWordsExerciseProps) {
  const { t } = useLanguage();
  const [connectWords, setConnectWords] = useState<string[]>([]);
  const [connectMeanings, setConnectMeanings] = useState<string[]>([]);
  const [connectPairs, setConnectPairs] = useState<
    { wordIndex: number; meaningIndex: number }[]
  >([]);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);
  const [incorrectPair, setIncorrectPair] = useState<{
    wordIndex: number;
    meaningIndex: number;
  } | null>(null);
  const [flashWordIndices, setFlashWordIndices] = useState<Set<number>>(
    () => new Set(),
  );
  const [flashMeaningIndices, setFlashMeaningIndices] = useState<Set<number>>(
    () => new Set(),
  );
  const flashTimeoutsRef = useRef<number[]>([]);
  const shouldReduceMotion = useReducedMotion();
  const isComplete = connectPairs.length === 4;
  const hasActiveSelection = selectedWord !== null;
  const pairedWordIndexSet = useMemo(
    () => new Set(connectPairs.map((pair) => pair.wordIndex)),
    [connectPairs],
  );
  const pairedMeaningIndexSet = useMemo(
    () => new Set(connectPairs.map((pair) => pair.meaningIndex)),
    [connectPairs],
  );

  const pairedRows = useMemo(
    () =>
      connectPairs
        .map((pair) => ({
          word: connectWords[pair.wordIndex],
          meaning: connectMeanings[pair.meaningIndex],
          wordIndex: pair.wordIndex,
        }))
        .sort((a, b) => a.wordIndex - b.wordIndex),
    [connectPairs, connectMeanings, connectWords],
  );

  useEffect(() => {
    const fourWords = words.slice(currentIndex, currentIndex + 4);
    if (fourWords.length < 4) {
      setConnectWords([]);
      setConnectMeanings([]);
      setConnectPairs([]);
      setSelectedWord(null);
      setIncorrectPair(null);
      setFlashWordIndices(new Set());
      setFlashMeaningIndices(new Set());
      flashTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      flashTimeoutsRef.current = [];
      onStatusChange({
        isCorrect: false,
        hasTypedAnswer: false,
        usedShowWord: false,
        usedHintForBrokenWord: false,
      });
      return;
    }

    const wordsInTarget = fourWords.map((w) => w.word_lemma);
    const meaningsInNative = fourWords.map(
      (w) => translations[w.concept_id] || w.word_lemma,
    );

    setConnectWords(wordsInTarget);
    setConnectMeanings(shuffleArray([...meaningsInNative]));
    setConnectPairs([]);
    setSelectedWord(null);
    setIncorrectPair(null);
    setFlashWordIndices(new Set());
    setFlashMeaningIndices(new Set());
    flashTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    flashTimeoutsRef.current = [];
    onStatusChange({
      isCorrect: false,
      hasTypedAnswer: false,
      usedShowWord: false,
      usedHintForBrokenWord: false,
    });
  }, [currentIndex, words, translations, onStatusChange]);

  useEffect(() => {
    onStatusChange({
      isCorrect: connectPairs.length === 4,
      hasTypedAnswer: false,
      usedShowWord: false,
      usedHintForBrokenWord: false,
    });
  }, [connectPairs.length, onStatusChange]);

  useEffect(() => {
    return () => {
      flashTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      flashTimeoutsRef.current = [];
    };
  }, []);

  const handleWordSelect = (wordIndex: number) => {
    if (isComplete) return;
    if (connectPairs.some((pair) => pair.wordIndex === wordIndex)) return;
    setSelectedWord((prev) => (prev === wordIndex ? null : wordIndex));
  };

  const handleMeaningSelect = (meaningIndex: number) => {
    if (isComplete) return;
    if (selectedWord === null) return;
    if (connectPairs.some((pair) => pair.meaningIndex === meaningIndex)) return;

    const selectedWordText = connectWords[selectedWord];
    const selectedMeaningText = connectMeanings[meaningIndex];

    const currentFourWords = words.slice(currentIndex, currentIndex + 4);
    const wordObject = currentFourWords.find(
      (w) => w.word_lemma === selectedWordText,
    );
    const correctMeaning = wordObject
      ? translations[wordObject.concept_id]
      : "";

    if (selectedMeaningText === correctMeaning) {
      const newPairs = [
        ...connectPairs,
        { wordIndex: selectedWord, meaningIndex },
      ];
      setConnectPairs(newPairs);
      setFlashWordIndices((prev) => new Set(prev).add(selectedWord));
      setFlashMeaningIndices((prev) => new Set(prev).add(meaningIndex));
      const timeoutId = window.setTimeout(() => {
        setFlashWordIndices((prev) => {
          const next = new Set(prev);
          next.delete(selectedWord);
          return next;
        });
        setFlashMeaningIndices((prev) => {
          const next = new Set(prev);
          next.delete(meaningIndex);
          return next;
        });
      }, 140);
      flashTimeoutsRef.current.push(timeoutId);
      setSelectedWord(null);
    } else {
      setIncorrectPair({
        wordIndex: selectedWord,
        meaningIndex,
      });
      setTimeout(() => {
        setIncorrectPair(null);
        setSelectedWord(null);
      }, 600);
    }
  };
  return (
    <div className="exercise-connect-root w-full space-y-4">
      <style>{`
        @keyframes shakeX {
          0% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          50% { transform: translateX(4px); }
          75% { transform: translateX(-2px); }
          100% { transform: translateX(0); }
        }
        .animate-shake {
          animation: shakeX 0.18s ease-out;
        }
      `}</style>
        <div className="exercise-connect-grid grid grid-cols-2 gap-x-8 w-full mx-auto items-center">
          <h4 className="text-[0.72rem] sm:text-xs uppercase tracking-[0.14em] text-gray-500 text-center font-semibold bg-white/70 border border-purple-200/70 rounded-full py-1 px-3">
            {sourceLabel}
          </h4>
          <h4 className="text-[0.72rem] sm:text-xs uppercase tracking-[0.14em] text-gray-500 text-center font-semibold bg-white/70 border border-purple-200/70 rounded-full py-1 px-3">
            {targetLabel}
          </h4>
        </div>
        {isComplete ? (
          <motion.div
            className="relative w-full max-w-2xl mx-auto"
            layout
            transition={
              shouldReduceMotion
                ? { duration: 0 }
                : { duration: 0.3, ease: "easeInOut" }
            }
          >
            <div className="grid gap-y-8">
              {pairedRows.map((pair, index) => (
                <motion.div
                  key={`${pair.word}-${pair.meaning}-row`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-4"
                  initial={shouldReduceMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, ease: "easeOut", delay: index * 0.03 }}
                >
                  <button
                    disabled
                    className="exercise-connect-button w-full min-w-0 self-center px-4 py-2 text-base md:text-lg font-medium rounded-lg border border-green-200 bg-green-100 text-green-700 cursor-default text-left shadow-sm"
                  >
                    <span className="flex min-w-0 items-center justify-start gap-2">
                      <span className="block min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                        {pair.word}
                      </span>
                    </span>
                  </button>
                  <span className="text-green-500 text-sm font-semibold">-&gt;</span>
                  <button
                    disabled
                    className="exercise-connect-button w-full min-w-0 self-center px-4 py-2 text-base md:text-lg font-medium rounded-lg border border-green-200 bg-green-100 text-green-700 cursor-default text-left shadow-sm"
                  >
                    <span className="flex min-w-0 items-center justify-start gap-2">
                      <span className="block min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                        {pair.meaning}
                      </span>
                    </span>
                  </button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : (
        <div className="exercise-connect-grid grid grid-cols-2 gap-x-8 gap-y-8 w-full mx-auto items-center">
            {connectWords.map((_, wordIndex) => {
              const meaningIndex = wordIndex;
              const word = connectWords[wordIndex];
              const meaning = connectMeanings[meaningIndex];
              if (word === undefined || meaning === undefined) return null;

              const isPaired = pairedWordIndexSet.has(wordIndex);
              const isMeaningPaired = pairedMeaningIndexSet.has(meaningIndex);
              const isFlashing = flashWordIndices.has(wordIndex);
              const isMeaningFlashing = flashMeaningIndices.has(meaningIndex);
              const isSelected = selectedWord === wordIndex;
              const isIncorrect = incorrectPair?.wordIndex === wordIndex;
              const shouldFade =
                hasActiveSelection && !isSelected && !isIncorrect && !isPaired;
              const isMeaningIncorrect =
                incorrectPair?.meaningIndex === meaningIndex;

              return (
                  <div key={`row-${wordIndex}-${meaningIndex}`} className="contents">
                    <motion.button
                      onClick={() => handleWordSelect(wordIndex)}
                      disabled={isPaired}
                      className={`exercise-connect-button w-full self-center px-4 py-2 text-base md:text-lg font-medium rounded-lg border transition-all text-left shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                        isPaired
                          ? isFlashing
                            ? "border-green-300 bg-green-100 text-green-700 cursor-default"
                            : "invisible pointer-events-none"
                          : isIncorrect
                          ? "animate-shake border-red-400 bg-red-100 text-red-700"
                          : isSelected
                            ? "border-purple-400 bg-purple-200 text-slate-900 ring-2 ring-purple-300"
                            : shouldFade
                              ? "border-purple-200 bg-purple-100 text-slate-900/75 opacity-80"
                              : "border-purple-200 bg-purple-100 text-slate-900 hover:bg-purple-200 hover:border-purple-300"
                      }`}
                      whileTap={{ scale: 0.99 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                      <span className="flex min-w-0 items-center justify-start gap-2">
                        <span className="block min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                          {word}
                        </span>
                      </span>
                    </motion.button>
                    <motion.button
                      onClick={() => handleMeaningSelect(meaningIndex)}
                      disabled={selectedWord === null || isMeaningPaired}
                      className={`exercise-connect-button w-full self-center px-4 py-2 text-base md:text-lg font-medium rounded-lg border transition-all text-left focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                        isMeaningPaired
                          ? isMeaningFlashing
                            ? "border-green-300 bg-green-100 text-green-700 cursor-default"
                            : "invisible pointer-events-none"
                          : isMeaningIncorrect
                          ? "animate-shake border-red-400 bg-red-100 text-red-700"
                          : "bg-white border-purple-200 text-slate-900 hover:border-purple-400 disabled:opacity-60 disabled:cursor-not-allowed"
                      }`}
                      whileTap={{ scale: 0.99 }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                    >
                      <span className="flex min-w-0 items-center justify-start gap-2">
                        <span className="block min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                          {meaning}
                        </span>
                      </span>
                    </motion.button>
                  </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
