import { useLanguage } from "../../../../contexts/LanguageContext";
import type { UserVocabularyList } from "../../../../lib/vocabularyLists";

interface ListCardProps {
  list: UserVocabularyList;
  // A real membership count, computed directly from membership rows (see
  // listWordCounts.ts) -- never a Learning/Known/Mastered aggregate.
  wordCount: number;
  onView: () => void;
}

export function ListCard({ list, wordCount, onView }: ListCardProps) {
  const { t } = useLanguage();

  return (
    <article className="my-lists-card">
      <div className="my-lists-card__top">
        <h3 className="my-lists-card__name">{list.name}</h3>
      </div>

      <p className="my-lists-card__count">
        {wordCount} {t("userProfile.myListsSection.wordsUnit")}
      </p>

      <button type="button" className="my-lists-card__view-button" onClick={onView}>
        {t("userProfile.myListsSection.card.viewList")}
      </button>
    </article>
  );
}
