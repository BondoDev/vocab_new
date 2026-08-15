import type { UiLanguageCode } from "../../../data/seo/shared/slugs";
import type { ConjugatedVerbFormsContentEntry } from "../../../data/seo/verbLists/conjugated100Verbs/conjugated100VerbRouteHelpers";
import type { SeoMetadata } from "../../SeoContext";
import { buildHreflangAlternates, normalizeOrigin, sanitizeMetadataText } from "../../shared/seoAlternates";
import {
  CONJUGATED_VERB_FORMS_DEV_PLACEHOLDER_DESCRIPTION,
  CONJUGATED_VERB_FORMS_DEV_PLACEHOLDER_TITLE,
  CONJUGATED_VERB_FORMS_LAUNCHED,
  CONJUGATED_VERB_FORMS_PRELAUNCH_ROBOTS,
} from "./conjugatedVerbFormsLaunchStatus";

export function buildConjugatedVerbFormsSeoMetadata({
  uiLang,
  pathname,
  siteOrigin,
  content,
  getAllPaths,
  getPath,
}: {
  uiLang: UiLanguageCode;
  pathname: string;
  siteOrigin: string;
  content: ConjugatedVerbFormsContentEntry | null;
  getAllPaths: () => string[];
  getPath: (uiLang: UiLanguageCode) => string | null;
}): SeoMetadata {
  const origin = normalizeOrigin(siteOrigin);
  const canonical = `${origin}${pathname}`;
  const hasAuthoredMetadata = Boolean(content?.metadata.metaTitle && content?.metadata.metaDescription);

  const title = hasAuthoredMetadata
    ? sanitizeMetadataText(content!.metadata.metaTitle)
    : CONJUGATED_VERB_FORMS_DEV_PLACEHOLDER_TITLE;
  const description = hasAuthoredMetadata
    ? sanitizeMetadataText(content!.metadata.metaDescription)
    : CONJUGATED_VERB_FORMS_DEV_PLACEHOLDER_DESCRIPTION;

  const knownPaths = getAllPaths();
  const alternates = knownPaths.length > 0
    ? buildHreflangAlternates(getPath, `${origin}${knownPaths[0]}`)
    : [];

  const metadata: SeoMetadata = {
    title,
    description,
    canonical,
    robots: CONJUGATED_VERB_FORMS_LAUNCHED ? undefined : CONJUGATED_VERB_FORMS_PRELAUNCH_ROBOTS,
    alternates,
  };

  if (!hasAuthoredMetadata) {
    return metadata;
  }

  const graph: object[] = [
    {
      "@type": "WebPage",
      "@id": `${canonical}#webpage`,
      url: canonical,
      name: title,
      description,
      inLanguage: uiLang,
      breadcrumb: { "@id": `${canonical}#breadcrumb` },
    },
    {
      "@type": "BreadcrumbList",
      "@id": `${canonical}#breadcrumb`,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: title, item: canonical },
      ],
    },
  ];

  if (content!.faq.items.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${canonical}#faq`,
      mainEntity: content!.faq.items.map((item) => ({
        "@type": "Question",
        name: sanitizeMetadataText(item.question),
        acceptedAnswer: {
          "@type": "Answer",
          text: sanitizeMetadataText(item.answer),
        },
      })),
    });
  }

  metadata.jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": graph,
  });

  return metadata;
}
