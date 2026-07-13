import { useMemo } from "react";
import {
  SPANISH_VERB_LIST_ITEMS,
  canLinkSpanishVerbListItem,
  getAllSpanishVerbListPaths,
  getSpanishVerbDefinition,
  getSpanishVerbListContent,
  getSpanishVerbListPath,
  getSpanishVerbTranslation,
  getSpanishVerbWordLemma,
} from "../../data/spanishVerbList";
import { buildWordPath } from "../../data/seo/wordSlugs";
import { type TargetLanguageSlug, type UiLanguageCode } from "../../data/seo/slugs";
import { buildVerbListSeoMetadata } from "../../seo/metadata";
import { useSeoSiteOrigin } from "../../seo/SeoContext";
import { useLocation } from "react-router-dom";
import { RichVerbListSeoPage } from "./RichVerbListSeoPage";
import { VerbListSeoTableOnlyPage } from "./VerbListSeoTableOnlyPage";

interface SpanishVerbListSeoPageProps {
  uiLang: UiLanguageCode;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}

const TARGET_LANGUAGE: TargetLanguageSlug = "spanish";

export function SpanishVerbListSeoPage({ uiLang, onStartPractice }: SpanishVerbListSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const content = getSpanishVerbListContent(uiLang);
  const rows = useMemo(
    () =>
      SPANISH_VERB_LIST_ITEMS.map((item, index) => {
        const wordLemma = getSpanishVerbWordLemma(item.id) || item.verb;
        return {
          index: index + 1,
          id: item.id,
          verb: wordLemma,
          translation: getSpanishVerbTranslation(item.id, uiLang),
          definition: getSpanishVerbDefinition(item.id, uiLang),
          href: canLinkSpanishVerbListItem(item.id)
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
    items: SPANISH_VERB_LIST_ITEMS,
    getAllPaths: getAllSpanishVerbListPaths,
    getPath: getSpanishVerbListPath,
    getContent: getSpanishVerbListContent,
    canLinkItem: canLinkSpanishVerbListItem,
    getWordLemma: getSpanishVerbWordLemma,
  });

  if (content) {
    return (
      <RichVerbListSeoPage
        uiLang={uiLang}
        targetLanguage={TARGET_LANGUAGE}
        speechLang="es-ES"
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
      speechLang="es-ES"
      rows={rows}
      seoMetadata={seoMetadata}
    />
  );
}
