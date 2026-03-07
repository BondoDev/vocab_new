type GtagCommand = "js" | "config" | "event";

type Gtag = (
  command: GtagCommand,
  target: string | Date,
  params?: Record<string, unknown>,
) => void;

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: Gtag;
  }
}

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();

function getPagePath(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function trackPageView(pagePath = getPagePath()): void {
  if (!GA_MEASUREMENT_ID || typeof window === "undefined" || !window.gtag) {
    return;
  }

  window.gtag("event", "page_view", {
    page_location: window.location.href,
    page_path: pagePath,
    page_title: document.title,
  });
}
