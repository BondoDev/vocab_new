import type { UiLanguageCode } from "../../data/seo/shared/slugs";

// Learning Resources directory metadata (route: /{ui}/learning-resources).
// `pageName` doubles as the breadcrumb label and the CollectionPage name in
// JSON-LD; `homeLabel` names the breadcrumb root.
export const SEO_HUB_METADATA: Record<
  UiLanguageCode,
  {
    title: string;
    description: string;
    pageName: string;
    homeLabel: string;
  }
> = {
  en: {
    title: "Vocabulary & Language Learning Resources",
    description:
      "Explore vocabulary lists, common verbs, conjugations, and language tests. Find resources for your level and practice what you learn.",
    pageName: "Learning resources",
    homeLabel: "Home",
  },
  es: {
    title: "Recursos de vocabulario y aprendizaje de idiomas",
    description:
      "Explora listas de vocabulario, verbos comunes, conjugaciones y pruebas de nivel. Encuentra recursos para tu nivel y practica lo que aprendes.",
    pageName: "Recursos de aprendizaje",
    homeLabel: "Inicio",
  },
  fr: {
    title: "Ressources de vocabulaire et d’apprentissage des langues",
    description:
      "Découvrez des listes de vocabulaire, des verbes courants, des conjugaisons et des tests de niveau. Trouvez des ressources adaptées à votre niveau.",
    pageName: "Ressources d’apprentissage",
    homeLabel: "Accueil",
  },
  de: {
    title: "Wortschatz- und Sprachlernmaterialien",
    description:
      "Entdecke Vokabellisten, häufige Verben, Konjugationen und Sprachtests. Finde Materialien für dein Niveau und übe, was du lernst.",
    pageName: "Lernmaterialien",
    homeLabel: "Startseite",
  },
  it: {
    title: "Risorse di vocabolario e apprendimento delle lingue",
    description:
      "Esplora liste di vocabolario, verbi comuni, coniugazioni e test di livello. Trova risorse adatte al tuo livello e metti in pratica ciò che impari.",
    pageName: "Risorse di apprendimento",
    homeLabel: "Home",
  },
  pt: {
    title: "Recursos de vocabulário e aprendizagem de idiomas",
    description:
      "Explore listas de vocabulário, verbos comuns, conjugações e testes de nível. Encontre recursos para o seu nível e pratique o que aprende.",
    pageName: "Recursos de aprendizagem",
    homeLabel: "Início",
  },
  ru: {
    title: "Материалы для изучения лексики и языков",
    description:
      "Списки слов, частотные глаголы, спряжения и тесты уровня. Подберите материалы для своего уровня и закрепляйте выученное на практике.",
    pageName: "Учебные материалы",
    homeLabel: "Главная",
  },
};

interface WordIndexMetadataCopy {
  summaryTitle: (languageName: string) => string;
  summaryDescription: (languageName: string) => string;
  levelTitle: (languageName: string, level: string, page: number) => string;
  levelDescription: (languageName: string, level: string, page: number) => string;
}

