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
  // listWordCounts.ts) — never a Learning/Known/Mastered aggregate. The
  // corrective My Lists phase removed that aggregate from cards entirely:
  // membership is concept-based and independent of user_word_progress, so
  // a list may be mostly (or entirely) unstudied, making a status
  // breakdown misleading rather than informative. See supabase/README.md's
  // "My Lists Corrective Phase" section.
  wordCount: number;
  onView: () => void;
  onRename: () => void;
  onDelete: () => void;
  // Optional smaller Practice List entry point (My Lists Phase 3) — the
  // detail header's own button is the primary entry point; this is the
  // card-level convenience path, tucked into the overflow menu so the
  // compact card never grows a third top-level button. Omitted from the
  // menu entirely for a zero-word list (see MyListsSection, which never
  // passes this for such a list) rather than shown disabled.
  onPracticeList?: () => void;
}

// One list card. Deliberately not a single clickable <button>/<div
// onClick> wrapping everything else — it holds two independent
// interactive controls (the overflow-menu trigger and the View List
// button), and nesting a button inside a button is invalid HTML/a11y (see
// the Phase 2A brief's own "do not make nested buttons inside a clickable
// card invalid" requirement).
export function ListCard({ list, wordCount, onView, onRename, onDelete, onPracticeList }: ListCardProps) {
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
            {onPracticeList ? (
              <DropdownMenuItem onSelect={onPracticeList}>
                {t("userProfile.myListsSection.practiceList")}
              </DropdownMenuItem>
            ) : null}
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
