import { ArrowRight, ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import {
  formatContentTemplate,
  type FullVocabularyListContentEntry,
} from "../../../../data/seo/listPages/fullVocabularyList";

// Educational sections rendered after the vocabulary directory. All text
// comes from the page's content record; each section renders only when that
// record authors it (see the optional sections in fullVocabularyListRegistry.ts).
// Kept typographic — dividers and whitespace rather than cards — so they read
// as a continuation of the directory, not a separate article.

const SECTION_CLASS = "border-t border-border pt-8";
const H2_CLASS = "text-xl text-foreground md:text-2xl";
const PARAGRAPH_CLASS = "mt-2 max-w-3xl text-base text-muted-foreground";

export function FullVocabularyCefrGuide({
  section,
  levels,
}: {
  section: NonNullable<FullVocabularyListContentEntry["cefrSection"]>;
  levels: FullVocabularyListContentEntry["levels"];
}) {
  return (
    <section aria-labelledby="full-vocabulary-cefr-heading" className={SECTION_CLASS}>
      <h2 id="full-vocabulary-cefr-heading" className={H2_CLASS}>
        {section.heading}
      </h2>
      <p className={PARAGRAPH_CLASS}>{section.paragraph}</p>
      {/* Compact level reference: two/three columns of label + one line,
          set off by a thin accent rule instead of six cards. */}
      <dl className="mt-5 grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {levels.map((level) => (
          <div key={level.level} className="border-l-2 border-primary/30 pl-3">
            <dt className="text-sm font-semibold text-foreground">
              {formatContentTemplate(section.levelLabelTemplate, {
                level: level.level.toUpperCase(),
                name: level.name,
              })}
            </dt>
            <dd className="mt-0.5 text-sm text-muted-foreground">{section.levelSummaries[level.level]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function FullVocabularyLearningGuide({
  section,
}: {
  section: NonNullable<FullVocabularyListContentEntry["learningSection"]>;
}) {
  return (
    <section aria-labelledby="full-vocabulary-learning-heading" className={SECTION_CLASS}>
      <h2 id="full-vocabulary-learning-heading" className={H2_CLASS}>
        {section.heading}
      </h2>
      <p className={PARAGRAPH_CLASS}>{section.intro}</p>
      <div className="mt-5 grid gap-x-8 gap-y-4 md:grid-cols-3">
        {section.tips.map((tip) => (
          <div key={tip.heading}>
            <h3 className="text-base font-semibold text-foreground">{tip.heading}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{tip.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const OPTION_BUTTON_CLASS =
  "mt-4 inline-flex h-10 items-center justify-center gap-1.5 self-start rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

// Two equal entry points into the app. Personalized Learning uses the
// indigo primary; Free Practice the same restrained amber as the homepage's
// learning cards. Each option is a flex column whose description grows, so
// headings, text, and buttons line up side by side however long the
// localized copy runs. The actions have generic visible text ("Get
// Started"), so each is described by its own option's heading and
// description for assistive tech.
export function FullVocabularyLearningOptions({
  section,
  isSignedIn,
  profilePath,
  practicePath,
  onRequestSignup,
  onPreparePractice,
}: {
  section: NonNullable<FullVocabularyListContentEntry["learningOptions"]>;
  isSignedIn: boolean;
  profilePath: string;
  practicePath: string;
  // Opens the header's existing sign-up dialog (App owns it).
  onRequestSignup: () => void;
  // Pre-selects this page's target language in the practice setup.
  onPreparePractice: () => void;
}) {
  const { personalized, freePractice } = section;
  const personalizedDescribedBy = "full-vocabulary-option-personalized full-vocabulary-option-personalized-text";
  const primaryAction = `${OPTION_BUTTON_CLASS} bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary/40`;
  return (
    <section aria-labelledby="full-vocabulary-options-heading" className={SECTION_CLASS}>
      <h2 id="full-vocabulary-options-heading" className={H2_CLASS}>
        {section.heading}
      </h2>
      <p className={PARAGRAPH_CLASS}>{section.description}</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col rounded-xl border border-primary/25 bg-primary/[0.04] p-5">
          <h3 id="full-vocabulary-option-personalized" className="text-base font-semibold text-foreground">
            {personalized.heading}
          </h3>
          <p id="full-vocabulary-option-personalized-text" className="mt-1 flex-1 text-sm text-muted-foreground">
            {personalized.description}
          </p>
          {/* Signed in: navigation to the learning dashboard (a link).
              Signed out: opens the existing sign-up dialog (a button). The
              session is null on the server and the first client render, so
              this only switches after hydration. */}
          {isSignedIn ? (
            <Link to={profilePath} aria-describedby={personalizedDescribedBy} className={primaryAction}>
              {personalized.buttonLabel}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : (
            <button
              type="button"
              onClick={onRequestSignup}
              aria-describedby={personalizedDescribedBy}
              className={primaryAction}
            >
              {personalized.buttonLabel}
              <ArrowRight aria-hidden="true" className="size-4" />
            </button>
          )}
        </div>
        <div className="flex flex-col rounded-xl border border-amber-600/25 bg-amber-500/[0.05] p-5">
          <h3 id="full-vocabulary-option-free" className="text-base font-semibold text-foreground">
            {freePractice.heading}
          </h3>
          <p id="full-vocabulary-option-free-text" className="mt-1 flex-1 text-sm text-muted-foreground">
            {freePractice.description}
          </p>
          <Link
            to={practicePath}
            onClick={onPreparePractice}
            aria-describedby="full-vocabulary-option-free full-vocabulary-option-free-text"
            className={`${OPTION_BUTTON_CLASS} bg-amber-700 text-white hover:bg-amber-800 focus-visible:ring-amber-600/40`}
          >
            {freePractice.buttonLabel}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// Native <details>/<summary>: keyboard-operable and announced as
// expandable without extra ARIA, and every answer stays in the
// server-rendered HTML while collapsed. A heading inside <summary> keeps the
// questions in the document outline. Intentionally no FAQPage JSON-LD.
export function FullVocabularyFaq({
  faq,
}: {
  faq: NonNullable<FullVocabularyListContentEntry["faq"]>;
}) {
  return (
    <section aria-labelledby="full-vocabulary-faq-heading" className={SECTION_CLASS}>
      <h2 id="full-vocabulary-faq-heading" className={H2_CLASS}>
        {faq.heading}
      </h2>
      <div className="mt-4 max-w-3xl divide-y divide-border border-y border-border">
        {faq.items.map((item) => (
          <details key={item.question} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md py-3.5 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
              <h3 className="text-base font-medium text-foreground group-hover:text-primary">{item.question}</h3>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
              />
            </summary>
            <p className="pb-4 pr-8 text-sm text-muted-foreground">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
