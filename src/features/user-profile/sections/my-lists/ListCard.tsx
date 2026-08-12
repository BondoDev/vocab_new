import { MoreHorizontal } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../app/components/ui/dropdown-menu";
import type { UserVocabularyList } from "../../../../lib/vocabularyLists";

interface ListCardProps {
  list: UserVocabularyList;
  // A real membership count, computed directly from membership rows (see
  // listWordCounts.ts) -- never a Learning/Known/Mastered aggregate.
  wordCount: number;
  onView: () => void;
  onRename: () => void;
  onDelete: () => void;
}

// One list card. Deliberately not a single clickable <button>/<div
// onClick> wrapping everything else — it holds two independent
// interactive controls (the overflow-menu trigger and the View List
// button), and nesting a button inside a button is invalid HTML/a11y.
export function ListCard({ list, wordCount, onView, onRename, onDelete }: ListCardProps) {
  const { t } = useLanguage();

  return (
    <article className="my-lists-card">
      <div className="my-lists-card__top">
        <h3 className="my-lists-card__name">{list.name}</h3>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="my-lists-card__menu-trigger"
              aria-label={list.name}
            >
              <MoreHorizontal size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRename}>{t("userProfile.myListsSection.rename")}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              {t("userProfile.myListsSection.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
