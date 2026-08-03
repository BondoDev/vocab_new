import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, MoreHorizontal, Star, Volume2 } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import type { ResolvedVocabularyRow } from "./loadVocabularyProgress";
import { computeLastPracticedDisplay } from "./lastPracticedDisplay";

const MENU_ACTION_KEYS = [
  "userProfile.vocabularySection.table.menu.viewDetails",
  "userProfile.vocabularySection.table.menu.addToList",
  "userProfile.vocabularySection.table.menu.practiceWord",
];

interface VocabularyTableProps {
  // Already the current page's slice — VocabularySection owns
  // filtering/pagination and hands this component only what should render.
  rows: ResolvedVocabularyRow[];
  totalFilteredCount: number;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  togglingIds: ReadonlySet<string>;
  onToggleFavorite: (row: ResolvedVocabularyRow) => void;
}

// Builds a stable, always-in-range window of up to 3 page buttons centered
// on the current page — simple clamped windowing rather than full
// server-pagination UI, matching "do not implement complex server
// pagination yet" while still reflecting the real page count (never a fake
// hardcoded [1, 2, 3]).
function getPageWindow(page: number, totalPages: number, windowSize = 3): number[] {
  if (totalPages <= windowSize) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  let end = start + windowSize - 1;
  if (end > totalPages) {
    end = totalPages;
    start = end - windowSize + 1;
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function VocabularyTable({
  rows,
  totalFilteredCount,
  page,
  totalPages,
  onPageChange,
  pageSize,
  onPageSizeChange,
  togglingIds,
  onToggleFavorite,
}: VocabularyTableProps) {
  const { t } = useLanguage();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenuId) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        (target.closest(".vocabulary-row-actions__menu-wrap") ||
          target.closest(".vocabulary-more-menu"))
      ) {
        return;
      }
      setOpenMenuId(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [openMenuId]);

  const statusLabel = (category: ResolvedVocabularyRow["category"]) =>
    t(`userProfile.vocabularySection.table.statuses.${category}`);

  const lastPracticedText = (row: ResolvedVocabularyRow) => {
    const display = computeLastPracticedDisplay(row.lastPracticedAt);
    if (display.kind === "daysAgo") {
      return `${display.days} ${t("userProfile.vocabularySection.table.lastPracticed.daysAgoSuffix")}`;
    }
    return t(`userProfile.vocabularySection.table.lastPracticed.${display.kind}`);
  };

  const pageWindow = getPageWindow(page, totalPages);
  const hasMoreAfterWindow = pageWindow[pageWindow.length - 1] < totalPages;

  return (
    <div className="vocabulary-table-container">
      <div className="vocabulary-table-scroll">
        <table className="vocabulary-table">
          <thead>
            <tr>
              <th scope="col">{t("userProfile.vocabularySection.table.columns.word")}</th>
              <th scope="col">{t("userProfile.vocabularySection.table.columns.translation")}</th>
              <th scope="col">{t("userProfile.vocabularySection.table.columns.level")}</th>
              <th scope="col">{t("userProfile.vocabularySection.table.columns.status")}</th>
              <th scope="col">{t("userProfile.vocabularySection.table.columns.lastPracticed")}</th>
              <th scope="col" className="vocabulary-table__actions-head">
                {t("userProfile.vocabularySection.table.columns.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="vocabulary-table__word-cell">
                    <span className="vocabulary-table__word">{row.targetWord}</span>
                    <span
                      className="vocabulary-table__audio-icon"
                      aria-label={t("userProfile.vocabularySection.table.audioAriaLabel")}
                    >
                      <Volume2 size={13} strokeWidth={2} aria-hidden="true" />
                    </span>
                  </div>
                </td>
                <td className="vocabulary-table__translation">{row.translation}</td>
                <td>{row.level ? <span className="vocabulary-level-badge">{row.level}</span> : null}</td>
                <td>
                  <span className={`vocabulary-status-badge vocabulary-status-badge--${row.category}`}>
                    {statusLabel(row.category)}
                  </span>
                </td>
                <td className="vocabulary-table__meta">{lastPracticedText(row)}</td>
                <td>
                  <RowActions
                    row={row}
                    isToggling={togglingIds.has(row.id)}
                    onToggleFavorite={() => onToggleFavorite(row)}
                    isMenuOpen={openMenuId === row.id}
                    onToggleMenu={() =>
                      setOpenMenuId((current) => (current === row.id ? null : row.id))
                    }
                    onCloseMenu={() => setOpenMenuId(null)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="vocabulary-mobile-list">
        {rows.map((row) => (
          <li key={row.id} className="vocabulary-mobile-card">
            <div className="vocabulary-mobile-card__top">
              <div className="vocabulary-table__word-cell">
                <span className="vocabulary-table__word">{row.targetWord}</span>
                <span
                  className="vocabulary-table__audio-icon"
                  aria-label={t("userProfile.vocabularySection.table.audioAriaLabel")}
                >
                  <Volume2 size={13} strokeWidth={2} aria-hidden="true" />
                </span>
              </div>

              {/* Favorite + more together, top-right - keeps the row the card
                  would later become tappable-for-details free of any other
                  interactive element competing for space below it. */}
              <RowActions
                row={row}
                isToggling={togglingIds.has(row.id)}
                onToggleFavorite={() => onToggleFavorite(row)}
                isMenuOpen={openMenuId === `${row.id}-mobile`}
                onToggleMenu={() =>
                  setOpenMenuId((current) =>
                    current === `${row.id}-mobile` ? null : `${row.id}-mobile`
                  )
                }
                onCloseMenu={() => setOpenMenuId(null)}
              />
            </div>

            <p className="vocabulary-mobile-card__translation">{row.translation}</p>

            <div className="vocabulary-mobile-card__meta-row">
              {row.level ? <span className="vocabulary-level-badge">{row.level}</span> : null}
              <span className={`vocabulary-status-badge vocabulary-status-badge--${row.category}`}>
                {statusLabel(row.category)}
              </span>
              <span className="vocabulary-mobile-card__meta-sep" aria-hidden="true">
                &bull;
              </span>
              <span className="vocabulary-mobile-card__meta-text">{lastPracticedText(row)}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="vocabulary-pagination">
        <p className="vocabulary-pagination__summary">
          {t("userProfile.vocabularySection.pagination.showingPrefix")} {rows.length}{" "}
          {t("userProfile.vocabularySection.pagination.showingConnector")} {totalFilteredCount}
        </p>

        <div className="vocabulary-pagination__controls">
          <button
            type="button"
            className="vocabulary-pagination__nav"
            aria-label={t("userProfile.vocabularySection.pagination.previous")}
            disabled={page <= 1}
            onClick={() => onPageChange(Math.max(1, page - 1))}
          >
            <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
          </button>

          {pageWindow.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              className={`vocabulary-pagination__page ${
                page === pageNumber ? "vocabulary-pagination__page--active" : ""
              }`}
              aria-current={page === pageNumber ? "page" : undefined}
              onClick={() => onPageChange(pageNumber)}
            >
              {pageNumber}
            </button>
          ))}

          {hasMoreAfterWindow ? (
            <span className="vocabulary-pagination__ellipsis" aria-hidden="true">
              …
            </span>
          ) : null}

          <button
            type="button"
            className="vocabulary-pagination__nav"
            aria-label={t("userProfile.vocabularySection.pagination.next")}
            disabled={page >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          >
            <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <label className="vocabulary-pagination__rows-per-page">
          {t("userProfile.vocabularySection.pagination.rowsPerPage")}
          <select
            value={String(pageSize)}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="vocabulary-pagination__rows-select"
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
          </select>
        </label>
      </div>
    </div>
  );
}

interface RowActionsProps {
  row: ResolvedVocabularyRow;
  isToggling: boolean;
  onToggleFavorite: () => void;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
}

function RowActions({ row, isToggling, onToggleFavorite, isMenuOpen, onToggleMenu, onCloseMenu }: RowActionsProps) {
  const { t } = useLanguage();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    if (!isMenuOpen) {
      setMenuStyle({
        position: "fixed",
        visibility: "hidden",
      });
      return;
    }

    const updateMenuPosition = () => {
      const button = buttonRef.current;
      const menu = menuRef.current;
      if (!button || !menu) {
        return;
      }

      const gap = 6;
      const buttonRect = button.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const hasRoomBelow = buttonRect.bottom + gap + menuRect.height <= viewportHeight;
      const top = hasRoomBelow
        ? buttonRect.bottom + gap
        : buttonRect.top - gap - menuRect.height;

      setMenuStyle({
        position: "fixed",
        visibility: "visible",
        top: Math.max(gap, Math.min(top, viewportHeight - menuRect.height - gap)),
        left: Math.max(
          gap,
          Math.min(buttonRect.right - menuRect.width, viewportWidth - menuRect.width - gap),
        ),
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [isMenuOpen]);

  // "Add/Remove <word> from favorites" — names the specific word rather
  // than a generic "Toggle favorite", so the control doesn't rely on icon
  // fill/color alone to communicate its current state (see this feature's
  // accessibility requirements).
  const favoriteAriaLabel = row.isFavorite
    ? `${t("userProfile.vocabularySection.table.removeFavoriteAriaLabelPrefix")} "${row.targetWord}" ${t(
        "userProfile.vocabularySection.table.removeFavoriteAriaLabelSuffix",
      )}`
    : `${t("userProfile.vocabularySection.table.addFavoriteAriaLabelPrefix")} "${row.targetWord}" ${t(
        "userProfile.vocabularySection.table.addFavoriteAriaLabelSuffix",
      )}`;

  return (
    <div className="vocabulary-row-actions">
      <button
        type="button"
        className="vocabulary-favorite-button"
        aria-pressed={row.isFavorite}
        aria-label={favoriteAriaLabel}
        disabled={isToggling}
        onClick={onToggleFavorite}
      >
        <Star size={15} strokeWidth={2} aria-hidden="true" fill={row.isFavorite ? "currentColor" : "none"} />
      </button>

      <div className="vocabulary-row-actions__menu-wrap">
        <button
          ref={buttonRef}
          type="button"
          className="vocabulary-more-button"
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
          aria-label={t("userProfile.vocabularySection.table.moreActionsAriaLabel")}
          onClick={onToggleMenu}
        >
          <MoreHorizontal size={15} strokeWidth={2} aria-hidden="true" />
        </button>

        {isMenuOpen ? (
          createPortal(
            <div
              ref={menuRef}
              className="vocabulary-more-menu"
              role="menu"
              style={menuStyle}
            >
              {MENU_ACTION_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  role="menuitem"
                  className="vocabulary-more-menu__item"
                  onClick={onCloseMenu}
                >
                  {t(key)}
                </button>
              ))}
            </div>,
            document.body,
          )
        ) : null}
      </div>
    </div>
  );
}
