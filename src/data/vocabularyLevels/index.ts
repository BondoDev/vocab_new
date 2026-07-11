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
  const loadedFile =
    cachedFile ??
    (await fetchVocabularyFile(uiLanguage, targetLanguage));

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

const vocabularyFetchPromises = new Map<string, Promise<VocabularyFile | null>>();

async function fetchVocabularyFile(
  uiLanguage: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
): Promise<VocabularyFile | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const key = `${uiLanguage}/${targetLanguage}`;
  const inFlight = vocabularyFetchPromises.get(key);
  if (inFlight) {
    return inFlight;
  }

  const request = (async () => {
    try {
      const response = await fetch(`/vocabularyLevels/${key}.json`);
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as VocabularyFile;
    } catch {
      return null;
    }
  })();

  vocabularyFetchPromises.set(key, request);
  const result = await request;
  if (!result) {
    // Drop failed loads so a later navigation can retry.
    vocabularyFetchPromises.delete(key);
  }
  return result;
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
    const path = nodeRequire("node:path") as typeof import("node:path");
    const filePath = path.resolve(
      process.cwd(),
      "src",
      "data",
      "vocabularyLevels",
      uiLanguage,
      `${targetLanguage}.json`,
    );
    const loadedFile = JSON.parse(readFileSync(filePath, "utf8")) as VocabularyFile;
    vocabularyFileCache.set(key, loadedFile);
    return loadedFile;
  } catch {
    return null;
  }
}
