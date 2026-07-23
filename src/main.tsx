import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App.tsx";
import "flag-icons/css/flag-icons.min.css";
import "./styles/index.css";
import "./styles/filters_page.scss";
import "./styles/exercise_page.scss";
import "./styles/exercises.scss";

createRoot(document.getElementById("root")!).render(
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />
  </BrowserRouter>,
);
