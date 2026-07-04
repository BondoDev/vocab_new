import {
  SUPPORTED_UI_LANGUAGES,
  buildLocalizedVocabularyPath,
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../data/seo/slugs";
import { buildWordPath } from "../data/seo/wordSlugs";
import { getAllSeoHubPaths, getSeoHubPath } from "../data/seo/hub";
import {
  getWordSeoHubLevelPath,
  getWordSeoHubSummaryPath,
  type WordSeoHubRoute,
} from "../data/seo/wordHubRoutes";
import { getLevelTestContent, getLevelTestSeoPath } from "../data/levelTests";
import {
  ENGLISH_VERB_LIST_ITEMS,
  canLinkEnglishVerbListItem,
  getAllEnglishVerbListPaths,
  getEnglishVerbListContent,
  getEnglishVerbListPath,
} from "../data/englishVerbList";
import { getVocabularyLevelContent, type VocabularyLevelContent } from "../data/vocabularyLevels";
import type { SeoMetadata } from "./SeoContext";
import { fixMojibake } from "../utils/fixMojibake";

const LEVEL_DISPLAY: Record<Level, string> = {
  a1: "A1",
  a2: "A2",
  b1: "B1",
  b2: "B2",
  c1: "C1",
  c2: "C2",
};

export interface FaqItem {
  question: string;
  answer: string;
}

const META_TITLE_TEMPLATE: Record<
  UiLanguageCode,
  (lang: string, level: string, count: number, words: string) => string
> = {
  en: (lang, level, count, words) =>
    `${lang} ${level} Vocabulary List (CEFR) – ${count}+ ${words} & Examples`,
  es: (lang, level, count, words) =>
    `${lang} ${level} Lista de vocabulario (CEFR) – ${count}+ ${words} y Ejemplos`,
  fr: (lang, level, count, words) =>
    `${lang} ${level} Liste de vocabulaire (CEFR) – ${count}+ ${words} et Exemples`,
  de: (lang, level, count, words) =>
    `${lang} ${level} Wortliste (CEFR) – ${count}+ ${words} und Beispiele`,
  it: (lang, level, count, words) =>
    `${lang} ${level} Lista vocabolario (CEFR) – ${count}+ ${words} ed Esempi`,
  pt: (lang, level, count, words) =>
    `${lang} ${level} Lista de vocabulário (CEFR) – ${count}+ ${words} e Exemplos`,
  ru: (lang, level, count, words) =>
    `${lang} ${level} Список слов (CEFR) – ${count}+ ${words} и Примеры`,
};

const META_DESC_TEMPLATE: Record<
  UiLanguageCode,
  (lang: string, level: string, count: number, words: string, benefit: string) => string
> = {
  en: (lang, level, count, words, benefit) =>
    `Practice ${count}+ ${lang} ${level} ${words} with CEFR-aligned exercises. ${benefit} Start free today.`,
  es: (lang, level, count, words, benefit) =>
    `Practica más de ${count} ${words} de ${lang} ${level} con ejercicios CEFR. ${benefit} Empieza gratis hoy.`,
  fr: (lang, level, count, words, benefit) =>
    `Pratiquez ${count}+ ${words} de ${lang} ${level} avec des exercices CEFR. ${benefit} Commencez gratuitement.`,
  de: (lang, level, count, words, benefit) =>
    `Übe ${count}+ ${lang} ${level} ${words} mit CEFR-Übungen. ${benefit} Jetzt kostenlos starten.`,
  it: (lang, level, count, words, benefit) =>
    `Pratica ${count}+ ${words} di ${lang} ${level} con esercizi CEFR. ${benefit} Inizia gratis oggi.`,
  pt: (lang, level, count, words, benefit) =>
    `Pratique ${count}+ ${words} de ${lang} ${level} com exercícios CEFR. ${benefit} Comece grátis hoje.`,
  ru: (lang, level, count, words, benefit) =>
    `Практикуйте ${count}+ ${words} ${lang} ${level} с упражнениями CEFR. ${benefit} Начните бесплатно.`,
};

const FAQ_SECTION_HEADING: Record<UiLanguageCode, string> = {
  en: "Frequently Asked Questions",
  es: "Preguntas frecuentes",
  fr: "Questions fréquemment posées",
  de: "Häufig gestellte Fragen",
  it: "Domande frequenti",
  pt: "Perguntas frequentes",
  ru: "Часто задаваемые вопросы",
};

const FAQ_QUESTION_TEMPLATES: Record<
  UiLanguageCode,
  {
    whatVocab: (lang: string, level: string) => string;
    howManyWords: (lang: string, level: string) => string;
    whatTopics: (lang: string, level: string) => string;
  }
> = {
  en: {
    whatVocab: (lang, level) => `What vocabulary is included in the ${lang} ${level} word list?`,
    howManyWords: (lang, level) => `How many ${lang} ${level} words should I know?`,
    whatTopics: (lang, level) => `What topics does the ${lang} ${level} vocabulary list cover?`,
  },
  es: {
    whatVocab: (lang, level) => `¿Qué vocabulario incluye la lista de palabras ${lang} ${level}?`,
    howManyWords: (lang, level) => `¿Cuántas palabras ${lang} ${level} debo conocer?`,
    whatTopics: (lang, level) => `¿Qué temas cubre la lista de vocabulario ${lang} ${level}?`,
  },
  fr: {
    whatVocab: (lang, level) =>
      `Quel vocabulaire est inclus dans la liste de mots ${lang} ${level} ?`,
    howManyWords: (lang, level) => `Combien de mots ${lang} ${level} dois-je connaître ?`,
    whatTopics: (lang, level) =>
      `Quels sujets couvre la liste de vocabulaire ${lang} ${level} ?`,
  },
  de: {
    whatVocab: (lang, level) =>
      `Welches Vokabular ist in der ${lang} ${level} Wortliste enthalten?`,
    howManyWords: (lang, level) => `Wie viele ${lang} ${level} Wörter sollte ich kennen?`,
    whatTopics: (lang, level) => `Welche Themen deckt die ${lang} ${level} Vokabelliste ab?`,
  },
  it: {
    whatVocab: (lang, level) =>
      `Quale vocabolario è incluso nell'elenco di parole ${lang} ${level}?`,
    howManyWords: (lang, level) => `Quante parole ${lang} ${level} dovrei conoscere?`,
    whatTopics: (lang, level) =>
      `Quali argomenti copre l'elenco di vocabolario ${lang} ${level}?`,
  },
  pt: {
    whatVocab: (lang, level) =>
      `Qual vocabulário está incluído na lista de palavras ${lang} ${level}?`,
    howManyWords: (lang, level) => `Quantas palavras ${lang} ${level} devo saber?`,
    whatTopics: (lang, level) => `Quais tópicos a lista de vocabulário ${lang} ${level} cobre?`,
  },
  ru: {
    whatVocab: (lang, level) => `Какой словарный запас включён в список слов ${lang} ${level}?`,
    howManyWords: (lang, level) => `Сколько слов ${lang} ${level} мне нужно знать?`,
    whatTopics: (lang, level) => `Какие темы охватывает список слов ${lang} ${level}?`,
  },
};

export function buildVocabularyFaqSection(
  uiLang: UiLanguageCode,
  languageName: string,
  levelDisplay: string,
  levelContent: VocabularyLevelContent,
  wordsUnit: string,
): { heading: string; items: FaqItem[] } {
  const templates = FAQ_QUESTION_TEMPLATES[uiLang] ?? FAQ_QUESTION_TEMPLATES.en;
  const topics = levelContent.vocabularyScope.groups
    ? levelContent.vocabularyScope.groups.flatMap((g) => g.items)
    : levelContent.vocabularyScope.topics;

  return {
    heading: FAQ_SECTION_HEADING[uiLang] ?? FAQ_SECTION_HEADING.en,
    items: [
      {
        question: templates.whatVocab(languageName, levelDisplay),
        answer: levelContent.levelExplanation.paragraph,
      },
      {
        question: templates.howManyWords(languageName, levelDisplay),
        answer: `${levelContent.wordCount.text} ${levelContent.wordCount.value}+ ${wordsUnit}.`,
      },
      {
        question: templates.whatTopics(languageName, levelDisplay),
        answer: topics.join(", ") + ".",
      },
    ],
  };
}

export function buildEnglishVerbListSeoMetadata({
  uiLang,
  pathname,
  siteOrigin,
}: {
  uiLang: UiLanguageCode;
  pathname: string;
  siteOrigin: string;
}): SeoMetadata {
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;
  const content = getEnglishVerbListContent(uiLang);
  const title = sanitizeMetadataText(content.metaTitle);
  const description = sanitizeMetadataText(content.metaDescription);
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        inLanguage: uiLang,
        mainEntity: { "@id": `${canonical}#verb-list` },
        breadcrumb: { "@id": `${canonical}#breadcrumb` },
      },
      {
        "@type": "ItemList",
        "@id": `${canonical}#verb-list`,
        name: sanitizeMetadataText(content.title),
        numberOfItems: ENGLISH_VERB_LIST_ITEMS.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: ENGLISH_VERB_LIST_ITEMS.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: sanitizeMetadataText(item.verb),
          ...(canLinkEnglishVerbListItem(item.id)
            ? { url: `${origin}${buildWordPath(uiLang, "english", item.verb, item.id)}` }
            : {}),
        })),
      },
      {
        "@type": "FAQPage",
        "@id": `${canonical}#faq`,
        mainEntity: content.faq.map((item) => ({
          "@type": "Question",
          name: sanitizeMetadataText(item.question),
          acceptedAnswer: {
            "@type": "Answer",
            text: sanitizeMetadataText(item.answer),
          },
        })),
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
          {
            "@type": "ListItem",
            position: 2,
            name: sanitizeMetadataText(content.title),
            item: canonical,
          },
        ],
      },
    ],
  });

  return {
    title,
    description,
    canonical,
    alternates: [
      ...SUPPORTED_UI_LANGUAGES.map((lang) => ({
        hreflang: lang,
        href: `${origin}${getEnglishVerbListPath(lang)}`,
      })),
      {
        hreflang: "x-default",
        href: `${origin}${getAllEnglishVerbListPaths()[0]}`,
      },
    ],
    jsonLd,
  };
}

