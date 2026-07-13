import { useMemo } from "react";
import {
  PORTUGUESE_VERB_LIST_ITEMS,
  canLinkPortugueseVerbListItem,
  getAllPortugueseVerbListPaths,
  getPortugueseVerbDefinition,
  getPortugueseVerbListContent,
  getPortugueseVerbListPath,
  getPortugueseVerbTranslation,
  getPortugueseVerbWordLemma,
} from "../../data/portugueseVerbList";
import { buildWordPath } from "../../data/seo/wordSlugs";
import { type TargetLanguageSlug, type UiLanguageCode } from "../../data/seo/slugs";
import { buildVerbListSeoMetadata } from "../../seo/metadata";
import { useSeoSiteOrigin } from "../../seo/SeoContext";
import { useLocation } from "react-router-dom";
import { RichVerbListSeoPage } from "./RichVerbListSeoPage";
import { VerbListSeoTableOnlyPage } from "./VerbListSeoTableOnlyPage";

interface PortugueseVerbListSeoPageProps {
  uiLang: UiLanguageCode;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}

const TARGET_LANGUAGE: TargetLanguageSlug = "portuguese";

export function PortugueseVerbListSeoPage({
  uiLang,
  onStartPractice,
}: PortugueseVerbListSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const content = getPortugueseVerbListContent(uiLang);
  const rows = useMemo(
    () =>
      PORTUGUESE_VERB_LIST_ITEMS.map((item, index) => {
        const wordLemma = getPortugueseVerbWordLemma(item.id) || item.verb;
        return {
          index: index + 1,
          id: item.id,
          verb: wordLemma,
          translation: getPortugueseVerbTranslation(item.id, uiLang),
          definition: getPortugueseVerbDefinition(item.id, uiLang),
          href: canLinkPortugueseVerbListItem(item.id)
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
    items: PORTUGUESE_VERB_LIST_ITEMS,
    getAllPaths: getAllPortugueseVerbListPaths,
    getPath: getPortugueseVerbListPath,
    getContent: getPortugueseVerbListContent,
    canLinkItem: canLinkPortugueseVerbListItem,
    getWordLemma: getPortugueseVerbWordLemma,
  });

  if (content) {
    return (
      <RichVerbListSeoPage
        uiLang={uiLang}
        targetLanguage={TARGET_LANGUAGE}
        speechLang="pt-PT"
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
      speechLang="pt-PT"
      rows={rows}
      seoMetadata={seoMetadata}
    />
  );
}
