import { useEffect, useRef, useState } from "react";
import {
  UniversalExerciseCaret,
  UniversalExerciseInput,
} from "./UniversalExerciseInput";
import { DesktopSpecialCharacters } from "./DesktopSpecialCharacters";
import { MobileKeyboard } from "./MobileKeyboard";
import { getSharedExerciseFieldSizing } from "./sharedFieldSizing";
import { type KeyboardLanguage } from "../../../keyboards/layouts";
import { useLanguage } from "../../../contexts/LanguageContext";

interface WordTypingExerciseProps {
  currentWord: any;
  currentPrompt: string;
  practiceLanguage: string;
  speakWord: () => void;
  onStatusChange: (status: {
    isCorrect: boolean;
    hasTypedAnswer: boolean;
    usedShowWord: boolean;
    usedHintForBrokenWord: boolean;
  }) => void;
}

type WordSegment = {
  text: string;
  startIndex: number;
};

export function WordTypingExercise({
  currentWord,
  currentPrompt,
  practiceLanguage,
  speakWord,
  onStatusChange,
}: WordTypingExerciseProps) {
  const { t } = useLanguage();
  const [userInput, setUserInput] = useState("");
  const [isCorrect, setIsCorrect] = useState(false);
  const [revealedHintIndices, setRevealedHintIndices] = useState<number[]>([]);
  const [hasTypedAnswer, setHasTypedAnswer] = useState(false);
  const [usedShowWord, setUsedShowWord] = useState(false);
  const [caretIndex, setCaretIndex] = useState(0);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [lineCount, setLineCount] = useState(1);
  const charSlotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const hasAutoPlayedCorrectAudioRef = useRef(false);
  const templateWord = currentWord?.word_lemma ?? "";

  const resolveKeyboardLanguage = (language: string): KeyboardLanguage => {
    const normalized = language.trim().toLowerCase();
    const aliases: Record<string, KeyboardLanguage> = {
      en: "en",
      "en-us": "en",
      english: "en",
      de: "de",
      "de-de": "de",
      german: "de",
      ru: "ru",
      "ru-ru": "ru",
      russian: "ru",
      es: "es",
      "es-es": "es",
      spanish: "es",
      fr: "fr",
      "fr-fr": "fr",
      french: "fr",
      pt: "pt",
      "pt-pt": "pt",
      portuguese: "pt",
      it: "it",
      "it-it": "it",
      italian: "it",
    };
    if (aliases[normalized]) {
      return aliases[normalized];
    }
    const supported: KeyboardLanguage[] = ["en", "de", "ru", "es", "fr", "pt", "it"];
    if (supported.includes(normalized as KeyboardLanguage)) {
      return normalized as KeyboardLanguage;
    }
    return "en";
  };

  useEffect(() => {
    setUserInput("");
    setIsCorrect(false);
    setRevealedHintIndices([]);
    setHasTypedAnswer(false);
    setUsedShowWord(false);
    setCaretIndex(0);
    setIsInputFocused(false);
    setLineCount(1);
    hasAutoPlayedCorrectAudioRef.current = false;
    charSlotRefs.current = [];
  }, [currentWord]);

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
  }, [currentWord, userInput, revealedHintIndices, isInputFocused, caretIndex]);

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 1023.98px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);
    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);
    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!currentWord || !userInput.trim() || !currentPrompt) {
      setIsCorrect(false);
      return;
    }

    const userAnswer = userInput.trim().toLowerCase();
    const correctAnswer = currentWord.word_lemma.toLowerCase();
    const inflectedAnswer =
      currentWord.word_inflected?.toLowerCase() || correctAnswer;

    const correct =
      userAnswer === correctAnswer || userAnswer === inflectedAnswer;

    setIsCorrect(correct);
  }, [userInput, currentWord, currentPrompt]);

  useEffect(() => {
    onStatusChange({
      isCorrect,
      hasTypedAnswer,
      usedShowWord,
      usedHintForBrokenWord: false,
    });
  }, [isCorrect, hasTypedAnswer, usedShowWord, onStatusChange]);

  useEffect(() => {
    if (!isCorrect) return;
    const viewportWidth =
      typeof globalThis.innerWidth === "number" ? globalThis.innerWidth : 1024;
    if (viewportWidth >= 1024) return;
    inputRef.current?.blur();
  }, [isCorrect]);

  useEffect(() => {
    if (!isCorrect || hasAutoPlayedCorrectAudioRef.current) return;
    hasAutoPlayedCorrectAudioRef.current = true;
    speakWord();
  }, [isCorrect, speakWord]);

  const updateCaretIndex = (target?: HTMLInputElement | null) => {
    if (!target) return;
    const position =
      target.selectionStart !== null && target.selectionStart !== undefined
        ? target.selectionStart
        : target.value.length;
    setCaretIndex(position);
  };

  const normalizeAgainstTemplate = (candidate: string): string => {
    let normalized = "";
    let templateIndex = 0;

    for (let i = 0; i < candidate.length; i++) {
      const typedChar = candidate[i];
      const expectedChar = templateWord[templateIndex];
      if (expectedChar === undefined) break;

      if (expectedChar === " ") {
        if (typedChar === " ") {
          normalized += " ";
          templateIndex += 1;
          continue;
        }
        break;
      }

      if (typedChar === " ") {
        continue;
      }

      normalized += typedChar;
      templateIndex += 1;
    }

    return normalized;
  };

  const handleMobileKeyboardChange = (nextValue: string) => {
    const maxLength = currentWord?.word_lemma?.length ?? 0;
    const normalizedValue = normalizeAgainstTemplate(nextValue);
    const limitedValue =
      maxLength > 0 ? normalizedValue.slice(0, maxLength) : "";
    setUserInput(limitedValue);
    setHasTypedAnswer(true);
    setCaretIndex(limitedValue.length);
    if (!isInputFocused) {
      setIsInputFocused(true);
    }
  };

  const handleDesktopCharacterInsert = (character: string) => {
    const target = inputRef.current;
    const maxLength = currentWord?.word_lemma?.length ?? 0;
    const selectionStart = target?.selectionStart ?? caretIndex;
    const selectionEnd = target?.selectionEnd ?? selectionStart;
    const nextRawValue =
      userInput.slice(0, selectionStart) +
      character +
      userInput.slice(selectionEnd);
    const normalizedValue = normalizeAgainstTemplate(nextRawValue);
    const limitedValue =
      maxLength > 0 ? normalizedValue.slice(0, maxLength) : "";
    const nextCaretIndex = Math.min(selectionStart + character.length, limitedValue.length);

    setUserInput(limitedValue);
    setHasTypedAnswer(true);
    setIsInputFocused(true);
    setCaretIndex(nextCaretIndex);

    window.requestAnimationFrame(() => {
      if (!inputRef.current) return;
      inputRef.current.focus();
      inputRef.current.setSelectionRange(nextCaretIndex, nextCaretIndex);
    });
  };

  const handleHint = () => {
    if (!currentWord) return;
    const availablePositions: number[] = [];
    for (let i = 0; i < currentWord.word_lemma.length; i++) {
      if (!revealedHintIndices.includes(i) && !userInput[i]) {
        availablePositions.push(i);
      }
    }
    if (availablePositions.length > 0) {
      const randomIndex =
        availablePositions[
          Math.floor(Math.random() * availablePositions.length)
        ];
      setRevealedHintIndices([...revealedHintIndices, randomIndex]);
    }
  };

  const getMaxHints = (): number => {
    if (!currentWord) return 0;
    const wordLength = currentWord.word_lemma.length;
    return wordLength <= 3 ? 0 : Math.floor(wordLength / 2);
  };

  const areHintsAvailable = (): boolean => {
    if (!currentWord) return false;
    const wordLength = currentWord.word_lemma.length;
    if (wordLength <= 3) return false;
    return revealedHintIndices.length < getMaxHints();
  };

  const handleShowWord = () => {
    if (!currentWord) return;
    setUsedShowWord(true);
    setUserInput(currentWord.word_lemma || "");
  };

  const rawWord: string = currentWord?.word_lemma ?? "";
  const wordSegments: WordSegment[] = (() => {
    const parts = rawWord.split(" ");
    let cursor = 0;
    return parts.map((part: string) => {
      const segment = { text: part, startIndex: cursor };
      cursor += part.length + 1; // include one space separator
      return segment;
    });
  })();
  const shouldWrapSingleWord = wordSegments.length === 1;
  const { fieldStyle, enableOverlayAutoFit } =
    getSharedExerciseFieldSizing(rawWord);

  return (
    <div className="w-full flex flex-col items-center">
      <UniversalExerciseInput
        isCorrect={isCorrect}
        onSpeakWord={speakWord}
        fieldStyle={fieldStyle}
        enableOverlayAutoFit={enableOverlayAutoFit}
        overlay={
          <div className="absolute inset-0 flex items-center justify-start pointer-events-none px-4 py-2">
            <div className="flex flex-wrap content-center gap-y-1">
              {wordSegments.map((segment, segmentIndex) => (
                <div
                  key={`segment-${segment.startIndex}`}
                  className={
                    shouldWrapSingleWord
                      ? "inline-flex flex-wrap"
                      : "inline-flex"
                  }
                  data-compound-segment="true"
                  style={{
                    gap: "0.5em",
                    width: shouldWrapSingleWord ? "100%" : undefined,
                    marginRight:
                      segmentIndex < wordSegments.length - 1 ? "0.25em" : "0",
                  }}
                >
                  {segment.text.split("").map((letter: string, offset: number) => {
                    const index = segment.startIndex + offset;
                    const isHintPosition =
                      revealedHintIndices.includes(index) && !usedShowWord;
                    const userTypedChar = userInput[index];

                    let displayChar;
                    let charStyle = "text-foreground";

                    if (
                      userTypedChar !== undefined &&
                      userTypedChar !== null
                    ) {
                      displayChar = userTypedChar;
                      charStyle = isCorrect ? "text-primary" : "text-foreground";
                    } else if (isHintPosition) {
                      displayChar = letter;
                      charStyle = "text-primary/60";
                    } else {
                      displayChar = "_";
                      charStyle = "text-muted-foreground/50";
                    }

                    const showCaret = isInputFocused && caretIndex === index;
                    const isEmptyInputAtStart =
                      index === 0 && caretIndex === 0 && userInput.length === 0;
                    const caretPositionClass =
                      isEmptyInputAtStart
                        ? "-left-[0.25em]"
                        : index === 0
                          ? "left-[calc(100%+0.25em)]"
                          : "-left-[0.25em]";

                    return (
                      <div
                        key={`char-${index}`}
                        className="relative flex flex-col items-center"
                        ref={(node) => {
                          charSlotRefs.current[index] = node;
                        }}
                        style={{ width: "1ch" }}
                      >
                        {showCaret && (
                          <UniversalExerciseCaret className={caretPositionClass} />
                        )}
                        <span
                          className={`exercise-answer-char text-xl md:text-2xl font-medium text-center whitespace-pre font-mono ${charStyle}`}
                        >
                          {displayChar}
                        </span>
                      </div>
                    );
                  })}
                  {segmentIndex < wordSegments.length - 1 && (
                    <div
                      className="relative flex flex-col items-center"
                      ref={(node) => {
                        charSlotRefs.current[segment.startIndex + segment.text.length] = node;
                      }}
                      style={{ width: "0.35ch" }}
                    >
                      {isInputFocused &&
                        caretIndex === segment.startIndex + segment.text.length && (
                          <UniversalExerciseCaret />
                        )}
                      <span className="exercise-answer-char text-xl md:text-2xl font-medium text-center whitespace-pre font-mono text-foreground" />
                    </div>
                  )}
                </div>
              ))}
              {isInputFocused &&
                caretIndex === (currentWord?.word_lemma?.length ?? 0) && (
                  <div className="relative" style={{ width: "0ch" }}>
                    <UniversalExerciseCaret className="left-[0.25em]" />
                  </div>
                )}
            </div>
          </div>
        }
        inputProps={{
          type: "text",
          value: userInput,
          onPointerDown: (e) => {
            if (!isMobileViewport) return;
            e.preventDefault();
            setIsInputFocused(true);
            setCaretIndex(userInput.length);
          },
          onChange: (e) => {
            const normalizedValue = normalizeAgainstTemplate(e.target.value);
            setUserInput(normalizedValue);
            setHasTypedAnswer(true);
            requestAnimationFrame(() => {
              e.target.value = normalizedValue;
              updateCaretIndex(e.target);
            });
          },
          onKeyDown: (e) => {
            if (e.key !== " ") return;
            const cursorPosition =
              e.currentTarget.selectionStart !== null
                ? e.currentTarget.selectionStart
                : userInput.length;
            if (templateWord[cursorPosition] !== " ") {
              e.preventDefault();
            }
          },
          onSelect: (e) => updateCaretIndex(e.target as HTMLInputElement),
          onKeyUp: (e) =>
            updateCaretIndex(e.currentTarget as HTMLInputElement),
          onClick: (e) => {
            if (isMobileViewport) {
              setIsInputFocused(true);
              setCaretIndex(userInput.length);
              return;
            }
            updateCaretIndex(e.currentTarget as HTMLInputElement);
          },
          onFocus: (e) => {
            if (isMobileViewport) {
              setIsInputFocused(true);
              setCaretIndex(userInput.length);
              e.currentTarget.blur();
              inputRef.current = null;
              return;
            }
            inputRef.current = e.currentTarget;
            setIsInputFocused(true);
            updateCaretIndex(e.target);
          },
          onBlur: () => {
            if (!isMobileViewport) {
              setIsInputFocused(false);
            }
            inputRef.current = null;
          },
          maxLength: currentWord.word_lemma.length,
          autoCapitalize: "off",
          autoCorrect: "off",
          inputMode: isMobileViewport ? "none" : "text",
          readOnly: isMobileViewport,
          spellCheck: "false",
        }}
        inputClassName={`exercise-answer-input w-full text-xl md:text-2xl px-4 py-3 bg-background border-2 rounded-xl outline-none transition-all text-left font-medium font-mono caret-primary ${
          isCorrect
            ? "border-primary bg-primary/10"
            : "border-border focus:border-primary"
        }`}
        inputStyle={{
          color: "transparent",
          caretColor: "transparent",
          minHeight:
            lineCount > 1 ? `${48 + (lineCount - 1) * 24}px` : undefined,
        }}
      />
      {!isMobileViewport && !isCorrect && (
        <DesktopSpecialCharacters
          language={resolveKeyboardLanguage(practiceLanguage)}
          onInsert={handleDesktopCharacterInsert}
        />
      )}

      <div
        className={`mt-6 flex items-start justify-center ${
          isCorrect ? "min-h-[0.75rem]" : "min-h-[3.25rem]"
        }`}
      >
        {!isCorrect && (
          <div className="flex justify-center gap-3">
            <button
              onClick={handleShowWord}
              disabled={usedShowWord || isCorrect}
              className="exercise-action-button px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("practice.showMeWord")}
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={handleHint}
                disabled={!areHintsAvailable() || usedShowWord || isCorrect}
                className="exercise-action-button exercise-hint-button px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("practice.hint")}
              </button>
              {getMaxHints() > 0 && (
                <span className="text-xs text-muted-foreground font-medium">
                  {revealedHintIndices.length} / {getMaxHints()}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      {isMobileViewport && isInputFocused && !isCorrect && (
        <MobileKeyboard
          language={resolveKeyboardLanguage(practiceLanguage)}
          value={userInput}
          onChange={handleMobileKeyboardChange}
          canInsertSpace={templateWord[userInput.length] === " "}
          onClose={() => {
            setIsInputFocused(false);
            inputRef.current?.blur();
          }}
        />
      )}
    </div>
  );
}
