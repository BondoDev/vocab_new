import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ListPlus, Volume2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { findInflectedWordRanges } from "../../../features/practice/utils/highlightInflectedWords";
import {
  formatContentTemplate,
  type FullVocabularyListContentEntry,
} from "../../../data/seo/fullVocabularyList";
import type { FullVocabularyRow } from "../../../data/seo/fullVocabularyList/fullVocabularyListEntries";

interface FullVocabularyTableProps {
  rows: FullVocabularyRow[];
  label: string;
  columns: FullVocabularyListContentEntry["levelPanel"]["tableColumns"];
  grammarTypes: FullVocabularyListContentEntry["grammarTypes"];
  pronounceLabel: string;
  // BCP 47 voice locale for the target language (e.g. "en-US").
  speechLang: string;
  // Adds a Translation column after Word (UI language differs from the
  // table's language).
  showTranslations: boolean;
  detailsLabel: string;
  hideLabel: string;
  // Accessible name of each row's "⋮" button ({word} token).
  rowActionsLabel: string;
  addToListLabel: string;
  onAddToList: (row: FullVocabularyRow) => void;
}

const ROW_MENU_ITEM_CLASS =
  "cursor-pointer gap-2.5 rounded-lg py-2 pl-2.5 pr-3 focus:bg-primary/10 focus:text-primary [&_svg]:!text-primary";

// Bolds the table word inside its example sentence as React nodes (no HTML
// injection). `languageTag` is only used for locale-aware lowercasing during
// matching, so the target language's voice locale (e.g. "en-US") serves.
function renderSentence(sentence: string, forms: string[] | undefined, languageTag: string): ReactNode {
  const ranges = forms?.length ? findInflectedWordRanges(sentence, languageTag, forms) : [];
  if (ranges.length === 0) {
    return sentence;
  }
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const range of ranges) {
    parts.push(sentence.slice(lastIndex, range.start));
    parts.push(
      <strong key={range.start} className="font-semibold not-italic text-foreground">
        {sentence.slice(range.start, range.end)}
      </strong>,
    );
    lastIndex = range.end;
  }
  parts.push(sentence.slice(lastIndex));
  return parts;
}

// Uses the browser's built-in speech synthesis, like the verb-list tables;
// cancel() first so rapid clicks don't queue up a backlog of words.
function speakWord(word: string, speechLang: string) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = speechLang;
  window.speechSynthesis.speak(utterance);
}

// The word column stays pinned while the table scrolls sideways on wider
// screens, so each definition/sentence keeps its word in view. Sticky cells
// need an opaque background to cover the cells scrolling beneath them.
const STICKY_WORD_CELL = "sticky left-0 z-10 max-[582px]:static";

// Below 582px the table switches to a compact layout instead of scrolling
// sideways: each row keeps N | word | [translation] | Details, and the
// definition, example sentence, and grammar type move into a full-width
// detail row toggled per entry. One table serves both layouts — these
// classes hide the cells that don't belong to the current width.
const DESKTOP_ONLY = "max-[582px]:hidden";
const MOBILE_ONLY = "min-[582px]:hidden";

