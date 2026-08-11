import { MoreHorizontal } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../../../app/components/ui/dropdown-menu";
import type { UserVocabularyList } from "../../../../lib/vocabularyLists";
import type { ListCardMetrics } from "./listCardMetrics";

interface ListCardProps {
  list: UserVocabularyList;
  metrics: ListCardMetrics;
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
// overflow menu — it doesn't exist yet (Phase 2B+), and the brief prefers
// omitting it cleanly over reserving a disabled placeholder.
export function ListCard({ list, metrics, onView, onRename, onDelete }: ListCardProps) {
  const { t } = useLanguage();
  const hasWords = metrics.total > 0;

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
        {metrics.total} {t("userProfile.myListsSection.wordsUnit")}
      </p>

      {hasWords ? (
        <div className="my-lists-card__bar" role="presentation">
          {metrics.learning > 0 ? (
            <span
              className="my-lists-card__bar-segment my-lists-card__bar-segment--learning"
              style={{ flexGrow: metrics.learning }}
            />
          ) : null}
          {metrics.known > 0 ? (
            <span
              className="my-lists-card__bar-segment my-lists-card__bar-segment--known"
              style={{ flexGrow: metrics.known }}
            />
          ) : null}
          {metrics.mastered > 0 ? (
            <span
              className="my-lists-card__bar-segment my-lists-card__bar-segment--mastered"
              style={{ flexGrow: metrics.mastered }}
            />
          ) : null}
        </div>
      ) : null}

      <div className="my-lists-card__stats">
        <span className="my-lists-card__stat my-lists-card__stat--learning">
          {metrics.learning} {t("userProfile.vocabularySection.table.statuses.learning")}
        </span>
        <span className="my-lists-card__stat my-lists-card__stat--known">
          {metrics.known} {t("userProfile.vocabularySection.table.statuses.known")}
        </span>
        <span className="my-lists-card__stat my-lists-card__stat--mastered">
          {metrics.mastered} {t("userProfile.vocabularySection.table.statuses.mastered")}
        </span>
      </div>

      <button type="button" className="my-lists-card__view-button" onClick={onView}>
        {t("userProfile.myListsSection.card.viewList")}
      </button>
    </article>
  );
}
