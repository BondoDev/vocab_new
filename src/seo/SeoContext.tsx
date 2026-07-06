import { createContext, useContext, useEffect, type ReactNode } from "react";
import { DEFAULT_OG_IMAGE, DEFAULT_SEO_METADATA, DEFAULT_SITE_ORIGIN } from "./site";

export interface SeoAlternateLink {
  href: string;
  hreflang: string;
}

export interface SeoMetadata {
  title: string;
  description: string;
  canonical?: string;
  robots?: string;
  alternates?: SeoAlternateLink[];
  jsonLd?: string;
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

function escapeJsonScriptContent(value: string): string {
  return value
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function upsertManagedJsonLd(jsonLd: string | undefined) {
  const existing = document.querySelector('script[data-managed-jsonld="true"]');
  if (existing) existing.remove();

  if (!jsonLd) return;

  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.setAttribute("data-managed-jsonld", "true");
  script.textContent = jsonLd;
  document.head.appendChild(script);
}

function removeManagedAlternateTags() {
  if (typeof document === "undefined") {
    return;
  }

  const existing = document.querySelectorAll("link[data-vocab-hreflang='true']");
  existing.forEach((element) => element.remove());
}

function upsertMetaName(name: string, content: string | undefined) {
  let tag = document.querySelector(`meta[name='${name}']`) as HTMLMetaElement | null;

  if (!content) {
    tag?.remove();
    return;
  }

  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("name", name);
    document.head.appendChild(tag);
  }

  tag.setAttribute("content", content);
}

function upsertMetaDescription(content: string) {
  upsertMetaName("description", content);
}

function upsertMetaProperty(property: string, content: string | undefined) {
  let tag = document.querySelector(`meta[property='${property}']`) as HTMLMetaElement | null;

  if (!content) {
    tag?.remove();
    return;
  }

  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute("property", property);
    document.head.appendChild(tag);
  }

  tag.setAttribute("content", content);
}

function upsertCanonical(href: string | undefined) {
  let tag = document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;

  if (!href) {
    tag?.remove();
    return;
  }

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
  upsertMetaName("robots", metadata.robots);
  upsertMetaProperty("og:type", metadata.canonical ? "website" : undefined);
  upsertMetaProperty("og:url", metadata.canonical);
  upsertMetaProperty("og:title", metadata.canonical ? metadata.title : undefined);
  upsertMetaProperty("og:description", metadata.canonical ? metadata.description : undefined);
  upsertMetaProperty("og:image", metadata.canonical ? DEFAULT_OG_IMAGE : undefined);
  upsertMetaProperty("og:image:width", metadata.canonical ? "1200" : undefined);
  upsertMetaProperty("og:image:height", metadata.canonical ? "630" : undefined);
  upsertManagedJsonLd(metadata.jsonLd);
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
    metadata.robots
      ? `<meta name="robots" content="${escapeHtml(metadata.robots)}">`
      : "",
    metadata.canonical
      ? `<link rel="canonical" href="${escapeHtml(metadata.canonical)}">`
      : "",
    metadata.canonical
      ? `<meta property="og:type" content="website">`
      : "",
    metadata.canonical
      ? `<meta property="og:url" content="${escapeHtml(metadata.canonical)}">`
      : "",
    metadata.canonical
      ? `<meta property="og:title" content="${escapeHtml(metadata.title)}">`
      : "",
    metadata.canonical
      ? `<meta property="og:description" content="${escapeHtml(metadata.description)}">`
      : "",
    metadata.canonical
      ? `<meta property="og:image" content="${escapeHtml(DEFAULT_OG_IMAGE)}">`
      : "",
    metadata.canonical
      ? `<meta property="og:image:width" content="1200">`
      : "",
    metadata.canonical
      ? `<meta property="og:image:height" content="630">`
      : "",
    alternates,
    metadata.jsonLd
      ? `<script type="application/ld+json" data-managed-jsonld="true">${escapeJsonScriptContent(metadata.jsonLd)}</script>`
      : "",
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
