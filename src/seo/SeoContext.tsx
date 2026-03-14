import { createContext, useContext, useEffect, type ReactNode } from "react";
import { DEFAULT_SEO_METADATA, DEFAULT_SITE_ORIGIN } from "./site";

export interface SeoAlternateLink {
  href: string;
  hreflang: string;
}

export interface SeoMetadata {
  title: string;
  description: string;
  canonical: string;
  alternates?: SeoAlternateLink[];
}

export interface SeoManager {
  metadata: SeoMetadata | null;
}

interface SeoContextValue {
  manager?: SeoManager;
  siteOrigin: string;
}

const SeoContext = createContext<SeoContextValue>({
  siteOrigin: DEFAULT_SITE_ORIGIN,
});

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function removeManagedAlternateTags() {
  if (typeof document === "undefined") {
    return;
  }

  const existing = document.querySelectorAll("link[data-vocab-hreflang='true']");
  existing.forEach((element) => element.remove());
}

function upsertMetaDescription(content: string) {
  let tag = document.querySelector("meta[name='description']") as HTMLMetaElement | null;

  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", "description");
    document.head.appendChild(tag);
  }

  tag.setAttribute("content", content);
}

function upsertMetaProperty(property: string, content: string) {
  let tag = document.querySelector(`meta[property='${property}']`) as HTMLMetaElement | null;

  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }

  tag.setAttribute("content", content);
}

function upsertCanonical(href: string) {
  let tag = document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;

  if (!tag) {
    tag = document.createElement("link");
    tag.setAttribute("rel", "canonical");
    document.head.appendChild(tag);
  }

  tag.setAttribute("href", href);
}

export function applySeoMetadata(metadata: SeoMetadata) {
  if (typeof document === "undefined") {
    return;
  }

  document.title = metadata.title;
  upsertMetaDescription(metadata.description);
  upsertCanonical(metadata.canonical);
  upsertMetaProperty("og:type", "website");
  upsertMetaProperty("og:url", metadata.canonical);
  upsertMetaProperty("og:title", metadata.title);
  upsertMetaProperty("og:description", metadata.description);
  removeManagedAlternateTags();

  (metadata.alternates ?? []).forEach((alternate) => {
    const link = document.createElement("link");
    link.setAttribute("rel", "alternate");
    link.setAttribute("hreflang", alternate.hreflang);
    link.setAttribute("href", alternate.href);
    link.setAttribute("data-vocab-hreflang", "true");
    document.head.appendChild(link);
  });
}

export function renderSeoTags(metadata: SeoMetadata): string {
  const alternates = (metadata.alternates ?? [])
    .map(
      (alternate) =>
        `<link rel="alternate" hreflang="${escapeHtml(alternate.hreflang)}" href="${escapeHtml(alternate.href)}" data-vocab-hreflang="true">`,
    )
    .join("\n    ");

  return [
    `<title>${escapeHtml(metadata.title)}</title>`,
    `<meta name="description" content="${escapeHtml(metadata.description)}">`,
    `<link rel="canonical" href="${escapeHtml(metadata.canonical)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeHtml(metadata.canonical)}">`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}">`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}">`,
    alternates,
  ]
    .filter(Boolean)
    .join("\n    ");
}

export function SeoProvider({
  children,
  manager,
  siteOrigin = DEFAULT_SITE_ORIGIN,
}: {
  children: ReactNode;
  manager?: SeoManager;
  siteOrigin?: string;
}) {
  return (
    <SeoContext.Provider value={{ manager, siteOrigin }}>
      {children}
    </SeoContext.Provider>
  );
}

export function SEOHead({ metadata }: { metadata: SeoMetadata }) {
  const { manager } = useContext(SeoContext);

  if (manager) {
    manager.metadata = metadata;
  }

  useEffect(() => {
    applySeoMetadata(metadata);

    return () => {
      applySeoMetadata(DEFAULT_SEO_METADATA);
      removeManagedAlternateTags();
    };
  }, [metadata]);

  return null;
}

export function useSeoSiteOrigin(): string {
  return useContext(SeoContext).siteOrigin;
}
