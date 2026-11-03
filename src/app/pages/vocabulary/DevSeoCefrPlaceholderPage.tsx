import { useMemo } from "react";
import { VocabularyLevelPage } from "./VocabularyLevelPage";
import type { SeoMetadata } from "../../../seo/SeoContext";
import type {
  CefrLevelCode,
  TargetLanguageSlug,
  UiLanguageCode,
} from "../../../data/seo/vocabularyLevels";
import { buildLocalizedVocabularyPath } from "../../../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import { getVocabularyFaqItems, buildVocabularyJsonLdGraph } from "../../../seo/metadata";
import {
  resolveVocabularyLevelPageModel,
  type VocabularyLevelPageModel,
} from "../../../data/seo/vocabularyLevels/levelContent";
import { getCefrLevelCode, getCefrPageCopy } from "../../../data/seo/vocabularyLevels/cefrPageCopy";
import type { LevelExplorerInitialData } from "../../../data/seo/vocabularyLevels/levelExplorerRows";
import {
  DEV_CEFR_PREVIEW_PATH,
  findSeoCefrPreviewItem,
  getSeoCefrPreviewItems,
  normalizeTargetLanguage,
  type SeoCefrContentItem,
} from "./devSeoCefrPreviewData";

// Despite the legacy name (see src/app/pages/README.md, "Known legacy
// naming"), this is the production entry point of every CEFR
// vocabulary-level page: it resolves the page's editorial entry, maps it
// through the legacy/v2 compatibility layer (levelContent.ts), builds the
// page metadata, and renders VocabularyLevelPage.

function buildItemPath(item: SeoCefrContentItem, pathPrefix: string): string {
  return (
    `${pathPrefix}${buildLocalizedVocabularyPath(
      item.uiLanguage,
      normalizeTargetLanguage(item.targetLanguage),
      item.level,
    ) ?? "/en/english-b1-vocabulary-practice"}`
  );
}

function buildSeoMetadata(
  item: SeoCefrContentItem,
  model: VocabularyLevelPageModel,
  pathPrefix: string,
): SeoMetadata {
  const normalizedTargetLanguage = normalizeTargetLanguage(item.targetLanguage);
  const copy = getCefrPageCopy(item.uiLanguage);
  // The canonical is always the bare CEFR path: explorer search/page query
  // parameters (?q=, ?page=) never create separate canonical pages.
  const canonicalPath = buildItemPath(item, pathPrefix);
  const alternateItems = getSeoCefrPreviewItems().filter(
    (candidate) =>
      normalizeTargetLanguage(candidate.targetLanguage) === normalizedTargetLanguage &&
      candidate.level === item.level,
  );
  const xDefaultItem =
    alternateItems.find((candidate) => candidate.uiLanguage === "en") ?? item;
  const origin = "https://www.fluentstellar.com";
  const canonical = `${origin}${canonicalPath}`;
  const title = model.metaTitle;
  const description = model.metaDescription;

  return {
    title,
    description,
    canonical,
    alternates: [
      ...alternateItems.map((candidate) => ({
        hreflang: candidate.uiLanguage,
        href: `${origin}${buildItemPath(candidate, pathPrefix)}`,
      })),
      {
        hreflang: "x-default",
        href: `${origin}${buildItemPath(xDefaultItem, pathPrefix)}`,
      },
    ],
    jsonLd: buildVocabularyJsonLdGraph({
      uiLang: item.uiLanguage,
      targetLanguage: normalizedTargetLanguage,
      canonical,
      origin,
      title,
      description,
      breadcrumbHomeLabel: copy.breadcrumbHome,
      breadcrumbLabel: copy.vocabularyHeading(normalizedTargetLanguage, getCefrLevelCode(item.level)),
      faqItems: getVocabularyFaqItems(model),
    }),
  };
}

export function DevSeoCefrPlaceholderPage({
  item,
  routeParams,
  onStartPractice,
  pathPrefix = "/test",
  initialExplorerData = null,
}: {
  item?: SeoCefrContentItem | null;
  routeParams?: {
    uiLanguage: UiLanguageCode;
    targetLanguage: TargetLanguageSlug;
    level: CefrLevelCode;
  } | null;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
  pathPrefix?: string;
  // SSR only; the browser reads the same rows from the page's embedded JSON.
  initialExplorerData?: LevelExplorerInitialData | null;
}) {
  const resolvedItem = useMemo(() => {
    if (item) {
      return item;
    }
    if (!routeParams) {
      return null;
    }
    return findSeoCefrPreviewItem(routeParams);
  }, [item, routeParams]);

  if (!resolvedItem) {
    return <div className="p-6 text-sm text-muted-foreground">Invalid preview page. Try {DEV_CEFR_PREVIEW_PATH}</div>;
  }

  // Resolved content owns its Hook lifecycle independently of fallback transitions.
  return (
    <ResolvedSeoCefrPage
      resolvedItem={resolvedItem}
      onStartPractice={onStartPractice}
      pathPrefix={pathPrefix}
      initialExplorerData={initialExplorerData}
    />
  );
}

function ResolvedSeoCefrPage({
  resolvedItem,
  onStartPractice,
  pathPrefix,
  initialExplorerData,
}: {
  resolvedItem: SeoCefrContentItem;
  onStartPractice: (targetLanguage: TargetLanguageSlug, level: string) => void;
  pathPrefix: string;
  initialExplorerData: LevelExplorerInitialData | null;
}) {
  const model = useMemo(() => resolveVocabularyLevelPageModel(resolvedItem.content), [resolvedItem.content]);
  const seoMetadata = useMemo(
    () => (model ? buildSeoMetadata(resolvedItem, model, pathPrefix) : null),
    [resolvedItem, model, pathPrefix],
  );
  const normalizedTargetLanguage = useMemo(
    () => normalizeTargetLanguage(resolvedItem.targetLanguage),
    [resolvedItem.targetLanguage],
  );

  // App.tsx already routes invalid content to the not-found page (it runs
  // the same validation), so this only guards direct/preview use.
  if (!model || !seoMetadata) {
    return <div className="p-6 text-sm text-muted-foreground">Vocabulary content unavailable.</div>;
  }

  return (
    <VocabularyLevelPage
      // Keyed per page so client-side navigation to another level or
      // language starts with fresh explorer state (rows, search, page).
      key={`${resolvedItem.uiLanguage}-${normalizedTargetLanguage}-${resolvedItem.level}`}
      uiLang={resolvedItem.uiLanguage}
      targetLanguage={normalizedTargetLanguage}
      level={resolvedItem.level}
      onStartPractice={onStartPractice}
      initialExplorerData={initialExplorerData}
      contentOverride={{ model }}
      seoMetadataOverride={seoMetadata}
    />
  );
}
