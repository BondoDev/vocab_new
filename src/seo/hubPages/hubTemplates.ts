import type { UiLanguageCode } from "../../data/seo/shared/slugs";

export const SEO_HUB_METADATA: Record<
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

export const WORD_SEO_HUB_METADATA: Record<
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
    summaryTitle: "Páginas SEO de palabras en inglés",
    summaryDescription:
      "Consulta páginas indexadas y paginadas que enlazan a todas las URLs canónicas de palabras en inglés en FluentStellar.",
    levelTitle: (level, page) =>
      page > 1 ? `Páginas SEO de palabras en inglés ${level} - Página ${page}` : `Páginas SEO de palabras en inglés ${level}`,
    levelDescription: (level, page) =>
      page > 1
        ? `Consulta la página ${page} del índice canónico de URLs de palabras en inglés ${level}.`
        : `Consulta el índice canónico de URLs de palabras en inglés ${level}.`,
  },
  fr: {
    summaryTitle: "Pages SEO des mots anglais",
    summaryDescription:
      "Consultez des pages d'index paginées qui relient à toutes les URL canoniques des mots anglais sur FluentStellar.",
    levelTitle: (level, page) =>
      page > 1 ? `Pages SEO des mots anglais ${level} - Page ${page}` : `Pages SEO des mots anglais ${level}`,
    levelDescription: (level, page) =>
      page > 1
        ? `Consultez la page ${page} de l'index canonique des URL de mots anglais ${level}.`
        : `Consultez l'index canonique des URL de mots anglais ${level}.`,
  },
  de: {
    summaryTitle: "SEO-Seiten für englische Wörter",
    summaryDescription:
      "Durchsuchen Sie paginierte Indexseiten mit Links zu allen kanonischen englischen Wort-SEO-URLs auf FluentStellar.",
    levelTitle: (level, page) =>
      page > 1 ? `SEO-Seiten für englische Wörter ${level} - Seite ${page}` : `SEO-Seiten für englische Wörter ${level}`,
    levelDescription: (level, page) =>
      page > 1
        ? `Durchsuchen Sie Seite ${page} des kanonischen URL-Index für englische Wortseiten ${level}.`
        : `Durchsuchen Sie den kanonischen URL-Index für englische Wortseiten ${level}.`,
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
    summaryTitle: "Páginas SEO de palavras em inglês",
    summaryDescription:
      "Consulte páginas de índice paginadas que ligam para todas as URLs canônicas de palavras em inglês no FluentStellar.",
    levelTitle: (level, page) =>
      page > 1 ? `Páginas SEO de palavras em inglês ${level} - Página ${page}` : `Páginas SEO de palavras em inglês ${level}`,
    levelDescription: (level, page) =>
      page > 1
        ? `Consulte a página ${page} do índice canônico de URLs de palavras em inglês ${level}.`
        : `Consulte o índice canônico de URLs de palavras em inglês ${level}.`,
  },
  ru: {
    summaryTitle: "SEO-страницы английских слов",
    summaryDescription:
      "Просматривайте постраничные индексные страницы со ссылками на все канонические URL английских слов на FluentStellar.",
    levelTitle: (level, page) =>
      page > 1 ? `SEO-страницы английских слов ${level} - страница ${page}` : `SEO-страницы английских слов ${level}`,
    levelDescription: (level, page) =>
      page > 1
        ? `Просматривайте страницу ${page} канонического индекса URL английских слов уровня ${level}.`
        : `Просматривайте канонический индекс URL английских слов уровня ${level}.`,
  },
};

// Generic templates for target languages other than English. Simple concatenation,
// no per-language grammatical inflection (kept consistent with the rest of the app).
export const GENERIC_WORD_SEO_HUB_METADATA: Record<
  UiLanguageCode,
  {
    summaryTitle: (languageName: string) => string;
    summaryDescription: (languageName: string) => string;
    levelTitle: (languageName: string, level: string, page: number) => string;
    levelDescription: (languageName: string, level: string, page: number) => string;
  }
