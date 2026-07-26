// Single centralized switch for the temporary pre-launch indexing state of
// the "Past Forms of the 100 Most Common {Target Language} Verbs" family.
// While false: pages render with robots="noindex, follow" and are excluded
// from sitemap generation (see generate-sitemap.mjs). Flipping this one
// constant to true is the entire launch step for indexing policy — it does
// not, by itself, add real slugs/content; that still comes from populating
// pastForms100VerbsContent.json.
export const PAST_VERB_FORMS_LAUNCHED = false;

export const PAST_VERB_FORMS_PRELAUNCH_ROBOTS = "noindex, follow";

// Shared, non-localized dev-state copy — used for both <head> metadata (via
// pastVerbFormsMetadata.ts) and the visible in-page placeholder (via
// PastVerbFormsSeoPage.tsx) whenever a given (targetLanguage, uiLanguage)
// combination has no authored JSON content yet. Deliberately a single
// English string reused everywhere rather than per-language copy — this is
// infrastructure/dev-state text, not SEO content, and only ever reachable
// while PAST_VERB_FORMS_LAUNCHED is false / robots is noindex.
export const PAST_VERB_FORMS_DEV_PLACEHOLDER_TITLE = "Page in development | FluentStellar";
export const PAST_VERB_FORMS_DEV_PLACEHOLDER_DESCRIPTION = "This page has not been published yet.";
export const PAST_VERB_FORMS_DEV_PLACEHOLDER_MESSAGE =
  "This page is still in development. Content has not been added yet.";
