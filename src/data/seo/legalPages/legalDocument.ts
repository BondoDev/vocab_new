// Content model for long-form legal documents (Privacy Policy now; Terms of
// Service is expected to reuse it). Documents are plain JSON, one file per
// UI language, rendered by src/app/pages/legal/LegalDocumentView.tsx.
//
// Safety: there is deliberately no HTML anywhere in this model. Text is
// rendered as React text nodes, formatting is limited to the inline node
// types below, and link targets are allow-listed (isSafeLegalHref). Never
// add an "html" block type or dangerouslySetInnerHTML for this content.

// "placeholder": structure-only demo text; the page is served
// "noindex, follow" and kept out of the sitemap. Switch a language's file to
// "published" only once its real, reviewed legal text is in place.
export type LegalDocumentStatus = "placeholder" | "published";

// Inline text: a plain string, or a bold/link span. Arrays of these make up
// paragraphs and list items, so bold text and links can sit mid-sentence.
export type LegalInline =
  | string
  | { type: "bold"; text: string }
  | { type: "link"; text: string; href: string };

export type LegalInlineContent = LegalInline[];

export type LegalBlock =
  | { type: "paragraph"; content: LegalInlineContent }
  // Rendered as <h3>. `id` makes the subsection directly linkable.
  | { type: "subheading"; id: string; text: string }
  | { type: "list"; style: "bullet" | "numbered"; items: LegalInlineContent[] };

export interface LegalSection {
  // Stable anchor id (/{ui}/privacy#<id>). Keep it identical across
  // languages and never change it once published: external links and the
  // table of contents depend on it.
  id: string;
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  schemaVersion: 1;
  status: LegalDocumentStatus;
  title: string;
  description: string;
  // ISO dates (YYYY-MM-DD). effectiveDate is optional until a policy
  // version takes effect; lastUpdated is always shown under the heading.
  effectiveDate: string | null;
  lastUpdated: string;
  sections: LegalSection[];
}

// Internal paths, https URLs, and mailto: only. Anything else (javascript:,
// data:, protocol-relative //host, plain http) is rendered as plain text.
export function isSafeLegalHref(href: string): boolean {
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  return /^(https:\/\/|mailto:)/i.test(href);
}

const ANCHOR_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Structural validation, run when a document is loaded. Throws with a
// precise message so a malformed content file fails the build/prerender
// instead of shipping a broken or partially rendered legal page.
export function assertValidLegalDocument(value: unknown, source: string): asserts value is LegalDocument {
  const fail = (message: string): never => {
    throw new Error(`Invalid legal document ${source}: ${message}`);
  };
  const doc = value as Partial<LegalDocument> | null;
  if (!doc || typeof doc !== "object") fail("not an object");
  if (doc!.schemaVersion !== 1) fail("schemaVersion must be 1");
  if (doc!.status !== "placeholder" && doc!.status !== "published") fail("status must be placeholder or published");
  if (typeof doc!.title !== "string" || !doc!.title.trim()) fail("title is required");
  if (typeof doc!.description !== "string" || !doc!.description.trim()) fail("description is required");
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  if (typeof doc!.lastUpdated !== "string" || !isoDate.test(doc!.lastUpdated)) fail("lastUpdated must be YYYY-MM-DD");
  if (doc!.effectiveDate !== null && (typeof doc!.effectiveDate !== "string" || !isoDate.test(doc!.effectiveDate))) {
    fail("effectiveDate must be YYYY-MM-DD or null");
  }
  if (!Array.isArray(doc!.sections) || doc!.sections.length === 0) fail("sections must be a non-empty array");

  const ids = new Set<string>();
  const claimId = (id: unknown, where: string) => {
    if (typeof id !== "string" || !ANCHOR_ID_RE.test(id)) fail(`${where}: id must be kebab-case`);
    if (ids.has(id as string)) fail(`${where}: duplicate id "${id}"`);
    ids.add(id as string);
  };
  const checkInline = (content: unknown, where: string) => {
    if (!Array.isArray(content) || content.length === 0) fail(`${where}: inline content must be a non-empty array`);
    for (const node of content as unknown[]) {
      if (typeof node === "string") continue;
      const span = node as { type?: string; text?: unknown; href?: unknown };
      if (span?.type === "bold" && typeof span.text === "string") continue;
      if (span?.type === "link" && typeof span.text === "string" && typeof span.href === "string") {
        if (!isSafeLegalHref(span.href)) fail(`${where}: unsupported link target "${span.href}"`);
        continue;
      }
      fail(`${where}: unknown inline node ${JSON.stringify(node)}`);
    }
  };

  doc!.sections!.forEach((section, sectionIndex) => {
    const where = `sections[${sectionIndex}]`;
    claimId(section?.id, where);
    if (typeof section.heading !== "string" || !section.heading.trim()) fail(`${where}: heading is required`);
    if (!Array.isArray(section.blocks)) fail(`${where}: blocks must be an array`);
    section.blocks.forEach((block, blockIndex) => {
      const blockWhere = `${where}.blocks[${blockIndex}]`;
      switch (block?.type) {
        case "paragraph":
          checkInline(block.content, blockWhere);
          break;
        case "subheading":
          claimId(block.id, blockWhere);
          if (typeof block.text !== "string" || !block.text.trim()) fail(`${blockWhere}: text is required`);
          break;
        case "list":
          if (block.style !== "bullet" && block.style !== "numbered") fail(`${blockWhere}: style must be bullet or numbered`);
          if (!Array.isArray(block.items) || block.items.length === 0) fail(`${blockWhere}: items must be a non-empty array`);
          block.items.forEach((item, itemIndex) => checkInline(item, `${blockWhere}.items[${itemIndex}]`));
          break;
        default:
          fail(`${blockWhere}: unknown block type ${JSON.stringify((block as { type?: unknown })?.type)}`);
      }
    });
  });
}
