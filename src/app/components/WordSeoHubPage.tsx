import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { getSeoHubPath } from "../../data/seo/shared/hub";
import { TARGET_LANGUAGE_TO_UI_LANGUAGE, type Level, type UiLanguageCode } from "../../data/seo/shared/slugs";
import {
  getWordSeoHubLevelPageData,
  getWordSeoHubSummaryPageData,
} from "../../data/seo/wordPages/wordHubData";
import {
  type WordSeoHubRoute,
  getWordSeoHubLevelPath,
} from "../../data/seo/wordPages/wordHubRoutes";
import { buildWordSeoHubMetadata } from "../../seo/metadata";
import { SEOHead, useSeoSiteOrigin } from "../../seo/SeoContext";

interface WordSeoHubPageProps {
  route: WordSeoHubRoute;
  uiLang: UiLanguageCode;
}

const LEVEL_DISPLAY: Record<Level, string> = {
  a1: "A1",
  a2: "A2",
  b1: "B1",
  b2: "B2",
  c1: "C1",
  c2: "C2",
};

const COPY: Record<
  UiLanguageCode,
  {
    summaryTitle: string;
    summaryIntro: string;
    levelLabel: string;
    wordCountLabel: string;
    pageCountLabel: string;
    openLevelLabel: string;
    levelTitle: (level: string, page: number) => string;
    levelIntro: (level: string, totalWords: number, page: number, totalPages: number) => string;
    backToSeoHub: string;
    backToWordIndex: string;
    paginationLabel: string;
    notFound: string;
  }
