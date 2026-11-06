// Loads the linguistic verb-forms dataset for the "100 Most Common
// Conjugated Verb Forms" table — one hand-authored JSON file per target
// language under ./conjugatedVerbs/ (e.g. english.json), each holding that
// language's full tense-grouped 100-verb conjugation array. Mirrors the
// pastForms100Verbs/ split — see pastForms100VerbFormsData.ts. The actual
// row-shaping logic lives in conjugated100VerbFormsRowBuilder.ts (kept
// import.meta-free so it stays unit-testable under Node); this file is only
// responsible for discovering the per-language files via Vite's
// import.meta.glob and handing each one to the builder.
//
// Lazy glob (G11 in docs/import-boundaries.md): one chunk per target
// language (~250-870 KB of JSON each), so only a conjugated-verb-forms page
// downloads its own language's file, instead of every page carrying all
// seven in the entry bundle and shaping them at startup. Same hydration
// contract as the noun details (common100NounDetails.ts): the page reads the
// rows synchronously (readConjugatedVerbFormsRows) and suspends only while
// they load — prerendering waits for every boundary (entry-server's
// stream.allReady), so the full table is in the HTML, and src/entry-client.tsx
// loads the file before hydrating so the prerendered page never suspends
// during hydration (see ConjugatedVerbFormsSeoPage.tsx).
import { SUPPORTED_TARGET_LANGUAGES, type TargetLanguageSlug } from "../../../shared/slugs";
import {
  buildConjugatedVerbFormsRows,
  type ConjugatedVerbFormsRowForms,
  type ConjugatedVerbFormsRowTenses,
} from "./conjugated100VerbFormsRowBuilder";

export type { ConjugatedVerbFormsRowForms, ConjugatedVerbFormsRowTenses };

export type ConjugatedVerbFormsRowsById = Map<string, ConjugatedVerbFormsRowTenses>;

const rawModules = import.meta.glob("./conjugatedVerbs/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

function modulePathFor(targetLanguage: TargetLanguageSlug): string {
  return `./conjugatedVerbs/${targetLanguage}.json`;
}

// Fail fast on a misnamed file, as the former eager glob did at startup —
// checked against the glob's keys only, so it costs no download.
const supportedTargetLanguages: ReadonlySet<string> = new Set(SUPPORTED_TARGET_LANGUAGES);
for (const modulePath of Object.keys(rawModules)) {
  const targetLanguage = (modulePath.split("/").pop() ?? "").replace(/\.json$/, "");
  if (!supportedTargetLanguages.has(targetLanguage)) {
    throw new Error(
      `Invalid conjugated-verb-forms data: "${modulePath}" does not match a supported target language (got "${targetLanguage}").`,
    );
  }
}

// Whether a conjugatedVerbs/{targetLanguage}.json file exists. Synchronous
// and download-free (the glob's keys are known at build time), so the table
// config and routing can decide "table ready vs placeholder" without loading.
export function hasConjugatedVerbFormsData(targetLanguage: TargetLanguageSlug): boolean {
  return modulePathFor(targetLanguage) in rawModules;
}

// One in-flight/settled promise per language, so every caller (the
// pre-hydration preload and the page) shares one download, plus synchronous
// views of the settled result for rendering.
const rowsCache = new Map<TargetLanguageSlug, Promise<ConjugatedVerbFormsRowsById | null>>();
const loadedRows = new Map<TargetLanguageSlug, ConjugatedVerbFormsRowsById | null>();
const failedRows = new Map<TargetLanguageSlug, Error>();

export function loadConjugatedVerbFormsRows(
  targetLanguage: TargetLanguageSlug,
): Promise<ConjugatedVerbFormsRowsById | null> {
  let pending = rowsCache.get(targetLanguage);
  if (!pending) {
    const modulePath = modulePathFor(targetLanguage);
    const loadModule = rawModules[modulePath];
    pending = (loadModule
      ? loadModule().then((module) => buildConjugatedVerbFormsRows(modulePath, targetLanguage, module.default))
      : Promise.resolve(null)
    ).then(
      (rows) => {
        loadedRows.set(targetLanguage, rows);
        return rows;
      },
      // Settled for this page load, like the noun details: every render then
      // sees the same result, and a reload retries.
      (error: unknown) => {
        failedRows.set(targetLanguage, error instanceof Error ? error : new Error(String(error)));
        throw error;
      },
    );
    rowsCache.set(targetLanguage, pending);
  }
  return pending;
}

export type ConjugatedVerbFormsRowsState =
  | { status: "loaded"; rows: ConjugatedVerbFormsRowsById | null }
  | { status: "failed"; error: Error }
  | { status: "pending"; promise: Promise<ConjugatedVerbFormsRowsById | null> };

// Synchronous read for rendering. Starts the load if it has not started yet.
// `rows` is null when no file exists for the language yet.
export function readConjugatedVerbFormsRows(targetLanguage: TargetLanguageSlug): ConjugatedVerbFormsRowsState {
  if (loadedRows.has(targetLanguage)) {
    return { status: "loaded", rows: loadedRows.get(targetLanguage) ?? null };
  }
  const error = failedRows.get(targetLanguage);
  if (error) return { status: "failed", error };
  return { status: "pending", promise: loadConjugatedVerbFormsRows(targetLanguage) };
}
