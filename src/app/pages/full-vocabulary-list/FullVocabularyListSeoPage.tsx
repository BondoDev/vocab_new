import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  formatContentTemplate,
  getFullVocabularyListContent,
  getFullVocabularyListPath,
  GRAMMAR_TYPE_KEYS,
} from "../../../data/seo/fullVocabularyList";
import {
  collectGrammarTypes,
  EMPTY_FULL_VOCABULARY_FILTER,
  filterFullVocabularyRows,
  FULL_VOCABULARY_INITIAL_DATA_ELEMENT_ID,
  FULL_VOCABULARY_SPEECH_LANG,
  hydrateFullVocabularyInitialData,
  isFullVocabularyFilterActive,
  isFullVocabularyLoadStarted,
  loadFullVocabularyPageRows,
  loadFullVocabularyRows,
  type FullVocabularyFilter,
  type FullVocabularyInitialData,
  type FullVocabularyRowsByLevel,
} from "../../../data/seo/fullVocabularyList/fullVocabularyListEntries";
import { readEmbeddedJson } from "../../../lib/readEmbeddedJson";
import {
  getUiVocabularyLanguage,
  TARGET_LANGUAGE_TO_UI_LANGUAGE,
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../../data/seo/shared/slugs";
import { buildFullVocabularyListSeoMetadata } from "../../../seo/fullVocabularyList/fullVocabularyListMetadata";
import { SEOHead, useSeoSiteOrigin } from "../../../seo/SeoContext";
import { AddWordToListDialog } from "../../../features/user-profile";
import type { StoredSupabaseSession } from "../../../lib/supabaseAuth";
import { Toast, useAutoDismissMessage } from "../../components/Toast";
import { NotFoundPage } from "../NotFoundPage";
import { FullVocabularyLevelSection, type FullVocabularyLoadStatus } from "./FullVocabularyLevelSection";
import { VocabularyFilterBar } from "./VocabularyFilterBar";
import { useAddToListAfterLogin } from "./useAddToListAfterLogin";
import {
  FullVocabularyCefrGuide,
  FullVocabularyFaq,
  FullVocabularyLearningGuide,
  FullVocabularyLearningOptions,
} from "./FullVocabularyListGuide";
import "./full-vocabulary-list.scss";

interface FullVocabularyListSeoPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  authSession: StoredSupabaseSession | null;
  // Opens the header login dialog in stay-on-page mode (App owns it).
  onRequestLogin: () => void;
  // App routes (ROUTES lives in App.tsx): the custom-practice setup and the
  // signed-in learning dashboard.
  practicePath: string;
  profilePath: string;
  // Opens the header's existing sign-up dialog.
  onRequestSignup: () => void;
  // Pre-selects this page's target language for the practice setup.
  onPreparePractice: () => void;
  // SSR: the first rows of each level, rendered into the HTML. In the
  // browser this is absent and the same data is read from the page.
  initialData?: FullVocabularyInitialData | null;
}

// The server-rendered first rows for this exact page, from the prop (SSR) or
// the embedded JSON block (browser). Must yield the same rows in both so the
// first browser render matches the HTML. Client-side navigation into the page
// finds no matching block and starts empty, as before.
function readInitialData(
  pathname: string,
  fromProps: FullVocabularyInitialData | null | undefined,
): FullVocabularyInitialData | null {
  const data = fromProps ?? readEmbeddedJson<FullVocabularyInitialData>(FULL_VOCABULARY_INITIAL_DATA_ELEMENT_ID);
  return data && data.pathname === pathname ? hydrateFullVocabularyInitialData(data) : null;
}

const GLOBAL_RESULTS_ID = "full-vocabulary-global-results";

