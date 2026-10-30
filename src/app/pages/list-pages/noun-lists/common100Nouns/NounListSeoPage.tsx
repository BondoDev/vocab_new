import {
  lazy,
  Suspense,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { useLocation } from "react-router-dom";
import {
  getNounList,
  getNounListContent,
  getNounListPath,
} from "../../../../../data/seo/listPages/nounLists";
import {
  loadNounDetails,
  type NounDetailsFile,
} from "../../../../../data/seo/listPages/nounLists/common100Nouns/common100NounDetails";
import { getFullVocabularyListPath } from "../../../../../data/seo/listPages/fullVocabularyList";
import {
  getUiVocabularyLanguage,
  TARGET_LANGUAGE_TO_UI_LANGUAGE,
  type UiLanguageCode,
} from "../../../../../data/seo/shared/slugs";
import { AddWordToListDialog } from "../../../../../features/user-profile";
import type { StoredSupabaseSession } from "../../../../../lib/supabaseAuth";
import { buildWordPath } from "../../../../../data/seo/wordPages/wordSlugs";
import { buildNounListSeoMetadata } from "../../../../../seo/listPages/nounLists/common100Nouns/common100NounsMetadata";
import { SEOHead, useSeoSiteOrigin } from "../../../../../seo/SeoContext";
import { RelatedLearningResources } from "../../../../components/learning-resources/RelatedLearningResources";
import { Toast, useAutoDismissMessage } from "../../../../components/Toast";
import { useAddToListAfterLogin } from "../../../../hooks/useAddToListAfterLogin";
import { NotFoundPage } from "../../../NotFoundPage";
import { NounListGuideSections, NounListPractice } from "./NounListGuide";
import {
  NounListTable,
  type NounListTableGroup,
  type NounListTableProps,
  type NounListTableRow,
} from "./NounListTable";
import "./noun-list-intro.scss";

type LoadedNounListTableProps = Omit<NounListTableProps, "groups"> & {
  buildGroups: (details: NounDetailsFile | null) => NounListTableGroup[];
};

// One lazy table per list, created once and cached at module level so its
// component identity is stable across renders. Its chunk is the list's
// generated details file (see common100NounDetails.ts): the table renders
// once that file has loaded — during prerendering, before the HTML is
// collected; on the client, before hydrating the server-rendered table.
const loadedTables = new Map<
  string,
  LazyExoticComponent<ComponentType<LoadedNounListTableProps>>
>();

function getLoadedNounListTable(listId: string) {
  let LoadedTable = loadedTables.get(listId);
  if (!LoadedTable) {
    LoadedTable = lazy(async () => {
      const details = await loadNounDetails(listId);
      return {
        default: function LoadedNounListTable({
          buildGroups,
          ...props
        }: LoadedNounListTableProps) {
          return <NounListTable {...props} groups={buildGroups(details)} />;
        },
      };
    });
    loadedTables.set(listId, LoadedTable);
  }
  return LoadedTable;
}

interface NounListSeoPageProps {
  uiLang: UiLanguageCode;
  listId: string;
  // The custom-practice setup route (ROUTES lives in App.tsx).
  practicePath: string;
  // Pre-selects this list's target language for the practice setup.
  onPreparePractice: () => void;
  authSession: StoredSupabaseSession | null;
  // Opens App's login dialog without leaving the page (signed-out add-to-list).
  onRequestLogin: () => void;
}

// 100-most-common-nouns list page (e.g. "100 Essential English Nouns"). The table is
// the page's main content, so it sits directly under a compact intro and is
// rendered in full from bundled data — every row, definition, sentence and
// translation is in the prerendered HTML, with no client-side fetch.
// Educational sections follow the table.
export function NounListSeoPage({
  uiLang,
  listId,
  practicePath,
  onPreparePractice,
  authSession,
  onRequestLogin,
}: NounListSeoPageProps) {
  const siteOrigin = useSeoSiteOrigin();
  const { pathname } = useLocation();
  const addToList = useAddToListAfterLogin({
    authSession,
    onRequestLogin,
    pathname,
  });
  const { message: toastMessage, show: showToast } = useAutoDismissMessage();
  const content = getNounListContent(listId, uiLang);
  const list = getNounList(listId);

  if (!content || !list) {
    return <NotFoundPage />;
  }

  const seoMetadata = buildNounListSeoMetadata({
    uiLang,
    siteOrigin,
    content,
    list,
    getPath: (lang) => getNounListPath(listId, lang),
  });

  // A translation column only when the visitor reads the site in another
  // language than the list's (e.g. English nouns with Spanish UI).
  const showTranslations =
    getUiVocabularyLanguage(uiLang) !== list.targetLanguage;
  // Rows of one category are contiguous (validated in
  // common100NounEntries.ts), so a single pass yields the groups in order.
  const buildTableGroups = (
    detailsFile: NounDetailsFile | null,
  ): NounListTableGroup[] => {
    const tableGroups: NounListTableGroup[] = [];
    for (const row of list.rows) {
      const details = detailsFile?.byConceptId[row.conceptId] ?? null;
      const tableRow: NounListTableRow = {
        key: row.conceptId,
        number: row.order,
        // Generated details always cover the list (the generator fails
        // otherwise); the dash only shows on stale details.
        word: details?.word ?? "—",
        // Same word-page URL the verb lists link to (lemma slug + concept id).
        href: details?.word
          ? buildWordPath(
              uiLang,
              list.targetLanguage,
              details.word,
              row.conceptId,
            )
          : null,
        translation: showTranslations
          ? (details?.translations[uiLang] ?? null)
          : undefined,
        // Explained in the reader's language: the UI-language definition on
        // cross-language pages, the list language's own on same-language ones.
        // The example sentence always stays in the list's language.
        definition:
          (showTranslations
            ? details?.definitions[uiLang]
            : details?.definition) || null,
        sentence: details?.sentence || null,
        sentenceForms: details?.sentenceForms ?? [],
      };
      const currentGroup = tableGroups[tableGroups.length - 1];
      if (currentGroup?.key === row.category) {
        currentGroup.rows.push(tableRow);
      } else {
        tableGroups.push({
          key: row.category,
          label: content.categories[row.category],
          rows: [tableRow],
        });
      }
    }
    return tableGroups;
  };
  const LoadedNounListTable = getLoadedNounListTable(listId);

  return (
    <main className="min-h-screen bg-background px-4 py-6 md:px-8 md:py-8">
      <SEOHead metadata={seoMetadata} />
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="space-y-3 md:space-y-4">
          <header className="nli">
            <h1 className="nli-heading">{content.hero.heading}</h1>
            <p className="nli-intro">{content.hero.intro}</p>
          </header>
          {/* The fallback only shows on client-side navigation to the page;
              prerendered HTML already contains the table. */}
          <Suspense
            fallback={<div className="nlt nlt-pending" aria-busy="true" />}
          >
            <LoadedNounListTable
              buildGroups={buildTableGroups}
              showTranslations={showTranslations}
              wordLang={list.speechLang}
              onAddToList={(row) =>
                addToList.requestAddToList({
                  wordId: row.key,
                  targetWord: row.word,
                })
              }
              labels={{
                table: content.table.label,
                number: content.table.number,
                word: content.table.word,
                translation: content.table.translation,
                definition: content.table.definition,
                sentence: content.table.sentence,
                pronounce: content.table.pronounceLabel,
                addToList: content.table.addToList,
                addToListWord: content.table.addToListWord,
              }}
            />
          </Suspense>
        </div>

        <div className="space-y-8 md:space-y-10">
          <NounListGuideSections
            sections={content.guideSections}
            exampleLang={list.speechLang}
          />
          <NounListPractice
            practice={content.practice}
            practicePath={practicePath}
            onPreparePractice={onPreparePractice}
            vocabularyListPath={getFullVocabularyListPath(
              list.targetLanguage,
              uiLang,
            )}
          />
        </div>
        <RelatedLearningResources
          uiLang={uiLang}
          targetLanguage={list.targetLanguage}
          currentPath={pathname}
        />
      </div>
      {/* The profile's own "Add to list" popup, as on the full vocabulary
          list: lists are per target language (short UI code) and store
          membership by concept id (row.key). */}
      <AddWordToListDialog
        word={addToList.dialogWord}
        targetLanguage={TARGET_LANGUAGE_TO_UI_LANGUAGE[list.targetLanguage]}
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
