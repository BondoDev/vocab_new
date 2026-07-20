import type { Level, UiLanguageCode } from "../../data/seo/shared/slugs";

export const LEVEL_DISPLAY: Record<Level, string> = {
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

export const META_TITLE_TEMPLATE: Record<
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

export const META_DESC_TEMPLATE: Record<
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

export const FAQ_SECTION_HEADING: Record<UiLanguageCode, string> = {
  en: "Frequently Asked Questions",
  es: "Preguntas frecuentes",
  fr: "Questions fréquemment posées",
  de: "Häufig gestellte Fragen",
  it: "Domande frequenti",
  pt: "Perguntas frequentes",
  ru: "Часто задаваемые вопросы",
};

export const FAQ_QUESTION_TEMPLATES: Record<
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

export const WORDS_UNIT_BY_UI_LANG: Record<UiLanguageCode, string> = {
  en: "words",
  es: "palabras",
  de: "Wörter",
  fr: "mots",
  it: "parole",
  pt: "palavras",
  ru: "слов",
};

