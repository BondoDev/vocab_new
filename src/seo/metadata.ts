import {
  SUPPORTED_UI_LANGUAGES,
  buildLocalizedVocabularyPath,
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../data/seo/slugs";
import { getAllSeoHubPaths, getSeoHubPath } from "../data/seo/hub";
import { getLevelTestContent, getLevelTestSeoPath } from "../data/levelTests";
import { getVocabularyLevelContent, type VocabularyLevelContent } from "../data/vocabularyLevels";
import type { SeoMetadata } from "./SeoContext";

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

function normalizeOrigin(siteOrigin: string): string {
  return siteOrigin.endsWith("/") ? siteOrigin.slice(0, -1) : siteOrigin;
}

export function buildVocabularySeoMetadata({
  uiLang,
  targetLanguage,
  level,
  pathname,
  siteOrigin,
}: {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: Level;
  pathname: string;
  siteOrigin: string;
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
  const faqSection = buildVocabularyFaqSection(uiLang, languageName, levelDisplay, levelContent, wordsUnit);
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqSection.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  });

  return {
    title:
      levelContent.metaTitle ??
      titleTemplate(languageName, levelDisplay, levelContent.wordCount.value, wordsUnit),
    description:
      levelContent.metaDescription ??
      descTemplate(languageName, levelDisplay, levelContent.wordCount.value, wordsUnit, benefit),
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
    title: content.metaTitle,
    description: content.metaDescription,
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
    title: copy.title,
    description: copy.description,
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
