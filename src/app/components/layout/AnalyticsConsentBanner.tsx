import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { Button } from "../ui/button";
import { useLanguage } from "../../../contexts/LanguageContext";
import { getPrivacyPolicyPath } from "../../../data/seo/legalPages/privacyPolicy/privacyPolicyRoutes";
import {
  OPEN_COOKIE_PREFERENCES_EVENT,
  onZarazConsentReady,
  readAnalyticsConsent,
  saveAnalyticsConsent,
  isAnalyticsPurposeConfigured,
  type AnalyticsConsentState,
} from "../../../lib/analyticsConsent";
import "./styles/analytics-consent.scss";

// "prompt": first-visit banner, shown only when Zaraz reports no recorded
// choice. "preferences": reopened from the footer to change an existing
// choice (adds a status line and a close control).
type BannerMode = "hidden" | "prompt" | "preferences";

const BODY_VISIBLE_CLASS = "has-consent-banner";

// Withdrawal (accepted -> declined) is the only consent change that reloads.
// Zaraz decides per page load which tools run; once GA4 has started on a
// page, its in-page listeners (e.g. engagement/visibility events) stay until
// the document is replaced. Reloading after the rejection is saved — and
// verified by saveAnalyticsConsent — starts a clean page under the new
// choice. Accepting needs no reload (sendQueuedEvents covers it), and
// declining when nothing was accepted has nothing to stop.
function reloadAfterWithdrawal(): void {
  window.location.reload();
}

// Mounted exactly once, in App.tsx's root next to ScrollToTopButton, so it
// survives client-side navigation and can never be duplicated by a page.
//
// SSR/hydration: the initial state is always "hidden" and every decision is
// made in effects, so the server and the first client render both output
// nothing. The consent record is never read during render.
export function AnalyticsConsentBanner() {
  const { t, uiLanguage } = useLanguage();
  const [mode, setMode] = useState<BannerMode>("hidden");
  const [consent, setConsent] = useState<AnalyticsConsentState>("unset");
  // A choice made from the preferences view before Zaraz has loaded; it is
  // applied once the Consent API reports ready.
  const pendingChoiceRef = useRef<boolean | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(
    () =>
      onZarazConsentReady(() => {
        if (!isAnalyticsPurposeConfigured()) {
          return;
        }
        const pendingChoice = pendingChoiceRef.current;
        if (pendingChoice !== null) {
          pendingChoiceRef.current = null;
          const previous = readAnalyticsConsent();
          if (saveAnalyticsConsent(pendingChoice)) {
            setConsent(pendingChoice ? "granted" : "denied");
            // Zaraz has just loaded with the old acceptance, so GA4 is
            // already active on this page; see reloadAfterWithdrawal.
            if (previous === "granted" && !pendingChoice) {
              reloadAfterWithdrawal();
            }
            return;
          }
        }
        const recorded = readAnalyticsConsent();
        setConsent(recorded);
        if (recorded === "unset") {
          setMode((current) => (current === "hidden" ? "prompt" : current));
        }
      }),
    [],
  );

  useEffect(() => {
    const handleOpen = () => {
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setConsent(readAnalyticsConsent());
      setMode("preferences");
    };
    // Keeps the status line truthful if consent changes outside this UI.
    const handleUpdated = () => setConsent(readAnalyticsConsent());
    document.addEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpen);
    document.addEventListener("zarazConsentChoicesUpdated", handleUpdated);
    return () => {
      document.removeEventListener(OPEN_COOKIE_PREFERENCES_EVENT, handleOpen);
      document.removeEventListener("zarazConsentChoicesUpdated", handleUpdated);
    };
  }, []);

  // The first-visit prompt never steals focus (it is non-modal); an
  // explicit "Cookie Preferences" request moves focus into the banner.
  useEffect(() => {
    if (mode === "preferences") {
      titleRef.current?.focus();
    }
  }, [mode]);

  // Lets CSS keep the scroll-to-top button from overlapping the banner.
  useEffect(() => {
    const visible = mode !== "hidden";
    document.body.classList.toggle(BODY_VISIBLE_CLASS, visible);
    return () => document.body.classList.remove(BODY_VISIBLE_CLASS);
  }, [mode]);

  const close = () => {
    if (mode === "preferences") {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      // After the banner unmounts, return focus to the footer control.
      window.setTimeout(() => target?.isConnected && target.focus(), 0);
    }
    setMode("hidden");
  };

  const choose = (granted: boolean) => {
    const previous = readAnalyticsConsent();
    // A first-visit prompt can go stale: the visitor may have decided in
    // another tab since it appeared. Keep that recorded decision (never
    // overwrite it, a rejection especially) and simply close the prompt;
    // changing it is what Cookie Preferences is for.
    if (mode === "prompt" && previous !== "unset") {
      setConsent(previous);
      close();
      return;
    }
    if (saveAnalyticsConsent(granted)) {
      setConsent(granted ? "granted" : "denied");
      if (previous === "granted" && !granted) {
        close();
        reloadAfterWithdrawal();
        return;
      }
    } else {
      pendingChoiceRef.current = granted;
    }
    close();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Escape only dismisses the reopened view; the first-visit prompt stays
    // until the visitor actually chooses.
    if (event.key === "Escape" && mode === "preferences") {
      event.stopPropagation();
      close();
    }
  };

  if (mode === "hidden") {
    return null;
  }

  const statusKey =
    mode === "preferences" && consent !== "unset"
      ? consent === "granted"
        ? "cookieConsent.currentAccepted"
        : "cookieConsent.currentDeclined"
      : null;

  return (
    <section
      className={`consent-banner${mode === "preferences" ? " consent-banner--preferences" : ""}`}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onKeyDown={handleKeyDown}
    >
      <div className="consent-banner__text">
        <h2 id={titleId} ref={titleRef} tabIndex={-1} className="consent-banner__title">
          {t("cookieConsent.title")}
        </h2>
        <p id={descriptionId} className="consent-banner__description">
          {t("cookieConsent.description")}{" "}
          <Link to={getPrivacyPolicyPath(uiLanguage)} className="consent-banner__link">
            {t("cookieConsent.privacyPolicy")}
          </Link>
        </p>
        {statusKey && (
          <p className="consent-banner__status" role="status">
            {t(statusKey)}
          </p>
        )}
      </div>
      <div className="consent-banner__actions">
        <Button
          type="button"
          variant="outline"
          className="consent-banner__button"
          onClick={() => choose(false)}
        >
          {t("cookieConsent.decline")}
        </Button>
        <Button
          type="button"
          className="consent-banner__button consent-banner__button--accept"
          onClick={() => choose(true)}
        >
          {t("cookieConsent.accept")}
        </Button>
      </div>
      {mode === "preferences" && (
        <button
          type="button"
          className="consent-banner__close"
          aria-label={t("cookieConsent.close")}
          onClick={close}
        >
          <X aria-hidden="true" />
        </button>
      )}
    </section>
  );
}
