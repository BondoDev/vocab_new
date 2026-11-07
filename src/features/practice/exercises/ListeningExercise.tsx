import { useEffect, useMemo, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { shuffleArray } from "../../../utils/shuffleArray";
import { useLanguage } from "../../../contexts/LanguageContext";
import { useExerciseAnnouncer } from "./useExerciseAnnouncer";

interface ListeningExerciseProps {
  words: any[];
  currentIndex: number;
  exerciseWords?: any[];
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
  exerciseWords,
  translations,
  sourceLabel,
  targetLabel,
  onSpeakWord,
  onStatusChange,
}: ListeningExerciseProps) {
  const { t } = useLanguage();
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
  const { announce, clear: clearAnnouncement, liveRegion } = useExerciseAnnouncer();
  const gridRef = useRef<HTMLDivElement | null>(null);

  // Distinct names by position only ("Play word audio 2 of 4"), so the
  // options can be told apart without revealing which word each one plays.
  // Reuses the localized "{selected} of {total}" template.
  const getAudioLabel = (rowIndex: number) =>
    `${t("practice.playWordAudio")} ${t("levelCategory.filtersPage.summary.ofTotal")
      .replace("{selected}", String(rowIndex + 1))
      .replace("{total}", String(leftItems.length))}`;

  // A matched pair (or a reset after a wrong pick) disables the focused
  // button, which would drop keyboard focus to the page. Put it back on an
  // audio option that can still be chosen — the given one if available —
  // but only when focus was in this grid, so pointer users see no change.
  const restoreAudioFocus = (rowIndex?: number) => {
    const grid = gridRef.current;
    if (!grid) return;
    const active = document.activeElement;
    if (active && active !== document.body && !grid.contains(active)) return;
    window.requestAnimationFrame(() => {
      const current = gridRef.current;
      if (!current) return;
      const preferred =
        rowIndex === undefined
          ? null
          : current.querySelector<HTMLButtonElement>(`[data-audio-index="${rowIndex}"]:not(:disabled)`);
      (preferred ?? current.querySelector<HTMLButtonElement>("[data-audio-index]:not(:disabled)"))?.focus();
    });
  };
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
    const fourWords = exerciseWords ?? words.slice(currentIndex, currentIndex + 4);
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
  }, [currentIndex, exerciseWords, words, translations, onStatusChange]);

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
      announce(t("practice.correct"));
      restoreAudioFocus();
      return;
    }

    setIncorrectPair({ leftIndex: selectedLeft, rightIndex });
    announce(t("practice.answerIncorrect"));
    const wrongLeftIndex = selectedLeft;
    setTimeout(() => {
      setIncorrectPair(null);
      setSelectedLeft(null);
      clearAnnouncement();
      restoreAudioFocus(wrongLeftIndex);
    }, 600);
  };

  return (
    <div className="w-full space-y-4">
      {liveRegion}
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
        <div className="exercise-listening-grid w-full grid grid-cols-2 gap-x-8 max-w-2xl mx-auto items-center mt-1">
          <h4 className="exercise-pair-column-label">
            {sourceLabel}
          </h4>
          <h4 className="exercise-pair-column-label">
            {targetLabel}
          </h4>
        </div>
        {isComplete ? (
          <div className="relative w-full max-w-2xl mx-auto"
          >
            <div className="grid gap-y-3">
              {pairedRows.map((pair) => (
                <div key={`${pair.word}-${pair.meaning}-row`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-4">
                  <button
                    disabled
                    className="exercise-connect-button w-full min-w-0 self-center px-4 py-2 text-base md:text-lg font-medium rounded-xl border border-green-200 bg-green-50 text-green-700 cursor-default text-left"
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
                    className="exercise-connect-button w-full min-w-0 self-center px-4 py-2 text-base md:text-lg font-medium rounded-xl border border-green-200 bg-green-50 text-green-700 cursor-default text-left"
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
        <div ref={gridRef} className="exercise-listening-grid w-full grid grid-cols-2 gap-x-3 gap-y-3 max-w-2xl mx-auto items-center">
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
                    className={`exercise-listening-mic-button exercise-pair-tile w-full px-4 py-2.5 rounded-xl border transition-all text-center focus:outline-none ${
                      isLeftPaired
                        ? isLeftFlashing
                          ? "border-green-300 bg-green-50 text-green-700 cursor-default"
                          : "invisible pointer-events-none"
                        : isLeftIncorrect
                        ? "animate-shake border-red-400 bg-red-50 text-red-700"
                        : isLeftSelected
                          ? "is-selected bg-white text-slate-900"
                          : shouldFade
                            ? "bg-white text-slate-900/70 opacity-80"
                            : "bg-white text-slate-900"
                    }`}
                    aria-label={getAudioLabel(rowIndex)}
                    // Choosing an audio clip is a toggle (choose it, then
                    // its meaning), exposed as a pressed state.
                    aria-pressed={isLeftSelected}
                    data-exercise-option=""
                    data-audio-index={rowIndex}
                  >
                    <Mic className="exercise-listening-mic-icon mx-auto h-6 w-6" />
                  </button>

                  <button
                    onClick={() => handleWordSelect(rightIndex)}
                    disabled={selectedLeft === null || isRightPaired}
                    className={`exercise-listening-word-button exercise-pair-tile w-full self-center px-4 py-2.5 text-base md:text-lg font-semibold rounded-xl border transition-all text-left focus:outline-none ${
                      isRightPaired
                        ? isRightFlashing
                          ? "border-green-300 bg-green-50 text-green-700 cursor-default"
                          : "invisible pointer-events-none"
                        : isRightIncorrect
                        ? "animate-shake border-red-400 bg-red-50 text-red-700"
                        : "bg-white text-slate-900 disabled:opacity-60 disabled:cursor-not-allowed"
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
