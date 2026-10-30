// Per-concept table details for the 100-most-common-nouns lists — word,
// definition, example sentence, sentence forms to bold, and translations and
// definitions in other UI languages — read from the generated
// common100NounDetails/{listId}.json files
// (scripts/generation/generate-common100-noun-details.mjs; never edit
// those by hand).
//
// Lazy glob (G13 in docs/import-boundaries.md): one chunk per target
// language, so a page downloads only its own list's ~30 KB (gzip) instead of
// all seven. The page renders the table through React.lazy inside Suspense;
// prerendering waits for every boundary (entry-server's stream.allReady), so
// the full table is still in the HTML, and hydration keeps that HTML until
// the chunk arrives.
//
// Kept out of common100NounRegistry.ts's import graph: the registry must
// stay light for the Node sitemap tooling, and only the page needs this.
import type { UiLanguageCode } from "../../../shared/slugs";

export interface NounDetails {
  // The concept's word in the list's target language (its vocabulary lemma).
  word: string;
  definition: string;
  sentence: string;
  // Forms of the word as they may appear in `sentence` (inflected forms plus
  // the lemma), for bolding.
  sentenceForms: string[];
  // The concept's word in other UI languages; absent when that language's
  // vocabulary has no such concept.
  translations: Partial<Record<UiLanguageCode, string>>;
  // The concept's definition in other UI languages, shown instead of
  // `definition` when the page's UI language differs from the list's.
  definitions: Partial<Record<UiLanguageCode, string>>;
}

export interface NounDetailsFile {
  listId: string;
  byConceptId: Record<string, NounDetails>;
}

const DETAIL_MODULES = import.meta.glob("./common100NounDetails/*.json") as Record<
  string,
  () => Promise<{ default: NounDetailsFile }>
>;

// One in-flight/settled promise per list, so every caller shares one fetch.
const detailsCache = new Map<string, Promise<NounDetailsFile | null>>();

export function loadNounDetails(listId: string): Promise<NounDetailsFile | null> {
  let pending = detailsCache.get(listId);
  if (!pending) {
    const loadModule = DETAIL_MODULES[`./common100NounDetails/${listId}.json`];
    pending = loadModule ? loadModule().then((module) => module.default) : Promise.resolve(null);
    detailsCache.set(listId, pending);
  }
  return pending;
}