> = {
  en: {
    summaryTitle: "English Word Pages",
    summaryIntro: "",
    levelLabel: "Level",
    wordCountLabel: "Words",
    pageCountLabel: "Pages",
    openLevelLabel: "Open words",
    levelTitle: (level, page) =>
      page > 1 ? `English ${level} Word Pages - Page ${page}` : `English ${level} Word Pages`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `This index lists canonical English ${level} word pages. Page ${page} of ${totalPages}, ${totalWords.toLocaleString("en-US")} total URLs.`,
    backToSeoHub: "Back to pages",
    backToWordIndex: "Back to English words",
    paginationLabel: "More word index pages",
    notFound: "Word index page not found.",
  },
  es: {
    summaryTitle: "Páginas de palabras en inglés",
    summaryIntro: "",
    levelLabel: "Nivel",
    wordCountLabel: "Palabras",
    pageCountLabel: "Páginas",
    openLevelLabel: "Abrir palabras",
    levelTitle: (level, page) =>
      page > 1 ? `Páginas de palabras en inglés ${level} - Página ${page}` : `Páginas de palabras en inglés ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Este índice muestra páginas canónicas de palabras en inglés ${level}. Página ${page} de ${totalPages}, ${totalWords.toLocaleString("es-ES")} URLs en total.`,
    backToSeoHub: "Volver a páginas",
    backToWordIndex: "Volver a palabras en inglés",
    paginationLabel: "Más páginas del índice",
    notFound: "No se encontró la página del índice.",
  },
  fr: {
    summaryTitle: "Pages de mots anglais",
    summaryIntro: "",
    levelLabel: "Niveau",
    wordCountLabel: "Mots",
    pageCountLabel: "Pages",
    openLevelLabel: "Ouvrir les mots",
    levelTitle: (level, page) =>
      page > 1 ? `Pages de mots anglais ${level} - Page ${page}` : `Pages de mots anglais ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Cet index liste les pages canoniques des mots anglais ${level}. Page ${page} sur ${totalPages}, ${totalWords.toLocaleString("fr-FR")} URL au total.`,
    backToSeoHub: "Retour aux pages",
    backToWordIndex: "Retour aux mots anglais",
    paginationLabel: "Autres pages d'index",
    notFound: "Page d'index introuvable.",
  },
  de: {
    summaryTitle: "Wortseiten für englische Wörter",
    summaryIntro: "",
    levelLabel: "Niveau",
    wordCountLabel: "Wörter",
    pageCountLabel: "Seiten",
    openLevelLabel: "Wörter öffnen",
    levelTitle: (level, page) =>
      page > 1 ? `Wortseiten für englische Wörter ${level} - Seite ${page}` : `Wortseiten für englische Wörter ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Dieser Index listet kanonische englische Wortseiten für ${level}. Seite ${page} von ${totalPages}, insgesamt ${totalWords.toLocaleString("de-DE")} URLs.`,
    backToSeoHub: "Zurück zu Seiten",
    backToWordIndex: "Zurück zu englischen Wörtern",
    paginationLabel: "Weitere Indexseiten",
    notFound: "Indexseite nicht gefunden.",
  },
  it: {
    summaryTitle: "Pagine delle parole inglesi",
    summaryIntro: "",
    levelLabel: "Livello",
    wordCountLabel: "Parole",
    pageCountLabel: "Pagine",
    openLevelLabel: "Apri parole",
    levelTitle: (level, page) =>
      page > 1 ? `Pagine delle parole inglesi ${level} - Pagina ${page}` : `Pagine delle parole inglesi ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Questo indice elenca le pagine canoniche delle parole inglesi ${level}. Pagina ${page} di ${totalPages}, ${totalWords.toLocaleString("it-IT")} URL totali.`,
    backToSeoHub: "Torna alle pagine",
    backToWordIndex: "Torna alle parole inglesi",
    paginationLabel: "Altre pagine dell'indice",
    notFound: "Pagina indice non trovata.",
  },
  pt: {
    summaryTitle: "Páginas de palavras em inglês",
    summaryIntro: "",
    levelLabel: "Nível",
    wordCountLabel: "Palavras",
    pageCountLabel: "Páginas",
    openLevelLabel: "Abrir palavras",
    levelTitle: (level, page) =>
      page > 1 ? `Páginas de palavras em inglês ${level} - Página ${page}` : `Páginas de palavras em inglês ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Este índice lista páginas canônicas de palavras em inglês ${level}. Página ${page} de ${totalPages}, ${totalWords.toLocaleString("pt-BR")} URLs no total.`,
    backToSeoHub: "Voltar para páginas",
    backToWordIndex: "Voltar para palavras em inglês",
    paginationLabel: "Mais páginas do índice",
    notFound: "Página de índice não encontrada.",
  },
  ru: {
    summaryTitle: "Страницы английских слов",
    summaryIntro: "",
    levelLabel: "Уровень",
    wordCountLabel: "Слова",
    pageCountLabel: "Страницы",
    openLevelLabel: "Открыть слова",
    levelTitle: (level, page) =>
      page > 1 ? `Страницы английских слов ${level} - страница ${page}` : `Страницы английских слов ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Этот индекс содержит канонические страницы английских слов уровня ${level}. Страница ${page} из ${totalPages}, всего ${totalWords.toLocaleString("ru-RU")} URL.`,
    backToSeoHub: "Назад к страницам",
    backToWordIndex: "Назад к английским словам",
    paginationLabel: "Другие страницы индекса",
    notFound: "Страница индекса не найдена.",
  },
};

// Generic templates for target languages other than English. Simple concatenation,
// no per-language grammatical inflection (kept consistent with the rest of the app).
const GENERIC_COPY: Record<
  UiLanguageCode,
  {
    summaryTitle: (languageName: string) => string;
    summaryIntro: (languageName: string) => string;
    levelTitle: (languageName: string, level: string, page: number) => string;
    levelIntro: (
      languageName: string,
      level: string,
      totalWords: number,
      page: number,
      totalPages: number,
    ) => string;
    backToWordIndex: (languageName: string) => string;
  }
