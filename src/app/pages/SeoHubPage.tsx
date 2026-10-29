import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { getSeoHubPath } from "../../data/seo/shared/hub";
import {
  SUPPORTED_UI_LANGUAGES,
  TARGET_LANGUAGE_TO_UI_LANGUAGE,
  type Level,
  type UiLanguageCode,
} from "../../data/seo/shared/slugs";
import { SEOHead, useSeoSiteOrigin } from "../../seo/SeoContext";
import { buildSeoHubMetadata } from "../../seo/metadata";
import { SEO_HUB_METADATA } from "../../seo/hubPages/hubTemplates";
import {
  getAllLanguageLearningResources,
  type LearningResourceGroup,
} from "../components/learning-resources/learningResourcesRegistry";

// Public "Learning Resources" directory (/{ui}/learning-resources). Every
// link is a real <Link>/<a> rendered during prerender, so the whole
// Homepage -> directory -> resource hierarchy is crawlable without
// JavaScript. Resources come from learningResourcesRegistry.ts; nothing here
// hard-codes a resource URL.

interface SeoHubPageProps {
  uiLang: UiLanguageCode;
}

const FLAG_CODES: Record<UiLanguageCode, string> = {
  en: "gb",
  es: "es",
  fr: "fr",
  de: "de",
  it: "it",
  pt: "pt",
  ru: "ru",
};

// Tints deepen from A1 to C2 so the ladder reads as a progression at a
// glance. Each pair keeps WCAG AA contrast for the 14px semibold label.
const LEVEL_TINTS: Record<Level, string> = {
  a1: "bg-[#f3f0fb] text-[#45326f]",
  a2: "bg-[#e6dff5] text-[#45326f]",
  b1: "bg-[#d9cdef] text-[#2f2755]",
  b2: "bg-[#7850ad] text-white",
  c1: "bg-[#604095] text-white",
  c2: "bg-[#45326f] text-white",
};

// The directory shows two columns only: level tests, and every other
// resource type in one list. New SEO page types join that list through the
// registry without needing their own heading here.
const STUDY_GROUP_ORDER: LearningResourceGroup[] = ["wordLists", "verbs"];

// Unknown groups sort last, keeping their registry order (sort is stable).
function groupRank(group: LearningResourceGroup): number {
  const index = STUDY_GROUP_ORDER.indexOf(group);
  return index === -1 ? STUDY_GROUP_ORDER.length : index;
}

// Endonyms, so each language is recognisable whatever the current UI
// language is.
const UI_LANGUAGE_ENDONYMS: Record<UiLanguageCode, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
  ru: "Русский",
};

const PAGE_COPY: Record<
  UiLanguageCode,
  {
    jumpLabel: string;
    levelsLabel: string;
    studyLabel: string;
    levelCheckLabel: string;
    wordIndexLabel: string;
    otherLanguagesLabel: string;
  }
> = {
  en: {
    jumpLabel: "Jump to a language",
    levelsLabel: "Vocabulary by CEFR level",
    studyLabel: "Study materials",
    levelCheckLabel: "Check your level",
    wordIndexLabel: "Alphabetical word index",
    otherLanguagesLabel: "This page in other languages",
  },
  es: {
    jumpLabel: "Ir a un idioma",
    levelsLabel: "Vocabulario por nivel MCER",
    studyLabel: "Materiales de estudio",
    levelCheckLabel: "Comprueba tu nivel",
    wordIndexLabel: "Índice alfabético de palabras",
    otherLanguagesLabel: "Esta página en otros idiomas",
  },
  fr: {
    jumpLabel: "Aller à une langue",
    levelsLabel: "Vocabulaire par niveau CECRL",
    studyLabel: "Ressources d’apprentissage",
    levelCheckLabel: "Évaluez votre niveau",
    wordIndexLabel: "Index alphabétique des mots",
    otherLanguagesLabel: "Cette page dans d’autres langues",
  },
  de: {
    jumpLabel: "Zu einer Sprache springen",
    levelsLabel: "Wortschatz nach GER-Niveau",
    studyLabel: "Lernmaterialien",
    levelCheckLabel: "Niveau prüfen",
    wordIndexLabel: "Alphabetischer Wortindex",
    otherLanguagesLabel: "Diese Seite in anderen Sprachen",
  },
  it: {
    jumpLabel: "Vai a una lingua",
    levelsLabel: "Vocabolario per livello QCER",
    studyLabel: "Materiali di studio",
    levelCheckLabel: "Verifica il tuo livello",
    wordIndexLabel: "Indice alfabetico delle parole",
    otherLanguagesLabel: "Questa pagina in altre lingue",
  },
  pt: {
    jumpLabel: "Ir para um idioma",
    levelsLabel: "Vocabulário por nível QECR",
    studyLabel: "Materiais de estudo",
    levelCheckLabel: "Verifique o seu nível",
    wordIndexLabel: "Índice alfabético de palavras",
    otherLanguagesLabel: "Esta página em outros idiomas",
  },
  ru: {
    jumpLabel: "Перейти к языку",
    levelsLabel: "Лексика по уровням CEFR",
    studyLabel: "Учебные материалы",
    levelCheckLabel: "Проверьте свой уровень",
    wordIndexLabel: "Алфавитный указатель слов",
    otherLanguagesLabel: "Эта страница на других языках",
  },
};

