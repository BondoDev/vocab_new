import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { useEffect } from "react";
import { useLocation } from "react-router";
import App from "./app/App.tsx";
import { trackPageView } from "./analytics";
import "flag-icons/css/flag-icons.min.css";
import "./styles/index.css";
import "./styles/filters_page.scss";
import "./styles/language_page.scss";
import "./styles/exercise_page.scss";
import "./styles/about_help_page.scss";
import "./styles/header.scss";
import "./styles/exercises.scss";

function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}${location.hash}`);
  }, [location.pathname, location.search, location.hash]);

  return null;
}

createRoot(document.getElementById("root")!).render(
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <AnalyticsTracker />
    <App />
  </BrowserRouter>,
);
