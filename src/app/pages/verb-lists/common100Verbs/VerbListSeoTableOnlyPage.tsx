import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getUiVocabularyLanguage,
  TARGET_LANGUAGE_TO_UI_LANGUAGE,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../../../data/seo/shared/slugs";
import { getFallbackVerbListCopy } from "../../../../data/seo/verbLists/common100Verbs/common100VerbFallbackCopy";
import { SEOHead, type SeoMetadata } from "../../../../seo/SeoContext";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { rowMatchesSearch } from "../shared/rowSearch";
import { VerbListTableSection } from "./VerbListTableSection";

export interface VerbListSeoTableOnlyRow {
  id: string;
  index: number;
  verb: string;
  translation: string;
  definition: string;
  href: string | null;
}

interface VerbListSeoTableOnlyPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  speechLang: string;
  rows: VerbListSeoTableOnlyRow[];
  seoMetadata: SeoMetadata;
}

export function VerbListSeoTableOnlyPage({
  uiLang,
  targetLanguage,
  speechLang,
  rows,
  seoMetadata,
}: VerbListSeoTableOnlyPageProps) {
  const location = useLocation();
  const { t } = useLanguage();
  const [searchValue, setSearchValue] = useState("");
  const showTranslationColumn = getUiVocabularyLanguage(uiLang) !== targetLanguage;
  const targetLanguageName = t(`languageNames.${TARGET_LANGUAGE_TO_UI_LANGUAGE[targetLanguage]}`);
  const uiLanguageName = t(`languageNames.${uiLang}`);
  const fallbackCopy = getFallbackVerbListCopy(uiLang, targetLanguage);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location.pathname]);

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredRows = useMemo(
    () => rows.filter((row) => rowMatchesSearch(normalizedSearch, [row.verb, row.translation, row.definition])),
    [normalizedSearch, rows],
  );

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      <SEOHead metadata={seoMetadata} />
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <h1 className="sr-only">{fallbackCopy.pageTitle}</h1>
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h2 className="text-2xl text-foreground">{fallbackCopy.pageTitle}</h2>

          <VerbListTableSection
            rows={filteredRows}
            showTranslationColumn={showTranslationColumn}
            speechLang={speechLang}
            numberLabel={fallbackCopy.number}
            verbLabel={targetLanguageName}
            translationLabel={uiLanguageName}
            definitionLabel={fallbackCopy.definition}
            pronounceLabel={fallbackCopy.pronounceLabel}
            regionLabel={fallbackCopy.pageTitle}
            scrollHint={fallbackCopy.scrollHint}
            scrollLeftLabel={fallbackCopy.scrollLeftLabel}
            scrollRightLabel={fallbackCopy.scrollRightLabel}
            searchValue={searchValue}
            onSearchChange={setSearchValue}
            searchPlaceholder={fallbackCopy.searchPlaceholder}
            noResultsMessage={filteredRows.length === 0 ? fallbackCopy.noResults : null}
          />
        </section>
      </div>
    </main>
  );
}