export function FullVocabularyTable({
  rows,
  label,
  columns,
  grammarTypes,
  pronounceLabel,
  speechLang,
  showTranslations,
  detailsLabel,
  hideLabel,
  rowActionsLabel,
  addToListLabel,
  onAddToList,
}: FullVocabularyTableProps) {
  // This table only ever renders in the browser (rows load client-side), so
  // reading window here can't cause an SSR/hydration mismatch. Browsers
  // without speech synthesis get no button rather than a dead one.
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  // Keyed by concept_id, never by row position, so filtering or Load More
  // can't move an open detail panel onto a different word.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set());
  // The detail row only renders in the mobile layout, so it spans exactly the
  // mobile columns (N | Word | [Translation] | Details | ⋮). Spanning the
  // hidden desktop columns too would make the fixed-layout table invent
  // phantom columns that take width away from Word and Translation.
  const mobileColumnCount = showTranslations ? 5 : 4;
  // Below 582px the table uses fixed layout: the number and Details columns
  // get set widths and Word/Translation split the rest, so long words wrap
  // inside their own column instead of squeezing neighbours. The Details
  // column is sized from its longest localized label ("Подробнее" needs
  // more room than "Details"); below 480px (where the ⋮ column leaves too little room) the label is visually hidden and
  // the chevron alone remains (the label stays its accessible name).
  const detailsColumnStyle = {
    "--details-col": `calc(${Math.max(detailsLabel.length, hideLabel.length)}ch + 2.5rem)`,
  } as CSSProperties;

  const toggleDetails = (conceptId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(conceptId)) {
        next.delete(conceptId);
      } else {
        next.add(conceptId);
      }
      return next;
    });
  };

  const grammarBadge = (row: FullVocabularyRow) => (
    <span className="inline-flex rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
      {grammarTypes[row.type as keyof typeof grammarTypes] ?? row.type}
    </span>
  );

  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="overflow-x-auto rounded-xl border border-border bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <table
        className={`w-full border-collapse text-left text-sm max-[582px]:min-w-0 max-[582px]:table-fixed ${
          showTranslations ? "min-w-[54rem]" : "min-w-[46rem]"
        }`}
      >
        <thead>
          <tr className="border-b border-border bg-muted text-xs uppercase tracking-wide text-muted-foreground max-[582px]:normal-case max-[582px]:tracking-normal">
            <th scope="col" className="w-12 px-3 py-2.5 text-right font-semibold max-[582px]:w-6 max-[582px]:px-1">
              {columns.number}
            </th>
            <th
              scope="col"
              className={`${STICKY_WORD_CELL} w-40 bg-muted px-3 py-2.5 font-semibold max-[582px]:w-auto max-[582px]:px-2 max-[582px]:break-words max-[582px]:hyphens-auto`}
            >
              {columns.word}
            </th>
            {showTranslations ? (
              <th scope="col" className="w-40 px-3 py-2.5 font-semibold max-[582px]:w-auto max-[582px]:px-2 max-[582px]:break-words max-[582px]:hyphens-auto">
                {columns.translation}
              </th>
            ) : null}
            <th scope="col" className={`px-3 py-2.5 font-semibold ${DESKTOP_ONLY}`}>
              {columns.definition}
            </th>
            <th scope="col" className={`px-3 py-2.5 font-semibold ${DESKTOP_ONLY}`}>
              {columns.sentence}
            </th>
            <th scope="col" className={`w-32 px-3 py-2.5 font-semibold ${DESKTOP_ONLY}`}>
              {columns.grammarType}
            </th>
            <th
              scope="col"
              style={detailsColumnStyle}
              className={`px-2 py-2.5 max-[582px]:w-(--details-col) max-[479px]:w-11 ${MOBILE_ONLY}`}
            >
              <span className="sr-only">{detailsLabel}</span>
            </th>
            {/* Right-most in both layouts. */}
            <th scope="col" className="w-10 px-1 py-2.5 max-[582px]:w-8 max-[582px]:px-0">
              <span className="sr-only">{columns.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => {
            const isExpanded = expandedIds.has(row.conceptId);
            const detailsId = `full-vocabulary-details-${row.conceptId}`;
            return (
              <Fragment key={row.conceptId}>
                <tr className={`align-top ${isExpanded ? "max-[582px]:border-b-0 max-[582px]:bg-muted/40" : ""}`}>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground max-[582px]:px-1">
                    {index + 1}
                  </td>
                  <th
                    scope="row"
                    className={`${STICKY_WORD_CELL} bg-card px-3 py-2 font-semibold text-foreground max-[582px]:bg-transparent max-[582px]:px-2 max-[359px]:px-1`}
                  >
                    <span className="flex items-start gap-1.5 max-[582px]:gap-1">
                      {canSpeak ? (
                        <button
                          type="button"
                          aria-label={formatContentTemplate(pronounceLabel, { word: row.word })}
                          onClick={() => speakWord(row.word, speechLang)}
                          className="-ml-1 inline-flex size-7 shrink-0 items-center max-[582px]:size-6 justify-center rounded-full text-primary/80 transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                          <Volume2 aria-hidden="true" className="size-4" />
                        </button>
                      ) : null}
                      <span lang={speechLang} className="min-w-0 break-words pt-0.5 hyphens-auto max-[582px]:pt-px">{row.word}</span>
                    </span>
                  </th>
                  {showTranslations ? (
                    <td className="break-words px-3 py-2.5 font-medium text-foreground hyphens-auto max-[582px]:px-2 max-[359px]:px-1">
                      {row.translation ?? <span className="text-muted-foreground">—</span>}
                    </td>
                  ) : null}
                  <td className={`px-3 py-2.5 text-muted-foreground ${DESKTOP_ONLY}`}>{row.definition}</td>
                  <td className={`px-3 py-2.5 italic text-foreground/80 ${DESKTOP_ONLY}`}>
                    {renderSentence(row.sentence, row.sentenceForms, speechLang)}
                  </td>
                  <td className={`px-3 py-2.5 ${DESKTOP_ONLY}`}>{grammarBadge(row)}</td>
                  <td className={`py-1.5 pl-0.5 pr-1.5 text-right ${MOBILE_ONLY}`}>
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      aria-controls={detailsId}
                      onClick={() => toggleDetails(row.conceptId)}
                      className="inline-flex min-h-9 items-center gap-0.5 whitespace-nowrap rounded-lg px-1.5 text-xs font-medium text-foreground/80 transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      <span className="max-[479px]:sr-only">{isExpanded ? hideLabel : detailsLabel}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className={`size-4 text-primary transition-transform ${isExpanded ? "rotate-180" : ""}`}
                      />
                    </button>
                  </td>
                  {/* Row actions menu ("⋮" as a text glyph). Non-modal so
                      opening it never locks scroll or shifts the page. */}
                  <td className="px-1 py-1.5 text-center max-[582px]:px-0">
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label={formatContentTemplate(rowActionsLabel, { word: row.word })}
                          className="inline-flex size-8 items-center justify-center rounded-full text-lg font-bold leading-none text-foreground/60 transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 data-[state=open]:bg-primary/10 data-[state=open]:text-primary max-[582px]:size-7"
                        >
                          <span aria-hidden="true">⋮</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="min-w-0 rounded-xl border-foreground/10 p-1 shadow-lg"
                      >
                        <DropdownMenuItem className={ROW_MENU_ITEM_CLASS} onSelect={() => onAddToList(row)}>
                          <ListPlus aria-hidden="true" />
                          {addToListLabel}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
                {/* Rendered only while open (the toggle exists only below
                    582px); one cell spans every column so the details use
                    the full row width. */}
                {isExpanded ? (
                  <tr className={`bg-muted/40 ${MOBILE_ONLY}`}>
                    <td id={detailsId} colSpan={mobileColumnCount} className="px-3 pb-2.5 pt-0">
                      {/* Grouping comes from type and a hairline divider, not
                          padding: tight label->text gaps, snug line height,
                          and the sentence set off by a divider so the panel
                          stays no taller than before. */}
                      <dl className="border-l-2 border-primary/40 pl-3 text-sm leading-snug">
                        <div className="mb-1.5">
                          <dt className="sr-only">{columns.grammarType}</dt>
                          <dd>
                            <span className="inline-flex rounded border border-primary/25 bg-primary/10 px-1.5 text-[11px] font-medium leading-[1.125rem] text-primary">
                              {grammarTypes[row.type as keyof typeof grammarTypes] ?? row.type}
                            </span>
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[11px] font-bold uppercase tracking-wide text-primary">
                            {columns.definition}
                          </dt>
                          <dd className="text-foreground">{row.definition}</dd>
                        </div>
                        <div className="mt-1.5 border-t border-foreground/10 pt-1.5">
                          <dt className="text-[11px] font-bold uppercase tracking-wide text-primary">
                            {columns.sentence}
                          </dt>
                          <dd className="italic text-foreground/85">
                            {renderSentence(row.sentence, row.sentenceForms, speechLang)}
                          </dd>
                        </div>
                      </dl>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
