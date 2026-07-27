import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  canLinkVerbListItem,
  getAllPastVerbFormsPaths,
  getPastVerbFormsContent,
  getPastVerbFormsPath,
  getPastVerbFormsTableConfig,
  getVerbListPath,
  getVerbListSpeechLang,
  getVerbListTranslation,
  getVerbListWordLemma,
  VERB_LIST_ITEMS,
} from "../../../../data/seo/verbLists";
import { getLevelTestSeoPath } from "../../../../data/seo/levelTests";
import { getSeoHubPath } from "../../../../data/seo/shared/hub";
import { type TargetLanguageSlug, type UiLanguageCode } from "../../../../data/seo/shared/slugs";
import { buildLocalizedVocabularyPath } from "../../../../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import { buildWordPath } from "../../../../data/seo/wordPages/wordSlugs";
import { getPastVerbFormsRowsById } from "../../../../data/seo/verbLists/pastForms100Verbs/pastForms100VerbFormsData";
import { buildPastVerbFormsSeoMetadata } from "../../../../seo/verbLists/pastForms100Verbs/pastVerbFormsMetadata";
import { PAST_VERB_FORMS_DEV_PLACEHOLDER_MESSAGE } from "../../../../seo/verbLists/pastForms100Verbs/pastVerbFormsLaunchStatus";
import { SEOHead, useSeoSiteOrigin } from "../../../../seo/SeoContext";
import type { PastVerbFormsTableColumns } from "../../../../data/seo/verbLists/pastForms100Verbs/pastForms100VerbRouteHelpers";
import { PastVerbFormsTableSection, type PastVerbFormsRow } from "./PastVerbFormsTableSection";

interface PastVerbFormsSeoPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}

const EMPTY_TABLE_COLUMNS: PastVerbFormsTableColumns = { number: "", infinitive: "", translation: "" };

// key -> route-builder map. Routes are owned in TypeScript here;
// content.related.items only supplies the label per key, per
// src/data/seo/README.md's "routes belong in TypeScript, labels belong in
// JSON" rule. Add a new key here (and reference it from JSON) to wire up an
// additional related-page link without touching render logic.
function buildRelatedLinkHref(
  key: string,
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): string | null {
  switch (key) {
    case "commonVerbs":
      return getVerbListPath(targetLanguage, uiLang);
    case "levelTest":
      return getLevelTestSeoPath(uiLang, targetLanguage);
    case "vocabularyLevels":
    case "vocabularyA1":
      return buildLocalizedVocabularyPath(uiLang, targetLanguage, "a1");
    case "vocabularyA2":
      return buildLocalizedVocabularyPath(uiLang, targetLanguage, "a2");
    case "vocabularyB1":
      return buildLocalizedVocabularyPath(uiLang, targetLanguage, "b1");
    case "seoHub":
      return getSeoHubPath(uiLang);
    default:
      return null;
  }
}

