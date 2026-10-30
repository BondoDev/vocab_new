import { Fragment, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  NounListContentEntry,
  NounListGuideSection,
} from "../../../../../data/seo/listPages/nounLists";

// Educational sections rendered after the word table. All text comes from
// the page's content record. Typographic rather than card-based — hairline
// dividers and whitespace — so they read as a continuation of the list.

const SECTION_CLASS = "border-t border-border pt-7";
const H2_CLASS = "text-xl text-foreground";
const PARAGRAPH_CLASS = "mt-2 text-base text-muted-foreground";

// Content strings mark the emphasised word with **double asterisks**
// (e.g. "My **sister** lives here."); rendered as React nodes, never as HTML.
function renderEmphasis(text: string): ReactNode {
  return text.split("**").map((part, index) =>
    index % 2 === 1 ? (
      <strong key={index} className="font-semibold text-foreground">
        {part}
      </strong>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

function GuideSection({ section }: { section: NounListGuideSection }) {
  const headingId = `noun-list-${section.id}-heading`;
  return (
    <section aria-labelledby={headingId} className={SECTION_CLASS}>
      <h2 id={headingId} className={H2_CLASS}>
        {section.heading}
      </h2>
      {section.paragraphs?.map((paragraph) => (
        <p key={paragraph} className={PARAGRAPH_CLASS}>
          {paragraph}
        </p>
      ))}
      {section.examples ? (
        <ul className="mt-3 space-y-1.5 border-l-2 border-primary/30 pl-4 text-base text-foreground/85">
          {section.examples.map((example) => (
            <li key={example}>{renderEmphasis(example)}</li>
          ))}
        </ul>
      ) : null}
      {section.items && section.layout === "definitions" ? (
        <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {section.items.map((item) => (
            <div key={item.heading}>
              <h3 className="text-base font-semibold text-foreground">
                {item.heading}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      ) : null}
      {section.items && section.layout === "steps" ? (
        <ol className="mt-4 space-y-3">
          {section.items.map((item, index) => (
            <li key={item.heading} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {index + 1}
              </span>
              <p className="text-sm text-muted-foreground">
                <strong className="font-semibold text-foreground">
                  {item.heading}
                </strong>{" "}
                {item.text}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

export function NounListGuideSections({
  sections,
}: {
  sections: NounListContentEntry["guideSections"];
}) {
  return (
    <>
      {sections.map((section) => (
        <GuideSection key={section.id} section={section} />
      ))}
    </>
  );
}

export function NounListPractice({
  practice,
  practicePath,
  onPreparePractice,
  vocabularyListPath,
}: {
  practice: NounListContentEntry["practice"];
  // The custom-practice setup route (App owns ROUTES).
  practicePath: string;
  // Pre-selects this list's target language in the practice setup.
  onPreparePractice: () => void;
  // Full vocabulary list page for this target/UI language, when it exists.
  vocabularyListPath: string | null;
}) {
  return (
    <section
      aria-labelledby="noun-list-practice-heading"
      className="rounded-xl border border-primary/20 bg-primary/[0.04] p-5 md:p-6"
    >
      <h2 id="noun-list-practice-heading" className={H2_CLASS}>
        {practice.heading}
      </h2>
      <p className={PARAGRAPH_CLASS}>{practice.description}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        <Link
          to={practicePath}
          onClick={onPreparePractice}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2"
        >
          {practice.buttonLabel}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
        {vocabularyListPath ? (
          <Link
            to={vocabularyListPath}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {practice.vocabularyListLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
