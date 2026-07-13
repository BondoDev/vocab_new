import { useMemo } from "react";
import {
  RUSSIAN_VERB_LIST_ITEMS,
  canLinkRussianVerbListItem,
  getAllRussianVerbListPaths,
  getRussianVerbDefinition,
  getRussianVerbListContent,
  getRussianVerbListPath,
  getRussianVerbTranslation,
  getRussianVerbWordLemma,
} from "../../data/russianVerbList";
import { buildWordPath } from "../../data/seo/wordSlugs";
import { type TargetLanguageSlug, type UiLanguageCode } from "../../data/seo/slugs";
import { buildVerbListSeoMetadata } from "../../seo/metadata";
import { useSeoSiteOrigin } from "../../seo/SeoContext";
import { useLocation } from "react-router-dom";
import { RichVerbListSeoPage } from "./RichVerbListSeoPage";
import { VerbListSeoTableOnlyPage } from "./VerbListSeoTableOnlyPage";

interface RussianVerbListSeoPageProps {
  uiLang: UiLanguageCode;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}

const TARGET_LANGUAGE: TargetLanguageSlug = "russian";

export function RussianVerbListSeoPage({ uiLang, onStartPractice }: RussianVerbListSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const content = getRussianVerbListContent(uiLang);
  const rows = useMemo(
    () =>
      RUSSIAN_VERB_LIST_ITEMS.map((item, index) => {
        const wordLemma = getRussianVerbWordLemma(item.id) || item.verb;
        return {
          index: index + 1,
          id: item.id,
          verb: wordLemma,
          translation: getRussianVerbTranslation(item.id, uiLang),
          definition: getRussianVerbDefinition(item.id, uiLang),
          href: canLinkRussianVerbListItem(item.id)
            ? buildWordPath(uiLang, TARGET_LANGUAGE, wordLemma, item.id)
            : null,
        };
      }),
    [uiLang],
  );

  const seoMetadata = buildVerbListSeoMetadata({
    uiLang,
    pathname: location.pathname,
    siteOrigin,
    targetLanguage: TARGET_LANGUAGE,
    items: RUSSIAN_VERB_LIST_ITEMS,
    getAllPaths: getAllRussianVerbListPaths,
    getPath: getRussianVerbListPath,
    getContent: getRussianVerbListContent,
    canLinkItem: canLinkRussianVerbListItem,
    getWordLemma: getRussianVerbWordLemma,
  });

  if (content) {
    return (
      <RichVerbListSeoPage
        uiLang={uiLang}
        targetLanguage={TARGET_LANGUAGE}
        speechLang="ru-RU"
        rows={rows}
        seoMetadata={seoMetadata}
        content={content}
        onStartPractice={onStartPractice}
      />
    );
  }

  return (
    <VerbListSeoTableOnlyPage
      uiLang={uiLang}
      targetLanguage={TARGET_LANGUAGE}
      speechLang="ru-RU"
      rows={rows}
      seoMetadata={seoMetadata}
    />
  );
}
