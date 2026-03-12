import { useMemo } from "react";
import { useLocation } from "react-router";
import { Link } from "react-router-dom";
import { SUPPORTED_LEVELS, buildLocalizedVocabularyPath } from "../../data/seo/slugs";
import {
  getVocabularyLevelContent,
  type CefrLevelCode,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../data/vocabularyLevels";
import { buildVocabularySeoMetadata } from "../../seo/metadata";
import { SEOHead, useSeoSiteOrigin } from "../../seo/SeoContext";

interface VocabularyLevelPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: CefrLevelCode;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}

const LEVEL_DISPLAY: Record<CefrLevelCode, string> = {
  a1: "A1",
  a2: "A2",
  b1: "B1",
  b2: "B2",
  c1: "C1",
  c2: "C2",
};

const WORDS_UNIT_BY_UI_LANG: Record<UiLanguageCode, string> = {
  en: "words",
  es: "palabras",
  de: "Wörter",
  fr: "mots",
  it: "parole",
  pt: "palavras",
  ru: "слов",
};

const SAMPLE_TABLE_HEADERS_BY_UI_LANG: Record<
  UiLanguageCode,
  { word: string; meaning: string }
> = {
  en: { word: "Word", meaning: "Meaning" },
  es: { word: "Palabra", meaning: "Significado" },
  de: { word: "Wort", meaning: "Bedeutung" },
  fr: { word: "Mot", meaning: "Signification" },
  it: { word: "Parola", meaning: "Significato" },
  pt: { word: "Palavra", meaning: "Significado" },
  ru: { word: "Слово", meaning: "Значение" },
};

function buildVocabularyUrl(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: CefrLevelCode,
): string {
  return buildLocalizedVocabularyPath(uiLang, targetLanguage, level) ?? "/";
}

export function VocabularyLevelPage({
  uiLang,
  targetLanguage,
  level,
  onStartPractice,
}: VocabularyLevelPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const wordsUnit = WORDS_UNIT_BY_UI_LANG[uiLang] ?? WORDS_UNIT_BY_UI_LANG.en;
  const contentBundle = useMemo(
    () => getVocabularyLevelContent(uiLang, targetLanguage, level),
    [uiLang, targetLanguage, level],
  );

  if (!contentBundle) {
    return null;
  }

  const { levelContent } = contentBundle;
  const levelDisplay = LEVEL_DISPLAY[level];
  const seoMetadata = buildVocabularySeoMetadata({
    uiLang,
    targetLanguage,
    level,
    pathname: location.pathname,
    siteOrigin,
  });
  const ctaText = levelContent.ctaText || `Start ${levelDisplay} Practice`;
  const localizedHeaders =
    SAMPLE_TABLE_HEADERS_BY_UI_LANG[uiLang] ?? SAMPLE_TABLE_HEADERS_BY_UI_LANG.en;
  const wordHeader =
    levelContent.sampleVocabulary.columns.word === "Word"
      ? localizedHeaders.word
      : levelContent.sampleVocabulary.columns.word;
  const meaningHeader =
    levelContent.sampleVocabulary.columns.meaning === "Meaning"
      ? localizedHeaders.meaning
      : levelContent.sampleVocabulary.columns.meaning;
  const introParagraphs =
    levelContent.introParagraphs && levelContent.introParagraphs.length > 0
      ? levelContent.introParagraphs
      : [levelContent.intro];
  const internalNavigationLinks = SUPPORTED_LEVELS.filter((item) => item !== level).map(
    (nextLevel) => {
      const nextLevelContent = getVocabularyLevelContent(uiLang, targetLanguage, nextLevel);

      return {
        level: nextLevel,
        href: buildVocabularyUrl(uiLang, targetLanguage, nextLevel),
        label: nextLevelContent?.levelContent.title ?? LEVEL_DISPLAY[nextLevel],
      };
    },
  );

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      {seoMetadata ? <SEOHead metadata={seoMetadata} /> : null}
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h1 className="text-3xl text-foreground md:text-4xl">{levelContent.title}</h1>
          <div className="mt-3 space-y-3">
            {introParagraphs.map((paragraph) => (
              <p key={paragraph} className="text-base text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </div>
          <button
            type="button"
            className="mt-5 rounded-xl border border-primary/45 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/15"
            onClick={() => onStartPractice(targetLanguage, levelDisplay)}
          >
            {ctaText}
          </button>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{levelContent.levelExplanation.heading}</h2>
          <p className="mt-3 text-muted-foreground">{levelContent.levelExplanation.paragraph}</p>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-muted-foreground">
            {levelContent.levelExplanation.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{levelContent.vocabularyScope.heading}</h2>

          {levelContent.vocabularyScope.groups && levelContent.vocabularyScope.groups.length > 0 ? (
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              {levelContent.vocabularyScope.groups.map((group) => (
                <div key={group.heading}>
                  <h3 className="text-lg text-foreground">{group.heading}</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                    {group.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 grid gap-6 md:grid-cols-2">
              <div>
                <h3 className="text-lg text-foreground">Topics</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {levelContent.vocabularyScope.topics.map((topic) => (
                    <li key={topic}>{topic}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-lg text-foreground">Word Types</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                  {levelContent.vocabularyScope.wordTypes.map((type) => (
                    <li key={type}>{type}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{levelContent.wordCount.heading}</h2>
          <p className="mt-3 text-muted-foreground">{levelContent.wordCount.text}</p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {levelContent.wordCount.value.toLocaleString(uiLang)} {wordsUnit}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{levelContent.sampleVocabulary.heading}</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <th className="border-b border-border py-2 pr-4 text-sm text-foreground">
                    {wordHeader}
                  </th>
                  <th className="border-b border-border py-2 text-sm text-foreground">
                    {meaningHeader}
                  </th>
                </tr>
              </thead>
              <tbody>
                {levelContent.sampleVocabulary.rows.slice(0, 10).map((row) => (
                  <tr key={`${row.word}-${row.meaning}`}>
                    <td className="border-b border-border/70 py-2 pr-4 text-sm text-foreground">
                      {row.word}
                    </td>
                    <td className="border-b border-border/70 py-2 text-sm text-muted-foreground">
                      {row.meaning}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{levelContent.internalNavigation.heading}</h2>

          <div className="mt-2 flex flex-wrap gap-2">
            {internalNavigationLinks.map((item) => (
              <Link
                key={item.level}
                className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm text-primary transition hover:bg-primary/10"
                to={item.href}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="pb-4">
          {levelContent.bottomCta?.heading ? (
            <h2 className="text-2xl text-foreground">{levelContent.bottomCta.heading}</h2>
          ) : null}
          {levelContent.bottomCta?.text ? (
            <p className="mt-3 text-muted-foreground">{levelContent.bottomCta.text}</p>
          ) : null}
          <button
            type="button"
            className="mt-4 rounded-xl border border-primary/45 bg-primary/10 px-5 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/15"
            onClick={() => onStartPractice(targetLanguage, levelDisplay)}
          >
            {ctaText}
          </button>
        </section>
      </div>
    </main>
  );
}
