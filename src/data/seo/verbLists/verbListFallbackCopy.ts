import type { TargetLanguageSlug, UiLanguageCode } from "../shared/slugs";

const TARGET_LANGUAGE_DISPLAY_NAMES: Record<UiLanguageCode, Record<TargetLanguageSlug, string>> = {
  en: {
    english: "English",
    german: "German",
    spanish: "Spanish",
    french: "French",
    italian: "Italian",
    portuguese: "Portuguese",
    russian: "Russian",
  },
  es: {
    english: "ingles",
    german: "aleman",
    spanish: "espanol",
    french: "frances",
    italian: "italiano",
    portuguese: "portugues",
    russian: "ruso",
  },
  de: {
    english: "Englisch",
    german: "Deutsch",
    spanish: "Spanisch",
    french: "Franzoesisch",
    italian: "Italienisch",
    portuguese: "Portugiesisch",
    russian: "Russisch",
  },
  fr: {
    english: "anglais",
    german: "allemand",
    spanish: "espagnol",
    french: "francais",
    italian: "italien",
    portuguese: "portugais",
    russian: "russe",
  },
  it: {
    english: "inglese",
    german: "tedesco",
    spanish: "spagnolo",
    french: "francese",
    italian: "italiano",
    portuguese: "portoghese",
    russian: "russo",
  },
  pt: {
    english: "ingles",
    german: "alemao",
    spanish: "espanhol",
    french: "frances",
    italian: "italiano",
    portuguese: "portugues",
    russian: "russo",
  },
  ru: {
    english: "angliiskie",
    german: "nemetskie",
    spanish: "ispanskie",
    french: "frantsuzskie",
    italian: "italianskie",
    portuguese: "portugalskie",
    russian: "russkie",
  },
};

const FALLBACK_COPY = {
  en: {
    pageTitle: (language: string) => `100 Most Common ${language} Verbs`,
    metaTitle: (language: string) => `100 Most Common ${language} Verbs`,
    metaDescription: (language: string) =>
      `Browse the 100 most common ${language.toLowerCase()} verbs with translations and definitions.`,
    searchPlaceholder: (language: string) => `Search ${language.toLowerCase()} verbs...`,
    definition: "Definition",
    noResults: "No matching verbs found.",
    pronounceLabel: "Hear pronunciation",
  },
  es: {
    pageTitle: (language: string) => `100 verbos ${language} mas comunes`,
    metaTitle: (language: string) => `100 verbos ${language} mas comunes`,
    metaDescription: (language: string) =>
      `Consulta 100 verbos ${language} frecuentes con traducciones y definiciones.`,
    searchPlaceholder: (language: string) => `Buscar verbos ${language}...`,
    definition: "Definicion",
    noResults: "No se encontraron verbos.",
    pronounceLabel: "Escuchar pronunciacion",
  },
  de: {
    pageTitle: (language: string) => `100 haeufigste ${language}e Verben`,
    metaTitle: (language: string) => `100 haeufigste ${language}e Verben`,
    metaDescription: (language: string) =>
      `Durchsuche 100 haeufige ${language}e Verben mit Uebersetzungen und Definitionen.`,
    searchPlaceholder: (language: string) => `${language}e Verben suchen...`,
    definition: "Definition",
    noResults: "Keine passenden Verben gefunden.",
    pronounceLabel: "Aussprache anhoeren",
  },
  fr: {
    pageTitle: (language: string) => `100 verbes ${language} les plus courants`,
    metaTitle: (language: string) => `100 verbes ${language} les plus courants`,
    metaDescription: (language: string) =>
      `Consultez 100 verbes ${language} frequents avec traductions et definitions.`,
    searchPlaceholder: (language: string) => `Rechercher des verbes ${language}...`,
    definition: "Definition",
    noResults: "Aucun verbe correspondant.",
    pronounceLabel: "Ecouter la prononciation",
  },
  it: {
    pageTitle: (language: string) => `100 verbi ${language} piu comuni`,
    metaTitle: (language: string) => `100 verbi ${language} piu comuni`,
    metaDescription: (language: string) =>
      `Consulta 100 verbi ${language} comuni con traduzioni e definizioni.`,
    searchPlaceholder: (language: string) => `Cerca verbi ${language}...`,
    definition: "Definizione",
    noResults: "Nessun verbo trovato.",
    pronounceLabel: "Ascolta la pronuncia",
  },
  pt: {
    pageTitle: (language: string) => `100 verbos ${language} mais comuns`,
    metaTitle: (language: string) => `100 verbos ${language} mais comuns`,
    metaDescription: (language: string) =>
      `Consulte 100 verbos ${language} comuns com traducoes e definicoes.`,
    searchPlaceholder: (language: string) => `Pesquisar verbos ${language}...`,
    definition: "Definicao",
    noResults: "Nenhum verbo encontrado.",
    pronounceLabel: "Ouvir pronuncia",
  },
  ru: {
    pageTitle: (language: string) => `100 samykh chastykh ${language} glagolov`,
    metaTitle: (language: string) => `100 samykh chastykh ${language} glagolov`,
    metaDescription: (language: string) =>
      `Smotrite 100 samykh chastykh ${language} glagolov s perevodami i opredeleniyami.`,
    searchPlaceholder: (language: string) => `Poisk ${language} glagolov...`,
    definition: "Opredelenie",
    noResults: "Podhodyashchie glagoly ne naydeny.",
    pronounceLabel: "Uslyshat proiznoshenie",
  },
} as const satisfies Record<
  UiLanguageCode,
  {
    pageTitle: (language: string) => string;
    metaTitle: (language: string) => string;
    metaDescription: (language: string) => string;
    searchPlaceholder: (language: string) => string;
    definition: string;
    noResults: string;
    pronounceLabel: string;
  }
>;

export function getVerbListDisplayName(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): string {
  return TARGET_LANGUAGE_DISPLAY_NAMES[uiLang][targetLanguage];
}

export function getFallbackVerbListCopy(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
) {
  const copy = FALLBACK_COPY[uiLang] ?? FALLBACK_COPY.en;
  const displayName = getVerbListDisplayName(uiLang, targetLanguage);

  return {
    pageTitle: copy.pageTitle(displayName),
    metaTitle: copy.metaTitle(displayName),
    metaDescription: copy.metaDescription(displayName),
    searchPlaceholder: copy.searchPlaceholder(displayName),
    definition: copy.definition,
    noResults: copy.noResults,
    pronounceLabel: copy.pronounceLabel,
    number: "№",
  };
}