const LINK_CLASS =
  "rounded-sm text-sm text-primary underline-offset-4 transition hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function renderStudyLink(link: { kind: string; href: string; label: string }) {
  return (
    <li key={link.kind} className="mb-1.5 break-inside-avoid">
      <Link className={LINK_CLASS} to={link.href}>
        {link.label}
      </Link>
    </li>
  );
}

export function SeoHubPage({ uiLang }: SeoHubPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const { t } = useLanguage();
  const copy = PAGE_COPY[uiLang] ?? PAGE_COPY.en;
  const headingCopy = SEO_HUB_METADATA[uiLang] ?? SEO_HUB_METADATA.en;
  const seoMetadata = buildSeoHubMetadata({ uiLang, pathname: location.pathname, siteOrigin });

  const languages = getAllLanguageLearningResources(uiLang).map((entry) => {
    const languageCode = TARGET_LANGUAGE_TO_UI_LANGUAGE[entry.targetLanguage];
    return {
      ...entry,
      sectionId: `learn-${entry.targetLanguage}`,
      flagCode: FLAG_CODES[languageCode],
      languageName: t(`languageNames.${languageCode}`),
    };
  });

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      <SEOHead metadata={seoMetadata} />
      <div className="mx-auto w-full max-w-6xl">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link className="hover:text-foreground hover:underline" to="/">
                {headingCopy.homeLabel}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-foreground">
              {headingCopy.pageName}
            </li>
          </ol>
        </nav>

        <header className="mt-5">
          <h1 className="text-3xl text-foreground md:text-4xl">{headingCopy.title}</h1>
          <p className="mt-3 max-w-3xl text-base text-muted-foreground">{headingCopy.description}</p>
          <nav aria-label={copy.jumpLabel} className="mt-6">
            <ul className="flex flex-wrap gap-2">
              {languages.map((language) => (
                <li key={language.targetLanguage}>
                  <a
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-foreground transition hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    href={`#${language.sectionId}`}
                  >
                    <span className={`fi fi-${language.flagCode} rounded-[2px]`} aria-hidden="true" />
                    {language.languageName}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </header>

        <div className="mt-8 divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {languages.map((language) => {
            const headingId = `${language.sectionId}-heading`;
            const studyLinks = [...language.resources]
              .filter((link) => link.group !== "levelCheck")
              .sort((a, b) => groupRank(a.group) - groupRank(b.group));
            const levelCheckLinks = language.resources.filter((link) => link.group === "levelCheck");
            // The word index is not a registry resource; it sits right after
            // the word lists it belongs with.
            const wordIndexAt = studyLinks.filter((link) => link.group === "wordLists").length;

            return (
              <section
                key={language.targetLanguage}
                id={language.sectionId}
                aria-labelledby={headingId}
                className="grid scroll-mt-24 gap-5 p-5 md:grid-cols-[11rem_minmax(0,1fr)] md:gap-8 md:p-7"
              >
                <h2 id={headingId} className="flex items-center gap-3 self-start text-xl text-foreground">
                  <span className={`fi fi-${language.flagCode} rounded-[3px] text-lg`} aria-hidden="true" />
                  {language.languageName}
                </h2>

                <div className="min-w-0">
                  {language.levels.length > 0 ? (
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">{copy.levelsLabel}</h3>
                      <ol className="mt-2 grid max-w-md grid-cols-6 gap-1.5">
                        {language.levels.map(({ level, href }) => (
                          <li key={level}>
                            <Link
                              className={`flex h-9 items-center justify-center rounded-md text-sm font-semibold transition hover:ring-2 hover:ring-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${LEVEL_TINTS[level]}`}
                              to={href}
                            >
                              <span className="sr-only">{language.languageName} </span>
                              {level.toUpperCase()}
                            </Link>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">{copy.studyLabel}</h3>
                      <ul className="mt-2 gap-x-5 sm:columns-2">
                        {studyLinks.slice(0, wordIndexAt).map(renderStudyLink)}
                        <li className="mb-1.5 break-inside-avoid">
                          <Link className={LINK_CLASS} to={language.wordIndexHref}>
                            <span className="sr-only">{language.languageName}: </span>
                            {copy.wordIndexLabel}
                          </Link>
                        </li>
                        {studyLinks.slice(wordIndexAt).map(renderStudyLink)}
                      </ul>
                    </div>
                    {levelCheckLinks.length > 0 ? (
                      <div>
                        <h3 className="text-sm font-medium text-muted-foreground">{copy.levelCheckLabel}</h3>
                        <ul className="mt-2 space-y-1.5">
                          {levelCheckLinks.map((link) => (
                            <li key={link.kind}>
                              <Link className={LINK_CLASS} to={link.href}>
                                {link.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        {/* Crawlable links to the other UI-language directories. The
            homepage only renders in English, and hreflang alternates are
            not followable links, so without this row the non-English
            resource clusters would have no anchor path from "/". */}
        <nav aria-labelledby="other-ui-languages-heading" className="mt-8 border-t border-border pt-5">
          <h2 id="other-ui-languages-heading" className="text-sm font-medium text-muted-foreground">
            {copy.otherLanguagesLabel}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {SUPPORTED_UI_LANGUAGES.filter((code) => code !== uiLang).map((code) => (
              <li key={code}>
                <Link className={LINK_CLASS} to={getSeoHubPath(code)} hrefLang={code} lang={code}>
                  {UI_LANGUAGE_ENDONYMS[code]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
