import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isSupportedUiLanguage, type UiLanguageCode } from "../data/seo/shared/slugs";
import { readEmbeddedJson } from "../lib/readEmbeddedJson";

// SUPPORTED_UI_LANGUAGES in data/seo/shared/slugs.ts is the canonical
// interface-language list; this name is kept for the provider's consumers.
export type UILanguage = UiLanguageCode;

interface LanguageContextType {
  uiLanguage: UILanguage;
  setUILanguage: (lang: UILanguage) => void;
  t: (key: string) => string;
}

interface TranslationObject {
  [key: string]: string | TranslationObject;
}

type TranslationNode = string | TranslationObject;

type LoadedTranslationData = {
  flat: Record<string, string>;
  root: Record<string, TranslationNode>;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// The id/shape src/entry-server.tsx and workers/word-ssr/src/index.full.ts
// both emit as an inert `<script type="application/json" id="initial-
// interface-data">` data block (CSP Phase 2A migration — no longer a
// `window.__INITIAL_INTERFACE_DATA__` global; see readEmbeddedJson).
const INITIAL_INTERFACE_DATA_ELEMENT_ID = "initial-interface-data";

interface InitialInterfaceDataPayload {
  lang: UILanguage;
  data: unknown;
}

function normalizeTranslationRoot(source: unknown): Record<string, TranslationNode> {
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
    "levelCategory.levelsSelectedPlural": "levelCategory.selection.levelsSelectedPlural",
    "levelCategory.allLevelsSelected": "levelCategory.selection.allLevelsSelected",
    "levelCategory.topicsSelected": "levelCategory.selection.topicsSelected",
    "levelCategory.topicsSelectedPlural": "levelCategory.selection.topicsSelectedPlural",
    "levelCategory.typesSelected": "levelCategory.selection.typesSelected",
    "levelCategory.typesSelectedPlural": "levelCategory.selection.typesSelectedPlural",
    "levelCategory.skipAllTopics": "levelCategory.topics.skipAll",
    "levelCategory.skipAllTypes": "levelCategory.types.skipAll",
    "levelCategory.showAllTopics": "levelCategory.topics.showAll",
    "levelCategory.showFewerTopics": "levelCategory.topics.showFewer",
    "levelCategory.showLessTopics": "levelCategory.topics.showLess",
    "levelCategory.moreTopics": "levelCategory.topics.more",
  };

  return aliases[key] ?? null;
}

function prepareTranslationData(source: unknown): LoadedTranslationData {
  const root = normalizeTranslationRoot(source);
  return {
    flat: flattenTranslations(root),
    root,
  };
}

async function loadLanguageData(lang: UILanguage): Promise<LoadedTranslationData> {
  switch (lang) {
    case "en":
      return prepareTranslationData((await import("../data/interface/english_interface.json")).default);
    case "es":
      return prepareTranslationData((await import("../data/interface/spanish_interface.json")).default);
    case "fr":
      return prepareTranslationData((await import("../data/interface/french_interface.json")).default);
    case "pt":
      return prepareTranslationData((await import("../data/interface/portuguese_interface.json")).default);
    case "it":
      return prepareTranslationData((await import("../data/interface/italian_interface.json")).default);
    case "de":
      return prepareTranslationData((await import("../data/interface/german_interface.json")).default);
    case "ru":
      return prepareTranslationData((await import("../data/interface/russian_interface.json")).default);
    default:
      return prepareTranslationData({});
  }
}

interface LanguageProviderProps {
  children: ReactNode;
  initialUILanguage?: UILanguage;
  initialTranslationData?: unknown;
}

export function readStoredUiLanguage(): UILanguage | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }

  const saved = window.localStorage.getItem("uiLanguage");
  return saved !== null && isSupportedUiLanguage(saved) ? saved : null;
}

function persistUiLanguage(lang: UILanguage): void {
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    window.localStorage.setItem("uiLanguage", lang);
  }
}

function readDocumentUiLanguage(): UILanguage | null {
  if (typeof document === "undefined") {
    return null;
  }

  const lang = document.documentElement.lang?.trim().toLowerCase();
  return lang && isSupportedUiLanguage(lang) ? lang : null;
}

