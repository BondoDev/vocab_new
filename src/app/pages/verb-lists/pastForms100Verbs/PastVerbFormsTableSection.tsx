import { Volume2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { PastVerbFormsTableConfig } from "../../../../data/seo/verbLists/pastForms100Verbs/pastForms100VerbTableConfig";
import type {
  PastVerbFormsFormColumn,
  PastVerbFormsTableColumns,
} from "../../../../data/seo/verbLists/pastForms100Verbs/pastForms100VerbRouteHelpers";
import type { PastVerbFormsRowForms } from "../../../../data/seo/verbLists/pastForms100Verbs/pastForms100VerbFormsData";
import { useHorizontalTableScroll } from "../shared/useHorizontalTableScroll";
import { TableScrollControls } from "../shared/TableScrollControls";
import {
  NUMBER_COLUMN_WIDTH,
  STICKY_BODY_CELL,
  STICKY_EDGE_SHADOW,
  STICKY_HEADER_CELL,
} from "../shared/stickyTableColumns";

export interface PastVerbFormsRow {
  id: string;
  index: number;
  infinitive: string;
  translation: string;
  href: string | null;
  forms: PastVerbFormsRowForms;
}

interface PastVerbFormsTableSectionProps {
  tableConfig: PastVerbFormsTableConfig;
  tableColumns: PastVerbFormsTableColumns;
  pastForms: PastVerbFormsFormColumn[];
  rows: PastVerbFormsRow[];
  speechLang: string;
  heading: string;
  description: string;
  scrollHint: string;
  scrollLeftLabel: string;
  scrollRightLabel: string;
  notes: string[];
  placeholderMessage: string;
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

const HINT_ID = "past-verb-forms-scroll-hint";

// Rendering boundary for the past-verb-forms table, isolated so its body can
// be swapped without any other page code changing. Column identity/order/
// labels come from tableColumns/pastForms (localized JSON content, per
// targetLanguage x uiLanguage); tableConfig.isTableReady + a non-empty rows
// array are the separate, non-localized signal that a target language's
// actual verb-row dataset exists (see pastForms100VerbFormsData.ts /
// pastForms100VerbTableConfig.ts) — both must be true to render the real
// table instead of the placeholder.
export function PastVerbFormsTableSection({
  tableConfig,
  tableColumns,
  pastForms,
  rows,
  speechLang,
  heading,
  description,
  scrollHint,
  scrollLeftLabel,
  scrollRightLabel,
  notes,
  placeholderMessage,
}: PastVerbFormsTableSectionProps) {
  const canRenderTable = tableConfig.isTableReady && pastForms.length > 0 && rows.length > 0;
  const { scrollRef, scrollState, scrollByPage } = useHorizontalTableScroll([
    canRenderTable,
    pastForms.length,
    rows.length,
  ]);

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
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr>
                  <th
                    style={{ width: NUMBER_COLUMN_WIDTH, minWidth: NUMBER_COLUMN_WIDTH, left: 0 }}
                    className={`${STICKY_HEADER_CELL} border-b border-border py-3 pl-1 pr-1 text-sm text-foreground`}
                  >
                    {tableColumns.number}
                  </th>
                  <th
                    style={{ left: NUMBER_COLUMN_WIDTH }}
                    className={`${STICKY_HEADER_CELL} ${scrollState.canScroll ? STICKY_EDGE_SHADOW : ""} min-w-[5.5rem] max-w-[7.5rem] border-b border-border py-3 pl-2 pr-3 text-sm text-foreground sm:min-w-[9rem] sm:max-w-none`}
                  >
                    {tableColumns.infinitive}
                  </th>
                  {pastForms.map((form) => (
                    <th
                      key={form.key}
                      className="min-w-[7rem] border-b border-border py-3 pr-4 text-sm text-foreground"
                    >
                      {form.label}
                    </th>
                  ))}
                  <th className="min-w-[9rem] border-b border-border py-3 pr-4 text-sm text-foreground">
                    {tableColumns.translation}
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
                          aria-label={row.infinitive}
                          onClick={() => speakVerb(row.infinitive, speechLang)}
                          className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-primary/80 transition hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                        {row.href ? (
                          <Link className="text-primary transition hover:underline" to={row.href}>
                            {row.infinitive}
                          </Link>
                        ) : (
                          row.infinitive
                        )}
                      </div>
                    </td>
                    {pastForms.map((form) => (
                      <td
                        key={form.key}
                        className="min-w-[7rem] whitespace-nowrap border-b border-border/70 py-3 pr-4 align-top text-sm text-muted-foreground"
                      >
                        {row.forms[form.key] || "—"}
                      </td>
                    ))}
                    <td className="min-w-[9rem] border-b border-border/70 py-3 pr-4 align-top text-sm text-muted-foreground">
                      {row.translation || "—"}
                    </td>
                  </tr>
                ))}
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
