// Shared interface copy for the CEFR vocabulary-level pages in all seven UI
// languages: everything visible on the page that is not per-page editorial
// content (which stays in seo-cefr-content.json).
//
// Kept as one typed module rather than in src/data/interface/*.json because
// the copy is page-family-specific, must be identical in SSR/prerender and
// the first browser render (the interface JSON loads asynchronously on
// client-side language switches), and its grammar needs functions, not
// plain strings: target-language names change form with context (German
// "Wortschatz Deutsch", French "test de niveau d'anglais", Russian genitive
// "английского языка"), so every phrase that contains a language name is
// written per UI language instead of being assembled from one name table.
// Record<UiLanguageCode, …> makes a missing language a type error.
import type { Level, TargetLanguageSlug, UiLanguageCode } from "../shared/slugs";

type LanguageNames = Record<TargetLanguageSlug, string>;
type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export interface CefrPageCopy {
  // Standalone (nominative, capitalized) names, for chips and link labels.
  languageNames: LanguageNames;
  levelNames: Record<Level, string>;
  // "German A1 vocabulary": explorer heading and breadcrumb label.
  vocabularyHeading: (language: TargetLanguageSlug, level: string) => string;
  levelTestLabel: (language: TargetLanguageSlug) => string;
  wordForms: PluralForms;
  thousandsSeparator: string;
  startPractice: string;
  exploreVocabulary: string;
  pageFactsLabel: string;
  explorer: {
    searchLabel: (level: string) => string;
    searchPlaceholder: { translation: string; definition: string };
    clearSearch: string;
    wordHeader: string;
    meaningHeader: { translation: string; definition: string };
    noMeaning: string;
    // {count} is an already-pluralized "936 words" phrase.
    totalSummary: (count: string) => string;
    matchSummary: (count: string, query: string) => string;
    range: (from: string, to: string, total: string) => string;
    loading: string;
    loadError: string;
    retry: string;
    empty: (query: string) => string;
    paginationLabel: string;
    previous: string;
    next: string;
    pageLabel: (page: number) => string;
  };
  wordTypes: Record<string, string>;
  learningOutcomes: string;
  related: {
    heading: string;
    otherLevels: string;
    otherLanguages: (level: string) => string;
    moreResources: string;
    allResources: string;
  };
  faqHeading: string;
  breadcrumbHome: string;
}

const LEVEL_CODES: Record<Level, string> = { a1: "A1", a2: "A2", b1: "B1", b2: "B2", c1: "C1", c2: "C2" };

export function getCefrLevelCode(level: Level): string {
  return LEVEL_CODES[level];
}

const en: CefrPageCopy = {
  languageNames: {
    english: "English",
    german: "German",
    spanish: "Spanish",
    french: "French",
    italian: "Italian",
    portuguese: "Portuguese",
    russian: "Russian",
  },
  levelNames: {
    a1: "Beginner",
    a2: "Elementary",
    b1: "Intermediate",
    b2: "Upper intermediate",
    c1: "Advanced",
    c2: "Proficient",
  },
  vocabularyHeading: (language, level) => `${en.languageNames[language]} ${level} vocabulary`,
  levelTestLabel: (language) => `${en.languageNames[language]} level test`,
  wordForms: { one: "word", other: "words" },
  thousandsSeparator: ",",
  startPractice: "Start practice",
  exploreVocabulary: "Explore vocabulary",
  pageFactsLabel: "About this word list",
  explorer: {
    searchLabel: (level) => `Search the ${level} word list`,
    searchPlaceholder: {
      translation: "Search words or translations",
      definition: "Search words or definitions",
    },
    clearSearch: "Clear search",
    wordHeader: "Word",
    meaningHeader: { translation: "Translation", definition: "Definition" },
    noMeaning: "No translation available",
    totalSummary: (count) => count,
    matchSummary: (count, query) => `${count} for “${query}”`,
    range: (from, to, total) => `Showing ${from}–${to} of ${total}`,
    loading: "Loading the word list…",
    loadError: "The word list couldn’t be loaded.",
    retry: "Try again",
    empty: (query) => `No words match “${query}”.`,
    paginationLabel: "Word list pages",
    previous: "Previous",
    next: "Next",
    pageLabel: (page) => `Page ${page}`,
  },
  wordTypes: {
    noun: "noun",
    verb: "verb",
    adjective: "adjective",
    adverb: "adverb",
    determiner: "determiner",
    pronoun: "pronoun",
    preposition: "preposition",
    conjunction: "conjunction",
    exclamation: "exclamation",
    expression: "expression",
    interjection: "interjection",
  },
  learningOutcomes: "Learning outcomes",
  related: {
    heading: "Keep learning",
    otherLevels: "Other levels",
    otherLanguages: (level) => `${level} in other languages`,
    moreResources: "More resources",
    allResources: "All learning resources",
  },
  faqHeading: "Frequently asked questions",
  breadcrumbHome: "Home",
};

