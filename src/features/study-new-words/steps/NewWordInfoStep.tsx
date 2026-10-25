import { useMemo } from "react";
import { ArrowRight, CornerDownRight, Volume2 } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import type { ResolvedStudyQueueItem } from "../../../data/learning/newWordStudyQueue";
import { useRandomCardSurface, type MotionCssVars } from "../../../exercises/exerciseTheme";
import { speakGuidedWord } from "../utils/speakGuidedWord";
// Same word-highlighting utility VocabularyPractice.tsx already uses to bold
// a concept's conjugated/separated forms inside its example sentence —
// reused here rather than re-implemented so both flows highlight identically.
import { highlightInflectedWords } from "../../practice/utils/highlightInflectedWords";

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

type WordCardCssVars = MotionCssVars<"--pc-surface">;

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

// Merely viewing this card must not complete the word — completion only
// happens once the guided exercises (broken/half/full) are done, so this
// step has exactly one action: hand off to the exercise sequence.
//
// Laid out as one two-sided flashcard rather than stacked, separately styled
// blocks:
// - Front (colored head): the word in the target language — language name,
//   the word with its audio button beside it, and one combined CEFR + grammar
//   chip directly under it, so the metadata reads as a property of the word.
//   The head uses the practice card's random surface (useRandomCardSurface),
//   the same treatment the three exercise cards that follow use, so this card
//   reads as the first card of that word's deck.
// - Bridge: the translation, in a band tinted with a light version of the
//   head's color directly under it, so it reads as the word's continuation
//   rather than a new section. A small "↳" cue beside the native-language
//   label marks the "translates to" relationship.
// - Back (card body): three labelled groups spaced by relationship —
//   definition, then example (sentence + listen control), then the action.
//
// Visual styling lives in ../styles/study-new-words.scss (imported by
// NewWordStudySession.tsx) — this file only assigns the semantic class names.
export function NewWordInfoStep({ item, practiceLanguage, yourLanguage, onContinue }: NewWordInfoStepProps) {
  const { t } = useLanguage();
  // Keyed per word, so every new word gets a fresh color; this step only
  // renders client-side inside an active session, so the random value can't
  // cause a hydration mismatch.
  const surfaceColor = useRandomCardSurface(`${item.conceptId}-intro`);
  const cardStyle: WordCardCssVars = { "--pc-surface": surfaceColor };

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

  // highlightInflectedWords reads its forms off arbitrary "*inflected*"-named
  // keys (see that module), so item.exampleSentenceInflectedForms — already
  // scoped to this one concept by the data resolver — is adapted into a
  // single synthetic entry rather than needing a concept_id to filter by.
  const highlightedExampleSentence = useMemo(() => {
    if (!item.exampleSentence) return "";
    const forms = item.exampleSentenceInflectedForms;
    if (!forms?.length) return item.exampleSentence;
    const syntheticEntry = Object.fromEntries(forms.map((form, index) => [`word_inflected-${index}`, form]));
    return highlightInflectedWords(item.exampleSentence, practiceLanguage, [syntheticEntry]);
  }, [item.exampleSentence, item.exampleSentenceInflectedForms, practiceLanguage]);

  return (
    <div className="new-word-info-step">
      <article className="new-word-info-card" style={cardStyle} aria-labelledby="new-word-info-word">
        <header className="new-word-info-head">
          <p className="new-word-info-language">{targetLanguageName}</p>
          <div className="new-word-info-word-row">
            <h2 id="new-word-info-word" className="new-word-info-word" lang={practiceLanguage}>
              {item.targetWord}
            </h2>
            <button
              type="button"
              onClick={() => speakGuidedWord(item.targetWord, practiceLanguage)}
              aria-label={t("practice.pronounceWord")}
              className="new-word-info-audio-button"
            >
              <Volume2 className="new-word-info-audio-icon" aria-hidden="true" />
            </button>
          </div>

          {/* One chip, two segments: level (stronger) then part of speech.
              Either segment is omitted when its data is missing; the chip
              wraps as a unit under long words and long localized labels. */}
          {(item.level || grammarTypeLabel) && (
            <p className="new-word-info-meta">
              {item.level && <span className="new-word-info-meta-level">{item.level}</span>}
              {grammarTypeLabel && <span className="new-word-info-meta-grammar">{grammarTypeLabel}</span>}
            </p>
          )}
        </header>

        <div className="new-word-info-bridge">
          <p className="new-word-info-bridge-label">
            <CornerDownRight className="new-word-info-bridge-icon" aria-hidden="true" />
            <span>{nativeLanguageName}</span>
          </p>
          <p className="new-word-info-translation" lang={yourLanguage}>
            {item.translation}
          </p>
        </div>

        <div className="new-word-info-body">
          {item.definition && (
            <section className="new-word-info-definition-group">
              <p className="new-word-info-label">{t("studyNewWords.definitionLabel")}</p>
              <p className="new-word-info-definition">{item.definition}</p>
            </section>
          )}

          {/* Example in context: label + listen control on one row, then the
              sentence (beside a thin accent rule) with the concept's
              conjugated/separable forms highlighted (highlightedExampleSentence). The listen button
              reuses speakGuidedWord — the same TTS call as the word audio
              button and GuidedExerciseAdapter's sentence speaker. Only the
              target-language sentence is shown. */}
          {item.exampleSentence && (
            <section className="new-word-info-example">
              <div className="new-word-info-example-header">
                <p className="new-word-info-label">{t("studyNewWords.exampleSentenceLabel")}</p>
                <button
                  type="button"
                  onClick={() => speakGuidedWord(item.exampleSentence!, practiceLanguage)}
                  aria-label={t("practice.listenToSentence")}
                  className="new-word-info-example-speak-button"
                >
                  <Volume2 className="new-word-info-example-speak-icon" aria-hidden="true" />
                </button>
              </div>
              <p
                className="new-word-info-example-text"
                lang={practiceLanguage}
                dangerouslySetInnerHTML={{ __html: highlightedExampleSentence }}
              />
            </section>
          )}

          <button type="button" onClick={onContinue} className="new-word-info-continue-button">
            <span>{t("studyNewWords.startExercisesButton")}</span>
            <ArrowRight className="new-word-info-continue-icon" aria-hidden="true" />
          </button>
        </div>
      </article>
    </div>
  );
}
