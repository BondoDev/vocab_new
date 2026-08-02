import { Volume2 } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import type { ResolvedStudyQueueItem } from "../../../data/learning/newWordStudyQueue";
import { speakGuidedWord } from "../utils/speakGuidedWord";
import { GUIDED_EXERCISE_COUNT } from "../newWordStudySessionState";

interface NewWordInfoStepProps {
  item: ResolvedStudyQueueItem;
  practiceLanguage: string;
  // Native/source language UI code — only used to render an explicit
  // "German" / "English" style label next to the translation, via the same
  // languageNames.* keys already used elsewhere (App.tsx, NewWordStudyComplete).
  // Never hardcoded.
  yourLanguage: string;
  onContinue: () => void;
}

// Same fallback used by PracticeResults.tsx/VocabularyPractice.tsx for an
// untranslated wordTypes.* id: title-case the raw value instead of showing a
// raw translation key. The grammar label always comes from item.grammarType
// (the real value resolved from the vocabulary data) — never hardcoded.
function formatWordTypeLabel(typeId: string): string {
  return typeId
    .split(/[_-]+/g)
    .map((part) => (part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

// Small uppercase muted label shared across the card (language names,
// translation/definition/example section titles) so every label reads as
// part of one consistent system rather than one-off styling per section.
function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/80">
      {children}
    </p>
  );
}

// Merely viewing this card must not complete the word — completion only
// happens once the guided exercises (broken/half/full) are done, so this
// step has exactly one action: hand off to the exercise sequence.
//
// Two-column on desktop (md+): left column is entirely "target language"
// (language label, word, audio, CEFR/grammar badges), right column is
// entirely "translation language" (language label, translation, definition).
// That split is what makes the language relationship legible at a glance —
// everything on the left belongs to one language, everything on the right
// to the other — and it uses the card's width instead of leaving it empty
// next to a short word. Collapses to a single stacked column on mobile
// (target-language block first, then translation-language block).
export function NewWordInfoStep({ item, practiceLanguage, yourLanguage, onContinue }: NewWordInfoStepProps) {
  const { t } = useLanguage();

  const grammarTypeLabel = item.grammarType
    ? (() => {
        const translated = t(`wordTypes.${item.grammarType}`);
        return translated === `wordTypes.${item.grammarType}`
          ? formatWordTypeLabel(item.grammarType!)
          : translated;
      })()
    : null;

  const targetLanguageName = t(`languageNames.${practiceLanguage}`);
  const nativeLanguageName = t(`languageNames.${yourLanguage}`);

  return (
    <div className="flex flex-col items-center py-6 md:py-8">
      <div className="w-full max-w-[520px] md:max-w-[600px] lg:max-w-[640px] mx-auto rounded-2xl border border-border bg-card shadow-sm px-5 py-6 sm:px-7 sm:py-7 md:px-8 md:py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-0 md:divide-x md:divide-border/60">
          {/* Target-language column: identity + audio + metadata. */}
          <div className="md:pr-7">
            <SectionLabel>{targetLanguageName}</SectionLabel>
            <div className="flex flex-wrap items-center gap-2.5 mt-1">
              <h2 className="min-w-0 max-w-full text-3xl md:text-4xl font-bold text-foreground break-words leading-tight">
                {item.targetWord}
              </h2>
              <button
                type="button"
                onClick={() => speakGuidedWord(item.targetWord, practiceLanguage)}
                aria-label={t("practice.pronounceWord")}
                className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 active:bg-primary/95 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
              >
                <Volume2 className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Badges sit directly under the word they describe, inside the
                same column — attached, not floating in leftover space. */}
            {(item.level || grammarTypeLabel) && (
              <div className="flex items-center gap-2 flex-wrap mt-3">
                {item.level && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold uppercase bg-muted text-muted-foreground">
                    {item.level}
                  </span>
                )}
                {grammarTypeLabel && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary">
                    {grammarTypeLabel}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Translation-language column: everything here belongs to the
              user's native language, mirroring the left column's structure
              (language label first, then the strongest text, then
              supporting detail) so the two sides read as a clear pair. */}
          <div className="md:pl-7 mt-6 md:mt-0">
            <SectionLabel>{nativeLanguageName}</SectionLabel>
            <p className="mt-1 text-xl md:text-2xl font-semibold text-foreground break-words">
              {item.translation}
            </p>

            {item.definition && (
              <p className="mt-2.5 text-sm md:text-[0.95rem] text-muted-foreground break-words">
                {item.definition}
              </p>
            )}
          </div>
        </div>

        {/* Example: full width below the two columns, left-accented "quote"
            treatment (not a plain box) so it reads as a learning aid rather
            than a disabled input. No example-translation field exists on
            the resolved queue item, so none is invented here. */}
        {item.exampleSentence && (
          <div className="mt-6">
            <SectionLabel>{t("studyNewWords.exampleSentenceLabel")}</SectionLabel>
            <div className="mt-1.5 rounded-lg border-l-[3px] border-primary/40 bg-muted/40 pl-3.5 pr-4 py-2.5">
              <p className="text-sm md:text-[0.95rem] italic text-foreground/85 break-words">
                {item.exampleSentence}
              </p>
            </div>
          </div>
        )}

        {/* Footer: exercise-count context (dynamic, never hardcoded — reads
            GUIDED_EXERCISE_COUNT from the session state module) + primary
            action, full width below everything else. */}
        <div className="mt-6 pt-4 border-t border-border/60">
          <p className="text-xs text-muted-foreground mb-2.5">
            {t("studyNewWords.exercisesHelperPrefix")}{" "}
            <span className="font-semibold text-foreground/80">{GUIDED_EXERCISE_COUNT}</span>{" "}
            {t("studyNewWords.exercisesHelperSuffix")}
          </p>
          <button
            type="button"
            onClick={onContinue}
            className="w-full py-3.5 rounded-lg bg-primary text-primary-foreground text-base font-semibold shadow-sm hover:bg-primary/90 active:bg-primary/95 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
          >
            {t("studyNewWords.startExercisesButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
