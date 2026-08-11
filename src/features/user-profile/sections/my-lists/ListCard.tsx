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
}

// One list card. Deliberately not a single clickable <button>/<div
// onClick> wrapping everything else — it holds two independent
// interactive controls (the overflow-menu trigger and the View List
// button), and nesting a button inside a button is invalid HTML/a11y (see
// the Phase 2A brief's own "do not make nested buttons inside a clickable
// card invalid" requirement). Study List is intentionally omitted from the
// overflow menu — it doesn't exist yet (a future phase), and the brief
// prefers omitting it cleanly over reserving a disabled placeholder.
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
