import { useEffect, useState } from "react";
import { ArrowRight, Check, ChevronDown, Layers, ListPlus, MoreVertical, Star, Volume2 } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { getStoredSupabaseSession } from "../../lib/supabaseAuth";
import { describeSupabaseError, resolveSupabaseErrorMessageKey } from "../../lib/supabaseError";
import { updateWordProgressFavorite, VocabularyFavoriteUpdateError } from "../../lib/newWordProgress";
import { Toast, useAutoDismissMessage } from "../../app/components/Toast";
// Same Radix dropdown the shared VocabularyTable uses for its row "⋮" menu.
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../app/components/ui/dropdown-menu";
// My Lists' own add-to-list dialog via the user-profile feature's public
// barrel — the same reuse FullVocabularyListSeoPage already does, so list
// membership logic stays in one place.
import { AddWordToListDialog, type AddToListWord } from "../user-profile";
import { buildWordPath } from "../../data/seo/wordPages/wordSlugs";
import { getUiVocabularyLanguage, isSupportedUiLanguage } from "../../data/seo/shared/slugs";
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

// Same item styling as the shared VocabularyTable's row menu.
const ROW_MENU_ITEM_CLASS =
  "cursor-pointer gap-2.5 rounded-lg py-2 pl-2.5 pr-3 focus:bg-primary/10 focus:text-primary [&_svg]:!text-primary";

// Longer lists collapse to the first rows with a Show all toggle; at or
// under the threshold the whole list is shown (no toggle for 1–2 hidden rows).
const COLLAPSE_THRESHOLD = 12;
const COLLAPSED_ROW_COUNT = 10;

