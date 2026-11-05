import { Link } from "react-router-dom";
import { useLanguage } from "../../../contexts/LanguageContext";
import { openCookiePreferences } from "../../../lib/analyticsConsent";
import { getPrivacyPolicyPath } from "../../../data/seo/legalPages/privacyPolicy/privacyPolicyRoutes";
import "./styles/analytics-consent.scss";

// Minimal global footer, rendered once after the routed page in App.tsx.
// Holds the localized Privacy Policy link and the Cookie Preferences
// control. The policy link is a real <a href> in the server-rendered HTML
// on every page (a crawlable internal link to /{ui}/privacy); Cookie
// Preferences is a <button>, not a link, because it opens the
// AnalyticsConsentBanner rather than navigating. Hidden while a learning
// session is mounted (see styles/analytics-consent.scss).
export function SiteFooter() {
  const { t, uiLanguage } = useLanguage();

  return (
    <footer className="site-footer">
      <Link to={getPrivacyPolicyPath(uiLanguage)} className="site-footer__link">
        {t("cookieConsent.privacyPolicy")}
      </Link>
      <span className="site-footer__separator" aria-hidden="true">
        ·
      </span>
      <button type="button" className="site-footer__link" onClick={openCookiePreferences}>
        {t("cookieConsent.cookiePreferences")}
      </button>
    </footer>
  );
}
