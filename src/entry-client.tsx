import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import "flag-icons/css/flag-icons.min.css";
import "./styles/index.css";
import "./styles/language_page.scss";
import "./styles/about_help_page.scss";
import "./styles/header.scss";

// Fire a route-specific chunk preload as early as possible.
// renderToPipeableStream marks resolved lazy boundaries with <!--$-->, but
// React.lazy on the client needs to load the chunk before hydration or it
// throws #421. Starting the import here gives the module a head-start so
// it is often already cached by the time hydrateRoot encounters the boundary.
const { pathname } = window.location;
const _lazyChunkPreload: Promise<unknown> | null =
  pathname === "/about" || pathname.startsWith("/about/")
    ? import("./app/components/About")
    : pathname === "/help" || pathname.startsWith("/help/")
    ? import("./app/components/Help")
    : pathname.includes("/languages/filters/exercises") && pathname.includes("/practice")
    ? import("./features/practice/VocabularyPractice")
    : pathname.startsWith("/languages/filters/exercises")
    ? import("./features/learning-setup/ExerciseSelection")
    : pathname === "/languages/filters" || pathname === "/languages/filters/"
    ? import("./features/learning-setup/LevelCategorySelection")
    : pathname.startsWith("/languages/level-test")
    ? import("./app/components/VocabularyLevelExam")
    : null;

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Missing root element");
}

const app = (
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />
  </BrowserRouter>
);

const hasRenderableServerMarkup = Array.from(rootElement.childNodes).some((node) => {
  if (node.nodeType === Node.ELEMENT_NODE) {
    return true;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return (node.textContent ?? "").trim().length > 0;
  }

  return false;
});

function startApp() {
  if (hasRenderableServerMarkup) {
    hydrateRoot(rootElement!, app, {
      onRecoverableError(error) {
        if (import.meta.env.DEV) {
          console.error("Recoverable hydration error:", error);
        }
        // In production, React #421 (Suspense boundary update before hydration
        // finished) is a known recoverable race between renderToPipeableStream's
        // <!--$--> markers and client-side React.lazy loading. React recovers by
        // client-rendering the boundary. Suppress the console noise; the page
        // renders correctly.
      },
    });
  } else {
    createRoot(rootElement!).render(app);
  }
}

// Wait for the route's lazy chunk before hydrating so React.lazy's internal
// payload resolves before hydrateRoot encounters the <!--$--> boundary.
if (_lazyChunkPreload) {
  _lazyChunkPreload.then(startApp, startApp);
} else {
  startApp();
}
