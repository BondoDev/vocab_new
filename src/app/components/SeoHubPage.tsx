import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  SUPPORTED_LEVELS,
  SUPPORTED_TARGET_LANGUAGES,
  buildLocalizedVocabularyPath,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../data/seo/slugs";
import { getLevelTestSeoPath } from "../../data/levelTests";
import { getEnglishVerbListContent, getEnglishVerbListPath } from "../../data/englishVerbList";
import { getWordSeoHubSummaryPath } from "../../data/seo/wordHubRoutes";
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
    wordPagesLinkLabel: string;
    levelTestsHeading: string;
    vocabularyLinkLabel: (languageName: string, level: string, practiceLabel: string) => string;
    levelTestLabel: (languageName: string, levelTestLabel: string) => string;
  }
> = {
  en: {
    title: "SEO Pages",
    intro: "Browse all vocabulary practice pages and available level tests in one place.",
    levelsHeading: "Vocabulary practice pages",
    wordPagesHeading: "Word SEO page indexes",
    wordPagesIntro:
      "Open the English word index hub to browse all canonical word SEO URLs through smaller paginated pages.",
    wordPagesLinkLabel: "English word SEO pages",
    levelTestsHeading: "Level test pages",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${languageName} ${level} ${practiceLabel}`,
    levelTestLabel: (languageName, levelTestLabel) => `${languageName} ${levelTestLabel}`,
  },
  es: {
    title: "Paginas SEO",
    intro: "Consulta todas las paginas de practica de vocabulario y los tests de nivel disponibles en un solo lugar.",
    levelsHeading: "Paginas de practica de vocabulario",
    wordPagesHeading: "Indices de palabras SEO",
    wordPagesIntro:
      "Abre el hub de palabras en ingles para ver todas las URLs canonicas en paginas mas pequenas y paginadas.",
    wordPagesLinkLabel: "Paginas SEO de palabras en ingles",
    levelTestsHeading: "Paginas de test de nivel",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${practiceLabel} de ${languageName.toLowerCase()} ${level}`,
    levelTestLabel: (languageName, levelTestLabel) =>
      `${levelTestLabel} de ${languageName.toLowerCase()}`,
  },
  fr: {
    title: "Pages SEO",
    intro: "Consultez toutes les pages de pratique du vocabulaire et les tests de niveau disponibles au meme endroit.",
    levelsHeading: "Pages de pratique du vocabulaire",
    wordPagesHeading: "Index de pages SEO de mots",
    wordPagesIntro:
      "Ouvrez le hub des mots anglais pour parcourir toutes les URL canoniques sur des pages plus petites et paginees.",
    wordPagesLinkLabel: "Pages SEO des mots anglais",
    levelTestsHeading: "Pages de test de niveau",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${practiceLabel} de ${languageName.toLowerCase()} ${level}`,
    levelTestLabel: (languageName, levelTestLabel) =>
      `${levelTestLabel} de ${languageName.toLowerCase()}`,
  },
  de: {
    title: "SEO-Seiten",
    intro: "Hier finden Sie alle Wortschatzseiten und verfugbaren Niveau-Tests an einem Ort.",
    levelsHeading: "Wortschatzseiten",
    wordPagesHeading: "Wort-SEO-Indizes",
    wordPagesIntro:
      "Offnen Sie den Index fur englische Worter, um alle kanonischen Wort-URLs uber kleinere paginierte Seiten zu durchsuchen.",
    wordPagesLinkLabel: "SEO-Seiten fur englische Worter",
    levelTestsHeading: "Niveau-Test-Seiten",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${languageName} ${level} ${practiceLabel}`,
    levelTestLabel: (languageName, levelTestLabel) => `${languageName} ${levelTestLabel}`,
  },
  it: {
    title: "Pagine SEO",
    intro: "Consulta tutte le pagine di pratica del vocabolario e i test di livello disponibili in un unico posto.",
    levelsHeading: "Pagine di pratica del vocabolario",
    wordPagesHeading: "Indici delle parole SEO",
    wordPagesIntro:
      "Apri l'hub delle parole inglesi per sfogliare tutti gli URL canonici in pagine piu piccole e paginate.",
    wordPagesLinkLabel: "Pagine SEO delle parole inglesi",
    levelTestsHeading: "Pagine del test di livello",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${practiceLabel} di ${languageName.toLowerCase()} ${level}`,
    levelTestLabel: (languageName, levelTestLabel) =>
      `${levelTestLabel} di ${languageName.toLowerCase()}`,
  },
  pt: {
    title: "Paginas SEO",
    intro: "Consulte todas as paginas de pratica de vocabulario e os testes de nivel disponiveis em um so lugar.",
    levelsHeading: "Paginas de pratica de vocabulario",
    wordPagesHeading: "Indices de palavras SEO",
    wordPagesIntro:
      "Abra o hub de palavras em ingles para navegar por todas as URLs canonicas em paginas menores e paginadas.",
    wordPagesLinkLabel: "Paginas SEO de palavras em ingles",
    levelTestsHeading: "Paginas de teste de nivel",
    vocabularyLinkLabel: (languageName, level, practiceLabel) =>
      `${practiceLabel} de ${languageName.toLowerCase()} ${level}`,
    levelTestLabel: (languageName, levelTestLabel) =>
      `${levelTestLabel} de ${languageName.toLowerCase()}`,
  },
  ru: {
    title: "SEO-stranicy",
    intro: "Zdes sobrany vse stranicy dlya praktiki slovarnogo zapasa i dostupnye testy urovnya.",
    levelsHeading: "Stranicy praktiki slovarnogo zapasa",
    wordPagesHeading: "Indeksy SEO-stranic slov",
    wordPagesIntro:
      "Otkroyte hab angliiskih slov, chtoby prosmotret vse kanonicheskie URL na nebolshih stranicah s paginaciei.",
    wordPagesLinkLabel: "SEO-stranicy angliiskih slov",
    levelTestsHeading: "Stranicy testov urovnya",
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
          levelLinks:
            targetLanguage === "english"
              ? [
                  ...levelLinks,
                  {
                    href: getEnglishVerbListPath(contentUiLang),
                    label: getEnglishVerbListContent(contentUiLang).title,
                    level: "verbs",
                  },
                ]
              : levelLinks,
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
          <p className="mt-3 text-sm text-muted-foreground">{copy.wordPagesIntro}</p>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>
              <Link
                className="text-primary transition hover:underline"
                to={getWordSeoHubSummaryPath(contentUiLang)}
              >
                {copy.wordPagesLinkLabel}
              </Link>
            </li>
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
