import { useMemo } from "react";
import {
  ITALIAN_VERB_LIST_ITEMS,
  canLinkItalianVerbListItem,
  getAllItalianVerbListPaths,
  getItalianVerbDefinition,
  getItalianVerbListContent,
  getItalianVerbListPath,
  getItalianVerbTranslation,
  getItalianVerbWordLemma,
} from "../../data/italianVerbList";
import { buildWordPath } from "../../data/seo/wordSlugs";
import { type TargetLanguageSlug, type UiLanguageCode } from "../../data/seo/slugs";
import { buildVerbListSeoMetadata } from "../../seo/metadata";
import { useSeoSiteOrigin } from "../../seo/SeoContext";
import { useLocation } from "react-router-dom";
import { RichVerbListSeoPage } from "./RichVerbListSeoPage";
import { VerbListSeoTableOnlyPage } from "./VerbListSeoTableOnlyPage";

interface ItalianVerbListSeoPageProps {
  uiLang: UiLanguageCode;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}

const TARGET_LANGUAGE: TargetLanguageSlug = "italian";

export function ItalianVerbListSeoPage({ uiLang, onStartPractice }: ItalianVerbListSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const content = getItalianVerbListContent(uiLang);
  const rows = useMemo(
    () =>
      ITALIAN_VERB_LIST_ITEMS.map((item, index) => {
        const wordLemma = getItalianVerbWordLemma(item.id) || item.verb;
        return {
          index: index + 1,
          id: item.id,
          verb: wordLemma,
          translation: getItalianVerbTranslation(item.id, uiLang),
          definition: getItalianVerbDefinition(item.id, uiLang),
          href: canLinkItalianVerbListItem(item.id)
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
    items: ITALIAN_VERB_LIST_ITEMS,
    getAllPaths: getAllItalianVerbListPaths,
    getPath: getItalianVerbListPath,
    getContent: getItalianVerbListContent,
    canLinkItem: canLinkItalianVerbListItem,
    getWordLemma: getItalianVerbWordLemma,
  });

  if (content) {
    return (
      <RichVerbListSeoPage
        uiLang={uiLang}
        targetLanguage={TARGET_LANGUAGE}
        speechLang="it-IT"
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
      speechLang="it-IT"
      rows={rows}
      seoMetadata={seoMetadata}
    />
  );
}
