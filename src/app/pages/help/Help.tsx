import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import { getSeoHubPath } from "../../../data/seo/shared/hub";
import {
  HELP_CENTER_ACTION_ROUTES,
  HELP_CENTER_SECTIONS,
  type HelpCenterActionId,
} from "./helpCenterSections";
import "./help-center.scss";

interface HelpProps {
  // Opens the header's existing sign-up dialog. App passes it only for a
  // confirmed guest, so the Create account action never shows when signed in.
  onCreateAccount?: () => void;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

// Body strings may hold several paragraphs separated by a blank line; that is
// the only formatting convention (no HTML in translations).
function HelpText({ text, className = "" }: { text: string; className?: string }) {
  return (
    <div className={`help-center__text ${className}`.trim()}>
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

function HelpDisclosure({ summary, body }: { summary: string; body: string }) {
  return (
    <details className="help-center__disclosure">
      <summary>
        <span>{summary}</span>
        <ChevronDown className="help-center__disclosure-icon" aria-hidden="true" />
      </summary>
      <HelpText text={body} className="help-center__disclosure-panel" />
    </details>
  );
}

export function Help({ onCreateAccount }: HelpProps) {
  const { t, uiLanguage } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeId, setActiveId] = useState<string>(HELP_CENTER_SECTIONS[0].id);
  // The first hash scroll (a direct /help#section link) jumps instantly;
  // later in-page navigation may animate.
  const hasHandledInitialHashRef = useRef(false);
  // Set by an explicit jump so focus follows the reader to the new section.
  const shouldFocusTargetRef = useRef(false);
  const contentEndRef = useRef<HTMLDivElement>(null);

  const scrollToSection = useCallback((id: string, smooth: boolean) => {
    const section = document.getElementById(id);
    if (!section) return;
    section.scrollIntoView({
      behavior: smooth && !prefersReducedMotion() ? "smooth" : "auto",
      block: "start",
    });
    if (shouldFocusTargetRef.current) {
      shouldFocusTargetRef.current = false;
      section.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    }
    setActiveId(id);
  }, []);

  // The URL hash is the source of truth, so direct links and browser
  // back/forward land on the same section as a click does.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.replace(/^#/, ""));
    const isInitial = !hasHandledInitialHashRef.current;
    hasHandledInitialHashRef.current = true;
    if (id) scrollToSection(id, !isInitial);
  }, [location.hash, scrollToSection]);