const deNames: LanguageNames = {
  english: "Englisch",
  german: "Deutsch",
  spanish: "Spanisch",
  french: "Französisch",
  italian: "Italienisch",
  portuguese: "Portugiesisch",
  russian: "Russisch",
};

const de: CefrPageCopy = {
  languageNames: deNames,
  levelNames: {
    a1: "Anfänger",
    a2: "Grundstufe",
    b1: "Mittelstufe",
    b2: "Gehobene Mittelstufe",
    c1: "Fortgeschritten",
    c2: "Sehr fortgeschritten",
  },
  // Apposition ("Wortschatz Deutsch A2") avoids adjective declension.
  vocabularyHeading: (language, level) => `Wortschatz ${deNames[language]} ${level}`,
  levelTestLabel: (language) => `Einstufungstest ${deNames[language]}`,
  wordForms: { one: "Wort", other: "Wörter" },
  thousandsSeparator: ".",
  startPractice: "Jetzt üben",
  exploreVocabulary: "Wortschatz ansehen",
  pageFactsLabel: "Über diese Wortliste",
  explorer: {
    searchLabel: (level) => `Wortliste ${level} durchsuchen`,
    searchPlaceholder: {
      translation: "Wort oder Übersetzung suchen",
      definition: "Wort oder Definition suchen",
    },
    clearSearch: "Suche löschen",
    wordHeader: "Wort",
    meaningHeader: { translation: "Übersetzung", definition: "Definition" },
    noMeaning: "Keine Übersetzung verfügbar",
    totalSummary: (count) => count,
    matchSummary: (count, query) => `${count} für „${query}“`,
    range: (from, to, total) => `${from}–${to} von ${total}`,
    loading: "Wortliste wird geladen …",
    loadError: "Die Wortliste konnte nicht geladen werden.",
    retry: "Erneut versuchen",
    empty: (query) => `Keine Wörter für „${query}“ gefunden.`,
    paginationLabel: "Seiten der Wortliste",
    previous: "Zurück",
    next: "Weiter",
    pageLabel: (page) => `Seite ${page}`,
  },
  wordTypes: {
    noun: "Substantiv",
    verb: "Verb",
    adjective: "Adjektiv",
    adverb: "Adverb",
    determiner: "Artikelwort",
    pronoun: "Pronomen",
    preposition: "Präposition",
    conjunction: "Konjunktion",
    exclamation: "Ausruf",
    expression: "Ausdruck",
    interjection: "Interjektion",
  },
  learningOutcomes: "Lernziele",
  related: {
    heading: "Weiterlernen",
    otherLevels: "Andere Niveaus",
    otherLanguages: (level) => `${level} in anderen Sprachen`,
    moreResources: "Weitere Materialien",
    allResources: "Alle Lernmaterialien",
  },
  faqHeading: "Häufig gestellte Fragen",
  breadcrumbHome: "Startseite",
};