const WORDS_UNIT_BY_UI_LANG: Record<UiLanguageCode, string> = {
  en: "words",
  es: "palabras",
  de: "Wörter",
  fr: "mots",
  it: "parole",
  pt: "palavras",
  ru: "слов",
};

const SEO_HUB_METADATA: Record<
  UiLanguageCode,
  {
    title: string;
    description: string;
  }
> = {
  en: {
    title: "SEO Pages - Vocabulary Practice and Level Tests",
    description: "Browse all vocabulary practice pages and available language level tests in one place.",
  },
  es: {
    title: "Páginas SEO - Práctica de vocabulario y tests de nivel",
    description: "Consulta todas las páginas de práctica de vocabulario y los tests de nivel disponibles en un solo lugar.",
  },
  fr: {
    title: "Pages SEO - Pratique du vocabulaire et tests de niveau",
    description: "Consultez toutes les pages de pratique du vocabulaire et les tests de niveau disponibles au même endroit.",
  },
  de: {
    title: "SEO-Seiten - Wortschatz und Niveau-Tests",
    description: "Finden Sie alle Wortschatzseiten und verfügbaren Niveau-Tests an einem Ort.",
  },
  it: {
    title: "Pagine SEO - Pratica del vocabolario e test di livello",
    description: "Consulta tutte le pagine di pratica del vocabolario e i test di livello disponibili in un unico posto.",
  },
  pt: {
    title: "Páginas SEO - Prática de vocabulário e testes de nível",
    description: "Consulte todas as páginas de prática de vocabulário e os testes de nível disponíveis em um só lugar.",
  },
  ru: {
    title: "SEO-страницы - Практика словарного запаса и тесты уровня",
    description: "Здесь собраны все страницы для практики словарного запаса и доступные тесты уровня.",
  },
};

