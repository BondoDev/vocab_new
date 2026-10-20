import { Fragment, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { Volume2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import "./vocabulary-table.scss";

// Reusable word-list table for vocabulary SEO pages (first consumer: the
// full vocabulary list, src/app/pages/list-pages/full-vocabulary-list/). It owns layout
// and interaction; the caller owns data, copy, and which columns exist.
//
// Built in: a row number, the word (pinned while scrolling sideways, with
// browser speech), an optional per-row actions menu ("⋮"), and the compact
// layout below 582px. Everything else is a configured column:
//   - "primary" columns stay in the row at every width (e.g. a translation);
//   - "detail" columns are ordinary columns on wider screens and move into a
//     per-row expandable panel below 582px (Details toggle / tap the row).
//
// Rows may be server-rendered in bulk for SEO, so:
//   - body cells use short vt-* classes (vocabulary-table.scss) rather than
//     long Tailwind strings — per-row markup size is multiplied by hundreds;
//   - controls with no indexable content (speech, Details, ⋮) render only
//     after hydration, keeping their cells so the layout doesn't shift.
// All visible text comes from props; nothing user-facing is hard-coded.

export interface VocabularyTableColumn<Row> {
  key: string;
  header: string;
  placement: "primary" | "detail";
  render: (row: Row) => ReactNode;
  // Rendering inside the compact details panel (defaults to `render`).
  renderDetail?: (row: Row) => ReactNode;
  // In the details panel: "labeled" shows the header above the value;
  // "badge" shows the value alone at the top (header kept for screen readers).
  detailStyle?: "labeled" | "badge";
  // Text treatment of the column's cells.
  tone?: "default" | "muted" | "strong" | "sentence";
  // Desktop width hint ("medium" ≈ the word column, "narrow" for badges).
  width?: "auto" | "medium" | "narrow";
}

export interface VocabularyTableRowAction<Row> {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: (row: Row) => void;
}

export interface VocabularyTableLabels {
  number: string;
  word: string;
  // Compact Details toggle, collapsed / expanded.
  details: string;
  hide: string;
  // Screen-reader header of the actions column.
  actions: string;
  // Accessible names of each row's speech and "⋮" buttons; {word} token.
  pronounce: string;
  rowActions: string;
}

export interface VocabularyTableProps<Row> {
  rows: Row[];
  // Stable per-row identity (e.g. concept id); also keys expansion state.
  getRowKey: (row: Row) => string;
  getWord: (row: Row) => string;
  // BCP 47 tag of the table's language: speech voice, the word's `lang`
  // attribute (hyphenation), and locale-aware matching by callers.
  wordLang: string;
  columns: VocabularyTableColumn<Row>[];
  labels: VocabularyTableLabels;
  rowActions?: VocabularyTableRowAction<Row>[];
  // Accessible name of the scrollable table region.
  ariaLabel: string;
  // Prefix for per-row details-panel ids (unique per page).
  idPrefix: string;
}

// Speech support never changes during a page's life.
const subscribeToNothing = () => () => {};

// Uses the browser's built-in speech synthesis; cancel() first so rapid
// clicks don't queue up a backlog of words.
function speakWord(word: string, lang: string) {
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(word);
  utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
}

function fillWord(template: string, word: string): string {
  return template.split("{word}").join(word);
}

// The word column stays pinned while the table scrolls sideways on wider
// screens, so each row's other cells keep their word in view. Sticky cells
// need an opaque background to cover the cells scrolling beneath them.
const STICKY_WORD_CELL = "sticky left-0 z-10 max-[582px]:static";

// Below 582px the table switches to a compact layout instead of scrolling
// sideways: rows keep N | word | primary columns | Details | ⋮, and detail
// columns move into a full-width panel toggled per row. One table serves
// both layouts — these classes hide the cells that don't belong to the
// current width (Tailwind v4 max-[582px]: means width < 582px).
const DESKTOP_ONLY = "max-[582px]:hidden";
const MOBILE_ONLY = "min-[582px]:hidden";
// Same breakpoint, for the row-click handler.
const COMPACT_TABLE_QUERY = "(max-width: 581px)";

const HEADER_WIDTH_CLASS = { auto: "", medium: "w-40", narrow: "w-32" } as const;
// Body cells: vt-p (primary) / vt-d (detail, hidden in the compact layout)
// plus an optional tone class — kept this short because they repeat per row.
const CELL_TONE_CLASS = { default: "", muted: " vt-muted", strong: " vt-strong", sentence: " vt-sent" } as const;

const ROW_MENU_ITEM_CLASS =
  "cursor-pointer gap-2.5 rounded-lg py-2 pl-2.5 pr-3 focus:bg-primary/10 focus:text-primary [&_svg]:!text-primary";

export function VocabularyTable<Row>({
  rows,
  getRowKey,
  getWord,
  wordLang,
  columns,
  labels,
  rowActions = [],
  ariaLabel,
  idPrefix,
}: VocabularyTableProps<Row>) {
  // The rows may be server-rendered, so browser-only capabilities are read
  // after hydration: false on the server and the first client render, then
  // the real value. Browsers without speech synthesis get no button rather
  // than a dead one.
  const canSpeak = useSyncExternalStore(subscribeToNothing, () => "speechSynthesis" in window, () => false);
  const isHydrated = useSyncExternalStore(subscribeToNothing, () => true, () => false);
  // Keyed by row identity, never by position, so filtering or Load More
  // can't move an open details panel onto a different word.
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());

  const primaryColumns = columns.filter((column) => column.placement === "primary");
  const detailColumns = columns.filter((column) => column.placement === "detail");
  const hasDetails = detailColumns.length > 0;
  const hasActions = rowActions.length > 0;
  // The details row only renders in the compact layout, so it spans exactly
  // the compact columns. Spanning the hidden desktop columns too would make
  // the fixed-layout table invent phantom columns that take width away from
  // the word and primary columns.
  const compactColumnCount = 2 + primaryColumns.length + (hasDetails ? 1 : 0) + (hasActions ? 1 : 0);
  // Badge-style details first, then labeled ones (divided from each other).
  const detailPanelColumns = [
    ...detailColumns.filter((column) => column.detailStyle === "badge"),
    ...detailColumns.filter((column) => column.detailStyle !== "badge"),
  ];
  // Desktop: scroll sideways rather than squeeze — 46rem base plus 8rem per
  // primary column (a translation column needs about that).
  const minTableWidth = `${46 + primaryColumns.length * 8}rem`;
  // Compact layout: the number column fits the widest row number shown
  // ("962" vs "1053" after Load More), so 4-digit numbers never spill into
  // the word cell. Sized in rem from the body cells' text-sm tabular digits
  // (~0.55rem each) — not ch, which would be measured in the header cell's
  // smaller text-xs font and come out too narrow — plus the cell's padding.
  const numberColumnStyle = {
    "--number-col": `${(String(rows.length).length * 0.55 + 0.5).toFixed(2)}rem`,
  } as CSSProperties;
  // Compact layout uses fixed table layout: the number and Details columns
  // get set widths and the word/primary columns split the rest, so long
  // words wrap inside their own column instead of squeezing neighbours. The
  // Details column is sized from its longest localized label ("Подробнее"
  // needs more room than "Details"); below 480px (where the ⋮ column leaves
  // too little room) the label is visually hidden and the chevron alone
  // remains (the label stays its accessible name).
  const detailsColumnStyle = {
    "--details-col": `calc(${Math.max(labels.details.length, labels.hide.length)}ch + 2.5rem)`,
  } as CSSProperties;

  const toggleDetails = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  return (
    <div
      role="region"
      aria-label={ariaLabel}
      tabIndex={0}
      className="overflow-x-auto rounded-xl border border-border bg-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <table
        className={`w-full border-collapse text-left text-sm max-[582px]:!min-w-0 max-[582px]:table-fixed${
          hasDetails ? " vt-expandable" : ""
        }`}
        style={{ minWidth: minTableWidth }}
      >
        <thead>
          <tr className="border-b border-border bg-muted text-xs uppercase tracking-wide text-muted-foreground max-[582px]:normal-case max-[582px]:tracking-normal">
            <th
              scope="col"
              style={numberColumnStyle}
              className="w-12 px-3 py-2.5 text-right font-semibold tabular-nums max-[582px]:w-(--number-col) max-[582px]:px-1"
            >
              {labels.number}
            </th>
            <th
              scope="col"
              className={`${STICKY_WORD_CELL} w-40 bg-muted px-3 py-2.5 font-semibold max-[582px]:w-auto max-[582px]:px-2 max-[582px]:break-words max-[582px]:hyphens-auto`}
            >
              {labels.word}
            </th>
            {primaryColumns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`${HEADER_WIDTH_CLASS[column.width ?? "medium"]} px-3 py-2.5 font-semibold max-[582px]:w-auto max-[582px]:px-2 max-[582px]:break-words max-[582px]:hyphens-auto`}
              >
                {column.header}
              </th>
            ))}
            {detailColumns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={`${HEADER_WIDTH_CLASS[column.width ?? "auto"]} px-3 py-2.5 font-semibold ${DESKTOP_ONLY}`}
              >
                {column.header}
              </th>
            ))}
            {hasDetails ? (
              <th
                scope="col"
                style={detailsColumnStyle}
                className={`px-2 py-2.5 max-[582px]:w-(--details-col) max-[479px]:w-11 ${MOBILE_ONLY}`}
              >
                <span className="sr-only">{labels.details}</span>
              </th>
            ) : null}
            {/* Right-most in both layouts. */}
            {hasActions ? (
              <th scope="col" className="w-10 px-1 py-2.5 max-[582px]:w-8 max-[582px]:px-0">
                <span className="sr-only">{labels.actions}</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => {
            const key = getRowKey(row);
            const word = getWord(row);
            const isExpanded = hasDetails && expandedKeys.has(key);
            const detailsId = `${idPrefix}-details-${key}`;
            return (
              <Fragment key={key}>
                {/* Below 582px a tap anywhere on the row toggles its details
                    (a bigger target than the chevron), except on the row's
                    own buttons — audio, Details, ⋮ — which keep their action.
                    The Details button stays the accessible/keyboard control;
                    this is a pointer convenience only, so no role is added.
                    The DOM-containment check matters: React bubbles clicks
                    from portals (the ⋮ menu's items) up to this row too. */}
                <tr
                  onClick={
                    hasDetails
                      ? (event) => {
                          const target = event.target as HTMLElement;
                          if (
                            window.matchMedia(COMPACT_TABLE_QUERY).matches &&
                            event.currentTarget.contains(target) &&
                            !target.closest("button, a")
                          ) {
                            toggleDetails(key);
                          }
                        }
                      : undefined
                  }
                  className={isExpanded ? "vt-row is-open" : "vt-row"}
                >
                  <td className="vt-num">{index + 1}</td>
                  <th scope="row" className="vt-word">
                    <span className="vt-word-inner">
                      {canSpeak ? (
                        <button
                          type="button"
                          aria-label={fillWord(labels.pronounce, word)}
                          onClick={() => speakWord(word, wordLang)}
                          className="vt-speak"
                        >
                          <Volume2 aria-hidden="true" />
                        </button>
                      ) : null}
                      <span lang={wordLang} className="vt-word-text">
                        {word}
                      </span>
                    </span>
                  </th>
                  {primaryColumns.map((column) => (
                    <td key={column.key} className={`vt-p${CELL_TONE_CLASS[column.tone ?? "strong"]}`}>
                      {column.render(row)}
                    </td>
                  ))}
                  {detailColumns.map((column) => (
                    <td key={column.key} className={`vt-d${CELL_TONE_CLASS[column.tone ?? "default"]}`}>
                      {column.render(row)}
                    </td>
                  ))}
                  {hasDetails ? (
                    <td className="vt-toggle-cell">
                      {isHydrated ? (
                        <button
                          type="button"
                          aria-expanded={isExpanded}
                          aria-controls={detailsId}
                          onClick={() => toggleDetails(key)}
                          className="vt-toggle"
                        >
                          <span className="vt-toggle-label">{isExpanded ? labels.hide : labels.details}</span>
                          <span aria-hidden="true" className="vt-chevron" />
                        </button>
                      ) : null}
                    </td>
                  ) : null}
                  {/* Row actions menu ("⋮" as a text glyph). Non-modal so
                      opening it never locks scroll or shifts the page. */}
                  {hasActions ? (
                    <td className="vt-actions">
                      {isHydrated ? (
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <button type="button" aria-label={fillWord(labels.rowActions, word)} className="vt-more">
                              <span aria-hidden="true">⋮</span>
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-0 rounded-xl border-foreground/10 p-1 shadow-lg">
                            {rowActions.map((action) => (
                              <DropdownMenuItem
                                key={action.key}
                                className={ROW_MENU_ITEM_CLASS}
                                onSelect={() => action.onSelect(row)}
                              >
                                {action.icon}
                                {action.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </td>
                  ) : null}
                </tr>
                {/* Rendered only while open (the toggle exists only below
                    582px); one cell spans the compact columns so the details
                    use the full row width. */}
                {isExpanded ? (
                  <tr className={`bg-muted/40 ${MOBILE_ONLY}`}>
                    <td id={detailsId} colSpan={compactColumnCount} className="px-3 pb-2.5 pt-0">
                      {/* Grouping comes from type and hairline dividers, not
                          padding: tight label->text gaps and snug line height
                          keep the panel compact. */}
                      <dl className="border-l-2 border-primary/40 pl-3 text-sm leading-snug">
                        {detailPanelColumns.map((column, columnIndex) => {
                          const value = (column.renderDetail ?? column.render)(row);
                          if (column.detailStyle === "badge") {
                            return (
                              <div key={column.key} className="mb-1.5">
                                <dt className="sr-only">{column.header}</dt>
                                <dd>{value}</dd>
                              </div>
                            );
                          }
                          const isFirstLabeled =
                            columnIndex === 0 || detailPanelColumns[columnIndex - 1].detailStyle === "badge";
                          return (
                            <div
                              key={column.key}
                              className={isFirstLabeled ? undefined : "mt-1.5 border-t border-foreground/10 pt-1.5"}
                            >
                              <dt className="text-[11px] font-bold uppercase tracking-wide text-primary">
                                {column.header}
                              </dt>
                              <dd className={column.tone === "sentence" ? "italic text-foreground/85" : "text-foreground"}>
                                {value}
                              </dd>
                            </div>
                          );
                        })}
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

// Small presentational pieces columns commonly render.

export function VocabularyTableBadge({ children, compact = false }: { children: ReactNode; compact?: boolean }) {
  return <span className={compact ? "vt-badge vt-badge--compact" : "vt-badge"}>{children}</span>;
}

// A missing value (e.g. no translation): an em dash in the muted color.
export function VocabularyTableMissing() {
  return <span className="vt-missing">—</span>;
}

// Emphasised fragment inside a sentence (e.g. the table word).
export function VocabularyTableHighlight({ children }: { children: ReactNode }) {
  return <strong className="vt-hl">{children}</strong>;
}
