import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import "flag-icons/css/flag-icons.min.css";
import "./styles/index.css";
import "./styles/filters_page.scss";
import "./styles/language_page.scss";
import "./styles/exercise_page.scss";
import "./styles/about_help_page.scss";
import "./styles/header.scss";
import "./styles/exercises.scss";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element");
}

const app = (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />
  </BrowserRouter>
);

if (rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, app);
} else {
  createRoot(rootElement).render(app);
}
