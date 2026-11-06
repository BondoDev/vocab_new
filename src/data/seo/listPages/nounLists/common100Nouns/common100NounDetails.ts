// Per-concept table details for the 100-most-common-nouns lists — word,
// definition, example sentence, sentence forms to bold, and translations and
// definitions in other UI languages — read from the generated
// common100NounDetails/{listId}.json files
// (scripts/generation/generate-common100-noun-details.mjs; never edit
// those by hand).
//
// Lazy glob (G13 in docs/import-boundaries.md): one chunk per target
// language, so a page downloads only its own list's ~30 KB (gzip) instead of
// all seven. The page reads it synchronously (readNounDetails) and suspends
// only while it is loading: prerendering waits for every boundary
// (entry-server's stream.allReady), so the full table is in the HTML, and
// src/entry-client.tsx loads the file before hydrating so the prerendered
// page hydrates without suspending (see NounListSeoPage.tsx).
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

// One in-flight/settled promise per list, so every caller shares one fetch,
// plus synchronous views of the settled result. The synchronous cache is
// what lets the page render the table without suspending once the file has
// loaded — see NounListSeoPage.tsx and the hydration preload in
// src/entry-client.tsx (same pattern as privacyPolicyContent.ts).
const detailsCache = new Map<string, Promise<NounDetailsFile | null>>();
const loadedDetails = new Map<string, NounDetailsFile | null>();
const failedDetails = new Map<string, Error>();

export function loadNounDetails(listId: string): Promise<NounDetailsFile | null> {
  let pending = detailsCache.get(listId);
  if (!pending) {
    const loadModule = DETAIL_MODULES[`./common100NounDetails/${listId}.json`];
    pending = (loadModule ? loadModule().then((module) => module.default) : Promise.resolve(null)).then(
      (details) => {
        loadedDetails.set(listId, details);
        return details;
      },
      // Settled for this page load, like the Privacy Policy document: every
      // render then sees the same result, and a reload retries.
      (error: unknown) => {
        failedDetails.set(listId, error instanceof Error ? error : new Error(String(error)));
        throw error;
      },
    );
    detailsCache.set(listId, pending);
  }
  return pending;
}

export type NounDetailsState =
  | { status: "loaded"; details: NounDetailsFile | null }
  | { status: "failed"; error: Error }
  | { status: "pending"; promise: Promise<NounDetailsFile | null> };

// Synchronous read for rendering. Starts the load if it has not started yet.
export function readNounDetails(listId: string): NounDetailsState {
  if (loadedDetails.has(listId)) return { status: "loaded", details: loadedDetails.get(listId) ?? null };
  const error = failedDetails.get(listId);
  if (error) return { status: "failed", error };
  return { status: "pending", promise: loadNounDetails(listId) };
}
