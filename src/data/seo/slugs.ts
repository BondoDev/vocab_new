export const SUPPORTED_UI_LANGUAGES = ["en", "es", "de", "fr", "ru", "pt", "it"] as const;
export const SUPPORTED_TARGET_LANGUAGES = [
  "english",
  "german",
  "spanish",
  "french",
  "italian",
  "portuguese",
  "russian",
] as const;
export const SUPPORTED_LEVELS = ["a1", "a2", "b1", "b2", "c1", "c2"] as const;

export type UiLanguageCode = (typeof SUPPORTED_UI_LANGUAGES)[number];
export type TargetLanguageSlug = (typeof SUPPORTED_TARGET_LANGUAGES)[number];
export type Level = (typeof SUPPORTED_LEVELS)[number];
export type PageType = "vocab-practice";
export type PageKey = `${TargetLanguageSlug}:${Level}:${PageType}`;
export interface LocalizedVocabularyRoute {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: Level;
  path: string;
  slug: string;
}

const TARGET_NAME_SLUGS: Record<UiLanguageCode, Record<TargetLanguageSlug, string>> = {
  en: {
    english: "english",
    german: "german",
    spanish: "spanish",
    french: "french",
    italian: "italian",
    portuguese: "portuguese",
    russian: "russian",
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
    english: "englisch",
    german: "deutsch",
    spanish: "spanisch",
    french: "franzoesisch",
    italian: "italienisch",
    portuguese: "portugiesisch",
    russian: "russisch",
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
  ru: {
    english: "angliiskii",
    german: "nemetskii",
    spanish: "ispanskii",
    french: "frantsuzskii",
    italian: "italyanskii",
    portuguese: "portugalskii",
    russian: "russkii",
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
  it: {
    english: "inglese",
    german: "tedesco",
    spanish: "spagnolo",
    french: "francese",
    italian: "italiano",
    portuguese: "portoghese",
    russian: "russo",
  },
};

const SLUG_PATTERNS: Record<UiLanguageCode, (targetSlug: string, level: Level) => string> = {
  en: (targetSlug, level) => `${targetSlug}-${level}-vocabulary-practice`,
  es: (targetSlug, level) => `vocabulario-${targetSlug}-${level}-practica`,
  de: (targetSlug, level) => `${targetSlug}-${level}-wortschatz-ueben`,
  fr: (targetSlug, level) => `vocabulaire-${targetSlug}-${level}-pratique`,
  ru: (targetSlug, level) => `slovar-${targetSlug}-${level}-praktika`,
  pt: (targetSlug, level) => `vocabulario-${targetSlug}-${level}-pratica`,
  it: (targetSlug, level) => `vocabolario-${targetSlug}-${level}-pratica`,
};

function createPageKey(targetLanguage: TargetLanguageSlug, level: Level): PageKey {
  return `${targetLanguage}:${level}:vocab-practice`;
}

function parsePageKey(pageKey: PageKey): {
  targetLanguage: TargetLanguageSlug;
  level: Level;
  pageType: PageType;
} {
  const [targetLanguage, level, pageType] = pageKey.split(":") as [
    TargetLanguageSlug,
    Level,
    PageType,
  ];
  return { targetLanguage, level, pageType };
}

export const slugs: Record<UiLanguageCode, Record<PageKey, string>> =
  SUPPORTED_UI_LANGUAGES.reduce((acc, uiLang) => {
    const byKey = {} as Record<PageKey, string>;

    SUPPORTED_TARGET_LANGUAGES.forEach((targetLanguage) => {
      SUPPORTED_LEVELS.forEach((level) => {
        const pageKey = createPageKey(targetLanguage, level);
        byKey[pageKey] = SLUG_PATTERNS[uiLang](TARGET_NAME_SLUGS[uiLang][targetLanguage], level);
      });
    });

    acc[uiLang] = byKey;
    return acc;
  }, {} as Record<UiLanguageCode, Record<PageKey, string>>);

export function isSupportedUiLanguage(value: string): value is UiLanguageCode {
  return (SUPPORTED_UI_LANGUAGES as readonly string[]).includes(value);
}

export function getPageKeyFromSlug(uiLang: UiLanguageCode, slug: string): PageKey | null {
  const entries = Object.entries(slugs[uiLang]) as Array<[PageKey, string]>;
  const found = entries.find(([, localizedSlug]) => localizedSlug === slug);
  return found ? found[0] : null;
}

export function getSlugForPage(uiLang: UiLanguageCode, pageKey: PageKey): string | null {
  return slugs[uiLang][pageKey] ?? null;
}

export function buildVocabularyPageKey(targetLanguage: TargetLanguageSlug, level: Level): PageKey {
  return createPageKey(targetLanguage, level);
}

export function buildLocalizedVocabularyPath(
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: Level,
): string | null {
  const pageKey = buildVocabularyPageKey(targetLanguage, level);
  const slug = getSlugForPage(uiLang, pageKey);
  return slug ? `/${uiLang}/${slug}` : null;
}

export function resolveVocabularyRoute(uiLangRaw: string, slug: string): {
  uiLang: UiLanguageCode;
  pageKey: PageKey;
  targetLanguage: TargetLanguageSlug;
  level: Level;
} | null {
  if (!isSupportedUiLanguage(uiLangRaw)) {
    return null;
  }

  const pageKey = getPageKeyFromSlug(uiLangRaw, slug);
  if (!pageKey) {
    return null;
  }

  const parsed = parsePageKey(pageKey);
  return {
    uiLang: uiLangRaw,
    pageKey,
    targetLanguage: parsed.targetLanguage,
    level: parsed.level,
  };
}

export function getAllLocalizedVocabularyRoutes(): LocalizedVocabularyRoute[] {
  const routes: LocalizedVocabularyRoute[] = [];

  SUPPORTED_UI_LANGUAGES.forEach((uiLang) => {
    SUPPORTED_TARGET_LANGUAGES.forEach((targetLanguage) => {
      SUPPORTED_LEVELS.forEach((level) => {
        const path = buildLocalizedVocabularyPath(uiLang, targetLanguage, level);
        const pageKey = buildVocabularyPageKey(targetLanguage, level);
        const slug = getSlugForPage(uiLang, pageKey);

        if (!path || !slug) {
          return;
        }

        routes.push({
          uiLang,
          targetLanguage,
          level,
          path,
          slug,
        });
      });
    });
  });

  return routes;
}
