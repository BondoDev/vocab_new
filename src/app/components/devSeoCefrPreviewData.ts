import sampleContent from "../../data/seo/vocabularyLevels/seo-cefr-content.json";
import {
  buildLocalizedVocabularyPath,
  isSupportedUiLanguage,
  SUPPORTED_TARGET_LANGUAGES,
  type TargetLanguageSlug,
} from "../../data/seo/slugs";
import type {
  CefrLevelCode,
  UiLanguageCode,
  VocabularyLevelContent,
} from "../../data/seo/vocabularyLevels";

type PreviewTargetLanguage = TargetLanguageSlug | UiLanguageCode;

export type SeoCefrContentItem = {
  uiLanguage: UiLanguageCode;
  targetLanguage: PreviewTargetLanguage;
  targetLanguageDisplayName: string;
  level: CefrLevelCode;
  content: VocabularyLevelContent;
};

const previewItems = sampleContent as SeoCefrContentItem[];
const defaultPreviewItem = previewItems[0];

export function getSeoCefrPreviewItems(): SeoCefrContentItem[] {
  return previewItems;
}

const TARGET_LANGUAGE_CODE_TO_SLUG: Record<UiLanguageCode, TargetLanguageSlug> = {
  en: "english",
  es: "spanish",
  de: "german",
  fr: "french",
  it: "italian",
  pt: "portuguese",
  ru: "russian",
};

function isTargetLanguageSlug(value: string): value is TargetLanguageSlug {
  return (SUPPORTED_TARGET_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeTargetLanguage(targetLanguage: PreviewTargetLanguage): TargetLanguageSlug {
  if (isTargetLanguageSlug(targetLanguage)) {
    return targetLanguage;
  }
  if (isSupportedUiLanguage(targetLanguage)) {
    return TARGET_LANGUAGE_CODE_TO_SLUG[targetLanguage];
  }
  throw new Error(`normalizeTargetLanguage: unsupported target language "${targetLanguage}"`);
}

export const DEV_CEFR_PREVIEW_PATH =
  `/test${buildLocalizedVocabularyPath(
    defaultPreviewItem?.uiLanguage ?? "en",
    normalizeTargetLanguage(defaultPreviewItem?.targetLanguage ?? "english"),
    defaultPreviewItem?.level ?? "b1",
  ) ?? "/en/english-b1-vocabulary-practice"}`;

export function findSeoCefrPreviewItem(params: {
  uiLanguage: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: CefrLevelCode;
}): SeoCefrContentItem | null {
  return (
    previewItems.find(
      (item) =>
        item.uiLanguage === params.uiLanguage &&
        normalizeTargetLanguage(item.targetLanguage) === params.targetLanguage &&
        item.level === params.level,
    ) ?? null
  );
}
