import { useCallback, useEffect, useState } from "react";
import { readEmbeddedJson } from "../../../lib/readEmbeddedJson";
import { loadLevelExplorerRows } from "../../../data/seo/vocabularyLevels/levelExplorerData";
import {
  LEVEL_EXPLORER_INITIAL_DATA_ELEMENT_ID,
  toSearchableLevelExplorerRows,
  type LevelExplorerInitialData,
  type LevelExplorerSearchableRow,
} from "../../../data/seo/vocabularyLevels/levelExplorerRows";
import type { Level, TargetLanguageSlug, UiLanguageCode } from "../../../data/seo/shared/slugs";

export type LevelExplorerLoadStatus = "idle" | "loading" | "ready" | "error";

export interface LevelExplorerRowsState {
  // Server-rendered first page (SSR prop or the embedded JSON block); null
  // after a client-side navigation into the page.
  initial: LevelExplorerInitialData | null;
  // The complete, searchable list once loaded.
  rows: LevelExplorerSearchableRow[] | null;
  totalWords: number | null;
  status: LevelExplorerLoadStatus;
  // Starts the complete-list download (idempotent).
  requestRows: () => void;
  retry: () => void;
}

// The prerendered first page for this exact URL, from the prop (SSR) or the
// embedded JSON block (browser). Both must yield the same rows so the first
// browser render matches the HTML.
function readInitialData(
  pathname: string,
  fromProps: LevelExplorerInitialData | null | undefined,
): LevelExplorerInitialData | null {
  const data = fromProps ?? readEmbeddedJson<LevelExplorerInitialData>(LEVEL_EXPLORER_INITIAL_DATA_ELEMENT_ID);
  return data && data.pathname === pathname ? data : null;
}

// Data ownership for one CEFR page's word list. A fresh page load renders
// from the prerendered first page and downloads the complete list only when
// the visitor needs it (search, another page, or prefetch on intent), never
// during SSR — so server and first client render stay identical. A
// client-side navigation into the page has no prerendered rows and loads
// the list immediately (the per-level files are small).
export function useLevelExplorerRows(
  pathname: string,
  uiLang: UiLanguageCode,
  targetLanguage: TargetLanguageSlug,
  level: Level,
  initialFromProps: LevelExplorerInitialData | null | undefined,
): LevelExplorerRowsState {
  const [initial] = useState(() => readInitialData(pathname, initialFromProps));
  const [requested, setRequested] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState<LevelExplorerSearchableRow[] | null>(null);
  const [status, setStatus] = useState<LevelExplorerLoadStatus>("idle");

  const needsRows = requested || initial === null;

  useEffect(() => {
    if (!needsRows || rows) {
      return;
    }
    let cancelled = false;
    setStatus("loading");
    loadLevelExplorerRows(uiLang, targetLanguage, level)
      .then((loaded) => {
        if (cancelled) return;
        setRows(toSearchableLevelExplorerRows(loaded));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [needsRows, rows, uiLang, targetLanguage, level, attempt]);

  const requestRows = useCallback(() => setRequested(true), []);
  const retry = useCallback(() => {
    setRequested(true);
    setAttempt((value) => value + 1);
  }, []);

  return {
    initial,
    rows,
    totalWords: rows?.length ?? initial?.totalWords ?? null,
    status,
    requestRows,
    retry,
  };
}
