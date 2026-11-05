import type { UiLanguageCode } from "../../shared/slugs";
import { assertValidLegalDocument, type LegalDocument } from "../legalDocument";

// Localized Privacy Policy documents (./content/{ui}.json), deliberately
// separate from the UI translation files (src/data/interface/) so the long
// legal text never enters the app's translation payload.
//
// Lazy glob (import-boundaries G14): each language is its own small chunk,
// loaded only on the privacy page. Prerendering waits for it, so the
// document is in the static HTML.
const CONTENT_MODULES = import.meta.glob("./content/*.json") as Record<
  string,
  () => Promise<{ default: unknown }>
>;

// One shared in-flight/settled promise per language, plus synchronous views
// of the settled result. The synchronous cache is what lets the page render
// without suspending once a document is loaded — see PrivacyPolicyPage.tsx
// and the hydration preload in src/entry-client.tsx.
const documentCache = new Map<UiLanguageCode, Promise<LegalDocument>>();
const loadedDocuments = new Map<UiLanguageCode, LegalDocument>();
const failedDocuments = new Map<UiLanguageCode, Error>();

export function loadPrivacyPolicyDocument(uiLang: UiLanguageCode): Promise<LegalDocument> {
  let pending = documentCache.get(uiLang);
  if (!pending) {
    const path = `./content/${uiLang}.json`;
    const loadModule = CONTENT_MODULES[path];
    pending = (
      loadModule
        ? loadModule().then((module) => {
            assertValidLegalDocument(module.default, `privacyPolicy/content/${uiLang}.json`);
            return module.default;
          })
        : Promise.reject(new Error(`Missing Privacy Policy content file ${path}`))
    ).then(
      (document) => {
        loadedDocuments.set(uiLang, document);
        return document;
      },
      (error: unknown) => {
        failedDocuments.set(uiLang, error instanceof Error ? error : new Error(String(error)));
        throw error;
      },
    );
    documentCache.set(uiLang, pending);
  }
  return pending;
}

export type PrivacyPolicyDocumentState =
  | { status: "loaded"; document: LegalDocument }
  | { status: "failed"; error: Error }
  | { status: "pending"; promise: Promise<LegalDocument> };

// Synchronous read for rendering. Starts the load if it has not started yet.
export function readPrivacyPolicyDocument(uiLang: UiLanguageCode): PrivacyPolicyDocumentState {
  const document = loadedDocuments.get(uiLang);
  if (document) return { status: "loaded", document };
  const error = failedDocuments.get(uiLang);
  if (error) return { status: "failed", error };
  return { status: "pending", promise: loadPrivacyPolicyDocument(uiLang) };
}
