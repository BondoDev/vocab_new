import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router";
import {
  getUiVocabularyLanguage,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../data/seo/shared/slugs";
import {
  getWordBrowseSearchData,
  getWordBrowseSearchShardKey,
  type WordBrowseSearchWordEntry,
} from "../../data/seo/wordPages/wordBrowseSearchData";
import {
  buildHydrationWordPageData,
  buildResolvedWordPageData,
  type HydrationWordPageData,
  type ResolvedWordPageData,
  type WordPageVocabEntry,
} from "../../data/seo/wordPages/wordPageData";
import { WordSeoPageView } from "./WordSeoPageView";

/**
 * Client/production wrapper around the shared, server-safe
 * `WordSeoPageView`. This is the component `App.tsx` renders directly (its
 * import path and prop interface are unchanged from before this split), and
 * it's also what the SSR entry (`src/entry-server.tsx`, used by the Node
 * SSR runtime and the Worker data build)
 * renders — it owns every piece of data-acquisition behavior that requires
 * a heavy or browser-only import:
 *
 *   - full-vocabulary fallback loading (`wordVocabModules`, below) — used
 *     only when a route renders without pre-resolved `initialData` (e.g. a
 *     client-side navigation that didn't go through a fresh SSR/prerender);
 *   - browse-search shard loading (`getWordBrowseSearchData`) — used only
 *     when the user actually focuses/types in the in-page search box.
 *
 * The staging Cloudflare Worker's render-entry.tsx deliberately imports
 * `WordSeoPageView` directly instead of this file, specifically to avoid
 * pulling either of the above into the Worker's SSR bundle — see that
 * file's header comment and the bundle-size investigation in the project's
 * migration report for why. Keep both loaders' imports in THIS file only;
 * do not move them into WordSeoPageView.tsx.
 */

type FullVocabEntry = WordPageVocabEntry;

interface WordPageHydrationPayload {
  pathname: string;
  data: HydrationWordPageData | null;
}

declare global {
  interface Window {
    __WORD_PAGE_DATA__?: WordPageHydrationPayload;
  }
}

const wordVocabModules = import.meta.glob(
  "../../data/vocabulary/*/vocabulary.json",
) as Record<string, () => Promise<{ default: FullVocabEntry[] }>>;

function getHydratedWordPageData(pathname: string): HydrationWordPageData | null {
  if (typeof window === "undefined") {
    return null;
  }

  const payload = window.__WORD_PAGE_DATA__;
  if (!payload || payload.pathname !== pathname) {
    return null;
  }

  return payload.data ?? null;
}

function normalizeWordPageDataForRender(
  data: ResolvedWordPageData | HydrationWordPageData | null | undefined,
  browsePage: number,
): HydrationWordPageData | null {
  if (!data) {
    return null;
  }

  if ("browseWordsTotalCount" in data) {
    return data;
  }

  return buildHydrationWordPageData(data, browsePage);
}

function createEmptyHydrationWordPageData(browsePage: number): HydrationWordPageData {
  const safeBrowsePage = Number.isFinite(browsePage) && browsePage > 0 ? Math.floor(browsePage) : 1;
  return {
    wordEntry: null,
    displayDefinition: "",
    displayWordLemma: "",
    displayWordType: "",
    displayCategory: "",
    relatedWords: [],
    discoveryWords: [],
    browseWords: [],
    otherMeanings: [],
    browseWordsTotalCount: 0,
    browsePage: safeBrowsePage,
  };
}

interface WordSeoPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  wordSlug: string;
  conceptId?: string | null;
  browsePage?: number;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
  initialData?: ResolvedWordPageData | null;
}

