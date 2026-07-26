import { Volume2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { PastVerbFormsTableConfig } from "../../../../data/seo/verbLists/pastForms100Verbs/pastForms100VerbTableConfig";
import type {
  PastVerbFormsFormColumn,
  PastVerbFormsTableColumns,
} from "../../../../data/seo/verbLists/pastForms100Verbs/pastForms100VerbRouteHelpers";
import type { PastVerbFormsRowForms } from "../../../../data/seo/verbLists/pastForms100Verbs/pastForms100VerbFormsData";

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
  notes,
  placeholderMessage,
}: PastVerbFormsTableSectionProps) {
  const canRenderTable = tableConfig.isTableReady && pastForms.length > 0 && rows.length > 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
      {heading ? <h2 className="text-2xl text-foreground">{heading}</h2> : null}
      {description ? <p className="mt-2 text-sm text-muted-foreground">{description}</p> : null}

      {canRenderTable ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left table-fixed">
            <thead>
              <tr>
                <th className="w-16 border-b border-border py-3 pr-4 text-sm text-foreground">
                  {tableColumns.number}
                </th>
                <th className="w-40 border-b border-border py-3 pr-4 text-sm text-foreground">
                  {tableColumns.infinitive}
                </th>
                {pastForms.map((form) => (
                  <th key={form.key} className="border-b border-border py-3 pr-4 text-sm text-foreground">
                    {form.label}
                  </th>
                ))}
                <th className="w-36 border-b border-border py-3 text-sm text-foreground">
                  {tableColumns.translation}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="border-b border-border/70 py-3 pr-4 align-top text-sm text-muted-foreground">
                    {row.index}
                  </td>
                  <td className="border-b border-border/70 py-3 pr-4 align-middle text-sm font-medium text-foreground">
                    <div className="inline-flex items-center gap-1.5">
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
                      className="border-b border-border/70 py-3 pr-4 align-top text-sm text-muted-foreground"
                    >
                      {row.forms[form.key] || "—"}
                    </td>
                  ))}
                  <td className="border-b border-border/70 py-3 align-top text-sm text-muted-foreground">
                    {row.translation || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
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