> = {
  en: {
    summaryTitle: (name) => `${name} Word Pages`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1 ? `${name} ${level} Word Pages - Page ${page}` : `${name} ${level} Word Pages`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `This index lists canonical ${name} ${level} word pages. Page ${page} of ${totalPages}, ${totalWords.toLocaleString("en-US")} total URLs.`,
    backToWordIndex: (name) => `Back to ${name} words`,
  },
  es: {
    summaryTitle: (name) => `Páginas de palabras en ${name.toLowerCase()}`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1
        ? `Páginas de palabras en ${name.toLowerCase()} ${level} - Página ${page}`
        : `Páginas de palabras en ${name.toLowerCase()} ${level}`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `Este índice muestra páginas canónicas de palabras en ${name.toLowerCase()} ${level}. Página ${page} de ${totalPages}, ${totalWords.toLocaleString("es-ES")} URLs en total.`,
    backToWordIndex: (name) => `Volver a palabras en ${name.toLowerCase()}`,
  },
  fr: {
    summaryTitle: (name) => `Pages de mots ${name.toLowerCase()}`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1
        ? `Pages de mots ${name.toLowerCase()} ${level} - Page ${page}`
        : `Pages de mots ${name.toLowerCase()} ${level}`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `Cet index liste les pages canoniques des mots ${name.toLowerCase()} ${level}. Page ${page} sur ${totalPages}, ${totalWords.toLocaleString("fr-FR")} URL au total.`,
    backToWordIndex: (name) => `Retour aux mots ${name.toLowerCase()}`,
  },
  de: {
    summaryTitle: (name) => `Wortseiten für ${name.toLowerCase()}e Wörter`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1
        ? `Wortseiten für ${name.toLowerCase()}e Wörter ${level} - Seite ${page}`
        : `Wortseiten für ${name.toLowerCase()}e Wörter ${level}`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `Dieser Index listet kanonische ${name.toLowerCase()}e Wortseiten für ${level}. Seite ${page} von ${totalPages}, insgesamt ${totalWords.toLocaleString("de-DE")} URLs.`,
    backToWordIndex: (name) => `Zurück zu ${name.toLowerCase()}en Wörtern`,
  },
  it: {
    summaryTitle: (name) => `Pagine delle parole ${name.toLowerCase()}`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1
        ? `Pagine delle parole ${name.toLowerCase()} ${level} - Pagina ${page}`
        : `Pagine delle parole ${name.toLowerCase()} ${level}`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `Questo indice elenca le pagine canoniche delle parole ${name.toLowerCase()} ${level}. Pagina ${page} di ${totalPages}, ${totalWords.toLocaleString("it-IT")} URL totali.`,
    backToWordIndex: (name) => `Torna alle parole ${name.toLowerCase()}`,
  },
  pt: {
    summaryTitle: (name) => `Páginas de palavras em ${name.toLowerCase()}`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1
        ? `Páginas de palavras em ${name.toLowerCase()} ${level} - Página ${page}`
        : `Páginas de palavras em ${name.toLowerCase()} ${level}`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `Este índice lista páginas canônicas de palavras em ${name.toLowerCase()} ${level}. Página ${page} de ${totalPages}, ${totalWords.toLocaleString("pt-BR")} URLs no total.`,
    backToWordIndex: (name) => `Voltar para palavras em ${name.toLowerCase()}`,
  },
  ru: {
    summaryTitle: (name) => `Страницы слов: ${name.toLowerCase()}`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1
        ? `Страницы слов: ${name.toLowerCase()} ${level} - страница ${page}`
        : `Страницы слов: ${name.toLowerCase()} ${level}`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `Этот индекс содержит канонические страницы слов (${name.toLowerCase()}) уровня ${level}. Страница ${page} из ${totalPages}, всего ${totalWords.toLocaleString("ru-RU")} URL.`,
    backToWordIndex: (name) => `Назад к словам: ${name.toLowerCase()}`,
  },
};

function getPaginationRange(current: number, total: number): number[] {
  const pages = new Set<number>([1, total]);
  for (let page = Math.max(1, current - 2); page <= Math.min(total, current + 2); page += 1) {
    pages.add(page);
  }

  return Array.from(pages).sort((a, b) => a - b);
}

