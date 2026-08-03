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
  return <p className="new-word-info-section-label">{children}</p>;
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
//
// Visual styling for this component lives in
// ../styles/study-new-words.scss (imported once by NewWordStudySession.tsx)
// — this file only assigns the semantic class names.
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
    <div className="new-word-info-step">
      <div className="new-word-info-card">
        <div className="new-word-info-grid">
          {/* Target-language column: identity + audio + metadata. */}
          <div className="new-word-info-col--target">
            <SectionLabel>{targetLanguageName}</SectionLabel>
            <div className="new-word-info-word-row">
              <h2 className="new-word-info-word">{item.targetWord}</h2>
              <button
                type="button"
                onClick={() => speakGuidedWord(item.targetWord, practiceLanguage)}
                aria-label={t("practice.pronounceWord")}
                className="new-word-info-action-button new-word-info-audio-button"
              >
                <Volume2 className="new-word-info-audio-icon" aria-hidden="true" />
              </button>
            </div>

            {/* Badges sit directly under the word they describe, inside the
                same column — attached, not floating in leftover space. */}
            {(item.level || grammarTypeLabel) && (
              <div className="new-word-info-badges">
                {item.level && (
                  <span className="new-word-info-badge new-word-info-badge--level">{item.level}</span>
                )}
                {grammarTypeLabel && (
                  <span className="new-word-info-badge new-word-info-badge--grammar">{grammarTypeLabel}</span>
                )}
              </div>
            )}
          </div>

          {/* Translation-language column: everything here belongs to the
              user's native language, mirroring the left column's structure
              (language label first, then the strongest text, then
              supporting detail) so the two sides read as a clear pair. */}
          <div className="new-word-info-col--translation">
            <SectionLabel>{nativeLanguageName}</SectionLabel>
            <p className="new-word-info-translation">{item.translation}</p>

            {item.definition && <p className="new-word-info-definition">{item.definition}</p>}
          </div>
        </div>

        {/* Example: full width below the two columns, left-accented "quote"
            treatment (not a plain box) so it reads as a learning aid rather
            than a disabled input. No example-translation field exists on
            the resolved queue item, so none is invented here. */}
        {item.exampleSentence && (
          <div className="new-word-info-example">
            <SectionLabel>{t("studyNewWords.exampleSentenceLabel")}</SectionLabel>
            <div className="new-word-info-example-box">
              <p className="new-word-info-example-text">{item.exampleSentence}</p>
            </div>
          </div>
        )}

        {/* Footer: exercise-count context (dynamic, never hardcoded — reads
            GUIDED_EXERCISE_COUNT from the session state module) + primary
            action, full width below everything else. */}
        <div className="new-word-info-footer">
          <p className="new-word-info-helper">
            {t("studyNewWords.exercisesHelperPrefix")}{" "}
            <span className="new-word-info-helper-count">{GUIDED_EXERCISE_COUNT}</span>{" "}
            {t("studyNewWords.exercisesHelperSuffix")}
          </p>
          <button
            type="button"
            onClick={onContinue}
            className="new-word-info-action-button new-word-info-continue-button"
          >
            {t("studyNewWords.startExercisesButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
