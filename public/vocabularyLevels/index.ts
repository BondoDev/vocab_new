import {
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
  SUPPORTED_TARGET_LANGUAGES,
  SUPPORTED_LEVELS,
} from "../seo/slugs";

export {
  SUPPORTED_LEVELS,
  type Level as CefrLevelCode,
  type TargetLanguageSlug,
  type UiLanguageCode,
};

export interface VocabularyLevelContent {
  title: string;
  metaTitle?: string;
  metaDescription?: string;
  intro: string;
  introParagraphs?: string[];
  levelDescription: string;
  ctaText: string;
  levelExplanation: {
    heading: string;
    paragraph: string;
    bullets: string[];
  };
  vocabularyScope: {
    heading: string;
    topics: string[];
    wordTypes: string[];
    groups?: Array<{
      heading: string;
      items: string[];
    }>;
  };
  wordCount: {
    heading: string;
    text: string;
    value: number;
  };
  sampleVocabulary: {
    heading: string;
    columns: {
      word: string;
      meaning: string;
    };
    rows: Array<{ word: string; meaning: string }>;
  };
  internalNavigation: {
    heading: string;
  };
  bottomCta?: {
    heading?: string;
    text?: string;
  };
}

interface VocabularyFile {
  targetLanguage: TargetLanguageSlug;
  targetLanguageDisplayName: string;
  levels: Partial<Record<Level, VocabularyLevelContent>>;
}

const vocabularyFileModules: Record<
  UiLanguageCode,
  Record<TargetLanguageSlug, () => Promise<{ default: VocabularyFile }>>
> = {
  de: {
    english: () => import("./de/english.json"),
    french: () => import("./de/french.json"),
    german: () => import("./de/german.json"),
    italian: () => import("./de/italian.json"),
    portuguese: () => import("./de/portuguese.json"),
    russian: () => import("./de/russian.json"),
    spanish: () => import("./de/spanish.json"),
  },
  en: {
    english: () => import("./en/english.json"),
    french: () => import("./en/french.json"),
    german: () => import("./en/german.json"),
    italian: () => import("./en/italian.json"),
    portuguese: () => import("./en/portuguese.json"),
    russian: () => import("./en/russian.json"),
    spanish: () => import("./en/spanish.json"),
  },
  es: {
    english: () => import("./es/english.json"),
    french: () => import("./es/french.json"),
    german: () => import("./es/german.json"),
    italian: () => import("./es/italian.json"),
    portuguese: () => import("./es/portuguese.json"),
    russian: () => import("./es/russian.json"),
    spanish: () => import("./es/spanish.json"),
  },
  fr: {
    english: () => import("./fr/english.json"),
    french: () => import("./fr/french.json"),
    german: () => import("./fr/german.json"),
    italian: () => import("./fr/italian.json"),
    portuguese: () => import("./fr/portuguese.json"),
    russian: () => import("./fr/russian.json"),
    spanish: () => import("./fr/spanish.json"),
  },
  it: {
    english: () => import("./it/english.json"),
    french: () => import("./it/french.json"),
    german: () => import("./it/german.json"),
    italian: () => import("./it/italian.json"),
    portuguese: () => import("./it/portuguese.json"),
    russian: () => import("./it/russian.json"),
    spanish: () => import("./it/spanish.json"),
  },
  pt: {
    english: () => import("./pt/english.json"),
    french: () => import("./pt/french.json"),
    german: () => import("./pt/german.json"),
    italian: () => import("./pt/italian.json"),
    portuguese: () => import("./pt/portuguese.json"),
    russian: () => import("./pt/russian.json"),
    spanish: () => import("./pt/spanish.json"),
  },
  ru: {
    english: () => import("./ru/english.json"),
    french: () => import("./ru/french.json"),
    german: () => import("./ru/german.json"),
    italian: () => import("./ru/italian.json"),
    portuguese: () => import("./ru/portuguese.json"),
    russian: () => import("./ru/russian.json"),
    spanish: () => import("./ru/spanish.json"),
  },
};
const vocabularyFileCache = new Map<string, VocabularyFile>();

export function isSupportedLevel(value: string): value is Level {
  return (SUPPORTED_LEVELS as readonly string[]).includes(value);
}

export function isSupportedTargetLanguage(
  value: string,
): value is TargetLanguageSlug {
  return (SUPPORTED_TARGET_LANGUAGES as readonly string[]).includes(value);
}

export function getVocabularyLevelContent(
  uiLanguage: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: Level,
): { file: VocabularyFile; levelContent: VocabularyLevelContent } | null {
  const key = `./${uiLanguage}/${targetLanguage}.json`;
  const loadedFile =
    vocabularyFileCache.get(key) ?? loadVocabularyFileSync(uiLanguage, targetLanguage);

  if (!loadedFile) {
    return null;
  }

  const levelContent = loadedFile.levels[level];
  if (!levelContent) {
    return null;
  }

  return {
    file: loadedFile,
    levelContent,
  };
}

export async function loadVocabularyLevelContent(
  uiLanguage: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: Level,
): Promise<{ file: VocabularyFile; levelContent: VocabularyLevelContent } | null> {
  const key = `./${uiLanguage}/${targetLanguage}.json`;
  const cachedFile = vocabularyFileCache.get(key);
  const loader = vocabularyFileModules[uiLanguage]?.[targetLanguage];
  const loadedFile =
    cachedFile ??
    ((await loader?.())?.default ?? null);

  if (!loadedFile) {
    return null;
  }

  vocabularyFileCache.set(key, loadedFile);
  const levelContent = loadedFile.levels[level];

  if (!levelContent) {
    return null;
  }

  return {
    file: loadedFile,
    levelContent,
  };
}

function loadVocabularyFileSync(
  uiLanguage: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): VocabularyFile | null {
  if (!import.meta.env.SSR) {
    return null;
  }

  const key = `./${uiLanguage}/${targetLanguage}.json`;
  const cachedFile = vocabularyFileCache.get(key);
  if (cachedFile) {
    return cachedFile;
  }

  try {
    const nodeRequire = (0, eval)("require") as NodeRequire;
    const { readFileSync } = nodeRequire("node:fs") as typeof import("node:fs");
    const { fileURLToPath } = nodeRequire("node:url") as typeof import("node:url");
    const filePath = fileURLToPath(
      new URL(`./${uiLanguage}/${targetLanguage}.json`, import.meta.url),
    );
    const loadedFile = JSON.parse(readFileSync(filePath, "utf8")) as VocabularyFile;
    vocabularyFileCache.set(key, loadedFile);
    return loadedFile;
  } catch {
    return null;
  }
}