// Spanish and Portuguese language names are nouns used after "de"
// (lowercase in running text, capitalized standalone).
const esNouns: LanguageNames = {
  english: "inglés",
  german: "alemán",
  spanish: "español",
  french: "francés",
  italian: "italiano",
  portuguese: "portugués",
  russian: "ruso",
};

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const capitalizeAll = (names: LanguageNames): LanguageNames =>
  Object.fromEntries(Object.entries(names).map(([key, value]) => [key, capitalize(value)])) as LanguageNames;

const es: CefrPageCopy = {
  languageNames: capitalizeAll(esNouns),
  levelNames: {
    a1: "Principiante",
    a2: "Elemental",
    b1: "Intermedio",
    b2: "Intermedio alto",
    c1: "Avanzado",
    c2: "Maestría",
  },
  vocabularyHeading: (language, level) => `Vocabulario de ${esNouns[language]} ${level}`,
  levelTestLabel: (language) => `Prueba de nivel de ${esNouns[language]}`,
  wordForms: { one: "palabra", other: "palabras" },
  thousandsSeparator: ".",
  startPractice: "Empezar a practicar",
  exploreVocabulary: "Explorar vocabulario",
  pageFactsLabel: "Sobre esta lista de palabras",
  explorer: {
    searchLabel: (level) => `Buscar en la lista ${level}`,
    searchPlaceholder: {
      translation: "Buscar palabras o traducciones",
      definition: "Buscar palabras o definiciones",
    },
    clearSearch: "Borrar búsqueda",
    wordHeader: "Palabra",
    meaningHeader: { translation: "Traducción", definition: "Definición" },
    noMeaning: "Traducción no disponible",
    totalSummary: (count) => count,
    matchSummary: (count, query) => `${count} para «${query}»`,
    range: (from, to, total) => `${from}–${to} de ${total}`,
    loading: "Cargando la lista de palabras…",
    loadError: "No se pudo cargar la lista de palabras.",
    retry: "Reintentar",
    empty: (query) => `Ninguna palabra coincide con «${query}».`,
    paginationLabel: "Páginas de la lista de palabras",
    previous: "Anterior",
    next: "Siguiente",
    pageLabel: (page) => `Página ${page}`,
  },
  wordTypes: {
    noun: "sustantivo",
    verb: "verbo",
    adjective: "adjetivo",
    adverb: "adverbio",
    determiner: "determinante",
    pronoun: "pronombre",
    preposition: "preposición",
    conjunction: "conjunción",
    exclamation: "exclamación",
    expression: "expresión",
    interjection: "interjección",
  },
  learningOutcomes: "Objetivos de aprendizaje",
  related: {
    heading: "Sigue aprendiendo",
    otherLevels: "Otros niveles",
    otherLanguages: (level) => `${level} en otros idiomas`,
    moreResources: "Más recursos",
    allResources: "Todos los recursos de aprendizaje",
  },
  faqHeading: "Preguntas frecuentes",
  breadcrumbHome: "Inicio",
};

// French: masculine adjectives after "vocabulaire"; elided "d'" before a
// vowel in "test de niveau d'anglais".
const frAdjectives: LanguageNames = {
  english: "anglais",
  german: "allemand",
  spanish: "espagnol",
  french: "français",
  italian: "italien",
  portuguese: "portugais",
  russian: "russe",
};
const frOf = (language: TargetLanguageSlug) =>
  /^[aeiouy]/.test(frAdjectives[language]) ? `d’${frAdjectives[language]}` : `de ${frAdjectives[language]}`;

