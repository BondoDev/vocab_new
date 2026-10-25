import { useEffect, useState } from "react";
import { ArrowRight, Check, Layers } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { getStoredSupabaseSession } from "../../lib/supabaseAuth";
import { describeSupabaseError } from "../../lib/supabaseError";
// The word list and its row actions are shared with Review Words' completion
// screen: the list is an app-level presentational component, the Add to
// list / favorites actions come from the user-profile feature's barrel.
import { SessionWordList } from "../../app/components/session-word-list/SessionWordList";
import { useSessionWordActions } from "../user-profile";
import { loadDueReviewCount } from "./loadDueReviewCount";
import { loadTodayStudiedWords, type StudiedWordSummary } from "./loadNewWordStudyQueue";
import { speakGuidedWord } from "./utils/speakGuidedWord";
// Visual styling lives in ./styles/study-new-words.scss (imported by
// NewWordStudySession.tsx, this component's sole renderer) — this file only
// assigns the semantic class names.

interface NewWordStudyCompleteProps {
  // The words this session finished (getCompletedSessionWords). The screen
  // lists *all* of today's words (see loadTodayStudiedWords); these are the
  // fallback if that read fails, and are merged in so a word whose save just
  // landed can never be missing from the list.
  sessionWords: StudiedWordSummary[];
  practiceLanguage: string;
  yourLanguage: string;
  onReturnToLearning: () => void;
  onStartReviewWords?: () => void;
}

type ReviewState = { status: "loading" } | { status: "error" } | { status: "ready"; dueCount: number };
type TodayWordsState = { status: "loading" } | { status: "error" } | { status: "ready"; words: StudiedWordSummary[] };

// Same plural-aware {count} formatting as NewWordStudyPreparation.tsx's
// helper (picks `${baseKey}_${CLDR category}`, falling back to `_other`),
// plus optional extra {name} substitutions. Locales define only the plural
// categories their grammar needs (Russian adds `_few`/`_many`).
function formatCount(
  t: (key: string) => string,
  uiLanguage: string,
  baseKey: string,
  count: number,
  extra: Record<string, string> = {},
): string {
  const categoryKey = `${baseKey}_${new Intl.PluralRules(uiLanguage).select(count)}`;
  const template = t(categoryKey);
  let text = (template === categoryKey ? t(`${baseKey}_other`) : template).replace("{count}", String(count));
  for (const [name, value] of Object.entries(extra)) {
    text = text.split(`{${name}}`).join(value);
  }
  return text;
}

// Today's words in study order, plus any of this session's words the read
// didn't include yet (appended in their session order). Deduplicated.
function mergeStudiedWords(todayWords: StudiedWordSummary[], sessionWords: StudiedWordSummary[]): StudiedWordSummary[] {
  const seen = new Set(todayWords.map((word) => word.conceptId));
  return [...todayWords, ...sessionWords.filter((word) => !seen.has(word.conceptId))];
}

