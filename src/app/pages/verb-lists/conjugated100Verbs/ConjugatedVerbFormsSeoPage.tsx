import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  canLinkVerbListItem,
  getAllConjugatedVerbFormsPaths,
  getConjugatedVerbFormsContent,
  getConjugatedVerbFormsPath,
  getConjugatedVerbFormsTableConfig,
  getPastVerbFormsPath,
  getVerbListPath,
  getVerbListSpeechLang,
  getVerbListTranslation,
  getVerbListWordLemma,
  VERB_LIST_ITEMS,
} from "../../../../data/seo/verbLists";
import { getLevelTestSeoPath } from "../../../../data/seo/levelTests";
import { getSeoHubPath } from "../../../../data/seo/shared/hub";
import {
  TARGET_LANGUAGE_TO_UI_LANGUAGE,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../../../data/seo/shared/slugs";
import { buildLocalizedVocabularyPath } from "../../../../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import { buildWordPath } from "../../../../data/seo/wordPages/wordSlugs";
import type {
  ConjugatedVerbFormsTableColumns,
  ConjugatedVerbFormsTense,
} from "../../../../data/seo/verbLists/conjugated100Verbs/conjugated100VerbRouteHelpers";
import { getConjugatedVerbFormsRowsById } from "../../../../data/seo/verbLists/conjugated100Verbs/conjugated100VerbFormsData";
import { buildConjugatedVerbFormsSeoMetadata } from "../../../../seo/verbLists/conjugated100Verbs/conjugatedVerbFormsMetadata";
import { CONJUGATED_VERB_FORMS_DEV_PLACEHOLDER_MESSAGE } from "../../../../seo/verbLists/conjugated100Verbs/conjugatedVerbFormsLaunchStatus";
import { SEOHead, useSeoSiteOrigin } from "../../../../seo/SeoContext";
import { rowMatchesSearch } from "../shared/rowSearch";
import { getTableSearchCopy } from "../shared/tableSearchCopy";
import {
  ConjugatedVerbFormsTableSection,
  type ConjugatedVerbFormsRow,
} from "./ConjugatedVerbFormsTableSection";

interface ConjugatedVerbFormsSeoPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}

const EMPTY_TABLE_COLUMNS: ConjugatedVerbFormsTableColumns = {
  number: "",
  infinitive: "",
  meaning: "",
};

