// Compatibility facade: src/seo/metadata.ts was split into focused modules
// (Issue 15) but every symbol below is re-exported here unchanged so existing
// production imports of "../../seo/metadata" / "./metadata" keep working.
export type { FaqItem } from "./vocabularyLevels/seoTemplates";
export { buildVocabularyFaqSection } from "./vocabularyLevels/seoFaq";
export { buildVerbListSeoMetadata } from "./verbListMetadata";
export { buildVocabularyJsonLdGraph } from "./vocabularyLevels/seoSchema";
export { buildVocabularySeoMetadata } from "./vocabularyLevels/vocabularyMetadata";
export { buildLevelTestSeoMetadata, buildSeoHubMetadata, buildWordSeoHubMetadata } from "./hubMetadata";
export type { WordSeoMetadataParams } from "./wordMetadata";
export { buildWordSeoMetadata } from "./wordMetadata";
