import { Suspense } from "react";
import type { UiLanguageCode } from "../../../data/seo/shared/slugs";
import { readPrivacyPolicyDocument } from "../../../data/seo/legalPages/privacyPolicy/privacyPolicyContent";
import { buildPrivacyPolicyMetadata } from "../../../seo/legalPages/privacyPolicyMetadata";
import { SEOHead, useSeoSiteOrigin } from "../../../seo/SeoContext";
import { LegalDocumentView } from "./LegalDocumentView";

// Route component for /{ui}/privacy.
//
// The document is a per-language lazy chunk (privacyPolicyContent.ts).
// PrivacyPolicyContent reads it synchronously once loaded and suspends only
// while it is still loading:
//   - Prerendering: the first render suspends, the stream waits for the
//     chunk, and the finished document (plus its <head> metadata) is in the
//     static HTML.
//   - Hydration: src/entry-client.tsx loads the document BEFORE hydrateRoot,
//     so this component never suspends during hydration. This replaced a
//     React.lazy wrapper, which always suspends on first render: if the app
//     re-rendered before that boundary finished hydrating (e.g. when auth
//     state resolves ~1s after load), React discarded the server HTML and
//     flashed the empty fallback (React #421, silenced in entry-client).
//   - Client-side navigation: suspends briefly and shows the fallback.
// The Suspense boundary itself must stay: it keeps the client tree identical
// to the server's (which rendered one) for hydration.
function PrivacyPolicyContent({ uiLang }: { uiLang: UiLanguageCode }) {
  const siteOrigin = useSeoSiteOrigin();
  const state = readPrivacyPolicyDocument(uiLang);
  if (state.status === "pending") {
    throw state.promise;
  }
  if (state.status === "failed") {
    throw state.error;
  }
  const { document } = state;
  return (
    <>
      <SEOHead metadata={buildPrivacyPolicyMetadata({ uiLang, document, siteOrigin })} />
      <LegalDocumentView document={document} />
    </>
  );
}

export function PrivacyPolicyPage({ uiLang }: { uiLang: UiLanguageCode }) {
  return (
    // The fallback only shows on client-side navigation to the page;
    // prerendered HTML already contains the document.
    <Suspense fallback={<div className="legal-doc legal-doc--pending" aria-busy="true" />}>
      <PrivacyPolicyContent uiLang={uiLang} />
    </Suspense>
  );
}
