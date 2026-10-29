import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import {
  ABOUT_ACTION_ROUTES,
  ABOUT_CAPABILITIES,
  ABOUT_LEARNING_PATHS,
  ABOUT_PRINCIPLES,
  type AboutActionId,
  type AboutSectionId,
} from "./aboutPageStructure";
import "./about-page.scss";

interface AboutProps {
  // Opens the header's existing sign-up dialog. App passes it only for a
  // confirmed guest, so Create account never shows when signed in.
  onCreateAccount?: () => void;
  // True only once auth has resolved to a signed-in user. While auth is
  // unresolved (including SSR/prerender) neither account action renders, so
  // hydration never swaps one for the other.
  isSignedIn?: boolean;
}

type ActionVariant = "primary" | "secondary" | "inverse";

const formatOrdinal = (index: number) => String(index + 1).padStart(2, "0");

function SectionHeader({ id, base }: { id: AboutSectionId; base: string }) {
  const copy = useAboutCopy();
  return (
    <header className="about-page__section-header">
      <h2 id={`${id}-title`}>{copy(`${base}.title`)}</h2>
      <p>{copy(`${base}.intro`)}</p>
    </header>
  );
}

// Every About string lives under `aboutPage.*` in the interface locale
// files; keys passed here are relative to that root (e.g. "hero.title") and
// mirror the key lists in aboutPageStructure.ts.
function useAboutCopy() {
  const { t } = useLanguage();
  return (key: string) => t(`aboutPage.${key}`);
}

export function About({ onCreateAccount, isSignedIn = false }: AboutProps) {
  const copy = useAboutCopy();

  const renderAction = (actionId: AboutActionId, variant: ActionVariant) => {
    const className = `about-page__action about-page__action--${variant}`;
    const content = (
      <>
        <span>{copy(`actions.${actionId}`)}</span>
        <ArrowRight aria-hidden="true" />
      </>
    );

    if (actionId === "createAccount") {
      return onCreateAccount ? (
        <button type="button" className={className} onClick={onCreateAccount}>
          {content}
        </button>
      ) : null;
    }

    const to = ABOUT_ACTION_ROUTES[actionId];
    return to ? (
      <Link to={to} className={className}>
        {content}
      </Link>
    ) : null;
  };

  // The account-facing action: sign up for guests, go to learning when
  // signed in, nothing while auth is still unknown.
  const accountActionId: AboutActionId | null = isSignedIn
    ? "openLearning"
    : onCreateAccount
      ? "createAccount"
      : null;

  return (
    <main className="about-page">
      <section className="about-page__hero" aria-labelledby="about-title">
        <div className="about-page__container">
          <p className="about-page__eyebrow">{copy("hero.eyebrow")}</p>
          <h1 id="about-title">{copy("hero.title")}</h1>
          <p className="about-page__lead">{copy("hero.description")}</p>
        </div>
      </section>

      <section id="approach" className="about-page__section" aria-labelledby="approach-title">
        <div className="about-page__container">
          <SectionHeader id="approach" base="approach" />
          <ol className="about-page__principles">
            {ABOUT_PRINCIPLES.map((principle, index) => (
              // Marker, title, and body are direct grid children so the
              // stylesheet can place the title beside the body on desktop.
              <li key={principle}>
                <span className="about-page__ordinal" aria-hidden="true">
                  {formatOrdinal(index)}
                </span>
                <h3>{copy(`approach.principles.${principle}.title`)}</h3>
                <p>{copy(`approach.principles.${principle}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        id="ways-to-learn"
        className="about-page__section about-page__section--tinted"
        aria-labelledby="ways-to-learn-title"
      >
        <div className="about-page__container">
          <SectionHeader id="ways-to-learn" base="paths" />
          <div className="about-page__paths">
            {ABOUT_LEARNING_PATHS.map(({ key, highlights }) => {
              const base = `paths.${key}`;
              const isGuided = key === "personalizedLearning";
              const actionId = isGuided ? accountActionId : "startPractice";

              return (
                <article
                  key={key}
                  className={`about-page__path about-page__path--${isGuided ? "guided" : "free"}`}
                  aria-labelledby={`about-path-${key}`}
                >
                  <p className="about-page__badge">{copy(`${base}.badge`)}</p>
                  <h3 id={`about-path-${key}`}>{copy(`${base}.title`)}</h3>
                  <p className="about-page__path-description">{copy(`${base}.description`)}</p>
                  <ul className="about-page__highlights">
                    {highlights.map((highlight) => (
                      <li key={highlight}>
                        <Check aria-hidden="true" />
                        <span>{copy(`${base}.highlights.${highlight}`)}</span>
                      </li>
                    ))}
                  </ul>
                  {actionId ? (
                    <div className="about-page__path-action">
                      {renderAction(actionId, isGuided ? "inverse" : "primary")}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="platform" className="about-page__section" aria-labelledby="platform-title">
        <div className="about-page__container">
          <SectionHeader id="platform" base="platform" />
          <ul className="about-page__capabilities">
            {ABOUT_CAPABILITIES.map((capability) => (
              <li key={capability}>
                <h3>{copy(`platform.items.${capability}.title`)}</h3>
                <p>{copy(`platform.items.${capability}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="get-started" className="about-page__cta" aria-labelledby="get-started-title">
        <div className="about-page__container">
          <div className="about-page__cta-panel">
            <div className="about-page__cta-text">
              <h2 id="get-started-title">{copy("cta.title")}</h2>
              <p>{copy("cta.description")}</p>
            </div>
            <div className="about-page__cta-actions">
              {renderAction("startPractice", "primary")}
              {accountActionId ? renderAction(accountActionId, "secondary") : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