const fr: CefrPageCopy = {
  languageNames: capitalizeAll(frAdjectives),
  levelNames: {
    a1: "Débutant",
    a2: "Élémentaire",
    b1: "Intermédiaire",
    b2: "Intermédiaire supérieur",
    c1: "Avancé",
    c2: "Maîtrise",
  },
  vocabularyHeading: (language, level) => `Vocabulaire ${frAdjectives[language]} ${level}`,
  levelTestLabel: (language) => `Test de niveau ${frOf(language)}`,
  wordForms: { one: "mot", other: "mots" },
  thousandsSeparator: " ",
  startPractice: "Commencer à pratiquer",
  exploreVocabulary: "Explorer le vocabulaire",
  pageFactsLabel: "À propos de cette liste de mots",
  explorer: {
    searchLabel: (level) => `Rechercher dans la liste ${level}`,
    searchPlaceholder: {
      translation: "Rechercher un mot ou une traduction",
      definition: "Rechercher un mot ou une définition",
    },
    clearSearch: "Effacer la recherche",
    wordHeader: "Mot",
    meaningHeader: { translation: "Traduction", definition: "Définition" },
    noMeaning: "Traduction non disponible",
    totalSummary: (count) => count,
    matchSummary: (count, query) => `${count} pour « ${query} »`,
    range: (from, to, total) => `${from}–${to} sur ${total}`,
    loading: "Chargement de la liste de mots…",
    loadError: "Impossible de charger la liste de mots.",
    retry: "Réessayer",
    empty: (query) => `Aucun mot ne correspond à « ${query} ».`,
    paginationLabel: "Pages de la liste de mots",
    previous: "Précédent",
    next: "Suivant",
    pageLabel: (page) => `Page ${page}`,
  },
  wordTypes: {
    noun: "nom",
    verb: "verbe",
    adjective: "adjectif",
    adverb: "adverbe",
    determiner: "déterminant",
    pronoun: "pronom",
    preposition: "préposition",
    conjunction: "conjonction",
    exclamation: "exclamation",
    expression: "expression",
    interjection: "interjection",
  },
  learningOutcomes: "Objectifs d’apprentissage",
  related: {
    heading: "Continuer à apprendre",
    otherLevels: "Autres niveaux",
    otherLanguages: (level) => `${level} dans d’autres langues`,
    moreResources: "Autres ressources",
    allResources: "Toutes les ressources d’apprentissage",
  },
  faqHeading: "Questions fréquentes",
  breadcrumbHome: "Accueil",
};

// Italian: masculine adjectives after "vocabolario"; "di" + noun for tests.
const itNames: LanguageNames = {
  english: "inglese",
  german: "tedesco",
  spanish: "spagnolo",
  french: "francese",
  italian: "italiano",
  portuguese: "portoghese",
  russian: "russo",
};

const it: CefrPageCopy = {
  languageNames: capitalizeAll(itNames),
  levelNames: {
    a1: "Principiante",
    a2: "Elementare",
    b1: "Intermedio",
    b2: "Intermedio superiore",
    c1: "Avanzato",
    c2: "Padronanza",
  },
  vocabularyHeading: (language, level) => `Vocabolario ${itNames[language]} ${level}`,
  levelTestLabel: (language) => `Test di livello di ${itNames[language]}`,
  wordForms: { one: "parola", other: "parole" },
  thousandsSeparator: ".",
  startPractice: "Inizia la pratica",
  exploreVocabulary: "Esplora il vocabolario",
  pageFactsLabel: "Informazioni su questo elenco di parole",
  explorer: {
    searchLabel: (level) => `Cerca nell’elenco ${level}`,
    searchPlaceholder: {
      translation: "Cerca parole o traduzioni",
      definition: "Cerca parole o definizioni",
    },
    clearSearch: "Cancella ricerca",
    wordHeader: "Parola",
    meaningHeader: { translation: "Traduzione", definition: "Definizione" },
    noMeaning: "Traduzione non disponibile",
    totalSummary: (count) => count,
    matchSummary: (count, query) => `${count} per «${query}»`,
    range: (from, to, total) => `${from}–${to} di ${total}`,
    loading: "Caricamento dell’elenco di parole…",
    loadError: "Impossibile caricare l’elenco di parole.",
    retry: "Riprova",
    empty: (query) => `Nessuna parola corrisponde a «${query}».`,
    paginationLabel: "Pagine dell’elenco di parole",
    previous: "Precedente",
    next: "Successiva",
    pageLabel: (page) => `Pagina ${page}`,
  },
  wordTypes: {
    noun: "sostantivo",
    verb: "verbo",
    adjective: "aggettivo",
    adverb: "avverbio",
    determiner: "determinante",
    pronoun: "pronome",
    preposition: "preposizione",
    conjunction: "congiunzione",
    exclamation: "esclamazione",
    expression: "espressione",
    interjection: "interiezione",
  },
  learningOutcomes: "Obiettivi di apprendimento",
  related: {
    heading: "Continua a imparare",
    otherLevels: "Altri livelli",
    otherLanguages: (level) => `${level} in altre lingue`,
    moreResources: "Altre risorse",
    allResources: "Tutte le risorse di apprendimento",
  },
  faqHeading: "Domande frequenti",
  breadcrumbHome: "Home",
};

