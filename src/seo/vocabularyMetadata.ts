import { buildLocalizedVocabularyPath } from "../data/seo/vocabularyLevels/vocabularyLevelRoutes";
import {
  type Level,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../data/seo/shared/slugs";
import { getVocabularyLevelContent } from "../data/seo/vocabularyLevels";
import type { SeoMetadata } from "./SeoContext";
import { buildHreflangAlternates, normalizeOrigin, sanitizeMetadataText } from "./seoAlternates";
import { buildVocabularyFaqSection } from "./seoFaq";
import { buildVocabularyJsonLdGraph } from "./seoSchema";
import { LEVEL_DISPLAY, META_DESC_TEMPLATE, META_TITLE_TEMPLATE, WORDS_UNIT_BY_UI_LANG } from "./seoTemplates";

export function buildVocabularySeoMetadata({
  uiLang,
  targetLanguage,
  level,
  pathname,
  siteOrigin,
  browsePreviewWords,
}: {
  uiLang: UiLanguageCode;
  targetLanguage: TargetLanguageSlug;
  level: Level;
  pathname: string;
  siteOrigin: string;
  browsePreviewWords?: ReadonlyArray<{ concept_id: string; word_lemma: string }>;
}): SeoMetadata | null {
  const contentBundle = getVocabularyLevelContent(uiLang, targetLanguage, level);
  if (!contentBundle) {
    return null;
  }

  const { file, levelContent } = contentBundle;
  const levelDisplay = LEVEL_DISPLAY[level];
  const wordsUnit = WORDS_UNIT_BY_UI_LANG[uiLang] ?? WORDS_UNIT_BY_UI_LANG.en;
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;
  const languageName = file.targetLanguageDisplayName;
  const benefit = levelContent.levelExplanation.bullets[0] ?? "";
  const titleTemplate = META_TITLE_TEMPLATE[uiLang] ?? META_TITLE_TEMPLATE.en;
  const descTemplate = META_DESC_TEMPLATE[uiLang] ?? META_DESC_TEMPLATE.en;

  const title = sanitizeMetadataText(
    levelContent.metaTitle ??
    titleTemplate(languageName, levelDisplay, levelContent.wordCount.value, wordsUnit),
  );
  const description = sanitizeMetadataText(
    levelContent.metaDescription ??
    descTemplate(languageName, levelDisplay, levelContent.wordCount.value, wordsUnit, benefit),
  );

  const faqSection = buildVocabularyFaqSection(uiLang, languageName, levelDisplay, levelContent, wordsUnit);
  const breadcrumbLabel = `${languageName} ${levelDisplay} Vocabulary`;

  const jsonLd = buildVocabularyJsonLdGraph({
    uiLang,
    targetLanguage,
    canonical,
    origin,
    title,
    description,
    breadcrumbLabel,
    faqItems: faqSection.items,
    browsePreviewWords,
  });

  return {
    title,
    description,
    canonical,
    jsonLd,
    alternates: buildHreflangAlternates((lang) => {
      const localizedPath = buildLocalizedVocabularyPath(lang, targetLanguage, level);
      return localizedPath ? `${origin}${localizedPath}` : null;
    }, `${origin}${buildLocalizedVocabularyPath("en", targetLanguage, level) ?? "/"}`),
  };
}
