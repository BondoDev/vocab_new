import { Volume2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useHorizontalTableScroll } from "../shared/useHorizontalTableScroll";
import { TableScrollControls } from "../shared/TableScrollControls";
import {
  NUMBER_COLUMN_WIDTH,
  STICKY_BODY_CELL,
  STICKY_EDGE_SHADOW,
  STICKY_HEADER_CELL,
} from "../shared/stickyTableColumns";

export interface VerbListTableRow {
  id: string;
  index: number;
  verb: string;
  translation: string;
  definition: string;
  href: string | null;
}

interface VerbListTableSectionProps {
  rows: VerbListTableRow[];
  showTranslationColumn: boolean;
  speechLang: string;
  numberLabel: string;
  verbLabel: string;
  translationLabel: string;
  definitionLabel: string;
  pronounceLabel: string;
  regionLabel: string;
  scrollHint: string;
  scrollLeftLabel: string;
  scrollRightLabel: string;
  noResultsMessage: string | null;
}

function speakVerb(verb: string, speechLang: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(verb);
  utterance.lang = speechLang;
  window.speechSynthesis.speak(utterance);
}

const HINT_ID = "verb-list-scroll-hint";

// Shared table body for the common-100-verbs page family (the full
// "Rich" page and the no-localized-content "table only" fallback both
// render the exact same table shape: number, verb, an optional
// translation column, definition). Isolated here so both callers get
// identical sticky/scroll/mobile behavior from one implementation instead
// of two copies drifting apart.
export function VerbListTableSection({
  rows,
  showTranslationColumn,
  speechLang,
  numberLabel,
  verbLabel,
  translationLabel,
  definitionLabel,
  pronounceLabel,
  regionLabel,
  scrollHint,
  scrollLeftLabel,
  scrollRightLabel,
  noResultsMessage,
}: VerbListTableSectionProps) {
  const { scrollRef, scrollState, scrollByPage } = useHorizontalTableScroll([
    rows.length,
    showTranslationColumn,
  ]);

  return (
    <>
      <div className="mt-5">
        <TableScrollControls
          scrollState={scrollState}
          hint={scrollHint}
          hintId={HINT_ID}
          scrollLeftLabel={scrollLeftLabel}
          scrollRightLabel={scrollRightLabel}
          onScrollLeft={() => scrollByPage(-1)}
          onScrollRight={() => scrollByPage(1)}
        />

        <div
          ref={scrollRef}
          role="region"
          tabIndex={0}
          aria-label={regionLabel || undefined}
          aria-describedby={scrollState.canScroll && scrollHint ? HINT_ID : undefined}
          className="overflow-x-auto rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                <th
                  style={{ width: NUMBER_COLUMN_WIDTH, minWidth: NUMBER_COLUMN_WIDTH, left: 0 }}
                  className={`${STICKY_HEADER_CELL} border-b border-border py-3 pl-1 pr-1 text-sm text-foreground`}
                >
                  {numberLabel}
                </th>
                <th
                  style={{ left: NUMBER_COLUMN_WIDTH }}
                  className={`${STICKY_HEADER_CELL} ${scrollState.canScroll ? STICKY_EDGE_SHADOW : ""} min-w-[5.5rem] max-w-[7.5rem] border-b border-border py-3 pl-2 pr-3 text-sm text-foreground sm:min-w-[9rem] sm:max-w-none`}
                >
                  {verbLabel}
                </th>
                {showTranslationColumn ? (
                  <th className="min-w-[7rem] border-b border-border py-3 pr-4 text-sm text-foreground">
                    {translationLabel}
                  </th>
                ) : null}
                <th className="whitespace-nowrap border-b border-border py-3 pr-4 text-sm text-foreground">
                  {definitionLabel}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td
                    style={{ width: NUMBER_COLUMN_WIDTH, minWidth: NUMBER_COLUMN_WIDTH, left: 0 }}
                    className={`${STICKY_BODY_CELL} border-b border-border/70 py-3 pl-1 pr-1 align-top text-sm text-muted-foreground`}
                  >
                    {row.index}
                  </td>
                  <td
                    style={{ left: NUMBER_COLUMN_WIDTH }}
                    className={`${STICKY_BODY_CELL} ${scrollState.canScroll ? STICKY_EDGE_SHADOW : ""} min-w-[5.5rem] max-w-[7.5rem] whitespace-normal break-words border-b border-border/70 py-3 pl-2 pr-3 align-top text-sm font-medium text-foreground sm:min-w-[9rem] sm:max-w-none sm:whitespace-nowrap`}
                  >
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`${pronounceLabel}: ${row.verb}`}
                        onClick={() => speakVerb(row.verb, speechLang)}
                        className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-primary/80 transition hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                      >
                        <Volume2 className="h-3.5 w-3.5" />
                      </button>
                      {row.href ? (
                        <Link className="text-primary transition hover:underline" to={row.href}>
                          {row.verb}
                        </Link>
                      ) : (
                        row.verb
                      )}
                    </div>
                  </td>
                  {showTranslationColumn ? (
                    <td className="min-w-[7rem] border-b border-border/70 py-3 pr-4 align-top text-sm text-muted-foreground">
                      {row.translation || "-"}
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap border-b border-border/70 py-3 pr-4 align-top text-sm text-muted-foreground">
                    {row.definition || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {noResultsMessage ? <p className="mt-4 text-sm text-muted-foreground">{noResultsMessage}</p> : null}
    </>
  );
}