  // Active-section highlight. The observed band starts a little below where a
  // jumped-to section lands (header height + scroll-margin, ~98px), so the
  // previous section's bottom edge never wins right after a jump; the
  // earliest section inside the band is active. The short last section can't
  // scroll up into the band, so it wins whenever the end of the content is on
  // screen (tracked by a separate sentinel observer).
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    let isEndVisible = false;
    const lastSection = HELP_CENTER_SECTIONS[HELP_CENTER_SECTIONS.length - 1];
    const updateActive = () => {
      const current = isEndVisible
        ? lastSection
        : HELP_CENTER_SECTIONS.find(({ id }) => visible.has(id));
      if (current) setActiveId(current.id);
    };

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        });
        updateActive();
      },
      { rootMargin: "-112px 0px -60% 0px" },
    );
    const endObserver = new IntersectionObserver((entries) => {
      isEndVisible = entries[entries.length - 1].isIntersecting;
      updateActive();
    });

    HELP_CENTER_SECTIONS.forEach(({ id }) => {
      const section = document.getElementById(id);
      if (section) sectionObserver.observe(section);
    });
    if (contentEndRef.current) endObserver.observe(contentEndRef.current);
    return () => {
      sectionObserver.disconnect();
      endObserver.disconnect();
    };
  }, []);

  const goToSection = (id: string) => {
    shouldFocusTargetRef.current = true;
    if (location.hash === `#${id}`) {
      scrollToSection(id, true);
      return;
    }
    navigate({ hash: id });
  };

  const handleNavClick = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    // Let modified clicks (new tab, etc.) keep native link behavior.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    goToSection(id);
  };

  const renderAction = (actionId: HelpCenterActionId) => {
    const label = t(`helpCenter.actions.${actionId}`);
    const content = (
      <>
        <span>{label}</span>
        <ArrowRight aria-hidden="true" />
      </>
    );

    if (actionId === "createAccount") {
      return onCreateAccount ? (
        <button key={actionId} type="button" className="help-center__action" onClick={onCreateAccount}>
          {content}
        </button>
      ) : null;
    }

    const to = actionId === "learningResources"
      ? getSeoHubPath(uiLanguage)
      : HELP_CENTER_ACTION_ROUTES[actionId];
    if (!to) return null;

    return (
      <Link key={actionId} to={to} className="help-center__action">
        {content}
      </Link>
    );
  };

  return (
    <main className="help-page help-center">
      <div className="help-center__inner">
        <header className="help-center__intro">
          <h1>{t("helpCenter.page.title")}</h1>
          <HelpText text={t("helpCenter.page.subtitle")} className="help-center__subtitle" />
        </header>

        <div className="help-center__jump">
          <label htmlFor="help-center-jump">{t("helpCenter.navigation.jumpTo")}</label>
          <div className="help-center__jump-field">
            <select
              id="help-center-jump"
              value={activeId}
              onChange={(event) => goToSection(event.target.value)}
            >
              {HELP_CENTER_SECTIONS.map(({ id, key }) => (
                <option key={id} value={id}>
                  {t(`helpCenter.navigation.${key}`)}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" />
          </div>
        </div>

        <div className="help-center__layout">
          <nav className="help-center__nav" aria-labelledby="help-center-nav-title">
            <p id="help-center-nav-title" className="help-center__nav-title">
              {t("helpCenter.navigation.label")}
            </p>
            <ol className="help-center__nav-list">
              {HELP_CENTER_SECTIONS.map(({ id, key }) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    onClick={(event) => handleNavClick(event, id)}
                    aria-current={activeId === id ? "location" : undefined}
                    className="help-center__nav-link"
                  >
                    {t(`helpCenter.navigation.${key}`)}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="help-center__content">
            {HELP_CENTER_SECTIONS.map((section) => {
              const base = `helpCenter.sections.${section.key}`;
              const headingId = `${section.id}-title`;
              const hasIntro = section.key !== "faq";

              return (
                <section
                  key={section.id}
                  id={section.id}
                  className="help-center__section"
                  aria-labelledby={headingId}
                >
                  {/* tabIndex lets a jump move keyboard focus to the section. */}
                  <h2 id={headingId} tabIndex={-1} className="help-center__section-title">
                    {t(`${base}.title`)}
                  </h2>
                  {hasIntro ? (
                    <HelpText text={t(`${base}.intro`)} className="help-center__section-intro" />
                  ) : null}

                  {section.topics.map((topic) => (
                    <div key={topic} className="help-center__topic">
                      <h3>{t(`${base}.${topic}.title`)}</h3>
                      <HelpText text={t(`${base}.${topic}.body`)} />
                    </div>
                  ))}

                  {section.exerciseTypes ? (
                    <div className="help-center__topic">
                      <h3>{t(`${base}.exerciseTypes.title`)}</h3>
                      <HelpText text={t(`${base}.exerciseTypes.intro`)} />
                      <div className="help-center__disclosures">
                        {section.exerciseTypes.map((exercise) => (
                          <HelpDisclosure
                            key={exercise}
                            summary={t(`${base}.exerciseTypes.${exercise}.title`)}
                            body={t(`${base}.exerciseTypes.${exercise}.body`)}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {section.faqItems ? (
                    <div className="help-center__disclosures">
                      {section.faqItems.map((item) => (
                        <HelpDisclosure
                          key={item}
                          summary={t(`${base}.items.${item}.question`)}
                          body={t(`${base}.items.${item}.answer`)}
                        />
                      ))}
                    </div>
                  ) : null}

                  {section.actions?.length ? (
                    <div className="help-center__actions">{section.actions.map(renderAction)}</div>
                  ) : null}
                </section>
              );
            })}
            <div ref={contentEndRef} aria-hidden="true" />
          </div>
        </div>
      </div>
    </main>
  );
}
