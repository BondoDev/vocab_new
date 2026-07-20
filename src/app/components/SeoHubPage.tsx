import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  SUPPORTED_LEVELS,
  SUPPORTED_TARGET_LANGUAGES,
  buildLocalizedVocabularyPath,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../data/seo/slugs";
import { getLevelTestSeoPath } from "../../data/seo/levelTests";
import { getSeoHubPath } from "../../data/seo/shared/hub";
import { getWordSeoHubSummaryPath } from "../../data/seo/wordPages/wordHubRoutes";
import { getVerbListPath, getVerbListTitle } from "../../data/seo/verbLists";
import { SEOHead, useSeoSiteOrigin } from "../../seo/SeoContext";
import { buildSeoHubMetadata } from "../../seo/metadata";
import { useLanguage, type UILanguage } from "../../contexts/LanguageContext";

interface SeoHubPageProps {
  uiLang: UiLanguageCode;
}

const TARGET_LANGUAGE_TO_UI_CODE: Record<TargetLanguageSlug, UILanguage> = {
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  russian: "ru",
};

const SEO_HUB_COPY: Record<
  UiLanguageCode,
  {
    title: string;
    intro: string;
    levelsHeading: string;
    wordPagesHeading: string;
    wordPagesIntro: string;
    wordPagesLinkLabel: (languageName: string) => string;
    levelTestsHeading: string;
    vocabularyLinkLabel: (languageName: string, level: string, practiceLabel: string) => string;
    levelTestLabel: (languageName: string, levelTestLabel: string) => string;
  }
