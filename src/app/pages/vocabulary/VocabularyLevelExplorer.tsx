import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { buildWordPath } from "../../../data/seo/wordPages/wordSlugs";
import {
  TARGET_LANGUAGE_TO_UI_LANGUAGE,
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../../data/seo/shared/slugs";
import {
  LEVEL_EXPLORER_PAGE_SIZE,
  buildLevelExplorerSearch,
  clampLevelExplorerPage,
  filterLevelExplorerRows,
  getLevelExplorerPageCount,
  getLevelExplorerPageItems,
  parseLevelExplorerUrlState,
  sliceLevelExplorerPage,
  type LevelExplorerMeaningKind,
  type LevelExplorerRow,
} from "../../../data/seo/vocabularyLevels/levelExplorerRows";
import {
  formatCefrCount,
  formatCefrWordCount,
  getCefrLevelCode,
  type CefrPageCopy,
} from "../../../data/seo/vocabularyLevels/cefrPageCopy";
import { getLevelExplorerMeaningKind } from "../../../data/seo/vocabularyLevels/levelExplorerData";
import type { LevelExplorerRowsState } from "./useLevelExplorerRows";

export const VOCABULARY_EXPLORER_ID = "vocabulary";
const SEARCH_URL_DELAY_MS = 250;

interface VocabularyLevelExplorerProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: Level;
  copy: CefrPageCopy;
  data: LevelExplorerRowsState;
}

