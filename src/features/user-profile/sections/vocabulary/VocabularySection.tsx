import { useEffect, useState, type ReactNode } from "react";
import { Plus, Search } from "lucide-react";
import { Toast, useAutoDismissMessage } from "../../../../app/components/Toast";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import type { UserProfile } from "../../../../lib/userProfile";
import { updateWordProgressFavorite, VocabularyFavoriteUpdateError } from "../../../../lib/newWordProgress";
import { describeSupabaseError, resolveSupabaseErrorMessageKey } from "../../../../lib/supabaseError";
import { type VocabularyCounts } from "../../../../data/learning/vocabularyCategory";
import { loadVocabularyProgress, type ResolvedVocabularyRow } from "./loadVocabularyProgress";
import {
  filterVocabularyRowsByTab,
  filterVocabularyRowsBySearch,
  type VocabularyTabId,
} from "./vocabularyFiltering";
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
  onStartNewWordStudy?: () => void;
}

export function VocabularySection({ userProfile, isProfileLoaded, onStartNewWordStudy }: VocabularySectionProps) {
  const { t } = useLanguage();
  const { authUserId } = useAuthSession();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  const [searchValue, setSearchValue] = useState("");
  const [activeTab, setActiveTab] = useState<VocabularyTabId>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [togglingIds, setTogglingIds] = useState<ReadonlySet<string>>(new Set());
  const { message: confirmationMessage, show: showConfirmation } = useAutoDismissMessage();

  const targetLanguage = userProfile.practiceLanguage;
  const nativeLanguage = userProfile.nativeLanguage;

  // Loads vocabulary progress for the shared profile's target/native
  // language pair — the profile itself is no longer fetched here (see
  // VocabularySectionProps above); this effect only waits for it
  // (isProfileLoaded) the same way DailyStreakCard/TodayProgressCard do.
  // Re-running on authUserId/isProfileLoaded/targetLanguage/nativeLanguage/
  // retryToken (not on every render) keeps this a "load once per active
  // language" fetch rather than one per keystroke/tab click — search and
  // tabs filter the already-loaded rows client-side (see the derived
  // values below).
  useEffect(() => {
    if (!authUserId) {
      setState({ status: "result", data: { rows: [], counts: EMPTY_COUNTS, targetLanguage: "" } });
      return;
    }

    if (!isProfileLoaded) {
      // The shared profile load (App.tsx) is still in flight — wait for it
      // rather than fetching with a not-yet-known target language.
      setState({ status: "loading" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const session = getStoredSupabaseSession();

        if (!session || !targetLanguage || !nativeLanguage) {
          setState({ status: "result", data: { rows: [], counts: EMPTY_COUNTS, targetLanguage } });
          return;
        }

        const result = await loadVocabularyProgress({ session, targetLanguage, nativeLanguage });
        if (cancelled) return;
        setState({ status: "result", data: { ...result, targetLanguage } });
      } catch (error) {
        if (cancelled) return;
        // Read-only page load: this stays one generic message + Retry
        // regardless of cause (see this refactor's scoping notes), but the
        // structured diagnostics logged here now include the classified
        // category/code/status instead of just the raw error object.
        console.warn(
          "VocabularySection: failed to load vocabulary progress.",
          describeSupabaseError("loadVocabularyProgress", error),
        );
        setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, isProfileLoaded, targetLanguage, nativeLanguage, retryToken]);

  const loadedTargetLanguage = state.status === "result" ? state.data.targetLanguage : null;

  // Resets pagination whenever the visible data set could change shape —
  // a new tab, a new search term, a new page size, or (via
  // loadedTargetLanguage) a freshly loaded language — but deliberately NOT
  // on every state update, so a Favorites toggle (which also calls
  // setState) never silently bounces the user back to page 1.
  useEffect(() => {
    setPage(1);
  }, [activeTab, searchValue, pageSize, loadedTargetLanguage]);

  const handleRetry = () => setRetryToken((token) => token + 1);

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

  const handleAddWord = () => {
    // No backend write yet - this only confirms the local preview action.
    showConfirmation(t("userProfile.vocabularySection.addWord.toast"));
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
  const visibleRows = filterVocabularyRowsBySearch(tabFilteredRows, searchValue);
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const pageStartIndex = (clampedPage - 1) * pageSize;
  const pagedRows = visibleRows.slice(pageStartIndex, pageStartIndex + pageSize);

  const hasAnyVocabulary = counts.total > 0;
  const hasSearchTerm = searchValue.trim().length > 0;

  return (
    <>
      <header className="vocabulary-section__header">
        <div className="vocabulary-section__heading">
          <h1 className="vocabulary-section__title">{t("userProfile.vocabularySection.title")}</h1>
          <p className="vocabulary-section__subtitle">{t("userProfile.vocabularySection.subtitle")}</p>
        </div>

        <div className="vocabulary-section__header-controls">
          <label className="vocabulary-section__search">
            <Search size={16} strokeWidth={2} aria-hidden="true" />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder={t("userProfile.vocabularySection.search.placeholder")}
              aria-label={t("userProfile.vocabularySection.search.ariaLabel")}
            />
          </label>

          <button type="button" className="vocabulary-section__add-word" onClick={handleAddWord}>
            <Plus size={16} strokeWidth={2.2} aria-hidden="true" />
            {t("userProfile.vocabularySection.addWord.label")}
          </button>
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
        ) : visibleRows.length === 0 && hasSearchTerm ? (
          <VocabularyMessageBlock message={t("userProfile.vocabularySection.emptyStates.noSearchMatches")} />
        ) : (
          <VocabularyTable
            rows={pagedRows}
            totalFilteredCount={visibleRows.length}
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
