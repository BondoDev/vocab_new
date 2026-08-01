import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Toast, useAutoDismissMessage } from "../../../../app/components/Toast";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { VocabularySummaryCards } from "./VocabularySummaryCards";
import { VocabularyTabs, type VocabularyTabId } from "./VocabularyTabs";
import { VocabularyTable } from "./VocabularyTable";
import "./vocabulary-section.scss";

export function VocabularySection() {
  const { t } = useLanguage();
  const [searchValue, setSearchValue] = useState("");
  const [activeTab, setActiveTab] = useState<VocabularyTabId>("all");
  const { message: confirmationMessage, show: showConfirmation } = useAutoDismissMessage();

  const handleAddWord = () => {
    // No backend write yet - this only confirms the local preview action.
    showConfirmation(t("userProfile.vocabularySection.addWord.toast"));
  };

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

      <VocabularySummaryCards />

      <div className="vocabulary-section__panel">
        <VocabularyTabs activeTab={activeTab} onTabChange={setActiveTab} />
        <VocabularyTable />
      </div>

      <Toast message={confirmationMessage} />
    </>
  );
}
