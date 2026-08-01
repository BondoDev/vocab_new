import { useId, useState } from "react";
import { Filter } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";

export type VocabularyTabId = "all" | "learning" | "known" | "mastered" | "favorites";

interface TabConfig {
  id: VocabularyTabId;
  labelKey: string;
  count: number | null;
}

// Hardcoded zero counts for a brand-new user preview - see
// VocabularySummaryCards.tsx for the matching summary-card values.
const TABS: TabConfig[] = [
  { id: "all", labelKey: "userProfile.vocabularySection.tabs.all", count: null },
  { id: "learning", labelKey: "userProfile.vocabularySection.tabs.learning", count: 0 },
  { id: "known", labelKey: "userProfile.vocabularySection.tabs.known", count: 0 },
  { id: "mastered", labelKey: "userProfile.vocabularySection.tabs.mastered", count: 0 },
  { id: "favorites", labelKey: "userProfile.vocabularySection.tabs.favorites", count: 0 },
];

interface VocabularyTabsProps {
  activeTab: VocabularyTabId;
  onTabChange: (tabId: VocabularyTabId) => void;
}

// Filters panel state is local and preview-only: it toggles a compact panel
// of native selects with no filtering logic behind it (see the vocabulary
// task brief - real filtering is a future backend-connected feature).
export function VocabularyTabs({ activeTab, onTabChange }: VocabularyTabsProps) {
  const { t } = useLanguage();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const filtersPanelId = useId();

  return (
    <div className="vocabulary-tabs-row">
      <div
        className="vocabulary-tabs-row__tabs"
        role="tablist"
        aria-label={t("userProfile.vocabularySection.tabs.ariaLabel")}
      >
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`vocabulary-tab ${isActive ? "vocabulary-tab--active" : ""}`}
              onClick={() => onTabChange(tab.id)}
            >
              {t(tab.labelKey)}
              {tab.count !== null ? (
                <span className="vocabulary-tab__count">({tab.count})</span>
              ) : null}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className={`vocabulary-filters-button ${isFiltersOpen ? "vocabulary-filters-button--active" : ""}`}
        aria-expanded={isFiltersOpen}
        aria-controls={filtersPanelId}
        onClick={() => setIsFiltersOpen((prev) => !prev)}
      >
        <Filter size={15} strokeWidth={2} aria-hidden="true" />
        {t("userProfile.vocabularySection.filters.label")}
      </button>

      {isFiltersOpen ? (
        <div id={filtersPanelId} className="vocabulary-filters-panel">
          <label className="vocabulary-filters-panel__field">
            <span className="vocabulary-filters-panel__label">
              {t("userProfile.vocabularySection.filters.level")}
            </span>
            <select className="vocabulary-filters-panel__select" defaultValue="">
              <option value="">{t("userProfile.vocabularySection.filters.any")}</option>
              <option value="a2">A2</option>
              <option value="b1">B1</option>
              <option value="b2">B2</option>
            </select>
          </label>

          <label className="vocabulary-filters-panel__field">
            <span className="vocabulary-filters-panel__label">
              {t("userProfile.vocabularySection.filters.partOfSpeech")}
            </span>
            <select className="vocabulary-filters-panel__select" defaultValue="">
              <option value="">{t("userProfile.vocabularySection.filters.any")}</option>
              <option value="noun">{t("userProfile.vocabularySection.filters.partsOfSpeech.noun")}</option>
              <option value="verb">{t("userProfile.vocabularySection.filters.partsOfSpeech.verb")}</option>
              <option value="adjective">
                {t("userProfile.vocabularySection.filters.partsOfSpeech.adjective")}
              </option>
              <option value="adverb">
                {t("userProfile.vocabularySection.filters.partsOfSpeech.adverb")}
              </option>
            </select>
          </label>

          <label className="vocabulary-filters-panel__field">
            <span className="vocabulary-filters-panel__label">
              {t("userProfile.vocabularySection.filters.status")}
            </span>
            <select className="vocabulary-filters-panel__select" defaultValue="">
              <option value="">{t("userProfile.vocabularySection.filters.any")}</option>
              <option value="learning">
                {t("userProfile.vocabularySection.filters.statusOptions.learning")}
              </option>
              <option value="known">{t("userProfile.vocabularySection.filters.statusOptions.known")}</option>
              <option value="mastered">
                {t("userProfile.vocabularySection.filters.statusOptions.mastered")}
              </option>
            </select>
          </label>
        </div>
      ) : null}
    </div>
  );
}