// Word-index (alphabetical word list) metadata, one template per UI language
// for every learning language. `languageName` is the learning language's
// name as the UI language writes it (interface `languageNames.*`,
// capitalized nominative). Phrasings are chosen so that form reads
// correctly without per-language inflection tables ("palabras en inglés",
// "mots en anglais", "Englisch" -> "englische Wörter", ...).
export const GENERIC_WORD_SEO_HUB_METADATA: Record<UiLanguageCode, WordIndexMetadataCopy> = {
  en: {
    summaryTitle: (name) => `${name} Word Index by CEFR Level`,
    summaryDescription: (name) =>
      `Browse ${name} words on FluentStellar in alphabetical order, grouped by CEFR level from A1 to C2.`,
    levelTitle: (name, level, page) =>
      page > 1
        ? `${name} ${level} Words in Alphabetical Order – Page ${page}`
        : `${name} ${level} Words in Alphabetical Order`,
    levelDescription: (name, level, page) =>
      `${page > 1 ? `Page ${page} of the alphabetical list` : "Alphabetical list"} of ${name} ${level} words. Open a word to see its meaning, examples, and practice.`,
  },
  es: {
    summaryTitle: (name) => `Índice de palabras en ${name.toLowerCase()} por nivel MCER`,
    summaryDescription: (name) =>
      `Consulta las palabras en ${name.toLowerCase()} de FluentStellar en orden alfabético, agrupadas por nivel MCER de A1 a C2.`,
    levelTitle: (name, level, page) =>
      `Palabras en ${name.toLowerCase()} ${level} en orden alfabético${page > 1 ? ` – Página ${page}` : ""}`,
    levelDescription: (name, level, page) =>
      `Lista alfabética de palabras en ${name.toLowerCase()} ${level}${page > 1 ? `, página ${page}` : ""}. Abre una palabra para ver su significado, ejemplos y práctica.`,
  },
  fr: {
    summaryTitle: (name) => `Index des mots en ${name.toLowerCase()} par niveau CECRL`,
    summaryDescription: (name) =>
      `Parcourez les mots en ${name.toLowerCase()} de FluentStellar par ordre alphabétique, classés par niveau CECRL de A1 à C2.`,
    levelTitle: (name, level, page) =>
      `Mots en ${name.toLowerCase()} ${level} par ordre alphabétique${page > 1 ? ` – Page ${page}` : ""}`,
    levelDescription: (name, level, page) =>
      `Liste alphabétique des mots en ${name.toLowerCase()} ${level}${page > 1 ? `, page ${page}` : ""}. Ouvrez un mot pour voir sa signification, des exemples et des exercices.`,
  },
  de: {
    summaryTitle: (name) => `Wortindex: ${name.toLowerCase()}e Wörter nach GER-Niveau`,
    summaryDescription: (name) =>
      `Durchsuche die ${name.toLowerCase()}en Wörter auf FluentStellar in alphabetischer Reihenfolge, geordnet nach GER-Niveau von A1 bis C2.`,
    levelTitle: (name, level, page) =>
      `${name}e Wörter ${level} in alphabetischer Reihenfolge${page > 1 ? ` – Seite ${page}` : ""}`,
    levelDescription: (name, level, page) =>
      `Alphabetische Liste ${name.toLowerCase()}er Wörter ${level}${page > 1 ? `, Seite ${page}` : ""}. Öffne ein Wort, um Bedeutung, Beispiele und Übungen zu sehen.`,
  },
  it: {
    summaryTitle: (name) => `Indice delle parole in ${name.toLowerCase()} per livello QCER`,
    summaryDescription: (name) =>
      `Consulta le parole in ${name.toLowerCase()} su FluentStellar in ordine alfabetico, raggruppate per livello QCER da A1 a C2.`,
    levelTitle: (name, level, page) =>
      `Parole in ${name.toLowerCase()} ${level} in ordine alfabetico${page > 1 ? ` – Pagina ${page}` : ""}`,
    levelDescription: (name, level, page) =>
      `Elenco alfabetico delle parole in ${name.toLowerCase()} ${level}${page > 1 ? `, pagina ${page}` : ""}. Apri una parola per vederne significato, esempi ed esercizi.`,
  },
  pt: {
    summaryTitle: (name) => `Índice de palavras em ${name.toLowerCase()} por nível QECR`,
    summaryDescription: (name) =>
      `Consulte as palavras em ${name.toLowerCase()} do FluentStellar em ordem alfabética, agrupadas por nível QECR de A1 a C2.`,
    levelTitle: (name, level, page) =>
      `Palavras em ${name.toLowerCase()} ${level} em ordem alfabética${page > 1 ? ` – Página ${page}` : ""}`,
    levelDescription: (name, level, page) =>
      `Lista alfabética de palavras em ${name.toLowerCase()} ${level}${page > 1 ? `, página ${page}` : ""}. Abra uma palavra para ver o significado, exemplos e prática.`,
  },
  ru: {
    summaryTitle: (name) => `${name} язык: указатель слов по уровням CEFR`,
    summaryDescription: (name) =>
      `Слова (${name.toLowerCase()} язык) на FluentStellar в алфавитном порядке, сгруппированные по уровням CEFR от A1 до C2.`,
    levelTitle: (name, level, page) =>
      `${name} язык, ${level}: слова в алфавитном порядке${page > 1 ? `, страница ${page}` : ""}`,
    levelDescription: (name, level, page) =>
      `Алфавитный список слов уровня ${level} (${name.toLowerCase()} язык)${page > 1 ? `, страница ${page}` : ""}. Откройте слово, чтобы увидеть значение, примеры и упражнения.`,
  },
};
