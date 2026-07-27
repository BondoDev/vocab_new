import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getLevelTestSeoPath } from "../../../../data/seo/levelTests";
import { getSeoHubPath } from "../../../../data/seo/shared/hub";
import { buildLocalizedVocabularyPath } from "../../../../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import {
  getUiVocabularyLanguage,
  TARGET_LANGUAGE_TO_UI_LANGUAGE,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../../../data/seo/shared/slugs";
import type { VerbListContent } from "../../../../data/seo/verbLists/common100Verbs/common100VerbRouteHelpers";
import { SEOHead, type SeoMetadata } from "../../../../seo/SeoContext";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { rowMatchesSearch } from "../shared/rowSearch";
import { VerbListTableSection } from "./VerbListTableSection";

export interface RichVerbListSeoRow {
  id: string;
  index: number;
  verb: string;
  translation: string;
  definition: string;
  href: string | null;
}

interface RichVerbListSeoPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  speechLang: string;
  rows: RichVerbListSeoRow[];
  seoMetadata: SeoMetadata;
  content: VerbListContent;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}

const PRONOUNCE_LABEL_BY_UI_LANG: Record<UiLanguageCode, string> = {
  en: "Hear pronunciation",
  es: "Escuchar pronunciacion",
  de: "Aussprache anhoren",
  fr: "Ecouter la prononciation",
  it: "Ascolta la pronuncia",
  pt: "Ouvir pronuncia",
  ru: "Uslyshat proiznoshenie",
};

export function RichVerbListSeoPage({
  uiLang,
  targetLanguage,
  speechLang,
  rows,
  seoMetadata,
  content,
  onStartPractice,
}: RichVerbListSeoPageProps) {
  const location = useLocation();
  const { t } = useLanguage();
  const pronounceLabel = PRONOUNCE_LABEL_BY_UI_LANG[uiLang] ?? PRONOUNCE_LABEL_BY_UI_LANG.en;
  const [searchValue, setSearchValue] = useState("");
  const showTranslationColumn = getUiVocabularyLanguage(uiLang) !== targetLanguage;
  const targetLanguageName = t(`languageNames.${TARGET_LANGUAGE_TO_UI_LANGUAGE[targetLanguage]}`);
  const uiLanguageName = t(`languageNames.${uiLang}`);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  const levelTestHref = getLevelTestSeoPath(uiLang, targetLanguage);
  const relatedLinks = [
    levelTestHref
      ? { href: levelTestHref, label: content.relatedLinks.levelTest }
      : null,
    buildLocalizedVocabularyPath(uiLang, targetLanguage, "a1")
      ? {
          href: buildLocalizedVocabularyPath(uiLang, targetLanguage, "a1")!,
          label: content.relatedLinks.englishA1,
        }
      : null,
    buildLocalizedVocabularyPath(uiLang, targetLanguage, "a2")
      ? {
          href: buildLocalizedVocabularyPath(uiLang, targetLanguage, "a2")!,
          label: content.relatedLinks.englishA2,
        }
      : null,
    buildLocalizedVocabularyPath(uiLang, targetLanguage, "b1")
      ? {
          href: buildLocalizedVocabularyPath(uiLang, targetLanguage, "b1")!,
          label: content.relatedLinks.englishB1,
        }
      : null,
    { href: getSeoHubPath(uiLang), label: content.relatedLinks.seoHub },
  ].filter((item): item is { href: string; label: string } => Boolean(item));

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredRows = useMemo(
    () => rows.filter((row) => rowMatchesSearch(normalizedSearch, [row.verb, row.translation, row.definition])),
    [normalizedSearch, rows],
  );

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      <SEOHead metadata={seoMetadata} />
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h1 className="text-3xl text-foreground md:text-4xl">{content.title}</h1>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              onClick={() => onStartPractice(targetLanguage, "A1")}
            >
              {content.buttons.startPractice}
            </button>
            {levelTestHref ? (
              <Link
                to={levelTestHref}
                className="rounded-xl border border-primary/35 bg-primary/5 px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/10"
              >
                {content.buttons.takeLevelTest}
              </Link>
            ) : null}
          </div>
          <div className="mt-5 space-y-3">
            {content.introParagraphs.map((paragraph) => (
              <p key={paragraph} className="text-base text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{content.sections.verbListHeading}</h2>

          <VerbListTableSection
            rows={filteredRows}
            showTranslationColumn={showTranslationColumn}
            speechLang={speechLang}
            numberLabel={content.table.number}
            verbLabel={targetLanguageName}
            translationLabel={uiLanguageName}
            definitionLabel={content.table.definition}
            pronounceLabel={pronounceLabel}
            regionLabel={content.sections.verbListHeading}
            scrollHint={content.table.scrollHint}
            scrollLeftLabel={content.table.scrollLeftLabel}
            scrollRightLabel={content.table.scrollRightLabel}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder={content.filters.searchPlaceholder}
            noResultsMessage={filteredRows.length === 0 ? content.table.noResults : null}
          />
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{content.sections.learningTipsHeading}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-muted-foreground">
            {content.learningTips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{content.sections.relatedLinksHeading}</h2>
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

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{content.sections.faqHeading}</h2>
          <div className="mt-4 space-y-5">
            {content.faq.map((item) => (
              <div key={item.question}>
                <h3 className="text-base font-semibold text-foreground">{item.question}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
