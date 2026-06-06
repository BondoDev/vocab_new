import type { UiLanguageCode } from "../vocabularyLevels";

export const LEVEL_DISPLAY = {
  a1: "A1",
  a2: "A2",
  b1: "B1",
  b2: "B2",
  c1: "C1",
  c2: "C2",
} as const;

export const BROWSE_WORDS_COPY: Record<
  UiLanguageCode,
  {
    heading: (args: { level: string; language: string }) => string;
    description: string;
    searchPlaceholder: (level: string) => string;
  }
> = {
  en: {
    heading: ({ level, language }) => `Browse ${level} ${language} Words`,
    description:
      "Explore common vocabulary words for this level. Click a word to learn its meaning, see example sentences, and practice it with exercises.",
    searchPlaceholder: (level) => `Search ${level} words...`,
  },
  es: {
    heading: ({ level, language }) => `Explorar palabras ${level} de ${language}`,
    description:
      "Explora las palabras de vocabulario mas comunes para este nivel. Haz clic en una palabra para ver su significado, ejemplos de oraciones y practicar con ejercicios.",
    searchPlaceholder: (level) => `Buscar palabras ${level}...`,
  },
  fr: {
    heading: ({ level, language }) => `Explorer les mots ${language} de niveau ${level}`,
    description:
      "Decouvrez les mots de vocabulaire courants pour ce niveau. Cliquez sur un mot pour en apprendre le sens, voir des exemples de phrases et vous entrainer avec des exercices.",
    searchPlaceholder: (level) => `Rechercher des mots ${level}...`,
  },
  de: {
    heading: ({ level, language }) => `${level} ${language} Worter durchsuchen`,
    description:
      "Erkunden Sie haufige Vokabeln fur dieses Niveau. Klicken Sie auf ein Wort, um seine Bedeutung zu erfahren, Beispielsatze zu sehen und es mit Ubungen zu uben.",
    searchPlaceholder: (level) => `${level}-Worter suchen...`,
  },
  it: {
    heading: ({ level, language }) => `Esplora le parole ${language} di livello ${level}`,
    description:
      "Esplora le parole di vocabolario piu comuni per questo livello. Clicca su una parola per impararne il significato, vedere frasi di esempio e praticare con gli esercizi.",
    searchPlaceholder: (level) => `Cerca parole ${level}...`,
  },
  pt: {
    heading: ({ level, language }) => `Explorar palavras ${language} de nivel ${level}`,
    description:
      "Explore as palavras de vocabulario mais comuns para este nivel. Clique em uma palavra para aprender seu significado, ver exemplos de frases e praticar com exercicios.",
    searchPlaceholder: (level) => `Pesquisar palavras ${level}...`,
  },
  ru: {
    heading: ({ level, language }) => `Слова ${language} уровня ${level}`,
    description:
      "Изучайте распространенные слова для этого уровня. Нажмите на слово, чтобы узнать его значение, увидеть примеры предложений и потренироваться с упражнениями.",
    searchPlaceholder: (level) => `Поиск слов уровня ${level}...`,
  },
};

export const CROSS_LANGUAGE_COPY: Record<
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
    heading: (level) => `${level} Vokabular in anderen Sprachen uben`,
    linkSuffix: "Wortliste",
  },
  it: {
    heading: (level) => `Pratica il vocabolario ${level} in altre lingue`,
    linkSuffix: "lista di vocabolario",
  },
  pt: {
    heading: (level) => `Pratique vocabulario ${level} em outros idiomas`,
    linkSuffix: "lista de vocabulario",
  },
  ru: {
    heading: (level) => `Практикуйте словарный запас ${level} на других языках`,
    linkSuffix: "список слов",
  },
};

export const RELATED_LINKS_COPY: Record<
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
    heading: "Paginas relacionadas",
    seoHubLabel: "Ver todas las paginas SEO",
    levelTestLabel: (languageName) => `Haz el test de nivel de ${languageName}`,
  },
  fr: {
    heading: "Pages associees",
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
    heading: "Paginas relacionadas",
    seoHubLabel: "Ver todas as paginas SEO",
    levelTestLabel: (languageName) => `Faca o teste de nivel de ${languageName}`,
  },
  ru: {
    heading: "Связанные страницы",
    seoHubLabel: "Посмотреть все SEO-страницы",
    levelTestLabel: (languageName) => `Тест уровня ${languageName}`,
  },
};
