import { useMemo } from "react";
import {
  canLinkVerbListItem,
  getVerbListConfig,
  getVerbListContent,
  getVerbListDefinition,
  getVerbListPath,
  getVerbListSpeechLang,
  getVerbListTranslation,
  getVerbListWordLemma,
  VERB_LIST_ITEMS,
} from "../../data/seo/verbLists";
import { buildWordPath } from "../../data/seo/wordPages/wordSlugs";
import { type TargetLanguageSlug, type UiLanguageCode } from "../../data/seo/slugs";
import { buildVerbListSeoMetadata } from "../../seo/metadata";
import { useSeoSiteOrigin } from "../../seo/SeoContext";
import { useLocation } from "react-router-dom";
import { RichVerbListSeoPage } from "./RichVerbListSeoPage";
import { VerbListSeoTableOnlyPage } from "./VerbListSeoTableOnlyPage";

interface VerbListSeoPageProps {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
}

export function VerbListSeoPage({
  uiLang,
  targetLanguage,
  onStartPractice,
}: VerbListSeoPageProps) {
  const location = useLocation();
  const siteOrigin = useSeoSiteOrigin();
  const config = getVerbListConfig(targetLanguage);
  const content = getVerbListContent(targetLanguage, uiLang);
  const rows = useMemo(
    () =>
      VERB_LIST_ITEMS.map((item, index) => {
        const wordLemma = getVerbListWordLemma(targetLanguage, item.id) || item.verb;
        return {
          index: index + 1,
          id: item.id,
          verb: wordLemma,
          translation: getVerbListTranslation(item.id, uiLang),
          definition: getVerbListDefinition(item.id, uiLang),
          href: canLinkVerbListItem(targetLanguage, item.id)
            ? buildWordPath(uiLang, targetLanguage, wordLemma, item.id)
            : null,
        };
      }),
    [targetLanguage, uiLang],
  );

  const seoMetadata = buildVerbListSeoMetadata({
    uiLang,
    pathname: location.pathname,
    siteOrigin,
    targetLanguage,
    items: VERB_LIST_ITEMS,
    getAllPaths: () => Object.values(config.paths),
    getPath: (lang) => getVerbListPath(targetLanguage, lang),
    getContent: (lang) => getVerbListContent(targetLanguage, lang),
    canLinkItem: (id) => canLinkVerbListItem(targetLanguage, id),
    getWordLemma: (id) => getVerbListWordLemma(targetLanguage, id),
  });

  if (content) {
    return (
      <RichVerbListSeoPage
        uiLang={uiLang}
        targetLanguage={targetLanguage}
        speechLang={getVerbListSpeechLang(targetLanguage)}
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
      targetLanguage={targetLanguage}
      speechLang={config.speechLang}
      rows={rows}
      seoMetadata={seoMetadata}
    />
  );
}
