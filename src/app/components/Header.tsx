import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Compass,
  Dumbbell,
  GraduationCap,
  Info,
  Languages,
  Menu,
  SlidersHorizontal,
  X,
} from "lucide-react";
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

function createRandomStarFieldImage(starCount: number, seed: number): string {
  const random = createSeededRandom(seed);
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
  const minDistance = 9;

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

function createSparkleFieldImage(sparkleCount: number, seed: number): string {
  const random = createSeededRandom(seed);
  const layers: string[] = [];
  const points: Array<{ x: number; y: number }> = [];
  const minDistance = 16;
  const sparkleScaleOptions = [0.8, 1, 1.2, 1.4];
  const colorOptions = [
    "rgba(255,255,255,0.95)",
    "rgba(245,245,255,0.92)",
    "rgba(236,232,255,0.9)",
  ];

  for (let i = 0; i < sparkleCount; i++) {
    let x = 0;
    let y = 0;
    let placed = false;

    for (let attempt = 0; attempt < 24; attempt++) {
      const candidateX = randomBetween(random, 8, 92);
      const candidateY = randomBetween(random, 18, 82);
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
      x = randomBetween(random, 8, 92);
      y = randomBetween(random, 18, 82);
    }

    points.push({ x, y });
    const color = colorOptions[Math.floor(random() * colorOptions.length)];
    const scale =
      sparkleScaleOptions[Math.floor(random() * sparkleScaleOptions.length)];
    const longArm = (randomBetween(random, 4.8, 6.6) * scale).toFixed(1);
    const shortArm = (randomBetween(random, 1.05, 1.45) * scale).toFixed(2);
    const core = (randomBetween(random, 0.9, 1.3) * scale).toFixed(2);
    const xPos = `${x.toFixed(1)}%`;
    const yPos = `${y.toFixed(1)}%`;

    layers.push(
      `radial-gradient(ellipse ${longArm}px ${shortArm}px at ${xPos} ${yPos}, ${color}, rgba(0,0,0,0) 72%)`,
      `radial-gradient(ellipse ${shortArm}px ${longArm}px at ${xPos} ${yPos}, ${color}, rgba(0,0,0,0) 72%)`,
      `radial-gradient(${core}px ${core}px at ${xPos} ${yPos}, rgba(255,255,255,0.98), rgba(0,0,0,0))`,
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
  const [isDesktopMoreOpen, setIsDesktopMoreOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const lastScrollYRef = useRef(0);
  const starSeeds = useMemo(
    () => ({
      sparkle: Math.floor(Math.random() * 0xffffffff),
      dots: Math.floor(Math.random() * 0xffffffff),
    }),
    [],
  );
  const starFieldStyle = useMemo(
    () => ({
      backgroundColor: "#4a2b82",
      backgroundImage: `${createSparkleFieldImage(6, starSeeds.sparkle)},\n${createRandomStarFieldImage(22, starSeeds.dots)}`,
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
    }),
    [starSeeds],
  );
  const { t } = useLanguage();
  const moreLabel = t("header.more") === "header.more" ? "More" : t("header.more");

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
      setIsDesktopMoreOpen(false);
    }
  }, [isMenuOpen]);
  const isActive = (...pages: NonNullable<HeaderProps["activePage"]>[]) =>
    activePage ? pages.includes(activePage) : false;
  const getDesktopNavClassName = (...pages: NonNullable<HeaderProps["activePage"]>[]) =>
    `relative inline-flex items-center leading-none cursor-pointer rounded-md transition text-[10px] font-bold uppercase tracking-[0.2em] border border-transparent px-3 py-1.5 appearance-none ${
      isActive(...pages)
        ? "rounded-full border-white/45 bg-white/18 text-white shadow-[0_8px_18px_rgba(12,10,24,0.18)]"
        : "bg-transparent text-white/90 hover:text-white hover:bg-white/10"
    }`;
  const createNavClickHandler = (action?: () => void) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!action) {
      return;
    }

    event.preventDefault();
    setIsMenuOpen(false);
    setIsDesktopMoreOpen(false);
    action();
  };
  const mobileNavItems = [
    {
      id: "about",
      href: NAV_HREFS.about,
      label: t("header.about"),
      onClick: onAbout,
      activePages: ["about"] as const,
      icon: Info,
    },
    {
      id: "language",
      href: NAV_HREFS.language,
      label: t("header.languages"),
      onClick: onLanguages,
      activePages: ["language"] as const,
      icon: Languages,
    },
    {
      id: "levelCategory",
      href: NAV_HREFS.levelCategory,
      label: t("header.filters"),
      onClick: onFilters,
      activePages: ["levelCategory"] as const,
      icon: SlidersHorizontal,
    },
    {
      id: "exerciseSelection",
      href: NAV_HREFS.exerciseSelection,
      label: t("header.exercises"),
      onClick: onExercises,
      activePages: ["exerciseSelection"] as const,
      icon: Dumbbell,
    },
    {
      id: "explore",
      href: NAV_HREFS.explore,
      label: t("header.explore"),
      onClick: onExplore,
      activePages: ["explore", "vocabularyLevel"] as const,
      icon: Compass,
    },
    {
      id: "help",
      href: NAV_HREFS.help,
      label: t("header.help"),
      onClick: onHelp,
      activePages: ["help"] as const,
      icon: CircleHelp,
    },
    {
      id: "exam",
      href: NAV_HREFS.exam,
      label: t("header.levelTest"),
      onClick: onLevelTest,
      activePages: ["exam"] as const,
      icon: GraduationCap,
    },
  ] as const;

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

        <nav className="header-nav relative flex items-center justify-between max-w-7xl mx-auto md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div className="header-logo-wrap order-2 md:order-1 md:justify-self-start">
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

          <div className="header-desktop-nav hidden md:flex order-2 items-center gap-6 md:justify-self-center">
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/90">
              <a
                href={NAV_HREFS.language}
                onClick={createNavClickHandler(onLanguages)}
                className={`${getDesktopNavClassName("language")} gap-1.5`}
              >
                <Languages size={12} strokeWidth={1.8} aria-hidden="true" />
                {t("header.languages")}
              </a>
              <a
                href={NAV_HREFS.levelCategory}
                onClick={createNavClickHandler(onFilters)}
                className={`${getDesktopNavClassName("levelCategory")} gap-1.5`}
              >
                <SlidersHorizontal size={12} strokeWidth={1.8} aria-hidden="true" />
                {t("header.filters")}
              </a>
              <a
                href={NAV_HREFS.exerciseSelection}
                onClick={createNavClickHandler(onExercises)}
                className={`${getDesktopNavClassName("exerciseSelection")} gap-1.5`}
              >
                <Dumbbell size={12} strokeWidth={1.8} aria-hidden="true" />
                {t("header.exercises")}
              </a>
              <div
                className="relative pb-2 -mb-2"
                onMouseLeave={() => setIsDesktopMoreOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setIsDesktopMoreOpen((open) => !open)}
                  className={`${getDesktopNavClassName("about", "help")} gap-1.5`}
                  aria-haspopup="menu"
                  aria-expanded={isDesktopMoreOpen}
                >
                  {moreLabel}
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${isDesktopMoreOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isDesktopMoreOpen ? (
                  <div className="absolute right-0 top-full z-50 min-w-[12rem] rounded-2xl border border-white/20 bg-[#2f155b]/95 p-2 shadow-[0_14px_30px_rgba(8,6,24,0.35)] backdrop-blur-sm">
                    <a
                      href={NAV_HREFS.about}
                      onClick={createNavClickHandler(onAbout)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition hover:bg-white/10 hover:text-white ${
                        isActive("about") ? "bg-white/12 text-white" : "text-white/90"
                      }`}
                    >
                      <Info size={12} strokeWidth={1.8} aria-hidden="true" />
                      {t("header.about")}
                    </a>
                    <a
                      href={NAV_HREFS.help}
                      onClick={createNavClickHandler(onHelp)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition hover:bg-white/10 hover:text-white ${
                        isActive("help") ? "bg-white/12 text-white" : "text-white/90"
                      }`}
                    >
                      <CircleHelp size={12} strokeWidth={1.8} aria-hidden="true" />
                      {t("header.help")}
                    </a>
                    <a
                      href={NAV_HREFS.explore}
                      onClick={createNavClickHandler(onExplore)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition hover:bg-white/10 hover:text-white ${
                        isActive("explore", "vocabularyLevel") ? "bg-white/12 text-white" : "text-white/90"
                      }`}
                    >
                      <Compass size={12} strokeWidth={1.8} aria-hidden="true" />
                      {t("header.explore")}
                    </a>
                  </div>
                ) : null}
              </div>
              <a
                href={NAV_HREFS.exam}
                onClick={createNavClickHandler(onLevelTest)}
                className={`header-level-test-nav inline-flex items-center gap-1.5 leading-none cursor-pointer transition text-[10px] font-bold uppercase tracking-[0.2em] text-white/95 border px-3 py-1 rounded-full shadow-sm appearance-none ${
                  isActive("exam") ? "is-active" : ""
                }`}
              >
                <GraduationCap size={12} strokeWidth={1.8} aria-hidden="true" />
                {t("header.levelTest")}
              </a>
            </div>

          </div>

          <div className="hidden md:flex order-3 justify-self-end pl-5 border-l border-white/20 scale-90">
            <UILanguageSwitcher />
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
            <div className="header-mobile-nav-list">
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const itemIsActive = isActive(...item.activePages);

                return (
                  <a
                    key={item.id}
                    href={item.href}
                    onClick={createNavClickHandler(item.onClick)}
                    className={`header-mobile-nav-item ${
                      item.id === "exam" ? "header-mobile-nav-item--exam" : ""
                    } ${itemIsActive ? "is-active" : ""}`}
                  >
                    <span className="header-mobile-nav-item__accent" aria-hidden="true" />
                    <span className="header-mobile-nav-item__icon" aria-hidden="true">
                      <Icon size={17} strokeWidth={1.8} />
                    </span>
                    <span className="header-mobile-nav-item__label">{item.label}</span>
                    <span className="header-mobile-nav-item__chevron" aria-hidden="true">
                      <ChevronRight size={16} strokeWidth={1.7} />
                    </span>
                  </a>
                );
              })}
            </div>
            <div className="header-mobile-lang-wrap">
              <div className="header-mobile-lang-label">{t("header.languages")}</div>
              <UILanguageSwitcher variant="centered-modal" />
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
