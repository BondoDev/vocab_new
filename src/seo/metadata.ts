// Compatibility facade: src/seo/metadata.ts was split into focused modules
// (Issue 15) but every symbol below is re-exported here unchanged so existing
// production imports of "../../seo/metadata" / "./metadata" keep working.
export type { FaqItem } from "./vocabularyLevels/seoTemplates";
export { buildVocabularyFaqSection } from "./vocabularyLevels/seoFaq";
export { buildVerbListSeoMetadata } from "./verbLists/common100Verbs/common100VerbsMetadata";
export { buildVocabularyJsonLdGraph } from "./vocabularyLevels/seoSchema";
export { buildLevelTestSeoMetadata } from "./levelTests/levelTestMetadata";
export { buildSeoHubMetadata, buildWordSeoHubMetadata } from "./hubPages/hubMetadata";
export type { WordSeoMetadataParams } from "./wordPages/wordMetadata";
export { buildWordSeoMetadata } from "./wordPages/wordMetadata";
