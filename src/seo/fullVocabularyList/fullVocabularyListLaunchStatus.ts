// Single switch for whether full-vocabulary-list pages are indexable and
// listed in the XML sitemap. The page currently ships its structure and copy
// before the vocabulary entries are connected; flip this to false to serve
// "noindex, follow" and drop the routes from sitemap-cefr.xml (read by
// scripts/generation/generate-sitemap.mjs via
// scripts/lib/load-full-vocabulary-list-registry.mjs).
export const FULL_VOCABULARY_LIST_LAUNCHED = true;

export const FULL_VOCABULARY_LIST_PRELAUNCH_ROBOTS = "noindex, follow";