const WORD_SEO_HUB_METADATA: Record<
  UiLanguageCode,
  {
    summaryTitle: string;
    summaryDescription: string;
    levelTitle: (level: string, page: number) => string;
    levelDescription: (level: string, page: number) => string;
  }
> = {
  en: {
    summaryTitle: "English Word SEO Pages - Browse Canonical Word URLs",
    summaryDescription:
      "Browse paginated index pages that link to all canonical English word SEO URLs on FluentStellar.",
    levelTitle: (level, page) =>
      page > 1 ? `English ${level} Word SEO Pages - Page ${page}` : `English ${level} Word SEO Pages`,
    levelDescription: (level, page) =>
      page > 1
        ? `Browse page ${page} of the canonical English ${level} word SEO URL index.`
        : `Browse the canonical English ${level} word SEO URL index.`,
  },
  es: {
    summaryTitle: "Paginas SEO de palabras en ingles",
    summaryDescription:
      "Consulta paginas indexadas y paginadas que enlazan a todas las URLs canonicas de palabras en ingles en FluentStellar.",
    levelTitle: (level, page) =>
      page > 1 ? `Paginas SEO de palabras en ingles ${level} - Pagina ${page}` : `Paginas SEO de palabras en ingles ${level}`,
    levelDescription: (level, page) =>
      page > 1
        ? `Consulta la pagina ${page} del indice canonico de URLs de palabras en ingles ${level}.`
        : `Consulta el indice canonico de URLs de palabras en ingles ${level}.`,
  },
  fr: {
    summaryTitle: "Pages SEO des mots anglais",
    summaryDescription:
      "Consultez des pages d'index paginees qui relient a toutes les URL canoniques des mots anglais sur FluentStellar.",
    levelTitle: (level, page) =>
      page > 1 ? `Pages SEO des mots anglais ${level} - Page ${page}` : `Pages SEO des mots anglais ${level}`,
    levelDescription: (level, page) =>
      page > 1
        ? `Consultez la page ${page} de l'index canonique des URL de mots anglais ${level}.`
        : `Consultez l'index canonique des URL de mots anglais ${level}.`,
  },
  de: {
    summaryTitle: "SEO-Seiten fur englische Worter",
    summaryDescription:
      "Durchsuchen Sie paginierte Indexseiten mit Links zu allen kanonischen englischen Wort-SEO-URLs auf FluentStellar.",
    levelTitle: (level, page) =>
      page > 1 ? `SEO-Seiten fur englische Worter ${level} - Seite ${page}` : `SEO-Seiten fur englische Worter ${level}`,
    levelDescription: (level, page) =>
      page > 1
        ? `Durchsuchen Sie Seite ${page} des kanonischen URL-Index fur englische Wortseiten ${level}.`
        : `Durchsuchen Sie den kanonischen URL-Index fur englische Wortseiten ${level}.`,
  },
  it: {
    summaryTitle: "Pagine SEO delle parole inglesi",
    summaryDescription:
      "Consulta pagine indice paginate che collegano a tutti gli URL canonici delle parole inglesi su FluentStellar.",
    levelTitle: (level, page) =>
      page > 1 ? `Pagine SEO delle parole inglesi ${level} - Pagina ${page}` : `Pagine SEO delle parole inglesi ${level}`,
    levelDescription: (level, page) =>
      page > 1
        ? `Consulta la pagina ${page} dell'indice canonico degli URL delle parole inglesi ${level}.`
        : `Consulta l'indice canonico degli URL delle parole inglesi ${level}.`,
  },
  pt: {
    summaryTitle: "Paginas SEO de palavras em ingles",
    summaryDescription:
      "Consulte paginas de indice paginadas que ligam para todas as URLs canonicas de palavras em ingles no FluentStellar.",
    levelTitle: (level, page) =>
      page > 1 ? `Paginas SEO de palavras em ingles ${level} - Pagina ${page}` : `Paginas SEO de palavras em ingles ${level}`,
    levelDescription: (level, page) =>
      page > 1
        ? `Consulte a pagina ${page} do indice canonico de URLs de palavras em ingles ${level}.`
        : `Consulte o indice canonico de URLs de palavras em ingles ${level}.`,
  },
  ru: {
    summaryTitle: "SEO-stranicy angliiskih slov",
    summaryDescription:
      "Просматривайте постраничные индексные страницы со ссылками на все канонические URL английских слов на FluentStellar.",
    levelTitle: (level, page) =>
      page > 1 ? `SEO-stranicy angliiskih slov ${level} - stranica ${page}` : `SEO-stranicy angliiskih slov ${level}`,
    levelDescription: (level, page) =>
      page > 1
        ? `Просматривайте страницу ${page} канонического индекса URL английских слов уровня ${level}.`
        : `Просматривайте канонический индекс URL английских слов уровня ${level}.`,
  },
};