> = {
  en: {
    title: "Pages",
    intro: "Browse all vocabulary practice pages and available level tests in one place.",
    levelsHeading: "Vocabulary practice pages",
    wordPagesHeading: "Word page indexes",
    wordPagesIntro:
      "Browse canonical word URL indexes for each language through smaller paginated pages.",
    wordPagesLinkLabel: (languageName) => `${languageName} word pages`,
    levelTestsHeading: "Level test pages",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${languageName} ${level} ${practiceLabel}`,
    levelTestLabel: (languageName, levelTestLabel) => `${languageName} ${levelTestLabel}`,
  },
  es: {
    title: "Páginas",
    intro: "Consulta todas las páginas de práctica de vocabulario y los tests de nivel disponibles en un solo lugar.",
    levelsHeading: "Páginas de práctica de vocabulario",
    wordPagesHeading: "Índices de páginas de palabras",
    wordPagesIntro:
      "Consulta los índices de URLs canónicas de palabras de cada idioma en páginas más pequeñas y paginadas.",
    wordPagesLinkLabel: (languageName) => `Páginas de palabras en ${languageName.toLowerCase()}`,
    levelTestsHeading: "Páginas de test de nivel",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${practiceLabel} de ${languageName.toLowerCase()} ${level}`,
    levelTestLabel: (languageName, levelTestLabel) =>
      `${levelTestLabel} de ${languageName.toLowerCase()}`,
  },
  fr: {
    title: "Pages",
    intro: "Consultez toutes les pages de pratique du vocabulaire et les tests de niveau disponibles au même endroit.",
    levelsHeading: "Pages de pratique du vocabulaire",
    wordPagesHeading: "Index de pages de mots",
    wordPagesIntro:
      "Consultez les index d'URL canoniques de mots de chaque langue, répartis sur des pages plus petites et paginées.",
    wordPagesLinkLabel: (languageName) => `Pages de mots ${languageName.toLowerCase()}`,
    levelTestsHeading: "Pages de test de niveau",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${practiceLabel} de ${languageName.toLowerCase()} ${level}`,
    levelTestLabel: (languageName, levelTestLabel) =>
      `${levelTestLabel} de ${languageName.toLowerCase()}`,
  },
  de: {
    title: "Seiten",
    intro: "Hier finden Sie alle Wortschatzseiten und verfügbaren Niveau-Tests an einem Ort.",
    levelsHeading: "Wortschatzseiten",
    wordPagesHeading: "Wortseiten-Indizes",
    wordPagesIntro:
      "Durchsuchen Sie die Indizes kanonischer Wort-URLs für jede Sprache über kleinere paginierte Seiten.",
    wordPagesLinkLabel: (languageName) => `${languageName} Wortseiten`,
    levelTestsHeading: "Niveau-Test-Seiten",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${languageName} ${level} ${practiceLabel}`,
    levelTestLabel: (languageName, levelTestLabel) => `${languageName} ${levelTestLabel}`,
  },
  it: {
    title: "Pagine",
    intro: "Consulta tutte le pagine di pratica del vocabolario e i test di livello disponibili in un unico posto.",
    levelsHeading: "Pagine di pratica del vocabolario",
    wordPagesHeading: "Indici delle pagine di parole",
    wordPagesIntro:
      "Consulta gli indici degli URL canonici delle parole di ogni lingua, suddivisi in pagine più piccole e paginate.",
    wordPagesLinkLabel: (languageName) => `Pagine delle parole ${languageName.toLowerCase()}`,
    levelTestsHeading: "Pagine del test di livello",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${practiceLabel} di ${languageName.toLowerCase()} ${level}`,
    levelTestLabel: (languageName, levelTestLabel) =>
      `${levelTestLabel} di ${languageName.toLowerCase()}`,
  },
  pt: {
    title: "Páginas",
    intro: "Consulte todas as páginas de prática de vocabulário e os testes de nível disponíveis em um só lugar.",
    levelsHeading: "Páginas de prática de vocabulário",
    wordPagesHeading: "Índices de páginas de palavras",
    wordPagesIntro:
      "Consulte os índices de URLs canônicas de palavras de cada idioma em páginas menores e paginadas.",
    wordPagesLinkLabel: (languageName) => `Páginas de palavras em ${languageName.toLowerCase()}`,
    levelTestsHeading: "Páginas de teste de nível",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${practiceLabel} de ${languageName.toLowerCase()} ${level}`,
    levelTestLabel: (languageName, levelTestLabel) =>
      `${levelTestLabel} de ${languageName.toLowerCase()}`,
  },
  ru: {
    title: "Страницы",
    intro: "Здесь собраны все страницы для практики словарного запаса и доступные тесты уровня.",
    levelsHeading: "Страницы практики словарного запаса",
    wordPagesHeading: "Индексы страниц слов",
    wordPagesIntro:
      "Просматривайте индексы канонических URL слов для каждого языка на небольших страницах с пагинацией.",
    wordPagesLinkLabel: (languageName) => `Страницы слов: ${languageName.toLowerCase()}`,
    levelTestsHeading: "Страницы тестов уровня",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${practiceLabel} ${languageName.toLowerCase()} ${level}`,
    levelTestLabel: (languageName, levelTestLabel) =>
      `${levelTestLabel}: ${languageName.toLowerCase()}`,
  },
};

export function SeoHubPage({ uiLang }: SeoHubPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const { t, uiLanguage } = useLanguage();
  const contentUiLang = uiLanguage;
  const copy = SEO_HUB_COPY[contentUiLang] ?? SEO_HUB_COPY.en;
  const vocabularyPracticeLabel = t("home.headline");
  const levelTestLabel = t("header.levelTest");

  const groupedVocabularyPages = useMemo(
    () =>
      SUPPORTED_TARGET_LANGUAGES.map((targetLanguage) => {
        const displayName = t(`languageNames.${TARGET_LANGUAGE_TO_UI_CODE[targetLanguage]}`);

        const levelLinks = SUPPORTED_LEVELS.map((level) => {
          const href = buildLocalizedVocabularyPath(contentUiLang, targetLanguage, level);
          const label = copy.vocabularyLinkLabel(
            displayName,
            level.toUpperCase(),
            vocabularyPracticeLabel,
          );

          return {
            href,
            label,
            level,
          };
        }).filter((item) => Boolean(item.href));

        return {
          targetLanguage,
          displayName,
          levelLinks: [
            ...levelLinks,
            {
              href: getVerbListPath(targetLanguage, contentUiLang),
              label: getVerbListTitle(targetLanguage, contentUiLang),
              level: "verbs",
            },
          ],
        };
      }),
    [contentUiLang, copy, t, vocabularyPracticeLabel],
  );

  const levelTestLinks = useMemo(
    () =>
      groupedVocabularyPages
        .map((group) => ({
          href: getLevelTestSeoPath(contentUiLang, group.targetLanguage as TargetLanguageSlug),
          label: copy.levelTestLabel(group.displayName, levelTestLabel),
          targetLanguage: group.targetLanguage,
        }))
        .filter((item) => Boolean(item.href)),
    [contentUiLang, copy, groupedVocabularyPages, levelTestLabel],
  );

  const wordPageLinks = useMemo(
    () =>
      SUPPORTED_TARGET_LANGUAGES.map((targetLanguage) => ({
        href: getWordSeoHubSummaryPath(contentUiLang, targetLanguage),
        label: copy.wordPagesLinkLabel(t(`languageNames.${TARGET_LANGUAGE_TO_UI_CODE[targetLanguage]}`)),
        targetLanguage,
      })),
    [contentUiLang, copy, t],
  );

  const seoMetadata = buildSeoHubMetadata({
    uiLang,
    pathname: location.pathname,
    siteOrigin,
  });

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      {seoMetadata ? <SEOHead metadata={seoMetadata} /> : null}
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h1 className="text-3xl text-foreground md:text-4xl">{copy.title}</h1>
          <p className="mt-3 text-base text-muted-foreground">{copy.intro}</p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{copy.levelsHeading}</h2>
          <div className="mt-5 space-y-6">
            {groupedVocabularyPages.map((group) => (
              <section key={group.targetLanguage}>
                <h3 className="text-xl text-foreground">{group.displayName}</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5">
                  {group.levelLinks.map((item) => (
                    <li key={item.level}>
                      <Link className="text-primary transition hover:underline" to={item.href ?? "/"}>
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{copy.wordPagesHeading}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            {wordPageLinks.map((item) => (
              <li key={item.targetLanguage}>
                <Link className="text-primary transition hover:underline" to={item.href}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{copy.levelTestsHeading}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            {levelTestLinks.map((item) => (
              <li key={item.targetLanguage}>
                <Link
                  className="text-primary transition hover:underline"
                  to={item.href ?? getSeoHubPath(contentUiLang)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
