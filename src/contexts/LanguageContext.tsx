import { createContext, useContext, useState, ReactNode } from "react";
import englishInterface from "../data/interface/english_interface.json";
import spanishInterface from "../data/interface/spanish_interface.json";
import frenchInterface from "../data/interface/french_interface.json";
import portugueseInterface from "../data/interface/portuguese_interface.json";
import italianInterface from "../data/interface/italian_interface.json";
import germanInterface from "../data/interface/german_interface.json";
import russianInterface from "../data/interface/russian_interface.json";

export type UILanguage = "en" | "es" | "fr" | "pt" | "it" | "de" | "ru";

interface LanguageContextType {
  uiLanguage: UILanguage;
  setUILanguage: (lang: UILanguage) => void;
  t: (key: string) => string;
}

interface TranslationObject {
  [key: string]: string | TranslationObject;
}

type TranslationNode = string | TranslationObject;

function normalizeTranslationRoot(
  source: unknown,
): Record<string, TranslationNode> {
  const candidate =
    source &&
    typeof source === "object" &&
    "default" in (source as Record<string, unknown>)
      ? (source as { default: unknown }).default
      : source;

  if (!candidate || typeof candidate !== "object") {
    return {};
  }

  return candidate as Record<string, TranslationNode>;
}

const LanguageContext = createContext<LanguageContextType | undefined>(
  undefined,
);

function flattenTranslations(
  node: Record<string, TranslationNode>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "string") {
      result[path] = value;
      continue;
    }

    Object.assign(result, flattenTranslations(value, path));
  }

  return result;
}

function lookupNestedTranslation(
  root: Record<string, TranslationNode>,
  key: string,
): string | undefined {
  const parts = key.split(".");
  let current: unknown = root;

  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in (current as Record<string, unknown>))) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === "string" ? current : undefined;
}

function getAliasKey(key: string): string | null {
  if (key.startsWith("level.")) {
    return key.replace("level.", "levels.");
  }

  if (key.startsWith("wordType.")) {
    return key.replace("wordType.", "wordTypes.");
  }

  const aliases: Record<string, string> = {
    "levelCategory.levelsSelected": "levelCategory.selection.levelsSelected",
    "levelCategory.levelsSelectedPlural":
      "levelCategory.selection.levelsSelectedPlural",
    "levelCategory.allLevelsSelected":
      "levelCategory.selection.allLevelsSelected",
    "levelCategory.topicsSelected": "levelCategory.selection.topicsSelected",
    "levelCategory.topicsSelectedPlural":
      "levelCategory.selection.topicsSelectedPlural",
    "levelCategory.typesSelected": "levelCategory.selection.typesSelected",
    "levelCategory.typesSelectedPlural":
      "levelCategory.selection.typesSelectedPlural",
    "levelCategory.skipAllTopics": "levelCategory.topics.skipAll",
    "levelCategory.skipAllTypes": "levelCategory.types.skipAll",
    "levelCategory.showAllTopics": "levelCategory.topics.showAll",
    "levelCategory.showFewerTopics": "levelCategory.topics.showFewer",
    "levelCategory.showLessTopics": "levelCategory.topics.showLess",
    "levelCategory.moreTopics": "levelCategory.topics.more",
  };

  return aliases[key] ?? null;
}

const translations: Record<UILanguage, Record<string, string>> = {
  en: flattenTranslations(normalizeTranslationRoot(englishInterface)),
  es: flattenTranslations(normalizeTranslationRoot(spanishInterface)),
  fr: flattenTranslations(normalizeTranslationRoot(frenchInterface)),
  pt: flattenTranslations(normalizeTranslationRoot(portugueseInterface)),
  it: flattenTranslations(normalizeTranslationRoot(italianInterface)),
  de: flattenTranslations(normalizeTranslationRoot(germanInterface)),
  ru: flattenTranslations(normalizeTranslationRoot(russianInterface)),
};

const translationRoots: Record<UILanguage, Record<string, TranslationNode>> = {
  en: normalizeTranslationRoot(englishInterface),
  es: normalizeTranslationRoot(spanishInterface),
  fr: normalizeTranslationRoot(frenchInterface),
  pt: normalizeTranslationRoot(portugueseInterface),
  it: normalizeTranslationRoot(italianInterface),
  de: normalizeTranslationRoot(germanInterface),
  ru: normalizeTranslationRoot(russianInterface),
};

interface LanguageProviderProps {
  children: ReactNode;
  initialUILanguage?: UILanguage;
}

function readStoredUiLanguage(): UILanguage | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }

  const saved = window.localStorage.getItem("uiLanguage");
  return saved === "en" || saved === "es" || saved === "fr" || saved === "pt" || saved === "it" || saved === "de" || saved === "ru"
    ? saved
    : null;
}

export function LanguageProvider({
  children,
  initialUILanguage = "en",
}: LanguageProviderProps) {
  const [uiLanguage, setUILanguage] = useState<UILanguage>(
    () => readStoredUiLanguage() ?? initialUILanguage,
  );

  const handleSetUILanguage = (lang: UILanguage) => {
    setUILanguage(lang);
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
      window.localStorage.setItem("uiLanguage", lang);
    }
  };

  const t = (key: string): string => {
    const selectedTranslations = translations[uiLanguage];
    const fallbackTranslations = translations.en;
    const aliasKey = getAliasKey(key);
    const selectedRoot = translationRoots[uiLanguage];
    const fallbackRoot = translationRoots.en;

    return (
      selectedTranslations[key] ||
      (aliasKey ? selectedTranslations[aliasKey] : undefined) ||
      lookupNestedTranslation(selectedRoot, key) ||
      (aliasKey ? lookupNestedTranslation(selectedRoot, aliasKey) : undefined) ||
      fallbackTranslations[key] ||
      (aliasKey ? fallbackTranslations[aliasKey] : undefined) ||
      lookupNestedTranslation(fallbackRoot, key) ||
      (aliasKey ? lookupNestedTranslation(fallbackRoot, aliasKey) : undefined) ||
      key
    );
  };

  return (
    <LanguageContext.Provider
      value={{ uiLanguage, setUILanguage: handleSetUILanguage, t }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    console.warn(
      "useLanguage called outside of LanguageProvider, using fallback",
    );
    const fallbackRoot = translationRoots.en;
    return {
      uiLanguage: "en" as UILanguage,
      setUILanguage: () => {},
      t: (key: string) => lookupNestedTranslation(fallbackRoot, key) || key,
    };
  }
  return context;
}