export function WordSeoPage({
  uiLang,
  targetLanguage,
  wordSlug,
  conceptId,
  browsePage = 1,
  onStartPractice,
  initialData,
}: WordSeoPageProps) {
  const location = useLocation();

  const routeHydrationData = useMemo(
    () =>
      normalizeWordPageDataForRender(
        initialData ?? getHydratedWordPageData(location.pathname),
        browsePage,
      ),
    [browsePage, initialData, location.pathname],
  );

  const [pageData, setPageData] = useState<HydrationWordPageData | null | undefined>(
    routeHydrationData ?? undefined,
  );
  const [isBrowseLoading, setIsBrowseLoading] = useState(false);
  const [browseSearchWords, setBrowseSearchWords] = useState<WordBrowseSearchWordEntry[] | null>(null);
  const [loadedBrowseSearchShardKey, setLoadedBrowseSearchShardKey] = useState<string | null>(null);
  const [isBrowseSearchLoading, setIsBrowseSearchLoading] = useState(false);
  const [browseSearchError, setBrowseSearchError] = useState<string | null>(null);

  const wordEntry = pageData?.wordEntry;
  const browseSearchShardKey = wordEntry
    ? getWordBrowseSearchShardKey(targetLanguage, wordEntry.level)
    : null;

  useEffect(() => {
    if (browseSearchShardKey && browseSearchShardKey === loadedBrowseSearchShardKey) {
      return;
    }
    setBrowseSearchWords(null);
    setLoadedBrowseSearchShardKey(null);
    setIsBrowseSearchLoading(false);
    setBrowseSearchError(null);
  }, [browseSearchShardKey, loadedBrowseSearchShardKey]);

  async function ensureBrowseSearchDataLoaded() {
    if (!wordEntry || !browseSearchShardKey) {
      return;
    }
    if (browseSearchWords && loadedBrowseSearchShardKey === browseSearchShardKey) {
      return;
    }
    if (isBrowseSearchLoading) {
      return;
    }

    setIsBrowseSearchLoading(true);
    setBrowseSearchError(null);

    try {
      const data = await getWordBrowseSearchData(targetLanguage, wordEntry.level);
      if (!data || data.words.length === 0) {
        setBrowseSearchError("Search is temporarily unavailable. Browse links still work.");
        return;
      }
      setBrowseSearchWords(data.words);
      setLoadedBrowseSearchShardKey(browseSearchShardKey);
    } catch {
      setBrowseSearchError("Search is temporarily unavailable. Browse links still work.");
    } finally {
      setIsBrowseSearchLoading(false);
    }
  }

  useEffect(() => {
    if (routeHydrationData) {
      setPageData(routeHydrationData);
      setIsBrowseLoading(false);
      return;
    }

    setPageData(undefined);
    setIsBrowseLoading(true);

    const key = `../../data/vocabulary/${targetLanguage}/vocabulary.json`;
    const loader = wordVocabModules[key];
    if (!loader) {
      setPageData(createEmptyHydrationWordPageData(browsePage));
      setIsBrowseLoading(false);
      return;
    }

    let cancelled = false;
    loader().then(async (mod) => {
      if (cancelled) return;
      const uiVocabLang = getUiVocabularyLanguage(uiLang);
      let uiVocabulary: FullVocabEntry[] | null = null;
      if (uiVocabLang !== targetLanguage) {
        const uiKey = `../../data/vocabulary/${uiVocabLang}/vocabulary.json`;
        const uiLoader = wordVocabModules[uiKey];
        if (uiLoader) {
          const uiMod = await uiLoader();
          if (cancelled) return;
          uiVocabulary = uiMod.default;
        }
      }

      const resolved = buildResolvedWordPageData({
        uiLang,
        targetLanguage,
        wordSlug,
        conceptId,
        vocabulary: mod.default,
        uiVocabulary,
      });
      setPageData(buildHydrationWordPageData(resolved, browsePage));
      setIsBrowseLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setPageData(createEmptyHydrationWordPageData(browsePage));
      setIsBrowseLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [browsePage, conceptId, routeHydrationData, targetLanguage, uiLang, wordSlug]);

  return (
    <WordSeoPageView
      uiLang={uiLang}
      targetLanguage={targetLanguage}
      wordSlug={wordSlug}
      conceptId={conceptId}
      browsePage={browsePage}
      onStartPractice={onStartPractice}
      pageData={pageData}
      isBrowseLoading={isBrowseLoading}
      browseSearchWords={browseSearchWords}
      loadedBrowseSearchShardKey={loadedBrowseSearchShardKey}
      isBrowseSearchLoading={isBrowseSearchLoading}
      browseSearchError={browseSearchError}
      onRequestBrowseSearchData={() => {
        void ensureBrowseSearchDataLoaded();
      }}
    />
  );
}
