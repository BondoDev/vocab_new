import { useEffect, useMemo, useState } from "react";
import { Volume2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  getUiVocabularyLanguage,
  TARGET_LANGUAGE_TO_UI_LANGUAGE,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../data/seo/shared/slugs";
import { getFallbackVerbListCopy } from "../../data/seo/verbLists/common100Verbs/common100VerbFallbackCopy";
import { SEOHead, type SeoMetadata } from "../../seo/SeoContext";
import { useLanguage } from "../../contexts/LanguageContext";

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

function speakVerb(verb: string, speechLang: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(verb);
  utterance.lang = speechLang;
  window.speechSynthesis.speak(utterance);
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
    () =>
      rows.filter((row) => {
        if (!normalizedSearch) {
          return true;
        }

        return row.verb.toLowerCase().includes(normalizedSearch);
      }),
    [normalizedSearch, rows],
  );

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8 md:py-10">
      <SEOHead metadata={seoMetadata} />
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <h1 className="sr-only">{fallbackCopy.pageTitle}</h1>
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <h2 className="text-2xl text-foreground">{fallbackCopy.pageTitle}</h2>
            </div>
            <label className="flex w-full max-w-[22rem] shrink-0 text-sm text-foreground">
              <span className="sr-only">{fallbackCopy.searchPlaceholder}</span>
              <input
                type="search"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder={fallbackCopy.searchPlaceholder}
                className="w-full rounded-xl border border-primary/35 bg-primary/5 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse text-left table-fixed">
              <thead>
                <tr>
                  <th className="w-20 border-b border-border py-3 pr-4 text-sm text-foreground">
                    {fallbackCopy.number}
                  </th>
                  <th className="w-40 border-b border-border py-3 pr-4 text-sm text-foreground">
                    {targetLanguageName}
                  </th>
                  {showTranslationColumn ? (
                    <th className="w-36 border-b border-border py-3 pr-4 text-sm text-foreground">
                      {uiLanguageName}
                    </th>
                  ) : null}
                  <th className="border-b border-border py-3 text-sm text-foreground">
                    {fallbackCopy.definition}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="border-b border-border/70 py-3 pr-4 align-top text-sm text-muted-foreground">
                      {row.index}
                    </td>
                    <td className="border-b border-border/70 py-3 pr-4 align-middle text-sm font-medium text-foreground">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`${fallbackCopy.pronounceLabel}: ${row.verb}`}
                          onClick={() => speakVerb(row.verb, speechLang)}
                          className="inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-primary/80 transition hover:bg-primary/10 hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                          <Volume2 className="h-3.5 w-3.5" />
                        </button>
                        {row.href ? (
                          <Link className="text-primary transition hover:underline" to={row.href}>
                            {row.verb}
                          </Link>
                        ) : (
                          row.verb
                        )}
                      </div>
                    </td>
                    {showTranslationColumn ? (
                      <td className="border-b border-border/70 py-3 pr-4 align-top text-sm">
                        {row.translation ? <span className="text-muted-foreground">{row.translation}</span> : <span className="text-muted-foreground">-</span>}
                      </td>
                    ) : null}
                    <td className="border-b border-border/70 py-3 align-top text-sm text-muted-foreground">
                      {row.definition || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredRows.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{fallbackCopy.noResults}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}
