import { useEffect, useState, type ReactNode } from "react";
import { Toast, useAutoDismissMessage } from "../../../../app/components/Toast";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import type { UserProfile } from "../../../../lib/userProfile";
import { updateWordProgressFavorite, VocabularyFavoriteUpdateError, type UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import { describeSupabaseError, resolveSupabaseErrorMessageKey } from "../../../../lib/supabaseError";
import { type VocabularyCounts } from "../../../../data/learning/vocabularyCategory";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import { loadVocabularyProgress, type ResolvedVocabularyRow } from "./loadVocabularyProgress";
import { filterVocabularyRowsByTab, type VocabularyTabId } from "./vocabularyFiltering";
import { adjustFavoritesCount, applyFavoriteToggle, canStartFavoriteToggle } from "./vocabularyFavoriteState";
import { VocabularySummaryCards } from "./VocabularySummaryCards";
import { VocabularyTabs, type VocabularyTabCounts } from "./VocabularyTabs";
import { VocabularyTable } from "./VocabularyTable";
import "./vocabulary-section.scss";

const EMPTY_COUNTS: VocabularyCounts = { learning: 0, known: 0, mastered: 0, favorites: 0, total: 0 };
const PAGE_SIZE_DEFAULT = 10;

interface VocabularyPageData {
  rows: ResolvedVocabularyRow[];
  counts: VocabularyCounts;
  targetLanguage: string;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "result"; data: VocabularyPageData };

interface VocabularySectionProps {
  // App.tsx's single shared profile load (useUserProfileLoad), threaded
  // down the same way LearningSection/DailyStreakCard already consume it —
  // practiceLanguage/nativeLanguage below come from this prop instead of a
  // second copy fetched here.
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  // The shared active-language user_word_progress rows, owned and fetched
  // exactly once by UserProfileDashboardPage's useProfileSharedProgressData
  // (see that hook's own header) — this section no longer calls
  // readUserWordProgress itself. This effect only waits for
  // wordProgressStatus to become "ready" and then resolves the already-
  // loaded rows against vocabulary.json (still a local async step — see the
  // effect below).
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  onRetryWordProgress: () => void;
  onStartNewWordStudy?: () => void;
}

export function VocabularySection({
  userProfile,
  isProfileLoaded,
  wordProgressRows,
  wordProgressStatus,
  onRetryWordProgress,
  onStartNewWordStudy,
}: VocabularySectionProps) {
  const { t } = useLanguage();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  const [activeTab, setActiveTab] = useState<VocabularyTabId>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [togglingIds, setTogglingIds] = useState<ReadonlySet<string>>(new Set());
  const { message: confirmationMessage, show: showConfirmation } = useAutoDismissMessage();

  const targetLanguage = userProfile.practiceLanguage;
  const nativeLanguage = userProfile.nativeLanguage;

  // Resolves the shared word-progress rows against vocabulary.json for the
  // profile's target/native language pair. Waits on wordProgressStatus the
  // same way it previously waited on isProfileLoaded — "loading" or
  // "unavailable" (no session / no target language yet) both keep this
  // section's own state in step with the shared source instead of
  // resolving against a not-yet-known or stale row set. A shared-fetch
  // "error" is surfaced directly (no local resolution to attempt); Retry
  // calls onRetryWordProgress, the shared hook's own retry action, rather
  // than a purely local token. Re-running on
  // wordProgressStatus/wordProgressRows/targetLanguage/nativeLanguage/
  // retryToken (not on every render) keeps this a "resolve once per loaded
  // row set" effect rather than one per tab click — the active tab filters
  // the already-resolved rows client-side (see the derived values below).
  useEffect(() => {
    if (wordProgressStatus === "unavailable") {
      setState({ status: "result", data: { rows: [], counts: EMPTY_COUNTS, targetLanguage: "" } });
      return;
    }

    if (wordProgressStatus === "loading") {
      setState({ status: "loading" });
      return;
    }

    if (wordProgressStatus === "error") {
      setState({ status: "error" });
      return;
    }

    if (!isProfileLoaded || !targetLanguage || !nativeLanguage) {
      // The shared row set is ready, but the profile itself hasn't
      // resolved a language pair yet — wait rather than resolving against
      // an unknown language.
      setState({ status: "loading" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        // No session check here: resolution is a local step (vocabulary.json
        // dynamic import + concept lookup, no Supabase call) — the shared
        // hook already gates wordProgressStatus === "ready" on a valid
        // session (see useProfileSharedProgressData.ts), so reaching this
        // branch already implies one existed for the fetch that produced
        // wordProgressRows.
        const result = await loadVocabularyProgress({ progressRows: wordProgressRows, targetLanguage, nativeLanguage });
        if (cancelled) return;
        setState({ status: "result", data: { ...result, targetLanguage } });
      } catch (error) {
        if (cancelled) return;
        // Read-only page load: this stays one generic message + Retry
        // regardless of cause (see this refactor's scoping notes), but the
        // structured diagnostics logged here now include the classified
        // category/code/status instead of just the raw error object.
        console.warn(
          "VocabularySection: failed to resolve vocabulary progress.",
          describeSupabaseError("loadVocabularyProgress", error),
        );
        setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isProfileLoaded, targetLanguage, nativeLanguage, wordProgressRows, wordProgressStatus, retryToken]);

  const loadedTargetLanguage = state.status === "result" ? state.data.targetLanguage : null;

  // Resets pagination whenever the visible data set could change shape —
  // a new tab, a new page size, or (via loadedTargetLanguage) a freshly
  // loaded language — but deliberately NOT on every state update, so a
  // Favorites toggle (which also calls setState) never silently bounces
  // the user back to page 1.
  useEffect(() => {
    setPage(1);
  }, [activeTab, pageSize, loadedTargetLanguage]);

  const handleRetry = () => {
    onRetryWordProgress();
    setRetryToken((token) => token + 1);
  };

  const handleToggleFavorite = (row: ResolvedVocabularyRow) => {
    if (state.status !== "result") return;
    if (!canStartFavoriteToggle(togglingIds, row.id)) return;

    const session = getStoredSupabaseSession();
    if (!session) {
      showConfirmation(t("supabaseErrors.sessionExpired"));
      return;
    }

    const previousIsFavorite = row.isFavorite;
    const nextIsFavorite = !previousIsFavorite;

    setTogglingIds((prev) => new Set(prev).add(row.id));
    setState((prev) => {
      if (prev.status !== "result") return prev;
      return {
        status: "result",
        data: {
          ...prev.data,
          rows: applyFavoriteToggle(prev.data.rows, row.id, nextIsFavorite),
          counts: {
            ...prev.data.counts,
            favorites: adjustFavoritesCount(prev.data.counts.favorites, previousIsFavorite, nextIsFavorite),
          },
        },
      };
    });

    void updateWordProgressFavorite(session, row.id, nextIsFavorite)
      .catch((error) => {
        // Full structured diagnostics were already logged inside
        // updateWordProgressFavorite's own catch (src/lib/newWordProgress.ts),
        // where the raw Supabase/PostgREST error is still available — this
        // only logs the already-sanitized domain error for screen-level
        // context.
        console.warn("VocabularySection: failed to update favorite.", error);
        setState((prev) => {
          if (prev.status !== "result") return prev;
          return {
            status: "result",
            data: {
              ...prev.data,
              rows: applyFavoriteToggle(prev.data.rows, row.id, previousIsFavorite),
              counts: {
                ...prev.data.counts,
                favorites: adjustFavoritesCount(prev.data.counts.favorites, nextIsFavorite, previousIsFavorite),
              },
            },
          };
        });
        const category = error instanceof VocabularyFavoriteUpdateError ? error.category : "unknown";
        showConfirmation(t(resolveSupabaseErrorMessageKey(category, "userProfile.vocabularySection.favoriteError")));
      })
      .finally(() => {
        setTogglingIds((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      });
  };

  const isLoading = state.status === "loading";
  const isError = state.status === "error";
  const data = state.status === "result" ? state.data : null;
  const counts = data?.counts ?? EMPTY_COUNTS;

  const tabCounts: VocabularyTabCounts = {
    all: counts.total,
    learning: counts.learning,
    known: counts.known,
    mastered: counts.mastered,
    favorites: counts.favorites,
  };

  const allRows = data?.rows ?? [];
  const tabFilteredRows = filterVocabularyRowsByTab(allRows, activeTab);
  const totalPages = Math.max(1, Math.ceil(tabFilteredRows.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageStartIndex = (clampedPage - 1) * pageSize;
  const pagedRows = tabFilteredRows.slice(pageStartIndex, pageStartIndex + pageSize);

  const hasAnyVocabulary = counts.total > 0;

  return (
    <>
      <header className="vocabulary-section__header">
        <div className="vocabulary-section__heading">
          <h1 className="vocabulary-section__title">{t("userProfile.vocabularySection.title")}</h1>
          <p className="vocabulary-section__subtitle">{t("userProfile.vocabularySection.subtitle")}</p>
        </div>
      </header>

      <VocabularySummaryCards counts={counts} isLoading={isLoading} />

      <div className="vocabulary-section__panel">
        <VocabularyTabs activeTab={activeTab} onTabChange={setActiveTab} counts={tabCounts} />

        {isLoading ? (
          <VocabularyLoadingBlock />
        ) : isError ? (
          <VocabularyMessageBlock message={t("userProfile.vocabularySection.loadError")}>
            <button type="button" onClick={handleRetry} className="vocabulary-retry-button">
              {t("userProfile.vocabularySection.retryButton")}
            </button>
          </VocabularyMessageBlock>
        ) : !hasAnyVocabulary ? (
          <VocabularyMessageBlock
            title={t("userProfile.vocabularySection.emptyStates.noWordsYetTitle")}
            message={t("userProfile.vocabularySection.emptyStates.noWordsYetMessage")}
          >
            {onStartNewWordStudy ? (
              <button type="button" onClick={onStartNewWordStudy} className="vocabulary-retry-button">
                {t("userProfile.vocabularySection.emptyStates.noWordsYetAction")}
              </button>
            ) : null}
          </VocabularyMessageBlock>
        ) : tabFilteredRows.length === 0 ? (
          <VocabularyMessageBlock message={t(`userProfile.vocabularySection.emptyStates.noTabWords.${activeTab}`)} />
        ) : (
          <VocabularyTable
            rows={pagedRows}
            totalFilteredCount={tabFilteredRows.length}
            page={clampedPage}
            totalPages={totalPages}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            togglingIds={togglingIds}
            onToggleFavorite={handleToggleFavorite}
          />
        )}
      </div>

      <Toast message={confirmationMessage} />
    </>
  );
}

function VocabularyLoadingBlock() {
  return (
    <div className="vocabulary-loading-block" role="status" aria-live="polite" aria-busy="true">
      <div className="vocabulary-loading-row" />
      <div className="vocabulary-loading-row" />
      <div className="vocabulary-loading-row" />
    </div>
  );
}

function VocabularyMessageBlock({
  title,
  message,
  children,
}: {
  title?: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="vocabulary-message-block" role="status">
      {title ? <p className="vocabulary-message-block__title">{title}</p> : null}
      <p className="vocabulary-message-block__text">{message}</p>
      {children}
    </div>
  );
}
