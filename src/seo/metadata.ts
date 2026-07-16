// Compatibility facade: src/seo/metadata.ts was split into focused modules
// (Issue 15) but every symbol below is re-exported here unchanged so existing
// production imports of "../../seo/metadata" / "./metadata" keep working.
export type { FaqItem } from "./seoTemplates";
export { buildVocabularyFaqSection } from "./seoFaq";
export { buildVerbListSeoMetadata } from "./verbListMetadata";
export { buildVocabularyJsonLdGraph } from "./seoSchema";
export { buildVocabularySeoMetadata } from "./vocabularyMetadata";
export { buildLevelTestSeoMetadata, buildSeoHubMetadata, buildWordSeoHubMetadata } from "./hubMetadata";
export type { WordSeoMetadataParams } from "./wordMetadata";
export { buildWordSeoMetadata } from "./wordMetadata";
