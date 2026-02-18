import { createContext, useContext, useState, ReactNode } from "react";
import englishInterface from "../data/interface/english_interface.json";
import spanishInterface from "../data/interface/spanish_interface.json";
import frenchInterface from "../data/interface/french_interface.json";
import portugueseInterface from "../data/interface/portuguese_interface.json";
import italianInterface from "../data/interface/italian_interface.json";
import germanInterface from "../data/interface/german_interface.json";
import russianInterface from "../data/interface/russian_interface.json";

type UILanguage = "en" | "es" | "fr" | "pt" | "it" | "de" | "ru";

interface LanguageContextType {
  uiLanguage: UILanguage;
  setUILanguage: (lang: UILanguage) => void;
  t: (key: string) => string;
}

interface TranslationObject {
  [key: string]: string | TranslationObject;
}

type TranslationNode = string | TranslationObject;

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
  en: flattenTranslations(
    englishInterface as unknown as Record<string, TranslationNode>,
  ),
  es: flattenTranslations(
    spanishInterface as unknown as Record<string, TranslationNode>,
  ),
  fr: flattenTranslations(
    frenchInterface as unknown as Record<string, TranslationNode>,
  ),
  pt: flattenTranslations(
    portugueseInterface as unknown as Record<string, TranslationNode>,
  ),
  it: flattenTranslations(
    italianInterface as unknown as Record<string, TranslationNode>,
  ),
  de: flattenTranslations(
    germanInterface as unknown as Record<string, TranslationNode>,
  ),
  ru: flattenTranslations(
    russianInterface as unknown as Record<string, TranslationNode>,
  ),
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [uiLanguage, setUILanguage] = useState<UILanguage>(() => {
    const saved = localStorage.getItem("uiLanguage");
    return saved === "en" || saved === "es" || saved === "fr" || saved === "pt" || saved === "it" || saved === "de" || saved === "ru"
      ? saved
      : "en";
  });

  const handleSetUILanguage = (lang: UILanguage) => {
    setUILanguage(lang);
    localStorage.setItem("uiLanguage", lang);
  };

  const t = (key: string): string => {
    const selectedTranslations = translations[uiLanguage];
    const fallbackTranslations = translations.en;
    const aliasKey = getAliasKey(key);

    return (
      selectedTranslations[key] ||
      (aliasKey ? selectedTranslations[aliasKey] : undefined) ||
      fallbackTranslations[key] ||
      (aliasKey ? fallbackTranslations[aliasKey] : undefined) ||
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
    return {
      uiLanguage: "en" as UILanguage,
      setUILanguage: () => {},
      t: (key: string) => key,
    };
  }
  return context;
}
