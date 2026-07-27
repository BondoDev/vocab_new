import type { UiLanguageCode } from "../../../../data/seo/shared/slugs";

export interface TableSearchCopy {
  searchPlaceholder: string;
  noResults: string;
}

// Generic, table-shape-agnostic search copy (not authored per targetLanguage
// x uiLanguage like the rest of this content) — used only where a table
// family has no existing localized search copy of its own (currently
// pastForms100Verbs; common100Verbs already authors its own richer
// "Search {Language} verbs..." placeholder per entry and keeps using that).
const TABLE_SEARCH_COPY: Record<UiLanguageCode, TableSearchCopy> = {
  en: { searchPlaceholder: "Search the table...", noResults: "No rows match your search." },
  es: { searchPlaceholder: "Buscar en la tabla...", noResults: "Ninguna fila coincide con tu búsqueda." },
  de: { searchPlaceholder: "Tabelle durchsuchen...", noResults: "Keine Zeilen entsprechen Ihrer Suche." },
  fr: {
    searchPlaceholder: "Rechercher dans le tableau...",
    noResults: "Aucune ligne ne correspond à votre recherche.",
  },
  it: { searchPlaceholder: "Cerca nella tabella...", noResults: "Nessuna riga corrisponde alla tua ricerca." },
  pt: { searchPlaceholder: "Pesquisar na tabela...", noResults: "Nenhuma linha corresponde à sua pesquisa." },
  ru: { searchPlaceholder: "Поиск по таблице...", noResults: "Нет строк, соответствующих запросу." },
};

export function getTableSearchCopy(uiLang: UiLanguageCode): TableSearchCopy {
  return TABLE_SEARCH_COPY[uiLang] ?? TABLE_SEARCH_COPY.en;
}
