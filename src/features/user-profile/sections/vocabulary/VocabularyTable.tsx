import { useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, Star, Volume2 } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";

type VocabularyStatus = "learning" | "known" | "mastered";
type VocabularyLevel = "A2" | "B1" | "B2";

interface VocabularyWordPreview {
  id: string;
  word: string;
  translation: string;
  level: VocabularyLevel;
  status: VocabularyStatus;
  lastReviewedKey: string;
  isFavorite: boolean;
}

// Hardcoded preview rows only, to demonstrate the visual structure of the
// table - not real vocabulary data. Status is limited to the three
// user-facing categories (Learning / Known / Mastered); internal
// backend-only states (Seen, Familiar, Strong, Weak) are intentionally not
// represented here.
const PREVIEW_WORDS: VocabularyWordPreview[] = [
  {
    id: "abundant",
    word: "abundant",
    translation: "reichlich",
    level: "B2",
    status: "learning",
    lastReviewedKey: "today",
    isFavorite: false,
  },
  {
    id: "accommodate",
    word: "accommodate",
    translation: "unterbringen",
    level: "B1",
    status: "known",
    lastReviewedKey: "twoDaysAgo",
    isFavorite: false,
  },
  {
    id: "achievement",
    word: "achievement",
    translation: "die Leistung",
    level: "B2",
    status: "mastered",
    lastReviewedKey: "fiveDaysAgo",
    isFavorite: true,
  },
  {
    id: "adapt",
    word: "adapt",
    translation: "anpassen",
    level: "B1",
    status: "learning",
    lastReviewedKey: "oneWeekAgo",
    isFavorite: false,
  },
  {
    id: "adventure",
    word: "adventure",
    translation: "das Abenteuer",
    level: "A2",
    status: "known",
    lastReviewedKey: "today",
    isFavorite: true,
  },
];

const MENU_ACTION_KEYS = [
  "userProfile.vocabularySection.table.menu.viewDetails",
  "userProfile.vocabularySection.table.menu.addToList",
  "userProfile.vocabularySection.table.menu.practiceWord",
];