> = {
  en: {
    summaryTitle: (languageName) => `${languageName} Word SEO Pages - Browse Canonical Word URLs`,
    summaryDescription: (languageName) =>
      `Browse paginated index pages that link to all canonical ${languageName} word SEO URLs on FluentStellar.`,
    levelTitle: (languageName, level, page) =>
      page > 1 ? `${languageName} ${level} Word SEO Pages - Page ${page}` : `${languageName} ${level} Word SEO Pages`,
    levelDescription: (languageName, level, page) =>
      page > 1
        ? `Browse page ${page} of the canonical ${languageName} ${level} word SEO URL index.`
        : `Browse the canonical ${languageName} ${level} word SEO URL index.`,
  },
  es: {
    summaryTitle: (languageName) => `Páginas SEO de palabras en ${languageName.toLowerCase()}`,
    summaryDescription: (languageName) =>
      `Consulta páginas indexadas y paginadas que enlazan a todas las URLs canónicas de palabras en ${languageName.toLowerCase()} en FluentStellar.`,
    levelTitle: (languageName, level, page) =>
      page > 1
        ? `Páginas SEO de palabras en ${languageName.toLowerCase()} ${level} - Página ${page}`
        : `Páginas SEO de palabras en ${languageName.toLowerCase()} ${level}`,
    levelDescription: (languageName, level, page) =>
      page > 1
        ? `Consulta la página ${page} del índice canónico de URLs de palabras en ${languageName.toLowerCase()} ${level}.`
        : `Consulta el índice canónico de URLs de palabras en ${languageName.toLowerCase()} ${level}.`,
  },
  fr: {
    summaryTitle: (languageName) => `Pages SEO des mots ${languageName.toLowerCase()}`,
    summaryDescription: (languageName) =>
      `Consultez des pages d'index paginées qui relient à toutes les URL canoniques des mots ${languageName.toLowerCase()} sur FluentStellar.`,
    levelTitle: (languageName, level, page) =>
      page > 1
        ? `Pages SEO des mots ${languageName.toLowerCase()} ${level} - Page ${page}`
        : `Pages SEO des mots ${languageName.toLowerCase()} ${level}`,
    levelDescription: (languageName, level, page) =>
      page > 1
        ? `Consultez la page ${page} de l'index canonique des URL de mots ${languageName.toLowerCase()} ${level}.`
        : `Consultez l'index canonique des URL de mots ${languageName.toLowerCase()} ${level}.`,
  },
  de: {
    summaryTitle: (languageName) => `SEO-Seiten für ${languageName.toLowerCase()}e Wörter`,
    summaryDescription: (languageName) =>
      `Durchsuchen Sie paginierte Indexseiten mit Links zu allen kanonischen ${languageName.toLowerCase()}en Wort-SEO-URLs auf FluentStellar.`,
    levelTitle: (languageName, level, page) =>
      page > 1
        ? `SEO-Seiten für ${languageName.toLowerCase()}e Wörter ${level} - Seite ${page}`
        : `SEO-Seiten für ${languageName.toLowerCase()}e Wörter ${level}`,
    levelDescription: (languageName, level, page) =>
      page > 1
        ? `Durchsuchen Sie Seite ${page} des kanonischen URL-Index für ${languageName.toLowerCase()}e Wortseiten ${level}.`
        : `Durchsuchen Sie den kanonischen URL-Index für ${languageName.toLowerCase()}e Wortseiten ${level}.`,
  },
  it: {
    summaryTitle: (languageName) => `Pagine SEO delle parole ${languageName.toLowerCase()}`,
    summaryDescription: (languageName) =>
      `Consulta pagine indice paginate che collegano a tutti gli URL canonici delle parole ${languageName.toLowerCase()} su FluentStellar.`,
    levelTitle: (languageName, level, page) =>
      page > 1
        ? `Pagine SEO delle parole ${languageName.toLowerCase()} ${level} - Pagina ${page}`
        : `Pagine SEO delle parole ${languageName.toLowerCase()} ${level}`,
    levelDescription: (languageName, level, page) =>
      page > 1
        ? `Consulta la pagina ${page} dell'indice canonico degli URL delle parole ${languageName.toLowerCase()} ${level}.`
        : `Consulta l'indice canonico degli URL delle parole ${languageName.toLowerCase()} ${level}.`,
  },
  pt: {
    summaryTitle: (languageName) => `Páginas SEO de palavras em ${languageName.toLowerCase()}`,
    summaryDescription: (languageName) =>
      `Consulte páginas de índice paginadas que ligam para todas as URLs canônicas de palavras em ${languageName.toLowerCase()} no FluentStellar.`,
    levelTitle: (languageName, level, page) =>
      page > 1
        ? `Páginas SEO de palavras em ${languageName.toLowerCase()} ${level} - Página ${page}`
        : `Páginas SEO de palavras em ${languageName.toLowerCase()} ${level}`,
    levelDescription: (languageName, level, page) =>
      page > 1
        ? `Consulte a página ${page} do índice canônico de URLs de palavras em ${languageName.toLowerCase()} ${level}.`
        : `Consulte o índice canônico de URLs de palavras em ${languageName.toLowerCase()} ${level}.`,
  },
  ru: {
    summaryTitle: (languageName) => `SEO-страницы слов: ${languageName.toLowerCase()}`,
    summaryDescription: (languageName) =>
      `Просматривайте постраничные индексные страницы со ссылками на все канонические URL слов (${languageName.toLowerCase()}) на FluentStellar.`,
    levelTitle: (languageName, level, page) =>
      page > 1
        ? `SEO-страницы слов: ${languageName.toLowerCase()} ${level} - страница ${page}`
        : `SEO-страницы слов: ${languageName.toLowerCase()} ${level}`,
    levelDescription: (languageName, level, page) =>
      page > 1
        ? `Просматривайте страницу ${page} канонического индекса URL слов (${languageName.toLowerCase()}) уровня ${level}.`
        : `Просматривайте канонический индекс URL слов (${languageName.toLowerCase()}) уровня ${level}.`,
  },
};
