import { useEffect, useMemo, useState } from "react";
import { Volume2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { getLevelTestSeoPath } from "../../data/levelTests";
import {
  GERMAN_VERB_LIST_ITEMS,
  canLinkGermanVerbListItem,
  getGermanVerbDefinition,
  getGermanVerbListContent,
  getGermanVerbTranslation,
  getGermanVerbWordLemma,
} from "../../data/germanVerbList";
import { getSeoHubPath } from "../../data/seo/hub";
import { getUiVocabularyLanguage } from "../../data/seo/wordPageData";
import {
  TARGET_LANGUAGE_TO_UI_LANGUAGE,
  buildLocalizedVocabularyPath,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../data/seo/slugs";
import { buildWordPath } from "../../data/seo/wordSlugs";
import { buildGermanVerbListSeoMetadata } from "../../seo/metadata";
import { SEOHead, useSeoSiteOrigin } from "../../seo/SeoContext";
import { useLanguage } from "../../contexts/LanguageContext";

interface GermanVerbListSeoPageProps {
  uiLang: UiLanguageCode;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}

const TARGET_LANGUAGE: TargetLanguageSlug = "german";
const GERMAN_SPEECH_LANG = "de-DE";
const PRONOUNCE_LABEL_BY_UI_LANG: Record<UiLanguageCode, string> = {
  en: "Hear pronunciation",
  es: "Escuchar pronunciacion",
  de: "Aussprache anhoren",
  fr: "Ecouter la prononciation",
  it: "Ascolta la pronuncia",
  pt: "Ouvir pronuncia",
  ru: "Uslyshat proiznoshenie",
};

function speakVerb(verb: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(verb);
  utterance.lang = GERMAN_SPEECH_LANG;
  window.speechSynthesis.speak(utterance);
}

export function GermanVerbListSeoPage({
  uiLang,
  onStartPractice,
}: GermanVerbListSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const { t } = useLanguage();
  const content = getGermanVerbListContent(uiLang);
  const pronounceLabel = PRONOUNCE_LABEL_BY_UI_LANG[uiLang] ?? PRONOUNCE_LABEL_BY_UI_LANG.en;
  const [searchValue, setSearchValue] = useState("");
  const showTranslationColumn = getUiVocabularyLanguage(uiLang) !== TARGET_LANGUAGE;
  const targetLanguageName = t(`languageNames.${TARGET_LANGUAGE_TO_UI_LANGUAGE[TARGET_LANGUAGE]}`);
  const uiLanguageName = t(`languageNames.${uiLang}`);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  const seoMetadata = buildGermanVerbListSeoMetadata({
    uiLang,
    pathname: location.pathname,
    siteOrigin,
  });
  const levelTestHref = getLevelTestSeoPath(uiLang, TARGET_LANGUAGE);
  const relatedLinks = [
    levelTestHref
      ? { href: levelTestHref, label: content.relatedLinks.levelTest }
      : null,
    buildLocalizedVocabularyPath(uiLang, TARGET_LANGUAGE, "a1")
      ? {
          href: buildLocalizedVocabularyPath(uiLang, TARGET_LANGUAGE, "a1")!,
          label: content.relatedLinks.englishA1,
        }
      : null,
    buildLocalizedVocabularyPath(uiLang, TARGET_LANGUAGE, "a2")
      ? {
          href: buildLocalizedVocabularyPath(uiLang, TARGET_LANGUAGE, "a2")!,
          label: content.relatedLinks.englishA2,
        }
      : null,
    buildLocalizedVocabularyPath(uiLang, TARGET_LANGUAGE, "b1")
      ? {
          href: buildLocalizedVocabularyPath(uiLang, TARGET_LANGUAGE, "b1")!,
          label: content.relatedLinks.englishB1,
        }
      : null,
    { href: getSeoHubPath(uiLang), label: content.relatedLinks.seoHub },
  ].filter((item): item is { href: string; label: string } => Boolean(item));

  const rows = useMemo(
    () =>
      GERMAN_VERB_LIST_ITEMS.map((item, index) => ({
        index: index + 1,
        id: item.id,
        verb: getGermanVerbWordLemma(item.id) || item.verb,
        translation: getGermanVerbTranslation(item.id, uiLang),
        definition: getGermanVerbDefinition(item.id, uiLang),
        href: canLinkGermanVerbListItem(item.id)
          ? buildWordPath(uiLang, TARGET_LANGUAGE, getGermanVerbWordLemma(item.id), item.id)
          : null,
      })),
    [uiLang],
  );

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (!normalizedSearch) {
          return true;
        }

        return row.verb.toLowerCase().includes(normalizedSearch);
      }),
    [normalizedSearch, rows],
  );

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      {seoMetadata ? <SEOHead metadata={seoMetadata} /> : null}
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h1 className="text-3xl text-foreground md:text-4xl">{content.title}</h1>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              onClick={() => onStartPractice(TARGET_LANGUAGE, "A1")}
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
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-2xl text-foreground">{content.sections.verbListHeading}</h2>
            </div>
            <label className="flex w-full max-w-[22rem] shrink-0 text-sm text-foreground">
              <span className="sr-only">{content.filters.searchPlaceholder}</span>
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={content.filters.searchPlaceholder}
                className="w-full rounded-xl border border-primary/35 bg-primary/5 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left table-fixed">
              <thead>
                <tr>
                  <th className="w-20 border-b border-border py-3 pr-4 text-sm text-foreground">
                    {content.table.number}
                  </th>
                  <th className="w-40 border-b border-border py-3 pr-4 text-sm text-foreground">
                    {targetLanguageName}
                  </th>
                  {showTranslationColumn ? (
                    <th className="w-36 border-b border-border py-3 pr-4 text-sm text-foreground">
                      {uiLanguageName}
                    </th>
                  ) : null}
                  <th className="border-b border-border py-3 text-sm text-foreground">
                    {content.table.definition}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="border-b border-border/70 py-3 pr-4 align-top text-sm text-muted-foreground">
                      {row.index}
                    </td>
                    <td className="border-b border-border/70 py-3 pr-4 align-middle text-sm font-medium text-foreground">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`${pronounceLabel}: ${row.verb}`}
                          onClick={() => speakVerb(row.verb)}
                          className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-primary/80 transition hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                        {row.href ? (
                          <Link className="text-primary transition hover:underline" to={row.href}>
                            {row.verb}
                          </Link>
                        ) : (
                          row.verb
                        )}
                      </div>
                    </td>
                    {showTranslationColumn ? (
                      <td className="border-b border-border/70 py-3 pr-4 align-top text-sm">
                        {row.translation ? <span className="text-muted-foreground">{row.translation}</span> : <span className="text-muted-foreground">-</span>}
                      </td>
                    ) : null}
                    <td className="border-b border-border/70 py-3 align-top text-sm text-muted-foreground">
                      {row.definition || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredRows.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{content.table.noResults}</p>
          ) : null}
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