function buildRelatedLinkHref(
  key: string,
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): string | null {
  switch (key) {
    case "commonVerbs":
      return getVerbListPath(targetLanguage, uiLang);
    case "pastForms":
      return getPastVerbFormsPath(targetLanguage, uiLang);
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

function resolveInitialTense(tenses: ConjugatedVerbFormsTense[], defaultTense: string | undefined): string {
  if (defaultTense && tenses.some((tense) => tense.key === defaultTense)) {
    return defaultTense;
  }

  return tenses[0]?.key ?? "";
}

function resolveInitialGroup(tenses: ConjugatedVerbFormsTense[], activeTenseKey: string): string {
  return tenses.find((tense) => tense.key === activeTenseKey)?.group ?? tenses[0]?.group ?? "";
}

export function ConjugatedVerbFormsSeoPage({
  uiLang,
  targetLanguage,
  onStartPractice,
}: ConjugatedVerbFormsSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();

  const content = getConjugatedVerbFormsContent(targetLanguage, uiLang);
  const tenses = content?.tenses ?? [];
  const initialTense = resolveInitialTense(tenses, content?.tenseSelector.defaultTense);
  const initialGroup = resolveInitialGroup(tenses, initialTense);
  const [activeGroupKey, setActiveGroupKey] = useState(initialGroup);
  const [activeTenseKey, setActiveTenseKey] = useState(initialTense);
  const activeTense = tenses.find((tense) => tense.key === activeTenseKey) ?? tenses[0] ?? null;
  const activeGroupTenses = tenses.filter((tense) => tense.group === activeGroupKey);
  const tableConfig = getConjugatedVerbFormsTableConfig(targetLanguage);
  const speechLang = getVerbListSpeechLang(targetLanguage);

  const rows = useMemo<ConjugatedVerbFormsRow[]>(() => {
    if (!activeTense) {
      return [];
    }

    const formsById = getConjugatedVerbFormsRowsById(targetLanguage);
    if (!formsById) {
      return [];
    }

    const result: ConjugatedVerbFormsRow[] = [];
    for (const item of VERB_LIST_ITEMS) {
      const tenseForms = formsById.get(item.id)?.[activeTense.key];
      if (!tenseForms) {
        continue;
      }

      const infinitive = getVerbListWordLemma(targetLanguage, item.id) || item.verb;
      result.push({
        id: item.id,
        index: result.length + 1,
        infinitive,
        meaning: getVerbListTranslation(item.id, uiLang),
        href: canLinkVerbListItem(targetLanguage, item.id)
          ? buildWordPath(uiLang, targetLanguage, infinitive, item.id)
          : null,
        forms: tenseForms,
      });
    }
    return result;
  }, [activeTense, targetLanguage, uiLang]);

  const showMeaningColumn = TARGET_LANGUAGE_TO_UI_LANGUAGE[targetLanguage] !== uiLang;
  const [searchValue, setSearchValue] = useState("");
  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        rowMatchesSearch(normalizedSearch, [
          row.infinitive,
          ...(showMeaningColumn ? [row.meaning] : []),
          ...Object.values(row.forms),
        ]),
      ),
    [normalizedSearch, rows, showMeaningColumn],
  );
  const searchCopy = getTableSearchCopy(uiLang);

  const seoMetadata = buildConjugatedVerbFormsSeoMetadata({
    uiLang,
    pathname: location.pathname,
    siteOrigin,
    content,
    getAllPaths: getAllConjugatedVerbFormsPaths,
    getPath: (lang) => getConjugatedVerbFormsPath(targetLanguage, lang),
  });

  const title = content?.metadata.title || seoMetadata.title;
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

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      <SEOHead metadata={seoMetadata} />
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h1 className="text-3xl text-foreground md:text-4xl">{title}</h1>
          {content ? (
            <>
              {content.hero.subtitle ? (
                <p className="mt-3 text-base text-muted-foreground">{content.hero.subtitle}</p>
              ) : null}
              {content.hero.introParagraphs.length > 0 ? (
                <div className="mt-5 space-y-3">
                  {content.hero.introParagraphs.map((paragraph) => (
                    <p key={paragraph} className="text-base text-muted-foreground">
                      {paragraph}
                    </p>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-border/70 bg-muted/40 p-4 text-sm text-muted-foreground">
              {CONJUGATED_VERB_FORMS_DEV_PLACEHOLDER_MESSAGE}
            </p>
          )}
        </section>

        {content ? (
          <section className="space-y-5">
            <div className="text-center">
              <h2 className="text-2xl text-foreground">{content.tenseSelector.heading}</h2>
              {content.tenseSelector.description ? (
                <p className="mt-2 text-sm text-muted-foreground">{content.tenseSelector.description}</p>
              ) : null}
            </div>

            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="grid w-full max-w-sm grid-cols-3 rounded-full border border-border bg-muted/60 p-1 shadow-sm sm:inline-flex sm:w-auto sm:max-w-none">
                {content.tenseSelector.groups.map((group) => {
                  const groupTenses = tenses.filter((tense) => tense.group === group.key);
                  if (groupTenses.length === 0) {
                    return null;
                  }

                  const isActiveGroup = activeGroupKey === group.key;
                  return (
                    <button
                      key={group.key}
                      type="button"
                      aria-pressed={isActiveGroup}
                      onClick={() => {
                        setActiveGroupKey(group.key);
                        setActiveTenseKey(groupTenses[0].key);
                      }}
                      className={`min-w-0 rounded-full px-4 py-2.5 text-center text-sm font-semibold transition sm:px-5 ${
                        isActiveGroup
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-background hover:text-foreground"
                      }`}
                    >
                      {group.label}
                    </button>
                  );
                })}
                </div>
              </div>

              {activeGroupTenses.length > 0 ? (
                <div className="rounded-2xl border border-border/70 bg-card/70 px-3 py-3">
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-center">
                    {activeGroupTenses.map((tense) => {
                      const isActive = activeTense?.key === tense.key;
                      return (
                        <button
                          key={tense.key}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => setActiveTenseKey(tense.key)}
                          className={`min-w-0 whitespace-normal rounded-full border px-3 py-2 text-center text-sm font-medium leading-snug break-words transition sm:px-4 ${
                            isActive
                              ? "border-primary/70 bg-primary/10 text-primary shadow-sm ring-1 ring-primary/20"
                              : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-primary/5"
                          }`}
                        >
                          {tense.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <ConjugatedVerbFormsTableSection
              tableConfig={tableConfig}
              tableColumns={content.tableColumns}
              pronounForms={content.pronounForms}
              showMeaningColumn={showMeaningColumn}
              hasRows={rows.length > 0}
              rows={filteredRows}
              speechLang={speechLang}
              heading={activeTense?.tableHeading ?? content.table.heading}
              description={activeTense?.tableDescription ?? content.table.description}
              scrollHint={content.table.scrollHint}
              scrollLeftLabel={content.table.scrollLeftLabel}
              scrollRightLabel={content.table.scrollRightLabel}
              notes={content.table.notes}
              placeholderMessage={CONJUGATED_VERB_FORMS_DEV_PLACEHOLDER_MESSAGE}
              searchValue={searchValue}
              onSearchChange={setSearchValue}
              searchPlaceholder={searchCopy.searchPlaceholder}
              noResultsMessage={searchCopy.noResults}
            />

            {activeTense ? (
              <div className="rounded-xl bg-muted/50 p-4">
                <h3 className="text-lg font-semibold text-foreground">{activeTense.grammar.heading}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{activeTense.grammar.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="rounded-md bg-background px-3 py-1.5 text-sm font-medium text-foreground">
                    {activeTense.grammar.formula}
                  </span>
                  {activeTense.grammar.additionalFormula ? (
                    <span className="rounded-md bg-background px-3 py-1.5 text-sm font-medium text-foreground">
                      {activeTense.grammar.additionalFormula}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        ) : (
          <ConjugatedVerbFormsTableSection
            tableConfig={tableConfig}
            tableColumns={EMPTY_TABLE_COLUMNS}
            pronounForms={[]}
            showMeaningColumn={showMeaningColumn}
            hasRows={false}
            rows={[]}
            speechLang={speechLang}
            heading=""
            description=""
            scrollHint=""
            scrollLeftLabel=""
            scrollRightLabel=""
            notes={[]}
            placeholderMessage={CONJUGATED_VERB_FORMS_DEV_PLACEHOLDER_MESSAGE}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder={searchCopy.searchPlaceholder}
            noResultsMessage={searchCopy.noResults}
          />
        )}

        {content?.overview.heading || content?.overview.paragraphs.length ? (
          <section className="space-y-4">
            {content.overview.heading ? <h2 className="text-2xl text-foreground">{content.overview.heading}</h2> : null}
            <div className="space-y-3">
              {content.overview.paragraphs.map((paragraph) => (
                <p key={paragraph} className="text-base text-muted-foreground">
                  {paragraph}
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {content?.rules.heading || content?.rules.items.length ? (
          <section className="space-y-4">
            {content.rules.heading ? <h2 className="text-2xl text-foreground">{content.rules.heading}</h2> : null}
            {content.rules.intro ? <p className="text-base text-muted-foreground">{content.rules.intro}</p> : null}
            <div className="space-y-5">
              {content.rules.items.map((rule) => (
                <div key={rule.heading}>
                  <h3 className="text-base font-semibold text-foreground">{rule.heading}</h3>
                  {rule.text ? <p className="mt-1 text-sm text-muted-foreground">{rule.text}</p> : null}
                  {rule.examples.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                      {rule.examples.map((example) => (
                        <li key={example}>{example}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {content?.commonMistakes.heading || content?.commonMistakes.items.length ? (
          <section className="space-y-4">
            {content.commonMistakes.heading ? (
              <h2 className="text-2xl text-foreground">{content.commonMistakes.heading}</h2>
            ) : null}
            {content.commonMistakes.intro ? (
              <p className="text-base text-muted-foreground">{content.commonMistakes.intro}</p>
            ) : null}
            <div className="space-y-3">
              {content.commonMistakes.items.map((item) => (
                <div key={item.incorrect} className="border-l-2 border-primary/40 pl-4">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-destructive">{item.incorrect}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{item.correct}</span>
                  </p>
                  {item.explanation ? <p className="mt-2 text-sm text-muted-foreground">{item.explanation}</p> : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {content?.howToUse.heading || content?.howToUse.steps.length ? (
          <section className="space-y-4">
            {content.howToUse.heading ? <h2 className="text-2xl text-foreground">{content.howToUse.heading}</h2> : null}
            <ol className="list-decimal space-y-3 pl-5 text-muted-foreground">
              {content.howToUse.steps.map((step, index) => (
                <li key={`${index}-${step.heading}`}>
                  {step.heading ? <p className="font-medium text-foreground">{step.heading}</p> : null}
                  {step.text ? <p>{step.text}</p> : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {content?.tips.heading || content?.tips.items.length ? (
          <section className="space-y-4">
            {content.tips.heading ? <h2 className="text-2xl text-foreground">{content.tips.heading}</h2> : null}
            <ul className="list-disc space-y-3 pl-5 text-muted-foreground">
              {content.tips.items.map((tip, index) => (
                <li key={`${index}-${tip.heading}`}>
                  {tip.heading ? <p className="font-medium text-foreground">{tip.heading}</p> : null}
                  {tip.text ? <p>{tip.text}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {content?.cta.heading || content?.cta.description || content?.cta.primaryLabel ? (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            {content.cta.heading ? <h2 className="text-2xl text-foreground">{content.cta.heading}</h2> : null}
            {content.cta.description ? <p className="mt-2 text-sm text-muted-foreground">{content.cta.description}</p> : null}
            <div className="mt-5 flex flex-wrap gap-3">
              {content.cta.primaryLabel ? (
                <button
                  type="button"
                  className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
                  onClick={() => onStartPractice(targetLanguage, "A1")}
                >
                  {content.cta.primaryLabel}
                </button>
              ) : null}
              {content.cta.secondaryLabel ? (
                <Link
                  to={getVerbListPath(targetLanguage, uiLang)}
                  className="rounded-xl border border-primary/35 bg-primary/5 px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10"
                >
                  {content.cta.secondaryLabel}
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        {relatedLinks.length > 0 ? (
          <section className="space-y-4">
            {content!.related.heading ? <h2 className="text-2xl text-foreground">{content!.related.heading}</h2> : null}
            <ul className="list-disc space-y-2 pl-5">
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

        {content?.faq.items.length ? (
          <section className="space-y-4">
            {content.faq.heading ? <h2 className="text-2xl text-foreground">{content.faq.heading}</h2> : null}
            <div className="space-y-5">
              {content.faq.items.map((item) => (
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
