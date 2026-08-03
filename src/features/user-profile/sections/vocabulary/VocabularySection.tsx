import { useEffect, useState, type ReactNode } from "react";
import { Plus, Search } from "lucide-react";
import { Toast, useAutoDismissMessage } from "../../../../app/components/Toast";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { readStoredUserProfile, readSupabaseUserProfile } from "../../../../lib/userProfile";
import { updateWordProgressFavorite } from "../../../../lib/newWordProgress";
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
  onStartNewWordStudy?: () => void;
}

export function VocabularySection({ onStartNewWordStudy }: VocabularySectionProps) {
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

  // Own self-contained load, matching DailyGoalSelector/TodayProgressCard's
  // precedent in this feature: reads its own copy of the authenticated
  // profile (for target + native language) rather than depending on prop
  // threading from App.tsx, then loads vocabulary progress for that
  // language pair. Re-running only on authUserId/retryToken change (not on
  // every render) is what keeps this a "load once per active language"
  // fetch rather than one per keystroke/tab click — search and tabs filter
  // the already-loaded rows client-side (see the derived values below).
  useEffect(() => {
    if (!authUserId) {
      setState({ status: "result", data: { rows: [], counts: EMPTY_COUNTS, targetLanguage: "" } });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });
    const storedProfile = readStoredUserProfile(authUserId);

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        const supabaseProfile = session ? await readSupabaseUserProfile(session) : null;
        if (cancelled) return;

        const targetLanguage = supabaseProfile?.practiceLanguage || storedProfile?.practiceLanguage || "";
        const nativeLanguage = supabaseProfile?.nativeLanguage || storedProfile?.nativeLanguage || "";

        if (!session || !targetLanguage || !nativeLanguage) {
          setState({ status: "result", data: { rows: [], counts: EMPTY_COUNTS, targetLanguage } });
          return;
        }

        const result = await loadVocabularyProgress({ session, targetLanguage, nativeLanguage });
        if (cancelled) return;
        setState({ status: "result", data: { ...result, targetLanguage } });
      } catch (error) {
        if (cancelled) return;
        console.warn("VocabularySection: failed to load vocabulary progress.", error);
        setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, retryToken]);

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
      showConfirmation(t("userProfile.vocabularySection.favoriteError"));
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
        showConfirmation(t("userProfile.vocabularySection.favoriteError"));
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