function normalizeOrigin(siteOrigin: string): string {
  return siteOrigin.endsWith("/") ? siteOrigin.slice(0, -1) : siteOrigin;
}

function sanitizeMetadataText(value: string): string {
  return fixMojibake(value);
}

/**
 * Shared @graph assembly (WebPage + BreadcrumbList + FAQPage + optional ItemList) for
 * vocabulary-level pages. Used by both `buildVocabularySeoMetadata` and
 * `DevSeoCefrPlaceholderPage`, which currently serves the populated CEFR levels and
 * builds its own SeoMetadata via `seoMetadataOverride` rather than calling
 * `buildVocabularySeoMetadata` directly.
 */
export function buildVocabularyJsonLdGraph({
  uiLang,
  targetLanguage,
  canonical,
  origin,
  title,
  description,
  breadcrumbLabel,
  faqItems,
  browsePreviewWords,
}: {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  canonical: string;
  origin: string;
  title: string;
  description: string;
  breadcrumbLabel: string;
  faqItems: ReadonlyArray<FaqItem>;
  browsePreviewWords?: ReadonlyArray<{ concept_id: string; word_lemma: string }>;
}): string {
  const sanitizedBreadcrumbLabel = sanitizeMetadataText(breadcrumbLabel);

  const faqNode = {
    "@type": "FAQPage",
    "@id": `${canonical}#faq`,
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  const breadcrumbNode = {
    "@type": "BreadcrumbList",
    "@id": `${canonical}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: sanitizedBreadcrumbLabel, item: canonical },
    ],
  };

  const hasItemList = browsePreviewWords && browsePreviewWords.length > 0;

  const webPageNode = {
    "@type": "WebPage",
    "@id": `${canonical}#webpage`,
    url: canonical,
    name: title,
    description,
    inLanguage: uiLang,
    mainEntity: { "@id": hasItemList ? `${canonical}#word-list` : `${canonical}#faq` },
    breadcrumb: { "@id": `${canonical}#breadcrumb` },
  };

  const graph: object[] = [webPageNode];

  if (hasItemList) {
    graph.push({
      "@type": "ItemList",
      "@id": `${canonical}#word-list`,
      name: sanitizedBreadcrumbLabel,
      numberOfItems: browsePreviewWords!.length,
      itemListOrder: "https://schema.org/ItemListOrderAscending",
      itemListElement: browsePreviewWords!.map((word, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: sanitizeMetadataText(word.word_lemma),
        url: `${origin}${buildWordPath(uiLang, targetLanguage, word.word_lemma, word.concept_id)}`,
      })),
    });
  }

  graph.push(faqNode, breadcrumbNode);

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

export function buildVocabularySeoMetadata({
  uiLang,
  targetLanguage,
  level,
  pathname,
  siteOrigin,
  browsePreviewWords,
}: {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: Level;
  pathname: string;
  siteOrigin: string;
  browsePreviewWords?: ReadonlyArray<{ concept_id: string; word_lemma: string }>;
}): SeoMetadata | null {
  const contentBundle = getVocabularyLevelContent(uiLang, targetLanguage, level);
  if (!contentBundle) {
    return null;
  }

  const { file, levelContent } = contentBundle;
  const levelDisplay = LEVEL_DISPLAY[level];
  const wordsUnit = WORDS_UNIT_BY_UI_LANG[uiLang] ?? WORDS_UNIT_BY_UI_LANG.en;
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;
  const languageName = file.targetLanguageDisplayName;
  const benefit = levelContent.levelExplanation.bullets[0] ?? "";
  const titleTemplate = META_TITLE_TEMPLATE[uiLang] ?? META_TITLE_TEMPLATE.en;
  const descTemplate = META_DESC_TEMPLATE[uiLang] ?? META_DESC_TEMPLATE.en;

  const title = sanitizeMetadataText(
    levelContent.metaTitle ??
    titleTemplate(languageName, levelDisplay, levelContent.wordCount.value, wordsUnit),
  );
  const description = sanitizeMetadataText(
    levelContent.metaDescription ??
    descTemplate(languageName, levelDisplay, levelContent.wordCount.value, wordsUnit, benefit),
  );

  const faqSection = buildVocabularyFaqSection(uiLang, languageName, levelDisplay, levelContent, wordsUnit);
  const breadcrumbLabel = `${languageName} ${levelDisplay} Vocabulary`;

  const jsonLd = buildVocabularyJsonLdGraph({
    uiLang,
    targetLanguage,
    canonical,
    origin,
    title,
    description,
    breadcrumbLabel,
    faqItems: faqSection.items,
    browsePreviewWords,
  });

  return {
    title,
    description,
    canonical,
    jsonLd,
    alternates: [
      ...SUPPORTED_UI_LANGUAGES.flatMap((lang) => {
        const localizedPath = buildLocalizedVocabularyPath(lang, targetLanguage, level);

        if (!localizedPath) {
          return [];
        }

        return [
          {
            hreflang: lang,
            href: `${origin}${localizedPath}`,
          },
        ];
      }),
      {
        hreflang: "x-default",
        href: `${origin}${buildLocalizedVocabularyPath("en", targetLanguage, level) ?? "/"}`,
      },
    ],
  };
}

export function buildLevelTestSeoMetadata({
  uiLang,
  targetLanguage,
  pathname,
  siteOrigin,
}: {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  pathname: string;
  siteOrigin: string;
}): SeoMetadata | null {
  const content = getLevelTestContent(uiLang, targetLanguage);
  if (!content) {
    return null;
  }

  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;

  return {
    title: sanitizeMetadataText(content.metaTitle),
    description: sanitizeMetadataText(content.metaDescription),
    canonical,
    alternates: [
      ...SUPPORTED_UI_LANGUAGES.flatMap((lang) => {
        const localizedPath = getLevelTestSeoPath(lang, targetLanguage);
        const localizedContent = getLevelTestContent(lang, targetLanguage);

        if (!localizedPath || !localizedContent) {
          return [];
        }

        return [
          {
            hreflang: lang,
            href: `${origin}${localizedPath}`,
          },
        ];
      }),
      {
        hreflang: "x-default",
        href: `${origin}${getLevelTestSeoPath("en", targetLanguage) ?? pathname}`,
      },
    ],
  };
}

export function buildSeoHubMetadata({
  uiLang,
  pathname,
  siteOrigin,
}: {
  uiLang: UiLanguageCode;
  pathname: string;
  siteOrigin: string;
}): SeoMetadata {
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;
  const copy = SEO_HUB_METADATA[uiLang] ?? SEO_HUB_METADATA.en;

  return {
    title: sanitizeMetadataText(copy.title),
    description: sanitizeMetadataText(copy.description),
    canonical,
    alternates: [
      ...SUPPORTED_UI_LANGUAGES.map((lang) => ({
        hreflang: lang,
        href: `${origin}${getSeoHubPath(lang)}`,
      })),
      {
        hreflang: "x-default",
        href: `${origin}${getAllSeoHubPaths()[0]}`,
      },
    ],
  };
}

// ─── Word SEO page metadata ───────────────────────────────────────────────────

export function buildWordSeoHubMetadata({
  uiLang,
  route,
  pathname,
  siteOrigin,
}: {
  uiLang: UiLanguageCode;
  route: WordSeoHubRoute;
  pathname: string;
  siteOrigin: string;
}): SeoMetadata {
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;
  const copy = WORD_SEO_HUB_METADATA[uiLang] ?? WORD_SEO_HUB_METADATA.en;

  if (route.kind === "summary") {
    return {
      title: sanitizeMetadataText(copy.summaryTitle),
      description: sanitizeMetadataText(copy.summaryDescription),
      canonical,
      alternates: [
        ...SUPPORTED_UI_LANGUAGES.map((lang) => ({
          hreflang: lang,
          href: `${origin}${getWordSeoHubSummaryPath(lang)}`,
        })),
        {
          hreflang: "x-default",
          href: `${origin}${getWordSeoHubSummaryPath("en")}`,
        },
      ],
    };
  }

  const levelLabel = route.level.toUpperCase();
  return {
    title: sanitizeMetadataText(copy.levelTitle(levelLabel, route.page)),
    description: sanitizeMetadataText(copy.levelDescription(levelLabel, route.page)),
    canonical,
    alternates: [
      ...SUPPORTED_UI_LANGUAGES.map((lang) => ({
        hreflang: lang,
        href: `${origin}${getWordSeoHubLevelPath(lang, route.level, route.page)}`,
      })),
      {
        hreflang: "x-default",
        href: `${origin}${getWordSeoHubLevelPath("en", route.level, route.page)}`,
      },
    ],
  };
}

const WORD_META_TITLE: Record<UiLanguageCode, (lang: string, word: string) => string> = {
  en: (lang, word) => `${lang} Word "${word}" Meaning – Definition and Example`,
  es: (lang, word) => `Palabra ${lang} "${word}" – Significado y Ejemplo`,
  fr: (lang, word) => `Mot ${lang} "${word}" – Signification et Exemple`,
  de: (lang, word) => `${lang}es Wort "${word}" – Bedeutung und Beispiel`,
  it: (lang, word) => `Parola ${lang} "${word}" – Significato ed Esempio`,
  pt: (lang, word) => `Palavra ${lang} "${word}" – Significado e Exemplo`,
  ru: (lang, word) => `Слово "${word}" на ${lang} – значение и пример`,
};

const WORD_META_DESC: Record<UiLanguageCode, (lang: string, word: string) => string> = {
  en: (lang, word) =>
    `Learn how to use "${word}" with simple examples, synonyms, CEFR level, and quick practice. Build real English vocabulary for daily speaking and writing.`,
  es: (lang, word) =>
    `Aprende el significado de la palabra ${lang} "${word}", ve oraciones de ejemplo y practica este vocabulario con ejercicios interactivos.`,
  fr: (lang, word) =>
    `Apprenez le sens du mot ${lang} "${word}", découvrez des exemples de phrases et pratiquez ce vocabulaire avec des exercices interactifs.`,
  de: (lang, word) =>
    `Lerne die Bedeutung des ${lang}en Wortes "${word}", sieh Beispielsätze und übe dieses Vokabel mit interaktiven Übungen.`,
  it: (lang, word) =>
    `Impara il significato della parola ${lang} "${word}", vedi frasi di esempio e pratica questo vocabolario con esercizi interattivi.`,
  pt: (lang, word) =>
    `Aprenda o significado da palavra ${lang} "${word}", veja frases de exemplo e pratique este vocabulário com exercícios interativos.`,
  ru: (lang, word) =>
    `Узнайте значение слова "${word}" на ${lang}, посмотрите примеры предложений и потренируйтесь с интерактивными упражнениями.`,
};

export interface WordSeoMetadataParams {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  targetLanguageDisplayName: string;
  wordLemma: string;
  conceptId: string;
  definition: string;
  wordType: string;
  cefrLevel: string;
  pathname: string;
  siteOrigin: string;
  browsePage?: number;
}

export function buildWordSeoMetadata(params: WordSeoMetadataParams): SeoMetadata {
  const {
    uiLang,
    targetLanguage,
    targetLanguageDisplayName,
    wordLemma,
    conceptId,
    definition,
    wordType,
    cefrLevel,
    pathname,
    siteOrigin,
    browsePage = 1,
  } = params;
  const origin = siteOrigin.replace(/\/$/, "");
  const baseTitle = (WORD_META_TITLE[uiLang] ?? WORD_META_TITLE.en)(
    targetLanguageDisplayName,
    wordLemma,
  );
  const titleSuffix = browsePage > 1 ? ` - Browse Page ${browsePage}` : "";
  const title = sanitizeMetadataText(`${baseTitle} (${cefrLevel} ${wordType})${titleSuffix}`);
  const baseDescription = (WORD_META_DESC[uiLang] ?? WORD_META_DESC.en)(
    targetLanguageDisplayName,
    wordLemma,
  );
  const trimmedDefinition = definition.trim().replace(/\s+/g, " ");
  const descriptionPrefix = trimmedDefinition
    ? `${trimmedDefinition} `
    : "";
  const paginatedDescriptionPrefix =
    browsePage > 1 ? `Browse page ${browsePage} of more ${cefrLevel} ${targetLanguageDisplayName} words. ` : "";
  const description = sanitizeMetadataText(
    `${paginatedDescriptionPrefix}${descriptionPrefix}${baseDescription}`.trim(),
  );
  const alternates = [
    ...SUPPORTED_UI_LANGUAGES.map((lang) => ({
      hreflang: lang,
      href: `${origin}${buildWordPath(lang, targetLanguage, wordLemma, conceptId)}`,
    })),
    {
      hreflang: "x-default",
      href: `${origin}${buildWordPath("en", targetLanguage, wordLemma, conceptId)}`,
    },
  ];

  const canonical = `${origin}${pathname}`;

  // Vocabulary-level page for this word's CEFR level — used as breadcrumb parent
  const vocabLevel = cefrLevel.toLowerCase() as Level;
  const vocabLevelPath = buildLocalizedVocabularyPath(uiLang, targetLanguage, vocabLevel);
  const vocabLevelUrl = vocabLevelPath ? `${origin}${vocabLevelPath}` : null;
  const vocabLevelLabel = sanitizeMetadataText(
    `${targetLanguageDisplayName} ${cefrLevel} Vocabulary`,
  );

  const breadcrumbItems: object[] = [
    { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
  ];
  if (vocabLevelUrl) {
    breadcrumbItems.push({
      "@type": "ListItem",
      position: 2,
      name: vocabLevelLabel,
      item: vocabLevelUrl,
    });
  }
  breadcrumbItems.push({
    "@type": "ListItem",
    position: vocabLevelUrl ? 3 : 2,
    name: sanitizeMetadataText(wordLemma),
    item: canonical,
  });

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: title,
        description,
        inLanguage: uiLang,
        mainEntity: { "@id": `${canonical}#term` },
        breadcrumb: { "@id": `${canonical}#breadcrumb` },
      },
      {
        "@type": "DefinedTerm",
        "@id": `${canonical}#term`,
        name: sanitizeMetadataText(wordLemma),
        description,
        url: canonical,
        inDefinedTermSet: {
          "@type": "DefinedTermSet",
          name: sanitizeMetadataText(`${targetLanguageDisplayName} ${cefrLevel} Vocabulary`),
        },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: breadcrumbItems,
      },
    ],
  });

  return {
    title,
    description,
    canonical: `${origin}${pathname}`,
    alternates,
    jsonLd,
    ...(browsePage > 1 ? { robots: "noindex, follow" } : {}),
  };
}