export function FullVocabularyListSeoPage({
  uiLang,
  targetLanguage,
  authSession,
  onRequestLogin,
  practicePath,
  profilePath,
  onRequestSignup,
  onPreparePractice,
  initialData: initialDataProp,
}: FullVocabularyListSeoPageProps) {
  const siteOrigin = useSeoSiteOrigin();
  const { pathname } = useLocation();
  const [initialData] = useState(() => readInitialData(pathname, initialDataProp));
  const addToList = useAddToListAfterLogin({ authSession, onRequestLogin, pathname });
  const { message: toastMessage, show: showToast } = useAutoDismissMessage();
  // Independent open state per level: any combination may be expanded at
  // once. All start collapsed so SSR and first client render match.
  const [openLevels, setOpenLevels] = useState<ReadonlySet<Level>>(() => new Set());
  // Vocabulary rows are fetched once per page, the first time any level is
  // opened or a global filter control is focused (never during SSR, so
  // server and first client render match).
  // loadAttempt re-runs the effect after a failed load's retry.
  // Starts requested when the file is already cached — e.g. after switching
  // UI language, which remounts this page on a new URL — so level word counts
  // come back immediately instead of waiting for another interaction. Fresh
  // page loads (and SSR) still start false, keeping hydration identical.
  const [rowsRequested, setRowsRequested] = useState(() => isFullVocabularyLoadStarted(targetLanguage));
  const [loadAttempt, setLoadAttempt] = useState(0);
  // Starts with the server-rendered first rows (if any); replaced by the
  // complete lists once loaded. `rowsComplete` tells search, filters, and
  // Load More whether they are looking at every word yet.
  const [rowsByLevel, setRowsByLevel] = useState<FullVocabularyRowsByLevel | null>(
    () => initialData?.rowsByLevel ?? null,
  );
  const [rowsComplete, setRowsComplete] = useState(false);
  // Per-level word totals, known as soon as the target-language file is in
  // (instant when cached, e.g. after a UI-language switch). Kept apart from
  // rowsByLevel, which also waits for translations/inflected forms, so the
  // header counts — identical in every UI language — never wait on them.
  const [levelWordCounts, setLevelWordCounts] = useState<Record<Level, number> | null>(
    () => initialData?.levelWordCounts ?? null,
  );
  const [loadFailed, setLoadFailed] = useState(false);
  const content = getFullVocabularyListContent(targetLanguage, uiLang);
  // Page-owned because it applies to every level. Levels receive the
  // deferred value so typing never waits on six tables re-filtering.
  const [globalFilter, setGlobalFilter] = useState<FullVocabularyFilter>(EMPTY_FULL_VOCABULARY_FILTER);
  const deferredGlobalFilter = useDeferredValue(globalFilter);
  // When the visitor reads the site in a different language than the table's
  // (e.g. an English list with German UI), each word also shows its
  // UI-language counterpart, joined by concept_id from that language's own
  // vocabulary.json. Same language: no extra file, no Translation column.
  const uiVocabularyLanguage = getUiVocabularyLanguage(uiLang);
  const showTranslations = uiVocabularyLanguage !== targetLanguage;

  // Level headers show word counts, which need the vocabulary rows. Rather
  // than waiting for a first click (so counts were missing on every fresh
  // load), start loading once the browser is idle after the page appears.
  // Runs only after mount, so SSR and hydration markup are unaffected.
  useEffect(() => {
    if (rowsRequested) {
      return;
    }
    const start = () => setRowsRequested(true);
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(start, { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(start, 500);
    return () => window.clearTimeout(handle);
  }, [rowsRequested]);

  useEffect(() => {
    if (!rowsRequested) {
      return;
    }
    let cancelled = false;
    // Rows only become ready once their translations (if any) are attached,
    // so the table never renders a half-filled Translation column.
    loadFullVocabularyRows(targetLanguage).then(
      (rows) => {
        if (!cancelled) {
          setLevelWordCounts({
            a1: rows.a1.length,
            a2: rows.a2.length,
            b1: rows.b1.length,
            b2: rows.b2.length,
            c1: rows.c1.length,
            c2: rows.c2.length,
          });
        }
      },
      () => {},
    );
    loadFullVocabularyPageRows(targetLanguage, showTranslations ? uiVocabularyLanguage : null).then(
      (rows) => {
        if (!cancelled) {
          setRowsByLevel(rows);
          setRowsComplete(true);
        }
      },
      () => {
        if (!cancelled) {
          setLoadFailed(true);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [rowsRequested, targetLanguage, showTranslations, uiVocabularyLanguage, loadAttempt]);

  // Longest unfiltered header count across the six levels, shared by all
  // headers so their badges line up. (Filtered labels are longer and may
  // widen their own slot while a filter is active.)
  const countSlotChars = useMemo(() => {
    if (!levelWordCounts || !content) {
      return 0;
    }
    return Math.max(
      ...Object.values(levelWordCounts).map(
        (total) => formatContentTemplate(content.levelPanel.headerCountLabel, { total }, uiLang).length,
      ),
    );
  }, [content, levelWordCounts, uiLang]);

  const loadStatus: FullVocabularyLoadStatus = rowsByLevel
    ? "ready"
    : loadFailed
      ? "error"
      : rowsRequested
        ? "loading"
        : "idle";

  const grammarTypeLabels = content?.grammarTypes;
  const globalCategoryOptions = useMemo(() => {
    if (!rowsByLevel || !grammarTypeLabels) {
      return [];
    }
    return collectGrammarTypes(Object.values(rowsByLevel).flat(), GRAMMAR_TYPE_KEYS).map((type) => ({
      value: type,
      label: grammarTypeLabels[type as keyof typeof grammarTypeLabels] ?? type,
    }));
  }, [grammarTypeLabels, rowsByLevel]);

  const isGlobalFilterActive = isFullVocabularyFilterActive(deferredGlobalFilter);
  const globalMatchCount = useMemo(() => {
    if (!rowsByLevel || !rowsComplete || !isGlobalFilterActive) {
      return null;
    }
    return Object.values(rowsByLevel).reduce(
      (sum, rows) => sum + filterFullVocabularyRows(rows, [deferredGlobalFilter]).length,
      0,
    );
  }, [deferredGlobalFilter, isGlobalFilterActive, rowsByLevel, rowsComplete]);

  if (!content) {
    return <NotFoundPage />;
  }

  const seoMetadata = buildFullVocabularyListSeoMetadata({
    uiLang,
    siteOrigin,
    content,
    getPath: (lang) => getFullVocabularyListPath(targetLanguage, lang),
  });

  const retryLoad = () => {
    setLoadFailed(false);
    setLoadAttempt((attempt) => attempt + 1);
  };

  const handleGlobalFilterChange = (next: FullVocabularyFilter) => {
    setRowsRequested(true);
    setGlobalFilter(next);
  };

  const toggleLevel = (level: Level) => {
    setRowsRequested(true);
    setOpenLevels((current) => {
      const next = new Set(current);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  return (
    <main className="full-vocabulary-list-page min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      <SEOHead metadata={seoMetadata} />
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-3">
          <h1 className="text-3xl text-foreground md:text-4xl">{content.hero.heading}</h1>
          <p className="max-w-3xl text-base text-muted-foreground">{content.hero.intro}</p>
        </header>

        <section aria-labelledby="full-vocabulary-levels-heading" className="space-y-3">
          <div className="space-y-1">
            <h2 id="full-vocabulary-levels-heading" className="text-xl text-foreground">
              {content.levelsSection.heading}
            </h2>
            {content.levelsSection.description ? (
              <p className="max-w-3xl text-sm text-muted-foreground">{content.levelsSection.description}</p>
            ) : null}
          </div>
          {/* Global filters span all six levels, so they sit between the
              section heading and the accordion list they will filter. */}
          <div role="search" aria-label={content.globalFilters.searchLabel}>
            <VocabularyFilterBar
              idPrefix="full-vocabulary-global"
              variant="global"
              searchLabel={content.globalFilters.searchLabel}
              searchPlaceholder={content.globalFilters.searchPlaceholder}
              categoryLabel={content.globalFilters.categoryLabel}
              categoryAllOption={content.globalFilters.categoryAllOption}
              categoryApplyLabel={content.globalFilters.categoryApplyLabel}
              categoryCloseLabel={content.globalFilters.categoryCloseLabel}
              resetLabel={content.globalFilters.resetLabel}
              value={globalFilter}
              onChange={handleGlobalFilterChange}
              categoryOptions={globalCategoryOptions}
              onInteract={() => setRowsRequested(true)}
              describedById={GLOBAL_RESULTS_ID}
            />
            <p id={GLOBAL_RESULTS_ID} aria-live="polite" className="mt-1.5 min-h-4 text-xs text-muted-foreground">
              {globalMatchCount !== null
                ? formatContentTemplate(content.globalFilters.resultsLabel, { count: globalMatchCount }, uiLang)
                : null}
            </p>
          </div>
          <div className="divide-y divide-foreground/10 overflow-hidden rounded-2xl border border-foreground/15 bg-card shadow-sm">
            {content.levels.map((level) => (
              <FullVocabularyLevelSection
                key={level.level}
                uiLang={uiLang}
                speechLang={FULL_VOCABULARY_SPEECH_LANG[targetLanguage]}
                showTranslations={showTranslations}
                level={level}
                panelCopy={content.levelPanel}
                grammarTypes={content.grammarTypes}
                isOpen={openLevels.has(level.level)}
                onToggle={() => toggleLevel(level.level)}
                status={loadStatus}
                rows={rowsByLevel ? rowsByLevel[level.level] : null}
                rowsComplete={rowsComplete}
                fullLoadFailed={loadFailed}
                levelWordCount={levelWordCounts ? levelWordCounts[level.level] : null}
                countSlotChars={countSlotChars}
                levelHeadingTemplate={content.levelsSection.levelHeadingTemplate}
                globalFilter={deferredGlobalFilter}
                onRetry={retryLoad}
                onAddToList={(row) => addToList.requestAddToList({ wordId: row.conceptId, targetWord: row.word })}
              />
            ))}
          </div>
        </section>

        {/* Educational sections follow the directory so they never push the
            vocabulary further down; each renders only if this record has it. */}
        {content.cefrSection ? <FullVocabularyCefrGuide section={content.cefrSection} levels={content.levels} /> : null}
        {content.learningSection ? (
          <FullVocabularyLearningGuide section={content.learningSection} />
        ) : content.howToUse ? (
          <section aria-labelledby="full-vocabulary-how-to-heading" className="border-t border-border pt-6">
            <h2 id="full-vocabulary-how-to-heading" className="text-lg font-semibold text-foreground">
              {content.howToUse.heading}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{content.howToUse.paragraph}</p>
          </section>
        ) : null}
        {content.learningOptions ? (
          <FullVocabularyLearningOptions
            section={content.learningOptions}
            isSignedIn={Boolean(authSession)}
            profilePath={profilePath}
            practicePath={practicePath}
            onRequestSignup={onRequestSignup}
            onPreparePractice={onPreparePractice}
          />
        ) : null}
        {content.faq ? <FullVocabularyFaq faq={content.faq} /> : null}
      </div>
      {/* The profile Vocabulary section's own "Add to list" popup, reused as
          is: it loads the user's lists for this target language (short UI
          code, like the profile's practiceLanguage) and writes membership by
          concept_id. */}
      <AddWordToListDialog
        word={addToList.dialogWord}
        targetLanguage={TARGET_LANGUAGE_TO_UI_LANGUAGE[targetLanguage]}
        onOpenChange={(open) => {
          if (!open) {
            addToList.closeDialog();
          }
        }}
        onShowToast={showToast}
      />
      <Toast message={toastMessage} />
    </main>
  );
}
