import { useMemo } from "react";
import {
  FRENCH_VERB_LIST_ITEMS,
  canLinkFrenchVerbListItem,
  getAllFrenchVerbListPaths,
  getFrenchVerbDefinition,
  getFrenchVerbListContent,
  getFrenchVerbListPath,
  getFrenchVerbTranslation,
  getFrenchVerbWordLemma,
} from "../../data/frenchVerbList";
import { buildWordPath } from "../../data/seo/wordSlugs";
import { type TargetLanguageSlug, type UiLanguageCode } from "../../data/seo/slugs";
import { buildVerbListSeoMetadata } from "../../seo/metadata";
import { useSeoSiteOrigin } from "../../seo/SeoContext";
import { useLocation } from "react-router-dom";
import { RichVerbListSeoPage } from "./RichVerbListSeoPage";
import { VerbListSeoTableOnlyPage } from "./VerbListSeoTableOnlyPage";

interface FrenchVerbListSeoPageProps {
  uiLang: UiLanguageCode;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}

const TARGET_LANGUAGE: TargetLanguageSlug = "french";

export function FrenchVerbListSeoPage({ uiLang, onStartPractice }: FrenchVerbListSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const content = getFrenchVerbListContent(uiLang);
  const rows = useMemo(
    () =>
      FRENCH_VERB_LIST_ITEMS.map((item, index) => {
        const wordLemma = getFrenchVerbWordLemma(item.id) || item.verb;
        return {
          index: index + 1,
          id: item.id,
          verb: wordLemma,
          translation: getFrenchVerbTranslation(item.id, uiLang),
          definition: getFrenchVerbDefinition(item.id, uiLang),
          href: canLinkFrenchVerbListItem(item.id)
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
    items: FRENCH_VERB_LIST_ITEMS,
    getAllPaths: getAllFrenchVerbListPaths,
    getPath: getFrenchVerbListPath,
    getContent: getFrenchVerbListContent,
    canLinkItem: canLinkFrenchVerbListItem,
    getWordLemma: getFrenchVerbWordLemma,
  });

  if (content) {
    return (
      <RichVerbListSeoPage
        uiLang={uiLang}
        targetLanguage={TARGET_LANGUAGE}
        speechLang="fr-FR"
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
      speechLang="fr-FR"
      rows={rows}
      seoMetadata={seoMetadata}
    />
  );
}
