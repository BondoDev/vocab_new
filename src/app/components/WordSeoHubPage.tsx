import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "../../contexts/LanguageContext";
import { getSeoHubPath } from "../../data/seo/hub";
import type { Level, UiLanguageCode } from "../../data/seo/slugs";
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
    summaryIntro:
      "Browse prerendered index pages for all canonical English word SEO URLs. Each level is split into smaller pages so the hub stays crawlable without becoming too heavy.",
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
    summaryTitle: "Paginas SEO de palabras en ingles",
    summaryIntro:
      "Consulta paginas indice prerenderizadas para todas las URLs canonicas de palabras en ingles. Cada nivel se divide en paginas pequenas para mantener el hub ligero y rastreable.",
    levelLabel: "Nivel",
    wordCountLabel: "Palabras",
    pageCountLabel: "Paginas",
    openLevelLabel: "Abrir indice",
    levelTitle: (level, page) =>
      page > 1 ? `Paginas SEO de palabras en ingles ${level} - Pagina ${page}` : `Paginas SEO de palabras en ingles ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Este indice muestra paginas canonicas de palabras en ingles ${level}. Pagina ${page} de ${totalPages}, ${totalWords.toLocaleString("es-ES")} URLs en total.`,
    backToSeoHub: "Volver a paginas SEO",
    backToWordIndex: "Volver al indice de palabras en ingles",
    paginationLabel: "Mas paginas del indice",
    notFound: "No se encontro la pagina del indice.",
  },
  fr: {
    summaryTitle: "Pages SEO des mots anglais",
    summaryIntro:
      "Parcourez des pages index pre-rendues pour toutes les URL canoniques des mots anglais. Chaque niveau est divise en petites pages pour garder le hub leger et explorable.",
    levelLabel: "Niveau",
    wordCountLabel: "Mots",
    pageCountLabel: "Pages",
    openLevelLabel: "Ouvrir l index",
    levelTitle: (level, page) =>
      page > 1 ? `Pages SEO des mots anglais ${level} - Page ${page}` : `Pages SEO des mots anglais ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Cet index liste les pages canoniques des mots anglais ${level}. Page ${page} sur ${totalPages}, ${totalWords.toLocaleString("fr-FR")} URL au total.`,
    backToSeoHub: "Retour aux pages SEO",
    backToWordIndex: "Retour a l index des mots anglais",
    paginationLabel: "Autres pages d index",
    notFound: "Page d index introuvable.",
  },
  de: {
    summaryTitle: "SEO-Seiten fur englische Worter",
    summaryIntro:
      "Durchsuchen Sie vorgerenderte Indexseiten fur alle kanonischen englischen Wort-URLs. Jede Stufe ist in kleinere Seiten aufgeteilt, damit der Hub crawlbar und leicht bleibt.",
    levelLabel: "Niveau",
    wordCountLabel: "Worter",
    pageCountLabel: "Seiten",
    openLevelLabel: "Index offnen",
    levelTitle: (level, page) =>
      page > 1 ? `SEO-Seiten fur englische Worter ${level} - Seite ${page}` : `SEO-Seiten fur englische Worter ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Dieser Index listet kanonische englische Wortseiten fur ${level}. Seite ${page} von ${totalPages}, insgesamt ${totalWords.toLocaleString("de-DE")} URLs.`,
    backToSeoHub: "Zuruck zu SEO-Seiten",
    backToWordIndex: "Zuruck zum Index englischer Worter",
    paginationLabel: "Weitere Indexseiten",
    notFound: "Indexseite nicht gefunden.",
  },
  it: {
    summaryTitle: "Pagine SEO delle parole inglesi",
    summaryIntro:
      "Sfoglia pagine indice prerenderizzate per tutti gli URL canonici delle parole inglesi. Ogni livello e suddiviso in pagine piu piccole per mantenere l hub leggero e crawlable.",
    levelLabel: "Livello",
    wordCountLabel: "Parole",
    pageCountLabel: "Pagine",
    openLevelLabel: "Apri indice",
    levelTitle: (level, page) =>
      page > 1 ? `Pagine SEO delle parole inglesi ${level} - Pagina ${page}` : `Pagine SEO delle parole inglesi ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Questo indice elenca le pagine canoniche delle parole inglesi ${level}. Pagina ${page} di ${totalPages}, ${totalWords.toLocaleString("it-IT")} URL totali.`,
    backToSeoHub: "Torna alle pagine SEO",
    backToWordIndex: "Torna all indice parole inglesi",
    paginationLabel: "Altre pagine indice",
    notFound: "Pagina indice non trovata.",
  },
  pt: {
    summaryTitle: "Paginas SEO de palavras em ingles",
    summaryIntro:
      "Navegue por paginas indice prerenderizadas para todas as URLs canonicas de palavras em ingles. Cada nivel e dividido em paginas menores para manter o hub leve e rastreavel.",
    levelLabel: "Nivel",
    wordCountLabel: "Palavras",
    pageCountLabel: "Paginas",
    openLevelLabel: "Abrir indice",
    levelTitle: (level, page) =>
      page > 1 ? `Paginas SEO de palavras em ingles ${level} - Pagina ${page}` : `Paginas SEO de palavras em ingles ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Este indice lista paginas canonicas de palavras em ingles ${level}. Pagina ${page} de ${totalPages}, ${totalWords.toLocaleString("pt-BR")} URLs no total.`,
    backToSeoHub: "Voltar para paginas SEO",
    backToWordIndex: "Voltar ao indice de palavras em ingles",
    paginationLabel: "Mais paginas do indice",
    notFound: "Pagina de indice nao encontrada.",
  },
  ru: {
    summaryTitle: "SEO-stranicy angliiskih slov",
    summaryIntro:
      "Zdes sobrany predvaritelno otrenderennye indeksnye stranicy dlya vseh kanonicheskih URL angliiskih slov. Kazhdyi uroven razbit na nebolshie stranicy, chtoby hab ostavalsya legkim i udobnym dlya obhoda.",
    levelLabel: "Uroven",
    wordCountLabel: "Slova",
    pageCountLabel: "Stranicy",
    openLevelLabel: "Otkryt indeks",
    levelTitle: (level, page) =>
      page > 1 ? `SEO-stranicy angliiskih slov ${level} - stranica ${page}` : `SEO-stranicy angliiskih slov ${level}`,
    levelIntro: (level, totalWords, page, totalPages) =>
      `Etot indeks soderzhit kanonicheskie stranicy angliiskih slov urovnya ${level}. Stranica ${page} iz ${totalPages}, vsego ${totalWords.toLocaleString("ru-RU")} URL.`,
    backToSeoHub: "Nazad k SEO-stranicam",
    backToWordIndex: "Nazad k indeksu angliiskih slov",
    paginationLabel: "Drugie stranicy indeksa",
    notFound: "Stranica indeksa ne naidena.",
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
  const { uiLanguage } = useLanguage();
  const contentUiLang = uiLanguage;
  const copy = COPY[contentUiLang] ?? COPY.en;
  const seoMetadata = buildWordSeoHubMetadata({
    uiLang,
    route,
    pathname: location.pathname,
    siteOrigin,
  });

  if (route.kind === "summary") {
    const data = getWordSeoHubSummaryPageData(uiLang);

    return (
      <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
        <SEOHead metadata={seoMetadata} />
        <div className="mx-auto w-full max-w-5xl space-y-8">
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <h1 className="text-3xl text-foreground md:text-4xl">{copy.summaryTitle}</h1>
            <p className="mt-3 text-base text-muted-foreground">{copy.summaryIntro}</p>
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
                    to={getWordSeoHubLevelPath(uiLang, level.level)}
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

  const data = getWordSeoHubLevelPageData(uiLang, route.level, route.page);
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
                    to={getWordSeoHubLevelPath(uiLang, data.level, page)}
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