// Three questions, top to bottom: what did I accomplish (header + subtitle),
// what did I study (every word studied today, across all of today's
// sessions — so 5 words, then 5 + 4 after a second session, up to the daily
// goal), what next (a Review Words suggestion that only offers Start
// Reviewing when words are actually due). No confetti/XP; a small check
// beside the heading is the only celebration.
//
// The actions sit in a bar fixed to the bottom of the viewport (see
// .new-word-study-complete-actions), so Start Reviewing / Return to Learning
// stay reachable however long the word list is. Fixed, not sticky: the
// global theme sets overflow:auto on html/body/#root, which makes body the
// sticky scroll container and pins a sticky bar to body's end instead of the
// screen. The screen reserves matching bottom padding so the last row and
// the review panel always scroll clear of the bar.
export function NewWordStudyComplete({
  sessionWords,
  practiceLanguage,
  yourLanguage,
  onReturnToLearning,
  onStartReviewWords,
}: NewWordStudyCompleteProps) {
  const { t, uiLanguage } = useLanguage();
  const [reviewState, setReviewState] = useState<ReviewState>({ status: "loading" });
  const [todayWordsState, setTodayWordsState] = useState<TodayWordsState>({ status: "loading" });
  const { getRowActions, overlay } = useSessionWordActions({
    targetLanguage: practiceLanguage,
    labels: {
      addToList: t("studyNewWords.complete.addToListButton"),
      addToFavorites: t("studyNewWords.complete.addToFavorites"),
      removeFromFavorites: t("studyNewWords.complete.removeFromFavorites"),
      favoriteAddedSuffix: t("studyNewWords.complete.favoriteAddedSuffix"),
      favoriteRemovedSuffix: t("studyNewWords.complete.favoriteRemovedSuffix"),
    },
  });

  // Both read once on mount. This screen only renders once the last save in
  // flight has finished (Finish session is disabled during a save), so the
  // progress rows already include this session's words. Never writes.
  useEffect(() => {
    const session = getStoredSupabaseSession();
    if (!session) {
      setReviewState({ status: "error" });
      setTodayWordsState({ status: "error" });
      return;
    }
    let cancelled = false;
    void loadDueReviewCount(session, practiceLanguage)
      .then((dueCount) => {
        if (!cancelled) setReviewState({ status: "ready", dueCount });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn(
          "NewWordStudyComplete: failed to load the due-review count.",
          describeSupabaseError("loadDueReviewCount", error),
        );
        setReviewState({ status: "error" });
      });
    void loadTodayStudiedWords({ session, targetLanguage: practiceLanguage, nativeLanguage: yourLanguage })
      .then((words) => {
        if (!cancelled) setTodayWordsState({ status: "ready", words });
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn(
          "NewWordStudyComplete: failed to load today's studied words; showing this session's words only.",
          describeSupabaseError("loadTodayStudiedWords", error),
        );
        setTodayWordsState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [practiceLanguage, yourLanguage]);

  const languageName = t(`languageNames.${practiceLanguage}`);
  // Language names are capitalized standalone (column captions, badges) but
  // lowercase mid-sentence in es/fr/it/pt/ru ("en allemand"); templates pick
  // {language} or {languageLower} accordingly.
  const languageNameLower = languageName.toLocaleLowerCase(uiLanguage);

  // While today's list loads, the summary waits (a brief loading line)
  // rather than showing this session's count and then jumping to today's.
  const isWordsLoading = todayWordsState.status === "loading";
  const studiedWords =
    todayWordsState.status === "ready" ? mergeStudiedWords(todayWordsState.words, sessionWords) : sessionWords;
  const wordCount = studiedWords.length;

  const dueCount = reviewState.status === "ready" ? reviewState.dueCount : 0;
  const canStartReview = Boolean(onStartReviewWords) && reviewState.status === "ready" && dueCount > 0;
  const isNothingDue = reviewState.status === "ready" && dueCount === 0;

  return (
    <div className="new-word-study-complete">
      <header className="new-word-study-complete-header">
        <h1 className="new-word-study-complete-title">
          <span className="new-word-study-complete-title-mark" aria-hidden="true">
            <Check className="new-word-study-complete-title-mark-icon" />
          </span>
          <span>{t("studyNewWords.complete.title")}</span>
        </h1>
        {isWordsLoading ? (
          <div className="new-word-study-complete-loading" role="status" aria-live="polite">
            <span className="study-new-words-spinner new-word-study-complete-loading-spinner" aria-hidden="true" />
          </div>
        ) : (
          <>
            {/* Zero only happens when the learner used "Finish session"
                before completing any word today: say so plainly instead of
                "0 new words". */}
            <p className="new-word-study-complete-subtitle">
              {wordCount === 0
                ? t("studyNewWords.complete.subtitleNone")
                : formatCount(t, uiLanguage, "studyNewWords.complete.subtitle", wordCount, {
                    language: languageName,
                    languageLower: languageNameLower,
                  })}
            </p>
          </>
        )}
      </header>

      {!isWordsLoading && (
        <SessionWordList
          words={studiedWords}
          practiceLanguage={practiceLanguage}
          yourLanguage={yourLanguage}
          idPrefix="new-word-study-complete-words"
          labels={{
            heading: t("studyNewWords.complete.wordsHeading"),
            typeColumn: t("studyNewWords.complete.typeColumn"),
            moreActions: t("studyNewWords.complete.moreActionsAriaLabel"),
            showFewer: t("studyNewWords.complete.showFewer"),
            showAll: (count) => formatCount(t, uiLanguage, "studyNewWords.complete.showAll", count),
          }}
          onSpeakWord={(word) => speakGuidedWord(word.targetWord, practiceLanguage)}
          // The favorite item is disabled for a word without a progress row
          // id (only possible if today's read failed).
          getRowActions={getRowActions}
        />
      )}

      {/* What next. Three honest states: words due → offer Start Reviewing
          with the real due count; nothing due → say reviews come later and
          only offer Return to Learning; loading/error → a neutral line with
          no number. aria-live announces the swap once the count arrives. */}
      <section className="new-word-study-complete-next" aria-live="polite">
        <span className="new-word-study-complete-next-icon" aria-hidden="true">
          <Layers className="new-word-study-complete-next-icon-svg" />
        </span>
        <div className="new-word-study-complete-next-body">
          <h2 className="new-word-study-complete-next-title">
            {isNothingDue ? t("studyNewWords.complete.reviewLaterTitle") : t("studyNewWords.complete.reviewDueTitle")}
          </h2>
          <p className="new-word-study-complete-next-text">
            {canStartReview
              ? formatCount(t, uiLanguage, "studyNewWords.complete.reviewDueDescription", dueCount)
              : isNothingDue
                ? t("studyNewWords.complete.reviewLaterDescription")
                : t("studyNewWords.complete.reviewNeutralDescription")}
          </p>
        </div>
      </section>

      <div className="new-word-study-complete-actions">
        <div className="new-word-study-complete-actions-inner">
          {canStartReview ? (
            <>
              <button type="button" onClick={onStartReviewWords} className="new-word-study-complete-primary">
                <span>{t("studyNewWords.complete.startReviewingButton")}</span>
                <ArrowRight className="new-word-study-complete-primary-icon" aria-hidden="true" />
              </button>
              <button type="button" onClick={onReturnToLearning} className="new-word-study-complete-secondary">
                {t("studyNewWords.returnToLearningButton")}
              </button>
            </>
          ) : (
            <button type="button" onClick={onReturnToLearning} className="new-word-study-complete-primary">
              {t("studyNewWords.returnToLearningButton")}
            </button>
          )}
        </div>
      </div>

      {overlay}
    </div>
  );
}
