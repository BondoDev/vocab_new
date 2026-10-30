import { Fragment, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import type {
  NounListContentEntry,
  NounListGuideSection,
} from "../../../../../data/seo/listPages/nounLists";

// Educational sections rendered after the word table. All text comes from
// the page's content record. Every section spans the page container like the
// table above it and shares one card language (hairline border, 0.75rem
// radius, card surface, primary used only for small accents).

// Section heading: strong enough to find each section when scanning below
// the table.
const GUIDE_H2_CLASS =
  "text-xl font-semibold leading-snug tracking-tight text-foreground md:text-[1.375rem]";

// Examples on cross-language pages are "sentence – translation" or
// "sentence (translation)." Split there so the translation can sit on its own
// muted line; every character is still rendered, including the separator.
// Same-language examples have no translation and don't match. The sentence
// part is in the list's language, so it carries that `lang` (the page's own
// lang is the UI language) for screen-reader pronunciation and language
// detection; the translation inherits the page language.
const EXAMPLE_TRANSLATION_PATTERN = /^(.*?[.!?…])(\s+)([–—-]\s.*|\(.*\)\.?)$/s;

function ExampleSentence({
  example,
  exampleLang,
}: {
  example: string;
  exampleLang: string;
}) {
  const match = EXAMPLE_TRANSLATION_PATTERN.exec(example);
  if (!match) {
    return <span className="text-foreground">{renderEmphasis(example)}</span>;
  }
  const [, sentence, space, translation] = match;
  return (
    <>
      <span lang={exampleLang} className="text-foreground">
        {renderEmphasis(sentence)}
      </span>
      {space}
      <span className="mt-0.5 block text-sm font-normal text-muted-foreground">
        {renderEmphasis(translation)}
      </span>
    </>
  );
}

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

// Explanation on the left, examples panel on the right (stacked below lg).
// The H2 spans both columns so the panel lines up with the paragraph.
function ExplainerSection({
  section,
  exampleLang,
}: {
  section: NounListGuideSection;
  exampleLang: string;
}) {
  const headingId = `noun-list-${section.id}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start lg:gap-x-10 lg:gap-y-4"
    >
      <h2 id={headingId} className={`${GUIDE_H2_CLASS} lg:col-span-2`}>
        {section.heading}
      </h2>
      <div className="max-w-[42rem] space-y-3">
        {section.paragraphs?.map((paragraph) => (
          <p
            key={paragraph}
            className="text-[0.9375rem] leading-relaxed text-muted-foreground md:text-base md:leading-[1.75]"
          >
            {paragraph}
          </p>
        ))}
      </div>
      {section.examples?.length ? (
        <ul className="divide-y divide-primary/10 overflow-hidden rounded-xl border border-primary/15 border-l-[3px] border-l-primary/60 bg-primary/[0.04]">
          {section.examples.map((example) => (
            <li
              key={example}
              className="break-words px-4 py-3 text-[0.9375rem] font-medium leading-snug md:px-5 md:py-3.5"
            >
              <ExampleSentence example={example} exampleLang={exampleLang} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

// Grammar topics as equal cards: three columns from lg (every record has
// three topics; with any other count the grid falls back to two columns so
// no row is left with a lone card). Between sm and lg each card is a single
// full-width row with the heading beside its text, which keeps long
// translations readable without squeezing them into narrow columns.
function DefinitionsSection({ section }: { section: NounListGuideSection }) {
  const headingId = `noun-list-${section.id}-heading`;
  const items = section.items ?? [];
  const columnsClass =
    items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={GUIDE_H2_CLASS}>
        {section.heading}
      </h2>
      <div className={`mt-4 grid gap-3 md:gap-4 ${columnsClass}`}>
        {items.map((item) => (
          <div
            key={item.heading}
            className="rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] sm:grid sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] sm:gap-6 md:p-5 lg:block"
          >
            <div>
              <span
                aria-hidden="true"
                className="mb-2.5 block h-1 w-7 rounded-full bg-primary/70"
              />
              <h3 className="break-words text-base font-semibold leading-snug text-foreground">
                {item.heading}
              </h3>
            </div>
            <p className="mt-2 break-words text-sm leading-relaxed text-muted-foreground sm:mt-0 lg:mt-2">
              {item.text}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// Learning tips as numbered cards, two per row from md (every record has
// four). Each tip's heading is an h3 on its own line above its text; the
// number is decorative since the <ol> already conveys the order.
function StepsSection({ section }: { section: NounListGuideSection }) {
  const headingId = `noun-list-${section.id}-heading`;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={GUIDE_H2_CLASS}>
        {section.heading}
      </h2>
      <ol className="mt-4 grid gap-3 md:grid-cols-2 md:gap-4">
        {section.items?.map((item, index) => (
          <li
            key={item.heading}
            className="flex gap-3.5 rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_0_rgb(0_0_0/0.05)] md:gap-4 md:p-5"
          >
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary ring-1 ring-inset ring-primary/15"
            >
              {index + 1}
            </span>
            <div className="min-w-0">
              <h3 className="break-words pt-1 text-base font-semibold leading-snug text-foreground">
                {item.heading}
              </h3>
              <p className="mt-1.5 break-words text-sm leading-relaxed text-muted-foreground">
                {item.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function GuideSection({
  section,
  exampleLang,
}: {
  section: NounListGuideSection;
  exampleLang: string;
}) {
  if (section.items && section.layout === "definitions") {
    return <DefinitionsSection section={section} />;
  }
  if (section.items && section.layout === "steps") {
    return <StepsSection section={section} />;
  }
  return <ExplainerSection section={section} exampleLang={exampleLang} />;
}

export function NounListGuideSections({
  sections,
  exampleLang,
}: {
  sections: NounListContentEntry["guideSections"];
  // BCP 47 tag of the list's language (NounList.speechLang).
  exampleLang: string;
}) {
  return (
    <>
      {sections.map((section) => (
        <GuideSection
          key={section.id}
          section={section}
          exampleLang={exampleLang}
        />
      ))}
    </>
  );
}

// Closing call to action: copy on the left, actions on the right from lg
// (stacked below). The primary button is the one strong fill on the panel;
// the vocabulary list link stays a text link, underlined so it reads as
// clickable without competing with the button.
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
      className="grid gap-5 rounded-xl border border-primary/20 border-l-[3px] border-l-primary/60 bg-primary/[0.05] p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-10 lg:px-8"
    >
      <div className="min-w-0">
        <h2 id="noun-list-practice-heading" className={GUIDE_H2_CLASS}>
          {practice.heading}
        </h2>
        <p className="mt-2 max-w-[42rem] break-words text-[0.9375rem] leading-relaxed text-muted-foreground md:text-base">
          {practice.description}
        </p>
      </div>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 lg:flex-col lg:items-center lg:gap-y-3">
        <Link
          to={practicePath}
          onClick={onPreparePractice}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-center text-sm font-semibold text-primary-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.08)] transition hover:bg-primary/90 active:bg-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {practice.buttonLabel}
          <ArrowRight aria-hidden="true" className="size-4 shrink-0" />
        </Link>
        {vocabularyListPath ? (
          <Link
            to={vocabularyListPath}
            className="self-center rounded-sm text-center text-sm font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:self-auto"
          >
            {practice.vocabularyListLabel}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
