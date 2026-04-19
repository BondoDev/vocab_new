import { useEffect, useMemo } from "react";
import { useLocation } from "react-router";
import { Link } from "react-router-dom";
import { SUPPORTED_LEVELS, SUPPORTED_TARGET_LANGUAGES, buildLocalizedVocabularyPath } from "../../data/seo/slugs";
import { getLevelTestSeoPath } from "../../data/levelTests";
import { getSeoHubPath } from "../../data/seo/hub";
import {
  getVocabularyLevelContent,
  type CefrLevelCode,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../data/vocabularyLevels";
import { buildVocabularySeoMetadata, buildVocabularyFaqSection } from "../../seo/metadata";
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

const WORD_MAP: Record<string, number> = {
  A1: 500,
  A2: 1500,
  B1: 2500,
  B2: 4000,
  C1: 8000,
  C2: 10000,
};

interface CuriosityArgs {
  language: string;
  level: string;
  words: number;
}

const CURIOSITY_TRANSLATIONS: Record<
  UiLanguageCode,
  {
    h1: (args: CuriosityArgs) => string;
    h2: (args: Pick<CuriosityArgs, "language" | "level">) => string;
    description: (args: Pick<CuriosityArgs, "level" | "words">) => string;
    cta: string;
  }
> = {
  en: {
    h1: ({ language, level, words }) =>
      `${language} ${level} Vocabulary: Mastering the ${words} Essential Words`,
    h2: ({ language, level }) => `How many words are in ${language} ${level}?`,
    description: ({ level, words }) =>
      `To reach ${level} proficiency, you need approximately ${words} words. However, simply knowing the list isn't enough—you need to master the usage and pronunciation.`,
    cta: "Start Practice",
  },
  ru: {
    h1: ({ language, level, words }) =>
      `${language} ${level}: Как освоить необходимые ${words} слов`,
    h2: ({ language, level }) => `Сколько слов в ${language} ${level}?`,
    description: ({ level, words }) =>
      `Для достижения уровня ${level} вам нужно примерно ${words} слов. Однако просто знать список недостаточно — нужно освоить употребление и произношение.`,
    cta: "Начать практику",
  },
  es: {
    h1: ({ language, level, words }) =>
      `${language} ${level}: Domina las ${words} palabras esenciales`,
    h2: ({ language, level }) => `¿Cuántas palabras tiene el ${language} ${level}?`,
    description: ({ level, words }) =>
      `Para alcanzar el nivel ${level} necesitas aproximadamente ${words} palabras. Sin embargo, no basta con conocer la lista — debes dominar el uso y la pronunciación.`,
    cta: "Comenzar práctica",
  },
  fr: {
    h1: ({ language, level, words }) =>
      `${language} ${level}: Maîtrisez les ${words} mots essentiels`,
    h2: ({ language, level }) => `Combien de mots contient le ${language} ${level} ?`,
    description: ({ level, words }) =>
      `Pour atteindre le niveau ${level}, vous avez besoin d'environ ${words} mots. Cependant, connaître la liste ne suffit pas — vous devez maîtriser l'usage et la prononciation.`,
    cta: "Commencer la pratique",
  },
  de: {
    h1: ({ language, level, words }) =>
      `${language} ${level}: Beherrschen Sie die ${words} wichtigsten Wörter`,
    h2: ({ language, level }) => `Wie viele Wörter hat ${language} ${level}?`,
    description: ({ level, words }) =>
      `Um das ${level}-Niveau zu erreichen, benötigen Sie etwa ${words} Wörter. Aber es reicht nicht, die Liste zu kennen — Sie müssen Verwendung und Aussprache meistern.`,
    cta: "Übung starten",
  },
  it: {
    h1: ({ language, level, words }) =>
      `${language} ${level}: Padroneggia le ${words} parole essenziali`,
    h2: ({ language, level }) => `Quante parole ha ${language} ${level}?`,
    description: ({ level, words }) =>
      `Per raggiungere il livello ${level}, hai bisogno di circa ${words} parole. Tuttavia, conoscere la lista non è sufficiente — devi padroneggiare l'uso e la pronuncia.`,
    cta: "Inizia la pratica",
  },
  pt: {
    h1: ({ language, level, words }) =>
      `${language} ${level}: Domine as ${words} palavras essenciais`,
    h2: ({ language, level }) => `Quantas palavras tem o ${language} ${level}?`,
    description: ({ level, words }) =>
      `Para alcançar o nível ${level}, você precisa de aproximadamente ${words} palavras. No entanto, apenas conhecer a lista não é suficiente — você precisa dominar o uso e a pronúncia.`,
    cta: "Iniciar prática",
  },
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

const CROSS_LANGUAGE_COPY: Record<
  UiLanguageCode,
  { heading: (level: string) => string; linkSuffix: string }
> = {
  en: {
    heading: (level) => `Practice ${level} vocabulary in other languages`,
    linkSuffix: "vocabulary list",
  },
  es: {
    heading: (level) => `Practica vocabulario ${level} en otros idiomas`,
    linkSuffix: "lista de vocabulario",
  },
  fr: {
    heading: (level) => `Pratiquez le vocabulaire ${level} dans d'autres langues`,
    linkSuffix: "liste de vocabulaire",
  },
  de: {
    heading: (level) => `${level} Vokabular in anderen Sprachen üben`,
    linkSuffix: "Wortliste",
  },
  it: {
    heading: (level) => `Pratica il vocabolario ${level} in altre lingue`,
    linkSuffix: "lista di vocabolario",
  },
  pt: {
    heading: (level) => `Pratique vocabulário ${level} em outros idiomas`,
    linkSuffix: "lista de vocabulário",
  },
  ru: {
    heading: (level) => `Практикуйте словарный запас ${level} на других языках`,
    linkSuffix: "список слов",
  },
};

const RELATED_LINKS_COPY: Record<
  UiLanguageCode,
  {
    heading: string;
    seoHubLabel: string;
    levelTestLabel: (languageName: string) => string;
  }
> = {
  en: {
    heading: "Related pages",
    seoHubLabel: "Browse all SEO pages",
    levelTestLabel: (languageName) => `Take the ${languageName} level test`,
  },
  es: {
    heading: "Páginas relacionadas",
    seoHubLabel: "Ver todas las páginas SEO",
    levelTestLabel: (languageName) => `Haz el test de nivel de ${languageName}`,
  },
  fr: {
    heading: "Pages associées",
    seoHubLabel: "Voir toutes les pages SEO",
    levelTestLabel: (languageName) => `Passez le test de niveau de ${languageName}`,
  },
  de: {
    heading: "Verwandte Seiten",
    seoHubLabel: "Alle SEO-Seiten ansehen",
    levelTestLabel: (languageName) => `${languageName} Niveau-Test machen`,
  },
  it: {
    heading: "Pagine correlate",
    seoHubLabel: "Vedi tutte le pagine SEO",
    levelTestLabel: (languageName) => `Fai il test di livello di ${languageName}`,
  },
  pt: {
    heading: "Páginas relacionadas",
    seoHubLabel: "Ver todas as páginas SEO",
    levelTestLabel: (languageName) => `Faça o teste de nível de ${languageName}`,
  },
  ru: {
    heading: "Связанные страницы",
    seoHubLabel: "Посмотреть все SEO-страницы",
    levelTestLabel: (languageName) => `Тест уровня ${languageName}`,
  },
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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  if (!contentBundle) {
    return null;
  }

  const { levelContent } = contentBundle;
  const levelDisplay = LEVEL_DISPLAY[level];
  const wordMapCount = WORD_MAP[levelDisplay] ?? levelContent.wordCount.value;
  const curiosityT = CURIOSITY_TRANSLATIONS[uiLang] ?? CURIOSITY_TRANSLATIONS.en;
  const seoMetadata = buildVocabularySeoMetadata({
    uiLang,
    targetLanguage,
    level,
    pathname: location.pathname,
    siteOrigin,
  });
  const ctaText = levelContent.ctaText || `Start ${levelDisplay} Practice`;
  const relatedCopy = RELATED_LINKS_COPY[uiLang] ?? RELATED_LINKS_COPY.en;
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
  const levelTestHref = getLevelTestSeoPath(uiLang, targetLanguage);
  const targetLanguageDisplayName = contentBundle.file.targetLanguageDisplayName;
  const seoHubHref = getSeoHubPath(uiLang);
  const crossLangCopy = CROSS_LANGUAGE_COPY[uiLang] ?? CROSS_LANGUAGE_COPY.en;
  const crossLanguageLinks = SUPPORTED_TARGET_LANGUAGES.filter((lang) => lang !== targetLanguage)
    .map((lang) => {
      const content = getVocabularyLevelContent(uiLang, lang, level);
      const href = buildLocalizedVocabularyPath(uiLang, lang, level);
      if (!href || !content) return null;
      return {
        lang,
        href,
        label: `${content.file.targetLanguageDisplayName} ${levelDisplay} ${crossLangCopy.linkSuffix}`,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const faqSection = buildVocabularyFaqSection(
    uiLang,
    targetLanguageDisplayName,
    levelDisplay,
    levelContent,
    wordsUnit,
  );

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      {seoMetadata ? <SEOHead metadata={seoMetadata} /> : null}
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h1 className="text-3xl text-foreground md:text-4xl">
            {curiosityT.h1({
              language: targetLanguageDisplayName,
              level: levelDisplay,
              words: wordMapCount,
            })}
          </h1>

          <div className="mt-5 rounded-xl border border-primary/15 bg-primary/5 p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-foreground">
              {curiosityT.h2({ language: targetLanguageDisplayName, level: levelDisplay })}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {curiosityT.description({ level: levelDisplay, words: wordMapCount })}
            </p>
            <button
              type="button"
              className="mt-4 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
              onClick={() => onStartPractice(targetLanguage, levelDisplay)}
            >
              {curiosityT.cta}
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {introParagraphs.map((paragraph) => (
              <p key={paragraph} className="text-base text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </div>
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

        {crossLanguageLinks.length > 0 ? (
          <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
            <h2 className="text-2xl text-foreground">
              {crossLangCopy.heading(levelDisplay)}
            </h2>
            <div className="mt-2 flex flex-wrap gap-2">
              {crossLanguageLinks.map((item) => (
                <Link
                  key={item.lang}
                  className="rounded-lg border border-primary/30 px-3 py-1.5 text-sm text-primary transition hover:bg-primary/10"
                  to={item.href}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{relatedCopy.heading}</h2>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            {levelTestHref ? (
              <li>
                <Link className="text-primary transition hover:underline" to={levelTestHref}>
                  {relatedCopy.levelTestLabel(targetLanguageDisplayName)}
                </Link>
              </li>
            ) : null}
            <li>
              <Link className="text-primary transition hover:underline" to={seoHubHref}>
                {relatedCopy.seoHubLabel}
              </Link>
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{faqSection.heading}</h2>
          <div className="mt-4 space-y-5">
            {faqSection.items.map((item) => (
              <div key={item.question}>
                <h3 className="text-base font-semibold text-foreground">{item.question}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{item.answer}</p>
              </div>
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
