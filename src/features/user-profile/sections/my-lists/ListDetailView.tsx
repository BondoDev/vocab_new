import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useLanguage, type UILanguage } from "../../../../contexts/LanguageContext";
import { buildWordPath } from "../../../../data/seo/wordPages/wordSlugs";
import { getUiVocabularyLanguage } from "../../../../data/seo/shared/slugs";
import type { UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import type { UserVocabularyList, UserVocabularyListMembership } from "../../../../lib/vocabularyLists";
import { loadVocabularyProgress, type ResolvedVocabularyRow } from "../vocabulary/loadVocabularyProgress";
import type { ListCardMetrics } from "./listCardMetrics";

interface ListDetailViewProps {
  list: UserVocabularyList;
  metrics: ListCardMetrics;
  // This list's own membership rows (already filtered by the caller) —
  // used only for each word's "Added" date; the actual word/translation/
  // CEFR display data is resolved below via loadVocabularyProgress, reused
  // as-is rather than reimplemented (see this file's own header rationale
  // in vocabularyLists.ts).
  memberships: UserVocabularyListMembership[];
  wordProgressRows: UserWordProgressFullRow[];
  nativeLanguage: UILanguage | "";
  onBack: () => void;
  onRename: () => void;
  onDelete: () => void;
}

type ResolveState = { status: "loading" } | { status: "error" } | { status: "ready"; rows: ResolvedVocabularyRow[] };

// The list-detail shell: back link, name, count, rename/delete actions, and
// either "No words in this list yet." or a basic word table. Deliberately
// does not reimplement VocabularyTable's pagination/favorites/floating-menu
// machinery — Phase 2A's table is read-only and un-paginated (a list is
// expected to be small), reusing only loadVocabularyProgress's resolution
// step and the word-detail link helper VocabularyTable itself uses for its
// own "View details" action.
export function ListDetailView({
  list,
  metrics,
  memberships,
  wordProgressRows,
  nativeLanguage,
  onBack,
  onRename,
  onDelete,
}: ListDetailViewProps) {
  const { t, uiLanguage } = useLanguage();
  const [resolveState, setResolveState] = useState<ResolveState>({ status: "loading" });

  useEffect(() => {
    if (memberships.length === 0) {
      setResolveState({ status: "ready", rows: [] });
      return;
    }

    if (!nativeLanguage) {
      setResolveState({ status: "loading" });
      return;
    }

    const memberProgressIds = new Set(memberships.map((membership) => membership.wordProgressId));
    const memberProgressRows = wordProgressRows.filter((row) => memberProgressIds.has(row.id));

    let cancelled = false;
    setResolveState({ status: "loading" });

    void (async () => {
      try {
        const result = await loadVocabularyProgress({
          progressRows: memberProgressRows,
          targetLanguage: list.targetLanguage,
          nativeLanguage,
        });
        if (cancelled) return;
        setResolveState({ status: "ready", rows: result.rows });
      } catch (error) {
        if (cancelled) return;
        console.warn("ListDetailView: failed to resolve list word data.", error);
        setResolveState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [list.targetLanguage, memberships, nativeLanguage, wordProgressRows]);

  const addedAtByProgressId = new Map(memberships.map((membership) => [membership.wordProgressId, membership.createdAt]));

  const statusLabel = (category: ResolvedVocabularyRow["category"]) =>
    t(`userProfile.vocabularySection.table.statuses.${category}`);

  return (
    <>
      <button type="button" className="my-lists-detail__back" onClick={onBack}>
        <ArrowLeft size={15} strokeWidth={2} aria-hidden="true" />
        {t("userProfile.myListsSection.detail.backToMyLists")}
      </button>

      <header className="my-lists-detail__header">
        <div className="my-lists-detail__heading">
          <h1 className="my-lists-detail__title">{list.name}</h1>
          <p className="my-lists-detail__subtitle">
            {metrics.total} {t("userProfile.myListsSection.wordsUnit")}
          </p>
        </div>
        <div className="my-lists-detail__actions">
          <button type="button" className="my-lists-detail__action" onClick={onRename}>
            {t("userProfile.myListsSection.rename")}
          </button>
          <button type="button" className="my-lists-detail__action my-lists-detail__action--danger" onClick={onDelete}>
            {t("userProfile.myListsSection.delete")}
          </button>
        </div>
      </header>

      {resolveState.status === "loading" ? (
        <div className="my-lists-loading-block" role="status" aria-live="polite" aria-busy="true">
          <div className="my-lists-loading-row" />
          <div className="my-lists-loading-row" />
        </div>
      ) : resolveState.status === "error" ? (
        <div className="my-lists-message-block" role="status">
          <p className="my-lists-message-block__text">{t("userProfile.myListsSection.loadError")}</p>
        </div>
      ) : resolveState.rows.length === 0 ? (
        <div className="my-lists-message-block" role="status">
          <p className="my-lists-message-block__text">{t("userProfile.myListsSection.detail.emptyState")}</p>
        </div>
      ) : (
        <div className="my-lists-detail-table-container">
          <table className="my-lists-detail-table">
            <thead>
              <tr>
                <th scope="col">{t("userProfile.vocabularySection.table.columns.word")}</th>
                <th scope="col">{t("userProfile.vocabularySection.table.columns.translation")}</th>
                <th scope="col">{t("userProfile.vocabularySection.table.columns.level")}</th>
                <th scope="col">{t("userProfile.vocabularySection.table.columns.status")}</th>
                <th scope="col">{t("userProfile.myListsSection.detail.addedColumn")}</th>
                <th scope="col" className="my-lists-detail-table__actions-head">
                  {t("userProfile.vocabularySection.table.columns.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {resolveState.rows.map((row) => {
                const addedAt = addedAtByProgressId.get(row.id);
                const wordPath = buildWordPath(
                  uiLanguage,
                  // list.targetLanguage is plain `string` on UserVocabularyList
                  // (mirrors the DB column) but is always one of the 7 UI
                  // language codes — enforced server-side by the migration's
                  // own CHECK constraint — so this narrowing is safe.
                  getUiVocabularyLanguage(list.targetLanguage as UILanguage),
                  row.targetWord,
                  row.conceptId,
                );
                return (
                  <tr key={row.id}>
                    <td className="my-lists-detail-table__word">{row.targetWord}</td>
                    <td className="my-lists-detail-table__translation">{row.translation}</td>
                    <td>{row.level ? <span className="my-lists-level-badge">{row.level}</span> : null}</td>
                    <td>
                      <span className={`my-lists-status-badge my-lists-status-badge--${row.category}`}>
                        {statusLabel(row.category)}
                      </span>
                    </td>
                    <td className="my-lists-detail-table__meta">
                      {addedAt ? new Date(addedAt).toLocaleDateString(uiLanguage) : ""}
                    </td>
                    <td>
                      <a
                        href={wordPath}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="my-lists-detail-table__view-link"
                        aria-label={`${t("userProfile.vocabularySection.table.menu.viewDetails")} "${row.targetWord}"`}
                      >
                        <ExternalLink size={14} strokeWidth={2} aria-hidden="true" />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
