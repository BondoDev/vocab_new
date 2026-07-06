import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { getSeoHubPath } from "../../data/seo/hub";
import { TARGET_LANGUAGE_TO_UI_LANGUAGE, type Level, type UiLanguageCode } from "../../data/seo/slugs";
import {
  getWordSeoHubLevelPageData,
  getWordSeoHubSummaryPageData,
} from "../../data/seo/wordHubData";
import {
  type WordSeoHubRoute,
  getWordSeoHubLevelPath,
} from "../../data/seo/wordHubRoutes";
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
    summaryTitle: "English Word SEO Pages",
    summaryIntro: "",
    levelLabel: "Level",
    wordCountLabel: "Words",
    pageCountLabel: "Pages",
    openLevelLabel: "Open word index",
    levelTitle: (level, page) =>
      page > 1 ? `English ${level} Word SEO Pages - Page ${page}` : `English ${level} Word SEO Pages`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `This index lists canonical English ${level} word pages. Page ${page} of ${totalPages}, ${totalWords.toLocaleString("en-US")} total URLs.`,
    backToSeoHub: "Back to SEO pages",
    backToWordIndex: "Back to English word SEO index",
    paginationLabel: "More word index pages",
    notFound: "Word index page not found.",
  },
  es: {
    summaryTitle: "Páginas SEO de palabras en inglés",
    summaryIntro: "",
    levelLabel: "Nivel",
    wordCountLabel: "Palabras",
    pageCountLabel: "Páginas",
    openLevelLabel: "Abrir índice",
    levelTitle: (level, page) =>
      page > 1 ? `Páginas SEO de palabras en inglés ${level} - Página ${page}` : `Páginas SEO de palabras en inglés ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Este índice muestra páginas canónicas de palabras en inglés ${level}. Página ${page} de ${totalPages}, ${totalWords.toLocaleString("es-ES")} URLs en total.`,
    backToSeoHub: "Volver a páginas SEO",
    backToWordIndex: "Volver al índice de palabras en inglés",
    paginationLabel: "Más páginas del índice",
    notFound: "No se encontró la página del índice.",
  },
  fr: {
    summaryTitle: "Pages SEO des mots anglais",
    summaryIntro: "",
    levelLabel: "Niveau",
    wordCountLabel: "Mots",
    pageCountLabel: "Pages",
    openLevelLabel: "Ouvrir l'index",
    levelTitle: (level, page) =>
      page > 1 ? `Pages SEO des mots anglais ${level} - Page ${page}` : `Pages SEO des mots anglais ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Cet index liste les pages canoniques des mots anglais ${level}. Page ${page} sur ${totalPages}, ${totalWords.toLocaleString("fr-FR")} URL au total.`,
    backToSeoHub: "Retour aux pages SEO",
    backToWordIndex: "Retour à l'index des mots anglais",
    paginationLabel: "Autres pages d'index",
    notFound: "Page d'index introuvable.",
  },
  de: {
    summaryTitle: "SEO-Seiten für englische Wörter",
    summaryIntro: "",
    levelLabel: "Niveau",
    wordCountLabel: "Wörter",
    pageCountLabel: "Seiten",
    openLevelLabel: "Index öffnen",
    levelTitle: (level, page) =>
      page > 1 ? `SEO-Seiten für englische Wörter ${level} - Seite ${page}` : `SEO-Seiten für englische Wörter ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Dieser Index listet kanonische englische Wortseiten für ${level}. Seite ${page} von ${totalPages}, insgesamt ${totalWords.toLocaleString("de-DE")} URLs.`,
    backToSeoHub: "Zurück zu SEO-Seiten",
    backToWordIndex: "Zurück zum Index englischer Wörter",
    paginationLabel: "Weitere Indexseiten",
    notFound: "Indexseite nicht gefunden.",
  },
  it: {
    summaryTitle: "Pagine SEO delle parole inglesi",
    summaryIntro: "",
    levelLabel: "Livello",
    wordCountLabel: "Parole",
    pageCountLabel: "Pagine",
    openLevelLabel: "Apri indice",
    levelTitle: (level, page) =>
      page > 1 ? `Pagine SEO delle parole inglesi ${level} - Pagina ${page}` : `Pagine SEO delle parole inglesi ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Questo indice elenca le pagine canoniche delle parole inglesi ${level}. Pagina ${page} di ${totalPages}, ${totalWords.toLocaleString("it-IT")} URL totali.`,
    backToSeoHub: "Torna alle pagine SEO",
    backToWordIndex: "Torna all'indice delle parole inglesi",
    paginationLabel: "Altre pagine dell'indice",
    notFound: "Pagina indice non trovata.",
  },
  pt: {
    summaryTitle: "Páginas SEO de palavras em inglês",
    summaryIntro: "",
    levelLabel: "Nível",
    wordCountLabel: "Palavras",
    pageCountLabel: "Páginas",
    openLevelLabel: "Abrir índice",
    levelTitle: (level, page) =>
      page > 1 ? `Páginas SEO de palavras em inglês ${level} - Página ${page}` : `Páginas SEO de palavras em inglês ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Este índice lista páginas canônicas de palavras em inglês ${level}. Página ${page} de ${totalPages}, ${totalWords.toLocaleString("pt-BR")} URLs no total.`,
    backToSeoHub: "Voltar para páginas SEO",
    backToWordIndex: "Voltar ao índice de palavras em inglês",
    paginationLabel: "Mais páginas do índice",
    notFound: "Página de índice não encontrada.",
  },
  ru: {
    summaryTitle: "SEO-страницы английских слов",
    summaryIntro: "",
    levelLabel: "Уровень",
    wordCountLabel: "Слова",
    pageCountLabel: "Страницы",
    openLevelLabel: "Открыть индекс",
    levelTitle: (level, page) =>
      page > 1 ? `SEO-страницы английских слов ${level} - страница ${page}` : `SEO-страницы английских слов ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Этот индекс содержит канонические страницы английских слов уровня ${level}. Страница ${page} из ${totalPages}, всего ${totalWords.toLocaleString("ru-RU")} URL.`,
    backToSeoHub: "Назад к SEO-страницам",
    backToWordIndex: "Назад к индексу английских слов",
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
    summaryTitle: (name) => `${name} Word SEO Pages`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1 ? `${name} ${level} Word SEO Pages - Page ${page}` : `${name} ${level} Word SEO Pages`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `This index lists canonical ${name} ${level} word pages. Page ${page} of ${totalPages}, ${totalWords.toLocaleString("en-US")} total URLs.`,
    backToWordIndex: (name) => `Back to ${name} word SEO index`,
  },
  es: {
    summaryTitle: (name) => `Páginas SEO de palabras en ${name.toLowerCase()}`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1
        ? `Páginas SEO de palabras en ${name.toLowerCase()} ${level} - Página ${page}`
        : `Páginas SEO de palabras en ${name.toLowerCase()} ${level}`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `Este índice muestra páginas canónicas de palabras en ${name.toLowerCase()} ${level}. Página ${page} de ${totalPages}, ${totalWords.toLocaleString("es-ES")} URLs en total.`,
    backToWordIndex: (name) => `Volver al índice de palabras en ${name.toLowerCase()}`,
  },
  fr: {
    summaryTitle: (name) => `Pages SEO des mots ${name.toLowerCase()}`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1
        ? `Pages SEO des mots ${name.toLowerCase()} ${level} - Page ${page}`
        : `Pages SEO des mots ${name.toLowerCase()} ${level}`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `Cet index liste les pages canoniques des mots ${name.toLowerCase()} ${level}. Page ${page} sur ${totalPages}, ${totalWords.toLocaleString("fr-FR")} URL au total.`,
    backToWordIndex: (name) => `Retour à l'index des mots ${name.toLowerCase()}`,
  },
  de: {
    summaryTitle: (name) => `SEO-Seiten für ${name.toLowerCase()}e Wörter`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1
        ? `SEO-Seiten für ${name.toLowerCase()}e Wörter ${level} - Seite ${page}`
        : `SEO-Seiten für ${name.toLowerCase()}e Wörter ${level}`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `Dieser Index listet kanonische ${name.toLowerCase()}e Wortseiten für ${level}. Seite ${page} von ${totalPages}, insgesamt ${totalWords.toLocaleString("de-DE")} URLs.`,
    backToWordIndex: (name) => `Zurück zum Index ${name.toLowerCase()}er Wörter`,
  },
  it: {
    summaryTitle: (name) => `Pagine SEO delle parole ${name.toLowerCase()}`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1
        ? `Pagine SEO delle parole ${name.toLowerCase()} ${level} - Pagina ${page}`
        : `Pagine SEO delle parole ${name.toLowerCase()} ${level}`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `Questo indice elenca le pagine canoniche delle parole ${name.toLowerCase()} ${level}. Pagina ${page} di ${totalPages}, ${totalWords.toLocaleString("it-IT")} URL totali.`,
    backToWordIndex: (name) => `Torna all'indice delle parole ${name.toLowerCase()}`,
  },
  pt: {
    summaryTitle: (name) => `Páginas SEO de palavras em ${name.toLowerCase()}`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1
        ? `Páginas SEO de palavras em ${name.toLowerCase()} ${level} - Página ${page}`
        : `Páginas SEO de palavras em ${name.toLowerCase()} ${level}`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `Este índice lista páginas canônicas de palavras em ${name.toLowerCase()} ${level}. Página ${page} de ${totalPages}, ${totalWords.toLocaleString("pt-BR")} URLs no total.`,
    backToWordIndex: (name) => `Voltar ao índice de palavras em ${name.toLowerCase()}`,
  },
  ru: {
    summaryTitle: (name) => `SEO-страницы слов: ${name.toLowerCase()}`,
    summaryIntro: () => "",
    levelTitle: (name, level, page) =>
      page > 1
        ? `SEO-страницы слов: ${name.toLowerCase()} ${level} - страница ${page}`
        : `SEO-страницы слов: ${name.toLowerCase()} ${level}`,
    levelIntro: (name, level, totalWords, page, totalPages) =>
      `Этот индекс содержит канонические страницы слов (${name.toLowerCase()}) уровня ${level}. Страница ${page} из ${totalPages}, всего ${totalWords.toLocaleString("ru-RU")} URL.`,
    backToWordIndex: (name) => `Назад к индексу слов (${name.toLowerCase()})`,
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
          <p className="mt-3 text-base text-muted-foreground">
            {copy.levelIntro(
              LEVEL_DISPLAY[data.level],
              data.totalWords,
              data.page,
              data.totalPages,
            )}
          </p>
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
              <h2 className="text-base font-medium text-foreground">{copy.paginationLabel}</h2>
              <div className="mt-3 flex flex-wrap gap-2">
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
