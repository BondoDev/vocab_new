import { useEffect, useMemo, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { UILanguageSwitcher } from "../components/UILanguageSwitcher";
import { useLanguage } from "../../contexts/LanguageContext";

const NAV_HREFS = {
  about: "/about",
  language: "/languages",
  levelCategory: "/languages/filters",
  exerciseSelection: "/languages/filters/exercises",
  explore: "/explore",
  help: "/help",
  exam: "/languages/level-test",
} as const;

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomBetween(random: () => number, min: number, max: number): number {
  return random() * (max - min) + min;
}

function createRandomStarFieldImage(starCount: number): string {
  const random = createSeededRandom(14057);
  const sizeOptions = [0.8, 1, 1.2, 1.4];
  const colorOptions = [
    "#fff",
    "#fff",
    "#fff",
    "#f3f3f3",
    "rgba(255,255,255,0.9)",
  ];
  const layers: string[] = [];
  const points: Array<{ x: number; y: number }> = [];
  const minDistance = 12;

  for (let i = 0; i < starCount; i++) {
    let x = 0;
    let y = 0;
    let placed = false;

    for (let attempt = 0; attempt < 25; attempt++) {
      const candidateX = randomBetween(random, 6, 94);
      const candidateY = randomBetween(random, 16, 84);
      const tooClose = points.some((point) => {
        const dx = point.x - candidateX;
        const dy = point.y - candidateY;
        return Math.hypot(dx, dy) < minDistance;
      });

      if (!tooClose) {
        x = candidateX;
        y = candidateY;
        placed = true;
        break;
      }
    }

    if (!placed) {
      x = randomBetween(random, 6, 94);
      y = randomBetween(random, 16, 84);
    }

    points.push({ x, y });
    const size = sizeOptions[Math.floor(random() * sizeOptions.length)];
    const color = colorOptions[Math.floor(random() * colorOptions.length)];

    layers.push(
      `radial-gradient(${size}px ${size}px at ${x.toFixed(1)}% ${y.toFixed(1)}%, ${color}, rgba(0,0,0,0))`,
    );
  }

  return layers.join(",\n    ");
}

interface HeaderProps {
  onAbout?: () => void;
  onHelp?: () => void;
  onLevelTest?: () => void;
  onLanguages?: () => void;
  onFilters?: () => void;
  onExercises?: () => void;
  onExplore?: () => void;
  activePage?:
    | "about"
    | "help"
    | "exam"
    | "language"
    | "levelCategory"
    | "exerciseSelection"
    | "explore"
    | "vocabularyLevel"
    | "notFound";
}

export function Header({
  onAbout,
  onHelp,
  onLevelTest,
  onLanguages,
  onFilters,
  onExercises,
  onExplore,
  activePage,
}: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const lastScrollYRef = useRef(0);
  const starFieldStyle = useMemo(
    () => ({
      backgroundColor: "#4a2b82",
      backgroundImage: createRandomStarFieldImage(14),
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
    }),
    [],
  );
  const { t } = useLanguage();

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const getScrollTop = () =>
      window.scrollY ||
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0;

    const handleScroll = () => {
      const currentTop = getScrollTop();
      const delta = currentTop - lastScrollYRef.current;

      if (currentTop <= 12) {
        setIsHeaderHidden(false);
      } else if (delta < -1) {
        setIsHeaderHidden(false);
      } else if (delta > 1 && currentTop > 80) {
        setIsHeaderHidden(true);
      }

      lastScrollYRef.current = currentTop;
    };

    let lastTouchY = 0;
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaY < -0.5) {
        setIsHeaderHidden(false);
        lastScrollYRef.current = getScrollTop();
      }
    };
    const handleTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? 0;
    };
    const handleTouchMove = (event: TouchEvent) => {
      const currentTouchY = event.touches[0]?.clientY ?? lastTouchY;
      const delta = currentTouchY - lastTouchY;
      if (delta > 1) {
        setIsHeaderHidden(false);
        lastScrollYRef.current = getScrollTop();
      }
      lastTouchY = currentTouchY;
    };

    lastScrollYRef.current = getScrollTop();
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    window.addEventListener("wheel", handleWheel, { passive: true });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
    };
  }, []);

  useEffect(() => {
    if (isMenuOpen) {
      setIsHeaderHidden(false);
    }
  }, [isMenuOpen]);
  const handleMenuAction = (action?: () => void) => () => {
    setIsMenuOpen(false);
    action?.();
  };
  const isActive = (...pages: NonNullable<HeaderProps["activePage"]>[]) =>
    activePage ? pages.includes(activePage) : false;
  const getDesktopNavClassName = (...pages: NonNullable<HeaderProps["activePage"]>[]) =>
    `relative inline-flex items-center leading-none cursor-pointer rounded-md transition text-[10px] font-bold uppercase tracking-[0.2em] border border-transparent px-3 py-1.5 appearance-none ${
      isActive(...pages)
        ? "rounded-full border-white/45 bg-white/18 text-white shadow-[0_8px_18px_rgba(12,10,24,0.18)]"
        : "bg-transparent text-white/90 hover:text-white hover:bg-white/10"
    }`;
  const getMobileNavClassName = (...pages: NonNullable<HeaderProps["activePage"]>[]) =>
    isActive(...pages) ? "is-active text-white" : undefined;
  const createNavClickHandler = (action?: () => void) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!action) {
      return;
    }

    event.preventDefault();
    setIsMenuOpen(false);
    action();
  };

  return (
    <>
      <div className="header-spacer" aria-hidden="true" />
      <header
        style={starFieldStyle}
        className={`header-shell w-full px-4 py-3 md:px-8 md:py-3 top-0 z-50 shadow-[0_8px_18px_rgba(20,10,45,0.25)] overflow-visible ${
          isHeaderHidden ? "is-hidden" : ""
        }`}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.3) 0%, rgba(0,0,0,0) 80%)",
          }}
        />

        <nav className="header-nav relative flex items-center justify-between max-w-7xl mx-auto">
          <div className="header-logo-wrap order-2 md:order-1">
            <div className="site-logo text-lg font-black tracking-[0.3em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]">
              <a
                href={NAV_HREFS.language}
                onClick={createNavClickHandler(onLanguages)}
                className="hover:text-white transition"
                aria-label="Go to languages page"
              >
                FLUENTSTELLAR
              </a>
            </div>
          </div>

          <div className="header-desktop-nav hidden md:flex order-2 items-center gap-8">
            <div className="flex gap-6 text-[10px] font-bold uppercase tracking-[0.2em] text-white/90">
              <a
                href={NAV_HREFS.about}
                onClick={createNavClickHandler(onAbout)}
                className={getDesktopNavClassName("about")}
              >
                {t("header.about")}
              </a>
              <a
                href={NAV_HREFS.language}
                onClick={createNavClickHandler(onLanguages)}
                className={getDesktopNavClassName("language")}
              >
                {t("header.languages")}
              </a>
              <a
                href={NAV_HREFS.levelCategory}
                onClick={createNavClickHandler(onFilters)}
                className={getDesktopNavClassName("levelCategory")}
              >
                {t("header.filters")}
              </a>
              <a
                href={NAV_HREFS.exerciseSelection}
                onClick={createNavClickHandler(onExercises)}
                className={getDesktopNavClassName("exerciseSelection")}
              >
                {t("header.exercises")}
              </a>
              <a
                href={NAV_HREFS.explore}
                onClick={createNavClickHandler(onExplore)}
                className={getDesktopNavClassName("explore", "vocabularyLevel")}
              >
                {t("header.explore")}
              </a>
              <a
                href={NAV_HREFS.help}
                onClick={createNavClickHandler(onHelp)}
                className={getDesktopNavClassName("help")}
              >
                {t("header.help")}
              </a>
              <a
                href={NAV_HREFS.exam}
                onClick={createNavClickHandler(onLevelTest)}
                className={`header-level-test-nav inline-flex items-center leading-none cursor-pointer transition text-[10px] font-bold uppercase tracking-[0.2em] text-white/95 border px-3 py-1 rounded-full shadow-sm appearance-none ${
                  isActive("exam") ? "is-active" : ""
                }`}
              >
                {t("header.levelTest")}
              </a>
            </div>

            <div className="pl-5 border-l border-white/20 scale-90">
              <UILanguageSwitcher />
            </div>
          </div>

          <button
            className="header-menu-toggle md:hidden order-1 p-1 text-white"
            onClick={() => setIsMenuOpen((v) => !v)}
          >
            {isMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </nav>

        <div
          className={`header-mobile-menu ${isMenuOpen ? "is-open" : ""}`}
          aria-hidden={!isMenuOpen}
        >
          <div className="header-mobile-menu-inner">
            <a
              href={NAV_HREFS.about}
              onClick={createNavClickHandler(onAbout)}
              className={getMobileNavClassName("about")}
            >
              {t("header.about")}
            </a>
            <a
              href={NAV_HREFS.language}
              onClick={createNavClickHandler(onLanguages)}
              className={getMobileNavClassName("language")}
            >
              {t("header.languages")}
            </a>
            <a
              href={NAV_HREFS.levelCategory}
              onClick={createNavClickHandler(onFilters)}
              className={getMobileNavClassName("levelCategory")}
            >
              {t("header.filters")}
            </a>
            <a
              href={NAV_HREFS.exerciseSelection}
              onClick={createNavClickHandler(onExercises)}
              className={getMobileNavClassName("exerciseSelection")}
            >
              {t("header.exercises")}
            </a>
            <a
              href={NAV_HREFS.explore}
              onClick={createNavClickHandler(onExplore)}
              className={getMobileNavClassName("explore", "vocabularyLevel")}
            >
              {t("header.explore")}
            </a>
            <a
              href={NAV_HREFS.help}
              onClick={createNavClickHandler(onHelp)}
              className={getMobileNavClassName("help")}
            >
              {t("header.help")}
            </a>
            <a
              href={NAV_HREFS.exam}
              onClick={createNavClickHandler(onLevelTest)}
              className={getMobileNavClassName("exam")}
            >
              {t("header.levelTest")}
            </a>
            <div className="header-mobile-lang-wrap">
              <UILanguageSwitcher variant="centered-modal" />
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
