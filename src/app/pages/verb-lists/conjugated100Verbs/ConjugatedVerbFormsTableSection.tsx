import { Volume2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { ConjugatedVerbFormsTableConfig } from "../../../../data/seo/verbLists/conjugated100Verbs/conjugated100VerbTableConfig";
import type {
  ConjugatedVerbFormsPronounColumn,
  ConjugatedVerbFormsTableColumns,
} from "../../../../data/seo/verbLists/conjugated100Verbs/conjugated100VerbRouteHelpers";
import type { ConjugatedVerbFormsRowForms } from "../../../../data/seo/verbLists/conjugated100Verbs/conjugated100VerbFormsData";
import { TableScrollControls } from "../shared/TableScrollControls";
import { TableSearchRow } from "../shared/TableSearchRow";
import {
  STICKY_BODY_CELL,
  STICKY_EDGE_SHADOW,
  STICKY_HEADER_CELL,
} from "../shared/stickyTableColumns";
import { useHorizontalTableScroll } from "../shared/useHorizontalTableScroll";

export interface ConjugatedVerbFormsRow {
  id: string;
  index: number;
  infinitive: string;
  meaning: string;
  href: string | null;
  forms: ConjugatedVerbFormsRowForms;
}

interface ConjugatedVerbFormsTableSectionProps {
  tableConfig: ConjugatedVerbFormsTableConfig;
  tableColumns: ConjugatedVerbFormsTableColumns;
  pronounForms: ConjugatedVerbFormsPronounColumn[];
  showMeaningColumn: boolean;
  hasRows: boolean;
  rows: ConjugatedVerbFormsRow[];
  speechLang: string;
  heading: string;
  description: string;
  scrollHint: string;
  scrollLeftLabel: string;
  scrollRightLabel: string;
  notes: string[];
  placeholderMessage: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  noResultsMessage: string;
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

const HINT_ID = "conjugated-verb-forms-scroll-hint";
const NUMBER_COLUMN_WIDTH = "1.5rem";
const INFINITIVE_COLUMN_WIDTH_REM = 9.5;
const MEANING_COLUMN_WIDTH_REM = 8;
const PRONOUN_COLUMN_WIDTH_REM = 7;

export function ConjugatedVerbFormsTableSection({
  tableConfig,
  tableColumns,
  pronounForms,
  showMeaningColumn,
  hasRows,
  rows,
  speechLang,
  heading,
  description,
  scrollHint,
  scrollLeftLabel,
  scrollRightLabel,
  notes,
  placeholderMessage,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  noResultsMessage,
}: ConjugatedVerbFormsTableSectionProps) {
  const canRenderTable = tableConfig.isTableReady && pronounForms.length > 0 && hasRows;
  const { scrollRef, scrollState, scrollByPage } = useHorizontalTableScroll([
    canRenderTable,
    pronounForms.length,
    rows.length,
  ]);
  const columnCount = pronounForms.length + 2 + (showMeaningColumn ? 1 : 0);
  const tableMinWidthRem =
    1.5 + INFINITIVE_COLUMN_WIDTH_REM + (showMeaningColumn ? MEANING_COLUMN_WIDTH_REM : 0) +
    pronounForms.length * PRONOUN_COLUMN_WIDTH_REM;

  return (
    <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
      {heading ? <h2 className="text-2xl text-foreground">{heading}</h2> : null}
      {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}

      {canRenderTable ? (
        <div className="mt-4">
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
            aria-label={heading || undefined}
            aria-describedby={scrollState.canScroll && scrollHint ? HINT_ID : undefined}
            className="overflow-x-auto rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <table
              className="w-full table-fixed border-collapse text-left text-sm"
              style={{ minWidth: `${tableMinWidthRem}rem` }}
            >
              <colgroup>
                <col style={{ width: NUMBER_COLUMN_WIDTH }} />
                <col style={{ width: `${INFINITIVE_COLUMN_WIDTH_REM}rem` }} />
                {showMeaningColumn ? <col style={{ width: `${MEANING_COLUMN_WIDTH_REM}rem` }} /> : null}
                {pronounForms.map((form) => (
                  <col key={form.key} style={{ width: `${PRONOUN_COLUMN_WIDTH_REM}rem` }} />
                ))}
              </colgroup>
              <thead>
                <TableSearchRow
                  colSpan={columnCount}
                  searchValue={searchValue}
                  onSearchChange={onSearchChange}
                  placeholder={searchPlaceholder}
                  containerWidth={scrollState.containerWidth}
                />
                <tr>
                  <th
                    style={{ width: NUMBER_COLUMN_WIDTH, minWidth: NUMBER_COLUMN_WIDTH, left: 0 }}
                    className={`${STICKY_HEADER_CELL} border-b border-border py-3 pl-0 pr-1 text-sm text-foreground`}
                  >
                    {tableColumns.number}
                  </th>
                  <th
                    style={{ left: NUMBER_COLUMN_WIDTH, width: `${INFINITIVE_COLUMN_WIDTH_REM}rem` }}
                    className={`${STICKY_HEADER_CELL} ${scrollState.canScroll ? STICKY_EDGE_SHADOW : ""} border-b border-border py-3 pl-2 pr-3 text-sm text-foreground`}
                  >
                    {tableColumns.infinitive}
                  </th>
                  {showMeaningColumn ? (
                    <th
                      style={{ width: `${MEANING_COLUMN_WIDTH_REM}rem` }}
                      className="border-b border-border py-3 pr-4 text-sm text-foreground"
                    >
                      {tableColumns.meaning}
                    </th>
                  ) : null}
                  {pronounForms.map((form) => (
                    <th
                      key={form.key}
                      style={{ width: `${PRONOUN_COLUMN_WIDTH_REM}rem` }}
                      className="border-b border-border py-3 pr-4 text-sm text-foreground"
                    >
                      {form.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={columnCount} className="py-6 text-center text-sm text-muted-foreground">
                      {noResultsMessage}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td
                        style={{ width: NUMBER_COLUMN_WIDTH, minWidth: NUMBER_COLUMN_WIDTH, left: 0 }}
                        className={`${STICKY_BODY_CELL} border-b border-border/70 py-3 pl-0 pr-1 align-top text-sm text-muted-foreground`}
                      >
                        {row.index}
                      </td>
                      <td
                        style={{
                          left: NUMBER_COLUMN_WIDTH,
                          width: `${INFINITIVE_COLUMN_WIDTH_REM}rem`,
                          maxWidth: `${INFINITIVE_COLUMN_WIDTH_REM}rem`,
                        }}
                        className={`${STICKY_BODY_CELL} ${scrollState.canScroll ? STICKY_EDGE_SHADOW : ""} whitespace-normal break-words border-b border-border/70 py-3 pl-2 pr-3 align-top text-sm font-medium leading-6 text-foreground`}
                      >
                        <div className="flex min-w-0 items-start gap-1.5">
                          <button
                            type="button"
                            aria-label={row.infinitive}
                            onClick={() => speakVerb(row.infinitive, speechLang)}
                            className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-primary/80 transition hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                          </button>
                          {row.href ? (
                            <Link className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere] text-primary transition hover:underline" to={row.href}>
                              {row.infinitive}
                            </Link>
                          ) : (
                            <span className="min-w-0 whitespace-normal break-words [overflow-wrap:anywhere]">{row.infinitive}</span>
                          )}
                        </div>
                      </td>
                      {showMeaningColumn ? (
                        <td className="border-b border-border/70 py-3 pr-4 align-top text-sm text-muted-foreground">
                          {row.meaning || "-"}
                        </td>
                      ) : null}
                      {pronounForms.map((form) => (
                        <td
                          key={form.key}
                          className="whitespace-normal break-words border-b border-border/70 py-3 pr-4 align-top text-sm leading-6 text-muted-foreground"
                        >
                          {row.forms[form.key] || "-"}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-border/70 bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          {placeholderMessage}
        </div>
      )}

      {notes.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