export function WordSeoHubPage({ route, uiLang }: WordSeoHubPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const { t, uiLanguage } = useLanguage();
  const contentUiLang = uiLanguage;
  const isEnglishTarget = route.targetLanguage === "english";
  const languageName = t(`languageNames.${TARGET_LANGUAGE_TO_UI_LANGUAGE[route.targetLanguage]}`);
  const englishCopy = COPY[contentUiLang] ?? COPY.en;
  const genericCopy = GENERIC_COPY[contentUiLang] ?? GENERIC_COPY.en;
  const copy = isEnglishTarget
    ? englishCopy
    : {
        ...englishCopy,
        summaryTitle: genericCopy.summaryTitle(languageName),
        summaryIntro: genericCopy.summaryIntro(languageName),
        levelTitle: (level: string, page: number) => genericCopy.levelTitle(languageName, level, page),
        levelIntro: (level: string, totalWords: number, page: number, totalPages: number) =>
          genericCopy.levelIntro(languageName, level, totalWords, page, totalPages),
        backToWordIndex: genericCopy.backToWordIndex(languageName),
      };
  const seoMetadata = buildWordSeoHubMetadata({
    uiLang,
    route,
    languageName,
    pathname: location.pathname,
    siteOrigin,
  });

  if (route.kind === "summary") {
    const data = getWordSeoHubSummaryPageData(uiLang, route.targetLanguage);

    return (
      <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
        <SEOHead metadata={seoMetadata} />
        <div className="mx-auto w-full max-w-5xl space-y-8">
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <h1 className="text-3xl text-foreground md:text-4xl">{copy.summaryTitle}</h1>
            {copy.summaryIntro ? (
              <p className="mt-3 text-base text-muted-foreground">{copy.summaryIntro}</p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <div className="mb-5">
              <Link className="text-sm text-primary transition hover:underline" to={getSeoHubPath(uiLang)}>
                {copy.backToSeoHub}
              </Link>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {data.levels.map((level) => (
                <article
                  key={level.level}
                  className="rounded-xl border border-border bg-background p-5"
                >
                  <h2 className="text-xl text-foreground">
                    {copy.levelLabel}: {LEVEL_DISPLAY[level.level]}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {copy.wordCountLabel}: {level.totalWords.toLocaleString(contentUiLang)}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {copy.pageCountLabel}: {level.totalPages.toLocaleString(contentUiLang)}
                  </p>
                  <Link
                    className="mt-4 inline-flex text-sm font-medium text-primary transition hover:underline"
                    to={getWordSeoHubLevelPath(uiLang, route.targetLanguage, level.level)}
                  >
                    {copy.openLevelLabel}
                  </Link>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
    );
  }

  const data = getWordSeoHubLevelPageData(uiLang, route.targetLanguage, route.level, route.page);
  if (!data) {
    return (
      <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
        <div className="mx-auto w-full max-w-5xl">
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <p className="text-sm text-muted-foreground">{copy.notFound}</p>
          </section>
        </div>
      </main>
    );
  }

  const pageRange = getPaginationRange(data.page, data.totalPages);

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      <SEOHead metadata={seoMetadata} />
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="text-primary transition hover:underline" to={getSeoHubPath(uiLang)}>
              {copy.backToSeoHub}
            </Link>
            <Link className="text-primary transition hover:underline" to={data.summaryPath}>
              {copy.backToWordIndex}
            </Link>
          </div>
          <h1 className="mt-4 text-3xl text-foreground md:text-4xl">
            {copy.levelTitle(LEVEL_DISPLAY[data.level], data.page)}
          </h1>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.words.map((word) => (
              <Link
                key={word.conceptId}
                className="rounded-lg border border-border px-3 py-2 text-sm text-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                to={word.href}
              >
                {word.word}
              </Link>
            ))}
          </div>

          {data.totalPages > 1 ? (
            <div className="mt-6">
              <div className="flex flex-wrap gap-2">
                {pageRange.map((page) => (
                  <Link
                    key={page}
                    className={
                      page === data.page
                        ? "rounded-lg border border-primary bg-primary/10 px-3 py-1.5 text-sm text-primary"
                        : "rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
                    }
                    to={getWordSeoHubLevelPath(uiLang, route.targetLanguage, data.level, page)}
                  >
                    {page}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