const ptNouns: LanguageNames = {
  english: "inglês",
  german: "alemão",
  spanish: "espanhol",
  french: "francês",
  italian: "italiano",
  portuguese: "português",
  russian: "russo",
};

const pt: CefrPageCopy = {
  languageNames: capitalizeAll(ptNouns),
  levelNames: {
    a1: "Iniciante",
    a2: "Elementar",
    b1: "Intermediário",
    b2: "Intermediário avançado",
    c1: "Avançado",
    c2: "Proficiente",
  },
  vocabularyHeading: (language, level) => `Vocabulário de ${ptNouns[language]} ${level}`,
  levelTestLabel: (language) => `Teste de nível de ${ptNouns[language]}`,
  wordForms: { one: "palavra", other: "palavras" },
  thousandsSeparator: ".",
  startPractice: "Começar a praticar",
  exploreVocabulary: "Explorar vocabulário",
  pageFactsLabel: "Sobre esta lista de palavras",
  explorer: {
    searchLabel: (level) => `Pesquisar na lista ${level}`,
    searchPlaceholder: {
      translation: "Pesquisar palavras ou traduções",
      definition: "Pesquisar palavras ou definições",
    },
    clearSearch: "Limpar pesquisa",
    wordHeader: "Palavra",
    meaningHeader: { translation: "Tradução", definition: "Definição" },
    noMeaning: "Tradução não disponível",
    totalSummary: (count) => count,
    matchSummary: (count, query) => `${count} para “${query}”`,
    range: (from, to, total) => `${from}–${to} de ${total}`,
    loading: "Carregando a lista de palavras…",
    loadError: "Não foi possível carregar a lista de palavras.",
    retry: "Tentar novamente",
    empty: (query) => `Nenhuma palavra corresponde a “${query}”.`,
    paginationLabel: "Páginas da lista de palavras",
    previous: "Anterior",
    next: "Próxima",
    pageLabel: (page) => `Página ${page}`,
  },
  wordTypes: {
    noun: "substantivo",
    verb: "verbo",
    adjective: "adjetivo",
    adverb: "advérbio",
    determiner: "determinante",
    pronoun: "pronome",
    preposition: "preposição",
    conjunction: "conjunção",
    exclamation: "exclamação",
    expression: "expressão",
    interjection: "interjeição",
  },
  learningOutcomes: "Objetivos de aprendizagem",
  related: {
    heading: "Continue aprendendo",
    otherLevels: "Outros níveis",
    otherLanguages: (level) => `${level} em outros idiomas`,
    moreResources: "Mais recursos",
    allResources: "Todos os recursos de aprendizagem",
  },
  faqHeading: "Perguntas frequentes",
  breadcrumbHome: "Início",
};

