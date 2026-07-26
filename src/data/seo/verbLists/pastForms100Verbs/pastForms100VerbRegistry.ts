// Route/content registry for the "100 Most Common Verb Past Forms" page
// family — the single import surface other code (routing, SSR, sitemap
// generation, the page component) should use.
//
// Boundary note: the content file's targetLanguage field is a short code
// (en/de/es/fr/it/pt/ru — see pastForms100VerbRouteHelpers.ts), while every
// other route family in this app (including ../common100Verbs/) identifies a
// target language by its full-name TargetLanguageSlug (e.g. "german"). This
// module is where that conversion happens — via TARGET_LANGUAGE_TO_UI_LANGUAGE
// (full name -> short code, for looking content up) and
// getUiVocabularyLanguage (short code -> full name, for reporting a matched
// route back to the rest of the app) — so the short-code choice stays local
// to this content file and never leaks into pageRouting.ts/App.tsx/entry-server.tsx.
//
// Canonical route paths are also NOT hardcoded here, unlike
// ../common100Verbs/common100VerbRegistry.ts: per an explicit product
// decision, each content record owns its own canonical slug via `urlSlug`.
// A record with an empty `urlSlug` contributes no route/sitemap entry yet —
// every function below that depends on a real slug (getPastVerbFormsPath,
// getAllPastVerbFormsPaths, resolvePastVerbFormsRoute) already handles that
// case correctly, so no code here needs to change once slugs are filled in.
//
// Deliberately does NOT import/re-export getPastVerbFormsTableConfig:
// scripts/lib/load-past-verb-forms-registry.mjs compiles this file (plus
// its imports) to CommonJS for the Node-only sitemap generator, and that
// compiler can't handle import.meta.glob. pastForms100VerbTableConfig.ts
// transitively imports pastForms100VerbFormsData.ts, which uses
// import.meta.glob to load ./pastForms/*.json — importing it from here
// would break `npm run sitemap` (and Cloudflare's prebuild) even though the
// sitemap script never calls that function. Client/SSR code should import
// getPastVerbFormsTableConfig directly from ./pastForms100VerbTableConfig
// (see ../index.ts) instead of expecting it from this registry.
import pastVerbFormsContentJson from "./pastForms100VerbsContent.json";
import {
  getUiVocabularyLanguage,
  TARGET_LANGUAGE_TO_UI_LANGUAGE,
  type TargetLanguageSlug,
  type UiLanguageCode,
} from "../../shared/slugs";
import {
  buildPastVerbFormsContentLookup,
  getPastVerbFormsContentEntry,
  type PastVerbFormsContentEntry,
} from "./pastForms100VerbRouteHelpers";

const PAST_VERB_FORMS_CONTENT_LOOKUP = buildPastVerbFormsContentLookup(pastVerbFormsContentJson);

export function getPastVerbFormsContent(
  targetLanguage: TargetLanguageSlug,
  uiLanguage: UiLanguageCode,
): PastVerbFormsContentEntry | null {
  const targetLanguageCode = TARGET_LANGUAGE_TO_UI_LANGUAGE[targetLanguage];
  return getPastVerbFormsContentEntry(PAST_VERB_FORMS_CONTENT_LOOKUP, targetLanguageCode, uiLanguage);
}

// Canonical path for one (targetLanguage, uiLanguage) combination, derived
// from that record's own urlSlug. Returns null while no urlSlug has been
// authored yet for that combination.
export function getPastVerbFormsPath(
  targetLanguage: TargetLanguageSlug,
  uiLanguage: UiLanguageCode,
): string | null {
  const content = getPastVerbFormsContent(targetLanguage, uiLanguage);
  return content?.urlSlug ? `/${uiLanguage}/${content.urlSlug}` : null;
}

export function getAllPastVerbFormsPaths(): string[] {
  const paths: string[] = [];

  for (const entry of PAST_VERB_FORMS_CONTENT_LOOKUP.values()) {
    if (entry.urlSlug) {
      paths.push(`/${entry.uiLanguage}/${entry.urlSlug}`);
    }
  }

  return paths;
}

export function resolvePastVerbFormsRoute(
  path: string,
): { uiLang: UiLanguageCode; targetLanguage: TargetLanguageSlug } | null {
  for (const entry of PAST_VERB_FORMS_CONTENT_LOOKUP.values()) {
    if (entry.urlSlug && `/${entry.uiLanguage}/${entry.urlSlug}` === path) {
      return {
        uiLang: entry.uiLanguage,
        targetLanguage: getUiVocabularyLanguage(entry.targetLanguage),
      };
    }
  }

  return null;
}
