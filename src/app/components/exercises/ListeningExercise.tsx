import { useEffect, useMemo, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { shuffleArray } from "../../utils/shuffleArray";

interface ListeningExerciseProps {
  words: any[];
  currentIndex: number;
  translations: { [key: string]: string };
  sourceLabel: string;
  targetLabel: string;
  onSpeakWord: (word: string) => void;
  onStatusChange: (status: {
    isCorrect: boolean;
    hasTypedAnswer: boolean;
    usedShowWord: boolean;
    usedHintForBrokenWord: boolean;
  }) => void;
}

type ExerciseWord = {
  conceptId: string;
  word: string;
};

export function ListeningExercise({
  words,
  currentIndex,
  translations,
  sourceLabel,
  targetLabel,
  onSpeakWord,
  onStatusChange,
}: ListeningExerciseProps) {
  const [leftItems, setLeftItems] = useState<ExerciseWord[]>([]);
  const [rightItems, setRightItems] = useState<ExerciseWord[]>([]);
  const [pairs, setPairs] = useState<
    { leftIndex: number; rightIndex: number }[]
  >([]);
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [incorrectPair, setIncorrectPair] = useState<{
    leftIndex: number;
    rightIndex: number;
  } | null>(null);
  const [flashLeftIndices, setFlashLeftIndices] = useState<Set<number>>(
    () => new Set(),
  );
  const [flashRightIndices, setFlashRightIndices] = useState<Set<number>>(
    () => new Set(),
  );
  const flashTimeoutsRef = useRef<number[]>([]);
  const hasActiveSelection = selectedLeft !== null;
  const isComplete = pairs.length === 4;
  const pairedLeftIndexSet = useMemo(
    () => new Set(pairs.map((pair) => pair.leftIndex)),
    [pairs],
  );
  const pairedRightIndexSet = useMemo(
    () => new Set(pairs.map((pair) => pair.rightIndex)),
    [pairs],
  );

  const pairedRows = useMemo(
    () =>
      pairs
        .map((pair) => ({
          word: leftItems[pair.leftIndex]?.word || "",
          meaning: rightItems[pair.rightIndex]?.word || "",
          leftIndex: pair.leftIndex,
        }))
        .sort((a, b) => a.leftIndex - b.leftIndex),
    [leftItems, pairs, rightItems],
  );

  useEffect(() => {
    const fourWords = words.slice(currentIndex, currentIndex + 4);
    if (fourWords.length < 4) {
      setLeftItems([]);
      setRightItems([]);
      setPairs([]);
      setSelectedLeft(null);
      setIncorrectPair(null);
      setFlashLeftIndices(new Set());
      setFlashRightIndices(new Set());
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

    const preparedWords: ExerciseWord[] = fourWords.map((item: any) => ({
      conceptId: String(item.concept_id),
      word: item.word_lemma,
    }));

    const preparedMeanings: ExerciseWord[] = fourWords.map((item: any) => ({
      conceptId: String(item.concept_id),
      word: translations[item.concept_id] || item.word_lemma,
    }));

    setLeftItems(preparedWords);
    setRightItems(shuffleArray([...preparedMeanings]));
    setPairs([]);
    setSelectedLeft(null);
    setIncorrectPair(null);
    setFlashLeftIndices(new Set());
    setFlashRightIndices(new Set());
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
      isCorrect: pairs.length === 4,
      hasTypedAnswer: false,
      usedShowWord: false,
      usedHintForBrokenWord: false,
    });
  }, [pairs.length, onStatusChange]);

  useEffect(() => {
    return () => {
      flashTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      flashTimeoutsRef.current = [];
    };
  }, []);

  const handleMicSelect = (leftIndex: number) => {
    if (pairs.some((pair) => pair.leftIndex === leftIndex)) return;
    if (selectedLeft === leftIndex) {
      onSpeakWord(leftItems[leftIndex].word);
      return;
    }
    setSelectedLeft(leftIndex);
    onSpeakWord(leftItems[leftIndex].word);
  };

  const handleWordSelect = (rightIndex: number) => {
    if (selectedLeft === null) return;
    if (pairs.some((pair) => pair.rightIndex === rightIndex)) return;

    const leftWord = leftItems[selectedLeft];
    const rightWord = rightItems[rightIndex];

    if (leftWord.conceptId === rightWord.conceptId) {
      setPairs([...pairs, { leftIndex: selectedLeft, rightIndex }]);
      setFlashLeftIndices((prev) => new Set(prev).add(selectedLeft));
      setFlashRightIndices((prev) => new Set(prev).add(rightIndex));
      const timeoutId = window.setTimeout(() => {
        setFlashLeftIndices((prev) => {
          const next = new Set(prev);
          next.delete(selectedLeft);
          return next;
        });
        setFlashRightIndices((prev) => {
          const next = new Set(prev);
          next.delete(rightIndex);
          return next;
        });
      }, 140);
      flashTimeoutsRef.current.push(timeoutId);
      setSelectedLeft(null);
      return;
    }

    setIncorrectPair({ leftIndex: selectedLeft, rightIndex });
    setTimeout(() => {
      setIncorrectPair(null);
      setSelectedLeft(null);
    }, 600);
  };

  return (
    <div className="w-full space-y-4">
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
        <p className="mx-auto max-w-[34rem] text-center text-sm text-gray-500 leading-relaxed font-medium">
          Tap audio in {sourceLabel}, then choose its meaning in {targetLabel}
        </p>
        <div className="exercise-listening-grid w-full grid grid-cols-2 gap-x-8 max-w-2xl mx-auto items-center mt-1">
          <h4 className="justify-self-center w-[clamp(7.1rem,24vw,11rem)] text-[0.72rem] sm:text-xs uppercase tracking-[0.14em] text-gray-500 text-center font-semibold bg-white/70 border border-purple-200/70 rounded-full py-1 px-3">
            {sourceLabel}
          </h4>
          <h4 className="justify-self-center w-[clamp(7.1rem,24vw,11rem)] text-[0.72rem] sm:text-xs uppercase tracking-[0.14em] text-gray-500 text-center font-semibold bg-white/70 border border-purple-200/70 rounded-full py-1 px-3">
            {targetLabel}
          </h4>
        </div>
        {isComplete ? (
          <div className="relative w-full max-w-2xl mx-auto"
          >
            <div className="grid gap-y-8">
              {pairedRows.map((pair) => (
                <div key={`${pair.word}-${pair.meaning}-row`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-4">
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
                </div>
              ))}
            </div>
          </div>
        ) : (
        <div className="exercise-listening-grid w-full grid grid-cols-2 gap-x-6 gap-y-8 max-w-2xl mx-auto items-center">
            {leftItems.map((leftItem, rowIndex) => {
              const rightIndex = rowIndex;
              const rightItem = rightItems[rowIndex];
              if (!leftItem || !rightItem) return null;

              const isLeftPaired = pairedLeftIndexSet.has(rowIndex);
              const isRightPaired = pairedRightIndexSet.has(rightIndex);
              const isLeftFlashing = flashLeftIndices.has(rowIndex);
              const isRightFlashing = flashRightIndices.has(rightIndex);
              const isLeftSelected = selectedLeft === rowIndex;
              const isLeftIncorrect = incorrectPair?.leftIndex === rowIndex;
              const shouldFade =
                hasActiveSelection &&
                !isLeftSelected &&
                !isLeftIncorrect &&
                !isLeftPaired;
              const isRightIncorrect = incorrectPair?.rightIndex === rightIndex;

              return (
                <div
                  key={`${rowIndex}-${rightItem.conceptId}`}
                  className="contents"
                >
                  <button
                    onClick={() => handleMicSelect(rowIndex)}
                    disabled={isLeftPaired}
                    className={`exercise-listening-mic-button w-full px-4 py-2 rounded-lg border transition-all text-center shadow-sm focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                      isLeftPaired
                        ? isLeftFlashing
                          ? "border-green-300 bg-green-100 text-green-700 cursor-default"
                          : "invisible pointer-events-none"
                        : isLeftIncorrect
                        ? "animate-shake border-red-400 bg-red-100 text-red-700"
                        : isLeftSelected
                          ? "border-purple-400 bg-purple-200 text-slate-900 ring-2 ring-purple-300"
                          : shouldFade
                            ? "border-purple-200 bg-purple-100 text-slate-900/75 opacity-80"
                            : "border-purple-200 bg-purple-100 text-slate-900 hover:bg-purple-200 hover:border-purple-300"
                    }`}
                    aria-label="Play word audio"
                  >
                    <Mic className="exercise-listening-mic-icon mx-auto h-6 w-6" />
                  </button>

                  <button
                    onClick={() => handleWordSelect(rightIndex)}
                    disabled={selectedLeft === null || isRightPaired}
                    className={`exercise-listening-word-button w-full self-center px-4 py-2 text-base md:text-lg font-medium rounded-lg border transition-all text-left focus:outline-none focus:ring-2 focus:ring-purple-300 ${
                      isRightPaired
                        ? isRightFlashing
                          ? "border-green-300 bg-green-100 text-green-700 cursor-default"
                          : "invisible pointer-events-none"
                        : isRightIncorrect
                        ? "animate-shake border-red-400 bg-red-100 text-red-700"
                        : "bg-white border-purple-200 text-slate-900 hover:border-purple-400 disabled:opacity-60 disabled:cursor-not-allowed"
                    }`}
                  >
                    <span className="flex min-w-0 items-center justify-start gap-2">
                      <span className="block min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                        {rightItem.word}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
