import { SUPPORTED_UI_LANGUAGES, type UiLanguageCode } from "../seo/slugs";

export interface GermanVerbListContent {
  title: string;
  metaTitle: string;
  metaDescription: string;
  filters: {
    searchPlaceholder: string;
  };
  table: {
    number: string;
    definition: string;
    noResults: string;
  };
}

const GERMAN_VERB_LIST_PATHS: Record<UiLanguageCode, string> = {
  en: "/en/100-most-common-german-verbs",
  es: "/es/100-verbos-alemanes-mas-comunes",
  de: "/de/100-haeufigste-deutsche-verben",
  fr: "/fr/100-verbes-allemands-les-plus-courants",
  it: "/it/100-verbi-tedeschi-piu-comuni",
  pt: "/pt/100-verbos-alemaes-mais-comuns",
  ru: "/ru/100-samykh-chastykh-nemetskikh-glagolov",
};

const GERMAN_VERB_LIST_CONTENT: Record<UiLanguageCode, GermanVerbListContent> = {
  en: {
    title: "100 Most Common German Verbs",
    metaTitle: "100 Most Common German Verbs - Essential Verb List",
    metaDescription:
      "Browse 100 common German verbs with translations and definitions across UI languages.",
    filters: {
      searchPlaceholder: "Search German verbs...",
    },
    table: {
      number: "No.",
      definition: "Definition",
      noResults: "No verbs match the current search.",
    },
  },
  es: {
    title: "100 verbos alemanes mas comunes",
    metaTitle: "100 verbos alemanes mas comunes - lista esencial",
    metaDescription:
      "Consulta 100 verbos comunes en aleman con traducciones y definiciones en cada idioma de interfaz.",
    filters: {
      searchPlaceholder: "Buscar verbos en aleman...",
    },
    table: {
      number: "No.",
      definition: "Definicion",
      noResults: "Ningun verbo coincide con la busqueda actual.",
    },
  },
  de: {
    title: "100 haufigste deutsche Verben",
    metaTitle: "100 haufigste deutsche Verben - wichtigste Verbliste",
    metaDescription:
      "Durchsuche 100 haufige deutsche Verben mit Ubersetzungen und Definitionen fur alle UI-Sprachen.",
    filters: {
      searchPlaceholder: "Deutsche Verben suchen...",
    },
    table: {
      number: "Nr.",
      definition: "Definition",
      noResults: "Keine Verben passen zur aktuellen Suche.",
    },
  },
  fr: {
    title: "100 verbes allemands les plus courants",
    metaTitle: "100 verbes allemands les plus courants - liste essentielle",
    metaDescription:
      "Consultez 100 verbes allemands frequents avec traductions et definitions selon la langue d'interface.",
    filters: {
      searchPlaceholder: "Rechercher des verbes allemands...",
    },
    table: {
      number: "No.",
      definition: "Definition",
      noResults: "Aucun verbe ne correspond a la recherche actuelle.",
    },
  },
  it: {
    title: "100 verbi tedeschi piu comuni",
    metaTitle: "100 verbi tedeschi piu comuni - lista essenziale",
    metaDescription:
      "Consulta 100 verbi tedeschi comuni con traduzioni e definizioni per ogni lingua UI.",
    filters: {
      searchPlaceholder: "Cerca verbi tedeschi...",
    },
    table: {
      number: "N.",
      definition: "Definizione",
      noResults: "Nessun verbo corrisponde alla ricerca attuale.",
    },
  },
  pt: {
    title: "100 verbos alemaes mais comuns",
    metaTitle: "100 verbos alemaes mais comuns - lista essencial",
    metaDescription:
      "Consulte 100 verbos alemaes comuns com traducoes e definicoes em cada idioma da interface.",
    filters: {
      searchPlaceholder: "Buscar verbos em alemao...",
    },
    table: {
      number: "No.",
      definition: "Definicao",
      noResults: "Nenhum verbo corresponde a busca atual.",
    },
  },
  ru: {
    title: "100 самых частых немецких глаголов",
    metaTitle: "100 самых частых немецких глаголов - основной список",
    metaDescription:
      "Смотрите 100 частых немецких глаголов с переводами и определениями для всех UI-языков.",
    filters: {
      searchPlaceholder: "Искать немецкие глаголы...",
    },
    table: {
      number: "No.",
      definition: "Определение",
      noResults: "Поиск не нашел глаголов.",
    },
  },
};

export function getGermanVerbListPath(uiLang: UiLanguageCode): string {
  return GERMAN_VERB_LIST_PATHS[uiLang];
}

export function resolveGermanVerbListRoute(path: string): UiLanguageCode | null {
  const entry = Object.entries(GERMAN_VERB_LIST_PATHS).find(([, routePath]) => routePath === path);
  return (entry?.[0] as UiLanguageCode | undefined) ?? null;
}

export function getAllGermanVerbListPaths(): string[] {
  return SUPPORTED_UI_LANGUAGES.map((uiLang) => GERMAN_VERB_LIST_PATHS[uiLang]);
}

export function getGermanVerbListContent(uiLang: UiLanguageCode): GermanVerbListContent {
  return GERMAN_VERB_LIST_CONTENT[uiLang] ?? GERMAN_VERB_LIST_CONTENT.en;
}
