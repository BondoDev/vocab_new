import { useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import { UILanguageSwitcher } from "../components/UILanguageSwitcher";
import { useLanguage } from "../../contexts/LanguageContext";

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function createRandomStarFieldImage(starCount: number): string {
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
      const candidateX = randomBetween(6, 94);
      const candidateY = randomBetween(16, 84);
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
      x = randomBetween(6, 94);
      y = randomBetween(16, 84);
    }

    points.push({ x, y });
    const size = sizeOptions[Math.floor(Math.random() * sizeOptions.length)];
    const color = colorOptions[Math.floor(Math.random() * colorOptions.length)];

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
}

export function Header({
  onAbout,
  onHelp,
  onLevelTest,
  onLanguages,
  onFilters,
  onExercises,
  onExplore,
}: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
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
  const handleMenuAction = (action?: () => void) => () => {
    setIsMenuOpen(false);
    action?.();
  };

  return (
    <header
      style={starFieldStyle}
      className="header-shell relative w-full px-4 py-3 md:px-8 md:py-4
                 sticky top-0 z-50 shadow-[0_8px_18px_rgba(20,10,45,0.25)] overflow-visible"
    >
      {/* Nebula glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.3) 0%, rgba(0,0,0,0) 80%)",
        }}
      />

      {/* NAV */}
      <nav className="header-nav relative flex items-center justify-between max-w-7xl mx-auto">
        {/* Logo */}
        <div className="header-logo-wrap order-2 md:order-1">
          <h1 className="site-logo text-lg font-black tracking-[0.3em] text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]">
            FLUENTSTELLAR
          </h1>
        </div>

        {/* Desktop navigation */}
        <div className="header-desktop-nav hidden md:flex order-2 items-center gap-8">
          <div className="flex gap-6 text-[10px] font-bold uppercase tracking-[0.2em] text-white/90">
            <button
              type="button"
              onClick={onAbout}
              className="inline-flex items-center leading-none cursor-pointer hover:text-white transition text-[10px] font-bold uppercase tracking-[0.2em] text-white/90 bg-transparent border-0 p-0 appearance-none"
            >
              {t("header.about")}
            </button>
            <button
              type="button"
              onClick={onLanguages}
              className="inline-flex items-center leading-none cursor-pointer hover:text-white transition text-[10px] font-bold uppercase tracking-[0.2em] text-white/90 bg-transparent border-0 p-0 appearance-none"
            >
              {t("header.languages")}
            </button>
            <button
              type="button"
              onClick={onFilters}
              className="inline-flex items-center leading-none cursor-pointer hover:text-white transition text-[10px] font-bold uppercase tracking-[0.2em] text-white/90 bg-transparent border-0 p-0 appearance-none"
            >
              {t("header.filters")}
            </button>
            <button
              type="button"
              onClick={onExercises}
              className="inline-flex items-center leading-none cursor-pointer hover:text-white transition text-[10px] font-bold uppercase tracking-[0.2em] text-white/90 bg-transparent border-0 p-0 appearance-none"
            >
              {t("header.exercises")}
            </button>
            <button
              type="button"
              onClick={onExplore}
              className="inline-flex items-center leading-none cursor-pointer hover:text-white transition text-[10px] font-bold uppercase tracking-[0.2em] text-white/90 bg-transparent border-0 p-0 appearance-none"
            >
              Explore
            </button>
            <a
              href="#"
              onClick={(event) => {
                if (!onHelp) {
                  return;
                }
                event.preventDefault();
                onHelp();
              }}
              className="inline-flex items-center leading-none cursor-pointer hover:text-white transition"
            >
              {t("header.help")}
            </a>
            <button
              type="button"
              onClick={onLevelTest}
              className="inline-flex items-center leading-none cursor-pointer hover:text-white transition text-[10px] font-bold uppercase tracking-[0.2em] text-white/95 bg-white/10 border border-white/30 px-3 py-1 rounded-full shadow-sm shadow-white/10 hover:bg-white/20 hover:border-white/50 appearance-none"
            >
              {t("header.levelTest")}
            </button>
          </div>

          <div className="pl-5 border-l border-white/20 scale-90">
            <UILanguageSwitcher />
          </div>
        </div>

        {/* Mobile menu */}
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
          <button type="button" onClick={handleMenuAction(onAbout)}>
            {t("header.about")}
          </button>
          <button type="button" onClick={handleMenuAction(onLanguages)}>
            {t("header.languages")}
          </button>
          <button type="button" onClick={handleMenuAction(onFilters)}>
            {t("header.filters")}
          </button>
          <button type="button" onClick={handleMenuAction(onExercises)}>
            {t("header.exercises")}
          </button>
          <button type="button" onClick={handleMenuAction(onExplore)}>
            Explore
          </button>
          <button type="button" onClick={handleMenuAction(onHelp)}>
            {t("header.help")}
          </button>
          <button type="button" onClick={handleMenuAction(onLevelTest)}>
            {t("header.levelTest")}
          </button>
          <div className="header-mobile-lang-wrap">
            <UILanguageSwitcher variant="centered-modal" />
          </div>
        </div>
      </div>
    </header>
  );
}

