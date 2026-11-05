import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import {
  isSafeLegalHref,
  type LegalBlock,
  type LegalDocument,
  type LegalInlineContent,
} from "../../../data/seo/legalPages/legalDocument";
import "./legal-document.scss";

// Presentational renderer for a LegalDocument (src/data/seo/legalPages/
// legalDocument.ts). Shared by the Privacy Policy page and, later, Terms of
// Service. SSR-safe: everything rendered on the server is a pure function
// of the document and UI language; browser-only behavior (scroll-spy, hash
// scrolling) lives in effects, so hydration always matches.

function renderInline(content: LegalInlineContent): ReactNode[] {
  return content.map((node, index) => {
    if (typeof node === "string") return node;
    if (node.type === "bold") return <strong key={index}>{node.text}</strong>;
    // Links were validated on load; re-checked here so the renderer never
    // emits an unsafe href even if handed an unvalidated document.
    if (!isSafeLegalHref(node.href)) return node.text;
    if (node.href.startsWith("/")) {
      return (
        <Link key={index} to={node.href}>
          {node.text}
        </Link>
      );
    }
    const isExternal = node.href.toLowerCase().startsWith("https://");
    return (
      <a key={index} href={node.href} {...(isExternal ? { rel: "noopener noreferrer" } : {})}>
        {node.text}
      </a>
    );
  });
}

function renderBlock(block: LegalBlock, index: number): ReactNode {
  switch (block.type) {
    case "paragraph":
      return <p key={index}>{renderInline(block.content)}</p>;
    case "subheading":
      return (
        <h3 key={index} id={block.id} className="legal-doc__subheading">
          {block.text}
        </h3>
      );
    case "list": {
      const ListTag = block.style === "numbered" ? "ol" : "ul";
      return (
        <ListTag key={index} className={`legal-doc__list legal-doc__list--${block.style}`}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </ListTag>
      );
    }
  }
}

function formatIsoDate(isoDate: string, uiLanguage: string): string {
  // UTC on both server and client, so the prerendered text and the
  // hydrating client format the same calendar day.
  return new Intl.DateTimeFormat(uiLanguage, { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

const isScrolledToBottom = () =>
  Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2;

// Highlights the section currently being read in the desktop contents list.
// Starts as null (server and first client render agree), then follows scroll.
//
// Three rules, in priority order:
//   1. A section chosen in the contents list stays highlighted until the
//      visitor scrolls on their own. Short final sections can never scroll
//      up to the reading band, so without this, clicking "14" at the page
//      bottom would highlight an earlier section.
//   2. At the very bottom of the page, the last section is current, for the
//      same reason.
//   3. Otherwise, the first section inside a reading band near the top of
//      the viewport (below the fixed header).
function useActiveSectionId(sectionIds: string[]) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const chosenIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;

    const visible = new Set<string>();
    const update = () => {
      if (chosenIdRef.current) {
        setActiveId(chosenIdRef.current);
      } else if (isScrolledToBottom()) {
        setActiveId(sectionIds[sectionIds.length - 1]);
      } else {
        const current = sectionIds.find((id) => visible.has(id));
        if (current) setActiveId(current);
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        update();
      },
      { rootMargin: "-15% 0px -55% 0px" },
    );
    elements.forEach((element) => observer.observe(element));

    // Only real user input releases a contents-list choice; the smooth
    // scroll triggered by the click itself must not.
    const releaseChoice = () => {
      if (chosenIdRef.current) {
        chosenIdRef.current = null;
      }
    };
    const userInputEvents = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    userInputEvents.forEach((type) => window.addEventListener(type, releaseChoice, { passive: true }));
    window.addEventListener("scroll", update, { passive: true });

    return () => {
      observer.disconnect();
      userInputEvents.forEach((type) => window.removeEventListener(type, releaseChoice));
      window.removeEventListener("scroll", update);
    };
  }, [sectionIds]);

  const chooseSection = (id: string) => {
    chosenIdRef.current = id;
    setActiveId(id);
  };

  return { activeId, chooseSection };
}

