import { useEffect, useState } from "react";
import { ChevronUp } from "lucide-react";

const MIN_SHOW_SCROLL_Y = 320;
const VIEWPORT_SHOW_RATIO = 0.35;

function getShowThreshold(): number {
  if (typeof window === "undefined") {
    return MIN_SHOW_SCROLL_Y;
  }
  return Math.max(MIN_SHOW_SCROLL_Y, Math.round(window.innerHeight * VIEWPORT_SHOW_RATIO));
}

export function ScrollToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const updateVisibility = () => {
      const isMobileViewport = window.innerWidth < 1024;
      if (isMobileViewport) {
        setIsVisible(false);
        return;
      }

      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      const scrollHeight = document.documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;
      const canScroll = scrollHeight > viewportHeight + 16;
      setIsVisible(canScroll && scrollTop >= getShowThreshold());
    };

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const rootElement = document.getElementById("root");
    document.body.classList.toggle("has-scroll-top-button", isVisible);
    rootElement?.classList.toggle("has-scroll-top-button", isVisible);
    return () => {
      document.body.classList.remove("has-scroll-top-button");
      rootElement?.classList.remove("has-scroll-top-button");
    };
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label="Scroll to top"
      onClick={() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      className="fixed bottom-3 right-0 z-[60] inline-flex h-10 w-10 translate-x-1/2 items-center justify-center rounded-full border border-white/70 bg-primary/90 text-white shadow-[0_10px_24px_rgba(15,23,42,0.25)] transition hover:bg-primary md:bottom-5 md:h-11 md:w-11 md:translate-x-0 md:right-[var(--nav-right-edge)]"
    >
      <ChevronUp className="h-5 w-5" />
    </button>
  );
}