// Section 2 of the CEFR page: the level's real word list with meanings,
// 40 rows per page, simple search, and URL state (?q=, ?page=).
//
// Hydration contract: the server always renders page 1 without a query (the
// canonical state), and the first browser render must match it, so the URL's
// query/page are applied only after mount (`hydrated`). Afterwards the URL
// is the source of truth for the page number and the committed query, which
// keeps Back/Forward and shared links working; typing updates the visible
// results immediately and writes ?q= after a short pause (replace, so each
// keystroke doesn't add a history entry). Page changes push a history entry.
export function VocabularyLevelExplorer({ uiLang, targetLanguage, level, copy, data }: VocabularyLevelExplorerProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const sectionRef = useRef<HTMLElement>(null);
  const [hydrated, setHydrated] = useState(false);
  const urlState = useMemo(
    () => (hydrated ? parseLevelExplorerUrlState(location.search) : { query: "", page: 1 }),
    [hydrated, location.search],
  );
  const [inputValue, setInputValue] = useState("");
  // The query this component last wrote to the URL; a URL query that differs
  // came from navigation (Back/Forward, a shared link) and replaces the input.
  const committedQueryRef = useRef("");
  const searchTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (urlState.query !== committedQueryRef.current) {
      committedQueryRef.current = urlState.query;
      setInputValue(urlState.query);
    }
  }, [urlState.query]);

  useEffect(
    () => () => {
      if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
    },
    [],
  );

  const { initial, rows, status, requestRows, retry } = data;
  const query = hydrated ? inputValue.trim() : "";
  // While typing, the URL's page still belongs to the previous query; results
  // for a new query always start on page 1.
  const requestedPage = query === urlState.query ? urlState.page : 1;
  const needsCompleteList = query.length > 0 || requestedPage > 1;

  useEffect(() => {
    if (needsCompleteList) requestRows();
  }, [needsCompleteList, requestRows]);

  const filteredRows = useMemo(() => (rows ? filterLevelExplorerRows(rows, query) : null), [rows, query]);

  let visibleRows: LevelExplorerRow[] | null = null;
  let resultCount: number | null = null;
  let page = 1;
  if (filteredRows) {
    resultCount = filteredRows.length;
    page = clampLevelExplorerPage(requestedPage, resultCount);
    visibleRows = sliceLevelExplorerPage(filteredRows, page);
  } else if (!needsCompleteList && initial) {
    resultCount = initial.totalWords;
    visibleRows = initial.rows;
  } else if (initial) {
    // Waiting for the complete list: keep the page count known from SSR.
    resultCount = query ? null : initial.totalWords;
    page = requestedPage;
  }
  const pageCount = resultCount === null ? null : getLevelExplorerPageCount(resultCount);
  const meaningKind: LevelExplorerMeaningKind = initial?.meaningKind ?? getLevelExplorerMeaningKind(uiLang, targetLanguage);
  const levelCode = getCefrLevelCode(level);
  const targetTag = TARGET_LANGUAGE_TO_UI_LANGUAGE[targetLanguage];

  const writeUrl = (next: { query: string; page: number }, replace: boolean) => {
    const search = buildLevelExplorerSearch(location.search, next);
    committedQueryRef.current = next.query.trim();
    navigate({ pathname: location.pathname, search, hash: "" }, { replace, preventScrollReset: true });
  };

  const handleInput = (value: string) => {
    setInputValue(value);
    if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
    searchTimerRef.current = window.setTimeout(() => {
      searchTimerRef.current = null;
      writeUrl({ query: value, page: 1 }, true);
    }, SEARCH_URL_DELAY_MS);
  };

  const clearSearch = () => {
    if (searchTimerRef.current !== null) window.clearTimeout(searchTimerRef.current);
    setInputValue("");
    writeUrl({ query: "", page: 1 }, true);
  };

  const goToPage = (nextPage: number) => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    writeUrl({ query, page: nextPage }, false);
    // Keep the list's top in view when the previous page was scrolled past.
    const section = sectionRef.current;
    if (section && section.getBoundingClientRect().top < 0) {
      section.scrollIntoView({ block: "start" });
    }
  };

  const summary =
    resultCount === null
      ? " "
      : query
        ? copy.explorer.matchSummary(formatCefrWordCount(uiLang, resultCount), query)
        : copy.explorer.totalSummary(formatCefrWordCount(uiLang, resultCount));

  let body: ReactNode;
  if (visibleRows && visibleRows.length > 0) {
    body = (
      <ExplorerTable
        rows={visibleRows}
        uiLang={uiLang}
        targetLanguage={targetLanguage}
        targetTag={targetTag}
        meaningKind={meaningKind}
        copy={copy}
      />
    );
  } else if (visibleRows && query) {
    body = (
      <div className="vle-state">
        <p>{copy.explorer.empty(query)}</p>
        <button type="button" className="vle-state__action" onClick={clearSearch}>
          {copy.explorer.clearSearch}
        </button>
      </div>
    );
  } else if (status === "error") {
    body = (
      <div className="vle-state vle-state--error" role="alert">
        <p>{copy.explorer.loadError}</p>
        <button type="button" className="vle-state__action" onClick={retry}>
          {copy.explorer.retry}
        </button>
      </div>
    );
  } else {
    body = (
      <div className="vle-loading" role="status">
        <span className="sr-only">{copy.explorer.loading}</span>
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} className="vle-loading__row" aria-hidden="true" />
        ))}
        <p className="vle-loading__text" aria-hidden="true">
          {copy.explorer.loading}
        </p>
      </div>
    );
  }

  const rangeStart = (page - 1) * LEVEL_EXPLORER_PAGE_SIZE + 1;
  const rangeEnd = resultCount === null ? 0 : Math.min(page * LEVEL_EXPLORER_PAGE_SIZE, resultCount);

  return (
    <section
      ref={sectionRef}
      id={VOCABULARY_EXPLORER_ID}
      className="vle"
      aria-labelledby="vocabulary-heading"
    >
      <div className="vle-head">
        <h2 id="vocabulary-heading" className="vle-head__title">
          {copy.vocabularyHeading(targetLanguage, levelCode)}
        </h2>
        <p className="vle-head__summary" aria-live="polite">
          {summary}
        </p>
      </div>

      <div className="vle-search" role="search">
        <label htmlFor="vocabulary-search" className="sr-only">
          {copy.explorer.searchLabel(levelCode)}
        </label>
        <Search className="vle-search__icon" aria-hidden="true" />
        <input
          id="vocabulary-search"
          type="search"
          className="vle-search__input"
          value={inputValue}
          onChange={(event) => handleInput(event.target.value)}
          onFocus={requestRows}
          placeholder={copy.explorer.searchPlaceholder[meaningKind]}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
        />
        {inputValue ? (
          <button type="button" className="vle-search__clear" onClick={clearSearch} aria-label={copy.explorer.clearSearch}>
            <X aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className="vle-body" aria-busy={status === "loading"}>
        {body}
      </div>

      {pageCount !== null && resultCount !== null && resultCount > 0 ? (
        <div className="vle-foot">
          <p className="vle-foot__range">
            {copy.explorer.range(
              formatCefrCount(copy, rangeStart),
              formatCefrCount(copy, rangeEnd || rangeStart),
              formatCefrCount(copy, resultCount),
            )}
          </p>
          {pageCount > 1 ? (
            <nav
              className="vle-pages"
              aria-label={copy.explorer.paginationLabel}
              onPointerEnter={requestRows}
              onFocus={requestRows}
            >
              <button
                type="button"
                className="vle-pages__step"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
              >
                <ChevronLeft aria-hidden="true" />
                <span>{copy.explorer.previous}</span>
              </button>
              <ol className="vle-pages__list">
                {getLevelExplorerPageItems(page, pageCount).map((item, index) =>
                  item === null ? (
                    <li key={`gap-${index}`} className="vle-pages__gap" aria-hidden="true">
                      …
                    </li>
                  ) : (
                    <li key={item}>
                      <button
                        type="button"
                        className="vle-pages__num"
                        aria-label={copy.explorer.pageLabel(item)}
                        aria-current={item === page ? "page" : undefined}
                        onClick={() => goToPage(item)}
                      >
                        {item}
                      </button>
                    </li>
                  ),
                )}
              </ol>
              <span className="vle-pages__compact" aria-hidden="true">
                {page} / {pageCount}
              </span>
              <button
                type="button"
                className="vle-pages__step"
                onClick={() => goToPage(page + 1)}
                disabled={page >= pageCount}
              >
                <span>{copy.explorer.next}</span>
                <ChevronRight aria-hidden="true" />
              </button>
            </nav>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ExplorerTable({
  rows,
  uiLang,
  targetLanguage,
  targetTag,
  meaningKind,
  copy,
}: {
  rows: LevelExplorerRow[];
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  targetTag: string;
  meaningKind: LevelExplorerMeaningKind;
  copy: CefrPageCopy;
}) {
  // Same-language definitions are written in the target language, which is
  // also the UI language; translations are UI-language words.
  return (
    <table className="vle-table">
      <thead>
        <tr>
          <th scope="col">{copy.explorer.wordHeader}</th>
          <th scope="col">{copy.explorer.meaningHeader[meaningKind]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const typeLabel = copy.wordTypes[row.type];
          return (
            <tr key={row.conceptId}>
              <th scope="row" className="vle-word">
                {row.linkable ? (
                  <Link
                    to={buildWordPath(uiLang, targetLanguage, row.word, row.conceptId)}
                    className="vle-word__link"
                    lang={targetTag}
                  >
                    {row.word}
                  </Link>
                ) : (
                  <span className="vle-word__text" lang={targetTag}>
                    {row.word}
                  </span>
                )}
                {typeLabel ? <span className="vle-word__type">{typeLabel}</span> : null}
              </th>
              <td className="vle-meaning" lang={uiLang}>
                {row.meaning ? (
                  row.meaning
                ) : (
                  <span title={copy.explorer.noMeaning}>
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">{copy.explorer.noMeaning}</span>
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