export function LegalDocumentView({ document: doc }: { document: LegalDocument }) {
  const { t, uiLanguage } = useLanguage();
  const mobileTocRef = useRef<HTMLDetailsElement>(null);
  const [sectionIds] = useState(() => doc.sections.map((section) => section.id));
  const { activeId, chooseSection } = useActiveSectionId(sectionIds);

  // Prerendered pages get native #fragment scrolling from the browser. After
  // a client-side navigation the content appears only once its chunk has
  // loaded, so scroll to a requested section here, once, after mount.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  const tocLinks = (onNavigate?: () => void) => (
    <ol className="legal-doc__toc-list">
      {doc.sections.map((section) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="legal-doc__toc-link"
            aria-current={activeId === section.id ? "location" : undefined}
            onClick={(event) => {
              // Scroll in place instead of following the #fragment: a hash
              // left in the URL makes every reload (and the language
              // switcher) jump back to that section — for the last sections,
              // straight to the page bottom. The href stays for "copy link"
              // / open-in-new-tab, and incoming #links still work (mount
              // effect above). Smoothness and reduced motion come from CSS
              // scroll-behavior on <html>.
              event.preventDefault();
              // Collapse the mobile contents list BEFORE measuring/scrolling:
              // closing it removes its height from above the target, and
              // scrolling first would overshoot by exactly that amount.
              onNavigate?.();
              const target = document.getElementById(section.id);
              target?.scrollIntoView();
              // Keyboard and screen-reader users continue from the section.
              document.getElementById(`${section.id}-heading`)?.focus({ preventScroll: true });
              chooseSection(section.id);
            }}
          >
            {section.heading}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <main className="legal-doc">
      <div className="legal-doc__inner">
        <header className="legal-doc__header">
          <h1>{doc.title}</h1>
          <p className="legal-doc__description">{doc.description}</p>
          <dl className="legal-doc__dates">
            <div>
              <dt>{t("legalPages.lastUpdated")}</dt>
              <dd>
                <time dateTime={doc.lastUpdated}>{formatIsoDate(doc.lastUpdated, uiLanguage)}</time>
              </dd>
            </div>
            {doc.effectiveDate ? (
              <div>
                <dt>{t("legalPages.effectiveDate")}</dt>
                <dd>
                  <time dateTime={doc.effectiveDate}>{formatIsoDate(doc.effectiveDate, uiLanguage)}</time>
                </dd>
              </div>
            ) : null}
          </dl>
          {doc.status === "placeholder" ? (
            <p className="legal-doc__draft-notice" role="note">
              {t("legalPages.placeholderNotice")}
            </p>
          ) : null}
        </header>

        {/* Phones/tablets: compact, collapsed contents list above the text. */}
        <nav className="legal-doc__toc-mobile" aria-label={t("legalPages.tableOfContents")}>
          <details ref={mobileTocRef}>
            <summary>
              <span>{t("legalPages.tableOfContents")}</span>
              <ChevronDown aria-hidden="true" />
            </summary>
            {tocLinks(() => {
              if (mobileTocRef.current) mobileTocRef.current.open = false;
            })}
          </details>
        </nav>

        <div className="legal-doc__layout">
          {/* Desktop: sticky contents list beside the text. */}
          <nav className="legal-doc__toc-desktop" aria-label={t("legalPages.tableOfContents")}>
            <p className="legal-doc__toc-title">{t("legalPages.tableOfContents")}</p>
            {tocLinks()}
          </nav>

          <article className="legal-doc__content">
            {doc.sections.map((section) => (
              <section key={section.id} id={section.id} className="legal-doc__section" aria-labelledby={`${section.id}-heading`}>
                <h2 id={`${section.id}-heading`} className="legal-doc__section-title" tabIndex={-1}>
                  {section.heading}
                </h2>
                {section.blocks.map(renderBlock)}
              </section>
            ))}
          </article>
        </div>
      </div>
    </main>
  );
}