// Same fallback as NewWordInfoStep for an untranslated wordTypes.* id.
function formatWordTypeLabel(typeId: string): string {
  return typeId
    .split(/[_-]+/g)
    .map((part) => (part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

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
  const [isListExpanded, setIsListExpanded] = useState(false);
  const [addToListWord, setAddToListWord] = useState<AddToListWord | null>(null);
  // Favorite flags changed on this screen, keyed by concept id, layered over
  // the values today's read returned (optimistic, reverted on failure).
  const [favoriteOverrides, setFavoriteOverrides] = useState<Readonly<Record<string, boolean>>>({});
  const [togglingFavoriteIds, setTogglingFavoriteIds] = useState<ReadonlySet<string>>(new Set());
  const { message: toastMessage, show: showToast } = useAutoDismissMessage();

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

  // Speech synthesis is browser-dependent; without it the audio buttons
  // would silently do nothing, so they're omitted instead.
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;

  const languageName = t(`languageNames.${practiceLanguage}`);
  // Language names are capitalized standalone (column captions, badges) but
  // lowercase mid-sentence in es/fr/it/pt/ru ("en allemand"); templates pick
  // {language} or {languageLower} accordingly.
  const languageNameLower = languageName.toLocaleLowerCase(uiLanguage);
  const nativeLanguageName = t(`languageNames.${yourLanguage}`);

  // While today's list loads, the summary waits (a brief loading line)
  // rather than showing this session's count and then jumping to today's.
  const isWordsLoading = todayWordsState.status === "loading";
  const studiedWords =
    todayWordsState.status === "ready" ? mergeStudiedWords(todayWordsState.words, sessionWords) : sessionWords;
  const wordCount = studiedWords.length;

  const isCollapsible = wordCount > COLLAPSE_THRESHOLD;
  const visibleWords = isCollapsible && !isListExpanded ? studiedWords.slice(0, COLLAPSED_ROW_COUNT) : studiedWords;

  const dueCount = reviewState.status === "ready" ? reviewState.dueCount : 0;
  const canStartReview = Boolean(onStartReviewWords) && reviewState.status === "ready" && dueCount > 0;
  const isNothingDue = reviewState.status === "ready" && dueCount === 0;

  const isWordFavorite = (word: StudiedWordSummary) => favoriteOverrides[word.conceptId] ?? word.isFavorite ?? false;

  // Same RPC and optimistic pattern as the Vocabulary page's star toggle
  // (VocabularySection.handleToggleFavorite). Needs the word's progress row
  // id, which only today's progress read provides — see StudiedWordSummary.
  const handleToggleFavorite = (word: StudiedWordSummary) => {
    const progressRowId = word.progressRowId;
    if (!progressRowId || togglingFavoriteIds.has(word.conceptId)) return;
    const session = getStoredSupabaseSession();
    if (!session) {
      showToast(t("supabaseErrors.sessionExpired"));
      return;
    }
    const previous = isWordFavorite(word);
    const next = !previous;
    setFavoriteOverrides((current) => ({ ...current, [word.conceptId]: next }));
    setTogglingFavoriteIds((current) => new Set(current).add(word.conceptId));
    void updateWordProgressFavorite(session, progressRowId, next)
      .then(() => {
        showToast(
          `"${word.targetWord}" ${t(
            next ? "studyNewWords.complete.favoriteAddedSuffix" : "studyNewWords.complete.favoriteRemovedSuffix",
          )}`,
        );
      })
      .catch((error) => {
        // Structured diagnostics are logged inside updateWordProgressFavorite.
        console.warn("NewWordStudyComplete: failed to update favorite.", error);
        setFavoriteOverrides((current) => ({ ...current, [word.conceptId]: previous }));
        const category = error instanceof VocabularyFavoriteUpdateError ? error.category : "unknown";
        showToast(t(resolveSupabaseErrorMessageKey(category, "userProfile.vocabularySection.favoriteError")));
      })
      .finally(() => {
        setTogglingFavoriteIds((current) => {
          const remaining = new Set(current);
          remaining.delete(word.conceptId);
          return remaining;
        });
      });
  };

  // Each word links to its own word page (same URL builder the Vocabulary
  // page's "View details" action uses), opened in a new tab so this summary
  // stays put. The page's UI language is the current one; the vocabulary
  // language is the one being studied. Plain text if either is unsupported.
  const wordPagePath = (word: StudiedWordSummary): string | null =>
    isSupportedUiLanguage(uiLanguage) && isSupportedUiLanguage(practiceLanguage)
      ? buildWordPath(uiLanguage, getUiVocabularyLanguage(practiceLanguage), word.targetWord, word.conceptId)
      : null;

  const grammarLabel = (grammarType?: string) => {
    if (!grammarType) return null;
    const translated = t(`wordTypes.${grammarType}`);
    return translated === `wordTypes.${grammarType}` ? formatWordTypeLabel(grammarType) : translated;
  };

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

      {!isWordsLoading && wordCount > 0 && (
        <section className="new-word-study-complete-words" aria-labelledby="new-word-study-complete-words-heading">
          <h2 id="new-word-study-complete-words-heading" className="new-word-study-complete-section-heading">
            {t("studyNewWords.complete.wordsHeading")}
          </h2>
          {/* Column captions double as the language key for every row; hidden
              from assistive tech because each row's cells carry lang. */}
          <div className="new-word-study-complete-columns" aria-hidden="true">
            <span>{languageName}</span>
            <span>{nativeLanguageName}</span>
            <span>{t("studyNewWords.complete.typeColumn")}</span>
            <span />
          </div>
          <ul id="new-word-study-complete-word-list" className="new-word-study-complete-list">
            {visibleWords.map((word) => {
              const grammar = grammarLabel(word.grammarType);
              const isFavorite = isWordFavorite(word);
              const wordPath = wordPagePath(word);
              return (
                <li key={word.conceptId} className="new-word-study-complete-row">
                  <span className="new-word-study-complete-row-word">
                    {canSpeak && (
                      <button
                        type="button"
                        onClick={() => speakGuidedWord(word.targetWord, practiceLanguage)}
                        aria-label={`${t("practice.pronounceWord")}: ${word.targetWord}`}
                        className="new-word-study-complete-row-audio"
                      >
                        <Volume2 className="new-word-study-complete-row-audio-icon" aria-hidden="true" />
                      </button>
                    )}
                    {wordPath ? (
                      <a
                        href={wordPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="new-word-study-complete-row-term new-word-study-complete-row-link"
                        lang={practiceLanguage}
                      >
                        {word.targetWord}
                      </a>
                    ) : (
                      <span className="new-word-study-complete-row-term" lang={practiceLanguage}>
                        {word.targetWord}
                      </span>
                    )}
                  </span>
                  <span className="new-word-study-complete-row-translation" lang={yourLanguage}>
                    {word.translation}
                  </span>
                  <span className="new-word-study-complete-row-type">{grammar}</span>
                  {/* Row actions ("⋮"). Non-modal, like the shared
                      VocabularyTable's menu, so opening it never locks
                      scroll. The favorite item is disabled while its save
                      is in flight, or when the word has no progress row id
                      (only possible if today's read failed). */}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`${t("studyNewWords.complete.moreActionsAriaLabel")}: ${word.targetWord}`}
                        className="new-word-study-complete-row-more"
                      >
                        <MoreVertical className="new-word-study-complete-row-more-icon" aria-hidden="true" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-0 rounded-xl border-foreground/10 p-1 shadow-lg">
                      <DropdownMenuItem
                        className={ROW_MENU_ITEM_CLASS}
                        onSelect={() => setAddToListWord({ wordId: word.conceptId, targetWord: word.targetWord })}
                      >
                        <ListPlus aria-hidden="true" />
                        {t("studyNewWords.complete.addToListButton")}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className={ROW_MENU_ITEM_CLASS}
                        disabled={!word.progressRowId || togglingFavoriteIds.has(word.conceptId)}
                        onSelect={() => handleToggleFavorite(word)}
                      >
                        <Star aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
                        {t(
                          isFavorite
                            ? "studyNewWords.complete.removeFromFavorites"
                            : "studyNewWords.complete.addToFavorites",
                        )}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
          {isCollapsible && (
            <button
              type="button"
              onClick={() => setIsListExpanded((expanded) => !expanded)}
              aria-expanded={isListExpanded}
              aria-controls="new-word-study-complete-word-list"
              className="new-word-study-complete-toggle"
            >
              <span>
                {isListExpanded
                  ? t("studyNewWords.complete.showFewer")
                  : formatCount(t, uiLanguage, "studyNewWords.complete.showAll", wordCount)}
              </span>
              <ChevronDown
                className={`new-word-study-complete-toggle-icon${isListExpanded ? " is-expanded" : ""}`}
                aria-hidden="true"
              />
            </button>
          )}
        </section>
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

      <AddWordToListDialog
        word={addToListWord}
        targetLanguage={practiceLanguage}
        onOpenChange={(open) => {
          if (!open) setAddToListWord(null);
        }}
        onShowToast={showToast}
      />
      <Toast message={toastMessage} />
    </div>
  );
}