function getInitialUiLanguage(initialUILanguage?: UILanguage): UILanguage {
  if (initialUILanguage) return initialUILanguage;
  // On client, the SSR injects an "initial-interface-data" JSON data block
  // with the page's lang. Prefer that over document.lang / localStorage to
  // prevent a mismatch when the user has a different language stored
  // locally than the prerendered page's language.
  if (typeof window !== "undefined") {
    const payload = readEmbeddedJson<InitialInterfaceDataPayload>(INITIAL_INTERFACE_DATA_ELEMENT_ID);
    // The payload is untrusted page JSON, so check the runtime type too.
    const payloadLang: unknown = payload?.lang;
    if (typeof payloadLang === "string" && isSupportedUiLanguage(payloadLang)) {
      return payloadLang;
    }
  }
  return readDocumentUiLanguage() ?? readStoredUiLanguage() ?? "en";
}

function readInitialInterfaceData(initialUILanguage?: UILanguage): LoadedTranslationData | null {
  if (typeof window === "undefined") {
    return null;
  }

  const initialPayload = readEmbeddedJson<InitialInterfaceDataPayload>(INITIAL_INTERFACE_DATA_ELEMENT_ID);
  const initialLang = getInitialUiLanguage(initialUILanguage);

  if (!initialPayload || initialPayload.lang !== initialLang) {
    return null;
  }

  return prepareTranslationData(initialPayload.data);
}

export function LanguageProvider({
  children,
  initialUILanguage,
  initialTranslationData,
}: LanguageProviderProps) {
  const [uiLanguage, setUILanguage] = useState<UILanguage>(() => getInitialUiLanguage(initialUILanguage));
  const [loadedLanguages, setLoadedLanguages] = useState<Partial<Record<UILanguage, LoadedTranslationData>>>(
    () => {
      const initialLang = getInitialUiLanguage(initialUILanguage);
      const initialData =
        initialTranslationData
          ? prepareTranslationData(initialTranslationData)
          : readInitialInterfaceData(initialUILanguage);
      return initialData ? { [initialLang]: initialData } : {};
    },
  );

  useEffect(() => {
    if (!initialUILanguage) {
      return;
    }

    setUILanguage(initialUILanguage);
  }, [initialUILanguage]);

  const didMountRef = useRef(false);
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    document.documentElement.lang = uiLanguage;
  }, [uiLanguage]);

  useEffect(() => {
    let cancelled = false;

    if (loadedLanguages[uiLanguage]) {
      return () => {
        cancelled = true;
      };
    }

    void loadLanguageData(uiLanguage).then((data) => {
      if (cancelled) {
        return;
      }

      setLoadedLanguages((current) => {
        if (current[uiLanguage]) {
          return current;
        }
        return {
          ...current,
          [uiLanguage]: data,
        };
      });
    });

    return () => {
      cancelled = true;
    };
  }, [loadedLanguages, uiLanguage]);

  // Every selection takes a new id, including selections served from the
  // cache, so a slower load for an earlier selection can never switch the
  // language back (or persist it) after a newer choice. The stale load still
  // populates the cache - its data is valid, only the selection is outdated.
  const latestSelectionIdRef = useRef(0);

  // Depends on loadedLanguages so the cache check never reads a stale map;
  // the identity therefore changes only when a translation file finishes
  // loading, not on unrelated provider renders.
  const handleSetUILanguage = useCallback(
    (lang: UILanguage) => {
      const selectionId = ++latestSelectionIdRef.current;

      if (loadedLanguages[lang]) {
        setUILanguage(lang);
        persistUiLanguage(lang);
        return;
      }

      void loadLanguageData(lang).then((data) => {
        setLoadedLanguages((current) => ({
          ...current,
          [lang]: current[lang] ?? data,
        }));
        if (selectionId !== latestSelectionIdRef.current) {
          return;
        }
        setUILanguage(lang);
        persistUiLanguage(lang);
      });
    },
    [loadedLanguages],
  );

  const currentLanguageData = loadedLanguages[uiLanguage];

  const t = useMemo(() => {
    return (key: string): string => {
      const aliasKey = getAliasKey(key);
      const selectedTranslations = currentLanguageData?.flat ?? {};
      const selectedRoot = currentLanguageData?.root ?? {};

      return (
        selectedTranslations[key] ||
        (aliasKey ? selectedTranslations[aliasKey] : undefined) ||
        lookupNestedTranslation(selectedRoot, key) ||
        (aliasKey ? lookupNestedTranslation(selectedRoot, aliasKey) : undefined) ||
        key
      );
    };
  }, [currentLanguageData]);

  const contextValue = useMemo<LanguageContextType>(
    () => ({ uiLanguage, setUILanguage: handleSetUILanguage, t }),
    [uiLanguage, handleSetUILanguage, t],
  );

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    console.warn("useLanguage called outside of LanguageProvider, using fallback");
    return {
      uiLanguage: "en" as UILanguage,
      setUILanguage: () => {},
      t: (key: string) => key,
    };
  }
  return context;
}