export function VocabularyTable() {
  const { t } = useLanguage();
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(
    () => new Set(PREVIEW_WORDS.filter((word) => word.isFavorite).map((word) => word.id))
  );
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);

  const toggleFavorite = (id: string) => {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const statusLabel = (status: VocabularyStatus) =>
    t(`userProfile.vocabularySection.table.statuses.${status}`);
  const lastReviewedLabel = (key: string) =>
    t(`userProfile.vocabularySection.table.lastReviewed.${key}`);

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
            <th scope="col">{t("userProfile.vocabularySection.table.columns.lastReviewed")}</th>
            <th scope="col" className="vocabulary-table__actions-head">
              {t("userProfile.vocabularySection.table.columns.actions")}
            </th>
          </tr>
        </thead>
        <tbody>
          {PREVIEW_WORDS.map((word) => (
            <tr key={word.id}>
              <td>
                <div className="vocabulary-table__word-cell">
                  <span className="vocabulary-table__word">{word.word}</span>
                  <span
                    className="vocabulary-table__audio-icon"
                    aria-label={t("userProfile.vocabularySection.table.audioAriaLabel")}
                  >
                    <Volume2 size={13} strokeWidth={2} aria-hidden="true" />
                  </span>
                </div>
              </td>
              <td className="vocabulary-table__translation">{word.translation}</td>
              <td>
                <span className="vocabulary-level-badge">{word.level}</span>
              </td>
              <td>
                <span className={`vocabulary-status-badge vocabulary-status-badge--${word.status}`}>
                  {statusLabel(word.status)}
                </span>
              </td>
              <td className="vocabulary-table__meta">{lastReviewedLabel(word.lastReviewedKey)}</td>
              <td>
                <RowActions
                  word={word}
                  isFavorite={favoriteIds.has(word.id)}
                  onToggleFavorite={() => toggleFavorite(word.id)}
                  isMenuOpen={openMenuId === word.id}
                  onToggleMenu={() =>
                    setOpenMenuId((current) => (current === word.id ? null : word.id))
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
        {PREVIEW_WORDS.map((word) => (
          <li key={word.id} className="vocabulary-mobile-card">
            <div className="vocabulary-mobile-card__top">
              <div className="vocabulary-table__word-cell">
                <span className="vocabulary-table__word">{word.word}</span>
                <span
                  className="vocabulary-table__audio-icon"
                  aria-label={t("userProfile.vocabularySection.table.audioAriaLabel")}
                >
                  <Volume2 size={13} strokeWidth={2} aria-hidden="true" />
                </span>
              </div>
              <button
                type="button"
                className="vocabulary-favorite-button"
                aria-pressed={favoriteIds.has(word.id)}
                aria-label={t("userProfile.vocabularySection.table.favoriteAriaLabel")}
                onClick={() => toggleFavorite(word.id)}
              >
                <Star
                  size={16}
                  strokeWidth={2}
                  aria-hidden="true"
                  fill={favoriteIds.has(word.id) ? "currentColor" : "none"}
                />
              </button>
            </div>

            <p className="vocabulary-mobile-card__translation">{word.translation}</p>

            <div className="vocabulary-mobile-card__badges">
              <span className="vocabulary-level-badge">{word.level}</span>
              <span className={`vocabulary-status-badge vocabulary-status-badge--${word.status}`}>
                {statusLabel(word.status)}
              </span>
            </div>

            <div className="vocabulary-mobile-card__bottom">
              <span className="vocabulary-table__meta">{lastReviewedLabel(word.lastReviewedKey)}</span>
              <RowActions
                word={word}
                isFavorite={favoriteIds.has(word.id)}
                onToggleFavorite={() => toggleFavorite(word.id)}
                isMenuOpen={openMenuId === `${word.id}-mobile`}
                onToggleMenu={() =>
                  setOpenMenuId((current) =>
                    current === `${word.id}-mobile` ? null : `${word.id}-mobile`
                  )
                }
                onCloseMenu={() => setOpenMenuId(null)}
                hideFavorite
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="vocabulary-pagination">
        <p className="vocabulary-pagination__summary">
          {t("userProfile.vocabularySection.pagination.previewingSampleRows")}
        </p>

        <div className="vocabulary-pagination__controls">
          <button
            type="button"
            className="vocabulary-pagination__nav"
            aria-label={t("userProfile.vocabularySection.pagination.previous")}
            onClick={() => setActivePage((page) => Math.max(1, page - 1))}
          >
            <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
          </button>

          {[1, 2, 3].map((page) => (
            <button
              key={page}
              type="button"
              className={`vocabulary-pagination__page ${
                activePage === page ? "vocabulary-pagination__page--active" : ""
              }`}
              aria-current={activePage === page ? "page" : undefined}
              onClick={() => setActivePage(page)}
            >
              {page}
            </button>
          ))}

          <span className="vocabulary-pagination__ellipsis" aria-hidden="true">
            …
          </span>

          <button
            type="button"
            className="vocabulary-pagination__nav"
            aria-label={t("userProfile.vocabularySection.pagination.next")}
            onClick={() => setActivePage((page) => Math.min(3, page + 1))}
          >
            <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <label className="vocabulary-pagination__rows-per-page">
          {t("userProfile.vocabularySection.pagination.rowsPerPage")}
          <select defaultValue="10" className="vocabulary-pagination__rows-select">
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
  word: VocabularyWordPreview;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  hideFavorite?: boolean;
}

function RowActions({
  isFavorite,
  onToggleFavorite,
  isMenuOpen,
  onToggleMenu,
  onCloseMenu,
  hideFavorite,
}: RowActionsProps) {
  const { t } = useLanguage();

  return (
    <div className="vocabulary-row-actions">
      {hideFavorite ? null : (
        <button
          type="button"
          className="vocabulary-favorite-button"
          aria-pressed={isFavorite}
          aria-label={t("userProfile.vocabularySection.table.favoriteAriaLabel")}
          onClick={onToggleFavorite}
        >
          <Star size={15} strokeWidth={2} aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
        </button>
      )}

      <div className="vocabulary-row-actions__menu-wrap">
        <button
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
          <div className="vocabulary-more-menu" role="menu">
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
