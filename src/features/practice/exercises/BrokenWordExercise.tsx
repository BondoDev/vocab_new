import { useEffect, useMemo, useRef, useState } from "react";
import { shuffleArray } from "../../../utils/shuffleArray";
import { UniversalExerciseInput } from "./UniversalExerciseInput";
import { getSharedExerciseFieldSizing } from "./sharedFieldSizing";
import { useLanguage } from "../../../contexts/LanguageContext";

interface BrokenWordExerciseProps {
  currentWord: any;
  speakWord: () => void;
  onStatusChange: (status: {
    isCorrect: boolean;
    hasTypedAnswer: boolean;
    usedShowWord: boolean;
    usedHintForBrokenWord: boolean;
  }) => void;
}

export function BrokenWordExercise({
  currentWord,
  speakWord,
  onStatusChange,
}: BrokenWordExerciseProps) {
  const { t } = useLanguage();
  const [wordChunks, setWordChunks] = useState<string[]>([]);
  const [shuffledChunks, setShuffledChunks] = useState<string[]>([]);
  const [placedChunks, setPlacedChunks] = useState<string[]>([]);
  const [placedChunkIndices, setPlacedChunkIndices] = useState<number[]>([]);
  const [usedChunks, setUsedChunks] = useState<boolean[]>([]);
  const [lockedSlots, setLockedSlots] = useState<boolean[]>([]);
  const [usedHintForBrokenWord, setUsedHintForBrokenWord] = useState(false);
  const [showIncorrectFeedback, setShowIncorrectFeedback] = useState(false);
  const [usedShowWord, setUsedShowWord] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [lineCount, setLineCount] = useState(1);
  const charSlotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const hasAutoPlayedCorrectAudioRef = useRef(false);
  const rawWord: string = currentWord?.word_lemma ?? "";
  const { fieldStyle } = getSharedExerciseFieldSizing(rawWord);

  const wordSegments = useMemo(() => {
    const parts = rawWord.split(" ");
    let cursor = 0;
    return parts.map((part) => {
      const segment = { text: part, startIndex: cursor };
      cursor += part.length + 1;
      return segment;
    });
  }, [rawWord]);

  const shouldWrapSingleWord = wordSegments.length === 1;

  const placedJoinedWord = useMemo(() => placedChunks.join(""), [placedChunks]);

  const placedChunkIndexByCharIndex = useMemo(() => {
    const map: number[] = [];
    let cursor = 0;
    placedChunks.forEach((chunk, chunkIndex) => {
      for (let i = 0; i < chunk.length; i += 1) {
        map[cursor + i] = chunkIndex;
      }
      cursor += chunk.length;
    });
    return map;
  }, [placedChunks]);

  const splitWordIntoChunks = (word: string): string[] => {
    const chunks: string[] = [];
    for (let i = 0; i < word.length; i += 2) {
      if (i + 1 < word.length) {
        chunks.push(word.substring(i, i + 2));
      } else {
        chunks.push(word.substring(i));
      }
    }
    return chunks;
  };

  const initializeBrokenWord = () => {
    const chunks = splitWordIntoChunks(currentWord.word_lemma);
    const shuffled = shuffleArray([...chunks]);

    setWordChunks(chunks);
    setShuffledChunks(shuffled);
    setPlacedChunks([]);
    setPlacedChunkIndices([]);
    setUsedChunks(new Array(shuffled.length).fill(false));
    setLockedSlots(new Array(chunks.length).fill(false));
    setUsedHintForBrokenWord(false);
    setShowIncorrectFeedback(false);
    setUsedShowWord(false);
    setIsCorrect(false);
    setLineCount(1);
    hasAutoPlayedCorrectAudioRef.current = false;
    charSlotRefs.current = [];
  };

  useEffect(() => {
    if (!currentWord) return;
    initializeBrokenWord();
    onStatusChange({
      isCorrect: false,
      hasTypedAnswer: false,
      usedShowWord: false,
      usedHintForBrokenWord: false,
    });
  }, [currentWord, onStatusChange]);

  useEffect(() => {
    onStatusChange({
      isCorrect,
      hasTypedAnswer: placedChunks.length > 0,
      usedShowWord,
      usedHintForBrokenWord,
    });
  }, [
    isCorrect,
    placedChunks.length,
    usedShowWord,
    usedHintForBrokenWord,
    onStatusChange,
  ]);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => {
      const linePositions = new Set<number>();
      charSlotRefs.current.forEach((node) => {
        if (node) {
          linePositions.add(node.offsetTop);
        }
      });
      setLineCount(Math.max(1, linePositions.size));
    });

    return () => window.cancelAnimationFrame(raf);
  }, [wordChunks, placedChunks, usedShowWord, rawWord]);

  useEffect(() => {
    if (!isCorrect || hasAutoPlayedCorrectAudioRef.current) return;
    hasAutoPlayedCorrectAudioRef.current = true;
    speakWord();
  }, [isCorrect, speakWord]);

  useEffect(() => {
    const handleResize = () => {
      const linePositions = new Set<number>();
      charSlotRefs.current.forEach((node) => {
        if (node) {
          linePositions.add(node.offsetTop);
        }
      });
      setLineCount(Math.max(1, linePositions.size));
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const checkBrokenWordAnswer = (placed: string[]) => {
    // Validate against the full assembled string so duplicate chunks
    // are interchangeable and not tied to shuffled source indices.
    const isCorrectOrder = placed.join("") === rawWord;

    if (isCorrectOrder) {
      setIsCorrect(true);
      setShowIncorrectFeedback(false);
    } else {
      setShowIncorrectFeedback(true);
      setTimeout(() => {
        clearBrokenWordSlots();
      }, 800);
    }
  };

  const clearBrokenWordSlots = () => {
    setPlacedChunks([]);
    setPlacedChunkIndices([]);
    setUsedChunks(new Array(shuffledChunks.length).fill(false));
    setLockedSlots(new Array(wordChunks.length).fill(false));
    setUsedHintForBrokenWord(false);
    setShowIncorrectFeedback(false);
  };

  const handleChunkSelect = (chunkIndex: number) => {
    if (usedChunks[chunkIndex]) return;

    const nextSlotIndex = placedChunks.length;
    if (lockedSlots[nextSlotIndex]) return;

    const newPlacedChunks = [...placedChunks, shuffledChunks[chunkIndex]];
    const newPlacedChunkIndices = [...placedChunkIndices, chunkIndex];
    const newUsedChunks = [...usedChunks];
    newUsedChunks[chunkIndex] = true;

    setPlacedChunks(newPlacedChunks);
    setPlacedChunkIndices(newPlacedChunkIndices);
    setUsedChunks(newUsedChunks);

    if (newPlacedChunks.length === wordChunks.length) {
      checkBrokenWordAnswer(newPlacedChunks);
    }
  };

  const handlePlacedChunkRemove = (slotIndex: number) => {
    if (slotIndex !== placedChunks.length - 1) return;
    if (lockedSlots[slotIndex]) return;
    const sourceChunkIndex = placedChunkIndices[slotIndex];
    if (sourceChunkIndex === undefined) return;

    const newPlacedChunks = placedChunks.filter((_, i) => i !== slotIndex);
    const newPlacedChunkIndices = placedChunkIndices.filter(
      (_, i) => i !== slotIndex,
    );
    const newUsedChunks = [...usedChunks];
    newUsedChunks[sourceChunkIndex] = false;

    setPlacedChunks(newPlacedChunks);
    setPlacedChunkIndices(newPlacedChunkIndices);
    setUsedChunks(newUsedChunks);
    setIsCorrect(false);
    setShowIncorrectFeedback(false);
  };

  const handleBrokenWordHint = () => {
    if (usedHintForBrokenWord || wordChunks.length === 0) return;

    const firstCorrectChunk = wordChunks[0];
    const currentFirstSourceIndex = placedChunkIndices[0];

    const candidateIndices = shuffledChunks
      .map((chunk, index) => (chunk === firstCorrectChunk ? index : -1))
      .filter((index) => index !== -1);

    if (candidateIndices.length === 0) return;

    const selectedHintSourceIndex =
      currentFirstSourceIndex !== undefined &&
      candidateIndices.includes(currentFirstSourceIndex)
        ? currentFirstSourceIndex
        : candidateIndices.find((index) => !usedChunks[index]) ??
          candidateIndices[0];

    type PlacedEntry = { chunk: string; sourceIndex: number };
    const retainedEntries: PlacedEntry[] = [];

    for (let slot = 1; slot < placedChunks.length; slot += 1) {
      const sourceIndex = placedChunkIndices[slot];
      if (sourceIndex === undefined) continue;
      if (sourceIndex === selectedHintSourceIndex) continue;
      retainedEntries.push({
        chunk: placedChunks[slot],
        sourceIndex,
      });
    }

    const newPlacedChunkIndices = [
      selectedHintSourceIndex,
      ...retainedEntries.map((entry) => entry.sourceIndex),
    ];
    const newPlacedChunks = [
      firstCorrectChunk,
      ...retainedEntries.map((entry) => entry.chunk),
    ];

    const newUsedChunks = new Array(shuffledChunks.length).fill(false);
    newPlacedChunkIndices.forEach((sourceIndex) => {
      if (sourceIndex !== undefined) {
        newUsedChunks[sourceIndex] = true;
      }
    });

    const newLockedSlots = new Array(wordChunks.length).fill(false);
    newLockedSlots[0] = true;

    setPlacedChunks(newPlacedChunks);
    setPlacedChunkIndices(newPlacedChunkIndices);
    setUsedChunks(newUsedChunks);
    setLockedSlots(newLockedSlots);
    setUsedHintForBrokenWord(true);

    if (newPlacedChunks.length === wordChunks.length) {
      checkBrokenWordAnswer(newPlacedChunks);
    }
  };

  const handleShowWord = () => {
    setUsedShowWord(true);
    setPlacedChunks([...wordChunks]);
    setPlacedChunkIndices([]);
    setUsedChunks(new Array(shuffledChunks.length).fill(true));
    setIsCorrect(true);
  };

  return (
    <div className={`space-y-6 ${isCorrect ? "pb-12" : ""}`}>
      <UniversalExerciseInput
        isCorrect={isCorrect}
        onSpeakWord={speakWord}
        fieldStyle={fieldStyle}
        enableOverlayAutoFit={false}
        overlay={
          <div className="absolute inset-0 flex items-center justify-start px-4 py-2">
            <div className="flex flex-wrap content-center gap-y-1">
              {wordSegments.map((segment, segmentIndex) => (
                <div
                  key={`segment-${segment.startIndex}`}
                  className={
                    shouldWrapSingleWord ? "inline-flex flex-wrap" : "inline-flex"
                  }
                  data-compound-segment="true"
                  style={{
                    gap: "0.5em",
                    width: shouldWrapSingleWord ? "100%" : undefined,
                    marginRight:
                      segmentIndex < wordSegments.length - 1 ? "0.25em" : "0",
                  }}
                >
                  {segment.text.split("").map((_, offset) => {
                    const charIndex = segment.startIndex + offset;
                    const placedChar = placedJoinedWord[charIndex];
                    const hasPlacedChar =
                      typeof placedChar === "string" &&
                      placedChar.length > 0 &&
                      placedChar !== " ";
                    const displayChar = hasPlacedChar ? placedChar : "_";
                    const chunkIndex =
                      placedChunkIndexByCharIndex[charIndex] ?? -1;
                    const canRemoveChunk =
                      hasPlacedChar &&
                      chunkIndex === placedChunks.length - 1 &&
                      !lockedSlots[chunkIndex] &&
                      !isCorrect &&
                      !usedShowWord;

                    return (
                      <div
                        key={`char-${charIndex}`}
                        className="relative flex flex-col items-center"
                        ref={(node) => {
                          charSlotRefs.current[charIndex] = node;
                        }}
                        style={{ width: "1ch" }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            chunkIndex >= 0
                              ? handlePlacedChunkRemove(chunkIndex)
                              : undefined
                          }
                          disabled={!canRemoveChunk}
                          className={`exercise-answer-char text-xl md:text-2xl font-medium text-center whitespace-pre font-mono ${
                            hasPlacedChar
                              ? "text-foreground disabled:cursor-default"
                              : "text-muted-foreground/50"
                          }`}
                        >
                          {displayChar}
                        </button>
                      </div>
                    );
                  })}
                  {segmentIndex < wordSegments.length - 1 && (
                    <div
                      className="relative flex flex-col items-center"
                      ref={(node) => {
                        charSlotRefs.current[
                          segment.startIndex + segment.text.length
                        ] = node;
                      }}
                      style={{ width: "0.35ch" }}
                    >
                      <span className="exercise-answer-char text-xl md:text-2xl font-medium text-center whitespace-pre font-mono text-foreground" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        }
        inputProps={{
          type: "text",
          value: placedChunks.join(""),
          readOnly: true,
          tabIndex: -1,
          "aria-hidden": true,
        }}
        inputClassName={`exercise-answer-input w-full text-xl md:text-2xl px-4 py-0 flex items-center justify-center text-center font-medium rounded-xl border-2 transition-colors outline-none ${
          showIncorrectFeedback
            ? "border-red-500 bg-red-50/50"
            : isCorrect
              ? "border-primary bg-primary/10"
              : "border-border bg-background"
        }`}
        inputStyle={{
          minHeight: lineCount > 1 ? `${56 + (lineCount - 1) * 24}px` : "56px",
          color: "transparent",
          caretColor: "transparent",
          pointerEvents: "none",
        }}
      />

      {!isCorrect && (
        <>
          <div className="flex justify-center">
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {shuffledChunks.map((chunk, chunkIndex) => (
                <button
                  key={chunkIndex}
                  onClick={() => handleChunkSelect(chunkIndex)}
                  disabled={usedChunks[chunkIndex] || usedShowWord}
                  className={`exercise-broken-chunk-button px-2.5 py-1 text-lg font-medium rounded-lg border-2 transition-all ${
                    usedChunks[chunkIndex]
                      ? "border-muted bg-muted text-muted-foreground opacity-30 cursor-not-allowed"
                      : "border-[#34205f] bg-[#34205f] text-white hover:bg-[#46307a] active:bg-[#28174a]"
                  }`}
                >
                  {chunk.toLocaleLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-center gap-3 mb-2">
            <button
              onClick={handleShowWord}
              disabled={usedShowWord || isCorrect}
              className="exercise-action-button px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("practice.showMeWord")}
            </button>
            <button
              onClick={handleBrokenWordHint}
              disabled={usedHintForBrokenWord || usedShowWord || isCorrect}
              className="exercise-action-button px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("practice.hint")}
            </button>
          </div>
        </>
      )}

      {showIncorrectFeedback && (
        <div className="text-center text-red-600 font-medium">
          {t("practice.incorrectOrderTryAgain")}
        </div>
      )}
    </div>
  );
}