// Russian: nominative names standalone; genitive adjective + "языка" inside
// phrases ("Слова английского языка", "Тест уровня английского языка").
const ruNominative: LanguageNames = {
  english: "Английский",
  german: "Немецкий",
  spanish: "Испанский",
  french: "Французский",
  italian: "Итальянский",
  portuguese: "Португальский",
  russian: "Русский",
};
const ruGenitive: LanguageNames = {
  english: "английского",
  german: "немецкого",
  spanish: "испанского",
  french: "французского",
  italian: "итальянского",
  portuguese: "португальского",
  russian: "русского",
};

const ru: CefrPageCopy = {
  languageNames: ruNominative,
  levelNames: {
    a1: "Начальный",
    a2: "Элементарный",
    b1: "Средний",
    b2: "Выше среднего",
    c1: "Продвинутый",
    c2: "Профессиональный",
  },
  vocabularyHeading: (language, level) => `Слова ${ruGenitive[language]} языка, уровень ${level}`,
  levelTestLabel: (language) => `Тест уровня ${ruGenitive[language]} языка`,
  wordForms: { one: "слово", few: "слова", many: "слов", other: "слова" },
  thousandsSeparator: " ",
  startPractice: "Начать практику",
  exploreVocabulary: "Смотреть слова",
  pageFactsLabel: "Об этом списке слов",
  explorer: {
    searchLabel: (level) => `Поиск по списку слов ${level}`,
    searchPlaceholder: {
      translation: "Искать слово или перевод",
      definition: "Искать слово или определение",
    },
    clearSearch: "Очистить поиск",
    wordHeader: "Слово",
    meaningHeader: { translation: "Перевод", definition: "Определение" },
    noMeaning: "Перевод недоступен",
    totalSummary: (count) => count,
    matchSummary: (count, query) => `${count} по запросу «${query}»`,
    range: (from, to, total) => `${from}–${to} из ${total}`,
    loading: "Загрузка списка слов…",
    loadError: "Не удалось загрузить список слов.",
    retry: "Повторить",
    empty: (query) => `По запросу «${query}» ничего не найдено.`,
    paginationLabel: "Страницы списка слов",
    previous: "Назад",
    next: "Далее",
    pageLabel: (page) => `Страница ${page}`,
  },
  wordTypes: {
    noun: "существительное",
    verb: "глагол",
    adjective: "прилагательное",
    adverb: "наречие",
    determiner: "определитель",
    pronoun: "местоимение",
    preposition: "предлог",
    conjunction: "союз",
    exclamation: "восклицание",
    expression: "выражение",
    interjection: "междометие",
  },
  learningOutcomes: "Чему вы научитесь",
  related: {
    heading: "Учитесь дальше",
    otherLevels: "Другие уровни",
    otherLanguages: (level) => `${level} на других языках`,
    moreResources: "Другие материалы",
    allResources: "Все учебные материалы",
  },
  faqHeading: "Часто задаваемые вопросы",
  breadcrumbHome: "Главная",
};

const COPY: Record<UiLanguageCode, CefrPageCopy> = { en, de, es, fr, it, pt, ru };

export function getCefrPageCopy(uiLang: UiLanguageCode): CefrPageCopy {
  return COPY[uiLang] ?? COPY.en;
}

// Deterministic integer formatting (not toLocaleString), so SSR and the
// browser always emit the same characters — Node's and browsers' ICU data
// can disagree on group separators, which would break hydration.
export function formatCefrCount(copy: CefrPageCopy, value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, copy.thousandsSeparator);
}

const pluralRulesCache = new Map<UiLanguageCode, Intl.PluralRules>();

// "936 words", "1 224 слова", "21 слово".
export function formatCefrWordCount(uiLang: UiLanguageCode, value: number): string {
  const copy = getCefrPageCopy(uiLang);
  let rules = pluralRulesCache.get(uiLang);
  if (!rules) {
    rules = new Intl.PluralRules(uiLang);
    pluralRulesCache.set(uiLang, rules);
  }
  const form = copy.wordForms[rules.select(value)] ?? copy.wordForms.other;
  return `${formatCefrCount(copy, value)} ${form}`;
}