// The single reusable page component for the "Past Forms of the 100 Most
// Common {Target Language} Verbs" family — target language is resolved data
// (via props + the registry), never a reason to fork this component.
export function PastVerbFormsSeoPage({
  uiLang,
  targetLanguage,
  onStartPractice,
}: PastVerbFormsSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();

  const content = getPastVerbFormsContent(targetLanguage, uiLang);
  const tableConfig = getPastVerbFormsTableConfig(targetLanguage);
  const speechLang = getVerbListSpeechLang(targetLanguage);

  // Row data reuses the common100Verbs vocabulary lookup (translation,
  // target-language infinitive, word-page linking) instead of duplicating
  // any of it here — only the past-form values themselves are unique to
  // this family. Canonical order/id set comes from VERB_LIST_ITEMS (the
  // same shared 100-verb list common100Verbs uses), not from the row
  // dataset's own file order.
  const rows = useMemo<PastVerbFormsRow[]>(() => {
    const formsById = getPastVerbFormsRowsById(targetLanguage);
    if (!formsById) {
      return [];
    }

    const result: PastVerbFormsRow[] = [];
    for (const item of VERB_LIST_ITEMS) {
      const forms = formsById.get(item.id);
      if (!forms) {
        continue;
      }

      const infinitive = getVerbListWordLemma(targetLanguage, item.id) || item.verb;
      result.push({
        id: item.id,
        index: result.length + 1,
        infinitive,
        translation: getVerbListTranslation(item.id, uiLang),
        href: canLinkVerbListItem(targetLanguage, item.id)
          ? buildWordPath(uiLang, targetLanguage, infinitive, item.id)
          : null,
        forms,
      });
    }
    return result;
  }, [targetLanguage, uiLang]);

  const seoMetadata = buildPastVerbFormsSeoMetadata({
    uiLang,
    pathname: location.pathname,
    siteOrigin,
    targetLanguage,
    content,
    getAllPaths: getAllPastVerbFormsPaths,
    getPath: (lang) => getPastVerbFormsPath(targetLanguage, lang),
  });

  const title = content?.metadata.title || seoMetadata.title;
  const hasHeroContent = Boolean(
    content && (content.hero.heading || content.hero.subtitle || content.hero.introParagraphs.length > 0),
  );
  const hasOverviewContent = Boolean(
    content && (content.overview.heading || content.overview.paragraphs.length > 0),
  );
  const hasHowToUseContent = Boolean(content && (content.howToUse.heading || content.howToUse.steps.length > 0));
  const hasTipsContent = Boolean(content && (content.tips.heading || content.tips.items.length > 0));
  const hasCtaContent = Boolean(
    content && (content.cta.heading || content.cta.description || content.cta.primaryLabel),
  );
  const hasFaqContent = Boolean(content && content.faq.items.length > 0);

  const relatedLinks = useMemo(() => {
    if (!content) {
      return [];
    }

    return content.related.items
      .map((item) => {
        const href = buildRelatedLinkHref(item.key, uiLang, targetLanguage);
        return href && item.label ? { href, label: item.label } : null;
      })
      .filter((item): item is { href: string; label: string } => Boolean(item));
  }, [content, targetLanguage, uiLang]);

  const seoHubHref = getSeoHubPath(uiLang);

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      <SEOHead metadata={seoMetadata} />
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link className="hover:text-foreground hover:underline" to="/">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link className="hover:text-foreground hover:underline" to={seoHubHref}>
                Verb Lists
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-foreground">
              {title}
            </li>
          </ol>
        </nav>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h1 className="text-3xl text-foreground md:text-4xl">{title}</h1>
          {hasHeroContent ? (
            <>
              {content!.hero.subtitle ? (
                <p className="mt-3 text-base text-muted-foreground">{content!.hero.subtitle}</p>
              ) : null}
              {content!.hero.introParagraphs.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {content!.hero.introParagraphs.map((paragraph) => (
                    <p key={paragraph} className="text-base text-muted-foreground">
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
              {PAST_VERB_FORMS_DEV_PLACEHOLDER_MESSAGE}
            </p>
          )}
        </section>

        <PastVerbFormsTableSection
          tableConfig={tableConfig}
          tableColumns={content?.tableColumns ?? EMPTY_TABLE_COLUMNS}
          pastForms={content?.pastForms ?? []}
          rows={rows}
          speechLang={speechLang}
          heading={content?.table.heading ?? ""}
          description={content?.table.description ?? ""}
          scrollHint={content?.table.scrollHint ?? ""}
          scrollLeftLabel={content?.table.scrollLeftLabel ?? ""}
          scrollRightLabel={content?.table.scrollRightLabel ?? ""}
          notes={content?.table.notes ?? []}
          placeholderMessage={PAST_VERB_FORMS_DEV_PLACEHOLDER_MESSAGE}
        />

        {hasOverviewContent ? (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            {content!.overview.heading ? (
              <h2 className="text-2xl text-foreground">{content!.overview.heading}</h2>
            ) : null}
            {content!.overview.paragraphs.length > 0 ? (
              <div className="mt-4 space-y-3">
                {content!.overview.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-base text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {hasHowToUseContent ? (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            {content!.howToUse.heading ? (
              <h2 className="text-2xl text-foreground">{content!.howToUse.heading}</h2>
            ) : null}
            {content!.howToUse.steps.length > 0 ? (
              <ol className="mt-4 list-decimal space-y-3 pl-5 text-muted-foreground">
                {content!.howToUse.steps.map((step, index) => (
                  <li key={`${index}-${step.heading}`}>
                    {step.heading ? <p className="font-medium text-foreground">{step.heading}</p> : null}
                    {step.text ? <p>{step.text}</p> : null}
                  </li>
                ))}
              </ol>
            ) : null}
          </section>
        ) : null}

        {hasTipsContent ? (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            {content!.tips.heading ? <h2 className="text-2xl text-foreground">{content!.tips.heading}</h2> : null}
            {content!.tips.items.length > 0 ? (
              <ul className="mt-4 list-disc space-y-3 pl-5 text-muted-foreground">
                {content!.tips.items.map((tip, index) => (
                  <li key={`${index}-${tip.heading}`}>
                    {tip.heading ? <p className="font-medium text-foreground">{tip.heading}</p> : null}
                    {tip.text ? <p>{tip.text}</p> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {hasCtaContent ? (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            {content!.cta.heading ? <h2 className="text-2xl text-foreground">{content!.cta.heading}</h2> : null}
            {content!.cta.description ? (
              <p className="mt-2 text-sm text-muted-foreground">{content!.cta.description}</p>
            ) : null}
            <div className="mt-5 flex flex-wrap gap-3">
              {content!.cta.primaryLabel ? (
                <button
                  type="button"
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                  onClick={() => onStartPractice(targetLanguage, "A1")}
                >
                  {content!.cta.primaryLabel}
                </button>
              ) : null}
              {content!.cta.secondaryLabel ? (
                <Link
                  to={getLevelTestSeoPath(uiLang, targetLanguage) ?? seoHubHref}
                  className="rounded-xl border border-primary/35 bg-primary/5 px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10"
                >
                  {content!.cta.secondaryLabel}
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        {relatedLinks.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            {content!.related.heading ? (
              <h2 className="text-2xl text-foreground">{content!.related.heading}</h2>
            ) : null}
            <ul className="mt-4 list-disc space-y-2 pl-5">
              {relatedLinks.map((item) => (
                <li key={item.href}>
                  <Link className="text-primary transition hover:underline" to={item.href}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {hasFaqContent ? (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            {content!.faq.heading ? <h2 className="text-2xl text-foreground">{content!.faq.heading}</h2> : null}
            <div className="mt-4 space-y-5">
              {content!.faq.items.map((item) => (
                <div key={item.question}>
                  <h3 className="text-base font-semibold text-foreground">{item.question}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
