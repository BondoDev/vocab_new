import type { PastVerbFormsTableConfig } from "../../../../data/seo/verbLists/pastForms100Verbs/pastForms100VerbTableConfig";
import type {
  PastVerbFormsFormColumn,
  PastVerbFormsTableColumns,
} from "../../../../data/seo/verbLists/pastForms100Verbs/pastForms100VerbRouteHelpers";

interface PastVerbFormsTableSectionProps {
  tableConfig: PastVerbFormsTableConfig;
  tableColumns: PastVerbFormsTableColumns;
  pastForms: PastVerbFormsFormColumn[];
  heading: string;
  description: string;
  notes: string[];
  placeholderMessage: string;
}

// Rendering boundary for the future past-verb-forms table, isolated so a
// later phase can swap the placeholder body below for a real table without
// any other page code changing. Column identity/order/labels come from
// tableColumns/pastForms (localized JSON content, per targetLanguage x
// uiLanguage); tableConfig.isTableReady is the separate, non-localized
// signal for whether that target language's actual verb-row dataset exists
// yet (see pastForms100VerbTableConfig.ts). Phase 1 ships isTableReady=false
// for every target language, so the placeholder branch always renders for
// now — the header-row wiring below only activates once both a future phase
// flips isTableReady and a record's pastForms is non-empty.
export function PastVerbFormsTableSection({
  tableConfig,
  tableColumns,
  pastForms,
  heading,
  description,
  notes,
  placeholderMessage,
}: PastVerbFormsTableSectionProps) {
  const canRenderTable = tableConfig.isTableReady && pastForms.length > 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
      {heading ? <h2 className="text-2xl text-foreground">{heading}</h2> : null}
      {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}

      {canRenderTable ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left table-fixed">
            <thead>
              <tr>
                <th className="border-b border-border py-3 pr-4 text-sm text-foreground">
                  {tableColumns.number}
                </th>
                <th className="border-b border-border py-3 pr-4 text-sm text-foreground">
                  {tableColumns.infinitive}
                </th>
                {pastForms.map((form) => (
                  <th key={form.key} className="border-b border-border py-3 pr-4 text-sm text-foreground">
                    {form.label}
                  </th>
                ))}
                <th className="border-b border-border py-3 text-sm text-foreground">
                  {tableColumns.translation}
                </th>
              </tr>
            </thead>
            {/* <tbody> intentionally omitted — no verb-row dataset exists
                yet. Future rows should reuse these same pastForms keys
                (e.g. row.forms[form.key]) rather than column position. */}
          </table>
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
