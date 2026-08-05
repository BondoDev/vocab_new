import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  BookOpenText,
  ChartSpline,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Compass,
  Dumbbell,
  GraduationCap,
  Info,
  Languages,
  LogIn,
  LogOut,
  Menu,
  ListPlus,
  SlidersHorizontal,
  Settings,
  Target,
  UserRound,
  X,
} from "lucide-react";
import { UILanguageSwitcher } from "./UILanguageSwitcher";
import { useLanguage } from "../../../contexts/LanguageContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  getStoredSupabaseSession,
  handleSupabaseAuthRedirect,
  sendPasswordRecoveryEmail,
  signInWithGoogleOAuth,
  signInWithPassword,
  signOutSupabase,
  signUpWithPassword,
  type StoredSupabaseSession,
} from "../../../lib/supabaseAuth";
import "./styles/header.scss";

const NAV_HREFS = {
  about: "/about",
  language: "/languages",
  levelCategory: "/languages/filters",
  exerciseSelection: "/languages/filters/exercises",
  explore: "/explore",
  help: "/help",
  exam: "/languages/level-test",
  profile: "/profile",
} as const;

type AccountProfileSection = "dashboard" | "learning" | "vocabulary";

const ACCOUNT_NAV_GROUPS = [
  {
    labelKey: "userProfile.sidebar.groups.main",
    items: [
      { id: "dashboard", labelKey: "userProfile.sidebar.items.dashboard", icon: UserRound, section: "dashboard" as const },
      { id: "learning", labelKey: "userProfile.sidebar.items.learning", icon: Target, section: "learning" as const },
    ],
  },
  {
    labelKey: "userProfile.sidebar.groups.learning",
    items: [
      { id: "vocabulary", labelKey: "userProfile.sidebar.items.vocabulary", icon: BookOpenText, section: "vocabulary" as const },
      { id: "my-lists", labelKey: "userProfile.sidebar.items.myLists", icon: ListPlus, disabled: true },
    ],
  },
  {
    labelKey: "userProfile.sidebar.groups.insights",
    items: [{ id: "progress", labelKey: "userProfile.sidebar.items.progress", icon: ChartSpline, disabled: true }],
  },
  {
    labelKey: "userProfile.sidebar.groups.system",
    items: [{ id: "settings", labelKey: "userProfile.sidebar.items.settings", icon: Settings, disabled: true }],
  },
] as const;

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

function GoogleMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
    >
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.2-4.8 9.2-7.3 0-.5-.1-.9-.1-1.3H12Z"
      />
      <path
        fill="#4285F4"
        d="M21.1 14.3c0-.5-.1-.9-.1-1.3H12v3.9h5.5c-.3 1.4-1.6 2.8-3.5 3.3l2.7 2.1c3.1-2.8 4.4-6.8 4.4-8Z"
      />
      <path
        fill="#FBBC05"
        d="M6 14.3c-.2-.6-.3-1.2-.3-1.9s.1-1.3.3-1.9L3.2 8.3C2.6 9.5 2.4 10.7 2.4 12s.2 2.5.8 3.7L6 14.3Z"
      />
      <path
        fill="#34A853"
        d="M12 21.6c2.7 0 4.9-.9 6.5-2.5l-2.7-2.1c-.8.6-1.9 1-3.8 1-3.2 0-5.8-2.1-6.7-5.1l-2.8 2.2c1.6 3.1 4.9 5.5 9.5 5.5Z"
      />
      <path
        fill="#1976D2"
        d="M5.3 12.9c-.1-.3-.1-.6-.1-.9s0-.6.1-.9L2.4 8.9A9.7 9.7 0 0 0 1.8 12c0 1.1.2 2.1.6 3.1l2.9-2.2Z"
      />
    </svg>
  );
}

interface HeaderProps {
  onAbout?: () => void;
  onHelp?: () => void;
  onLevelTest?: () => void;
  onLanguages?: () => void;
  onFilters?: () => void;
  onExercises?: () => void;
  onExplore?: () => void;
  onProfile?: (section?: AccountProfileSection) => void;
  activePage?:
    | "about"
    | "help"
    | "exam"
    | "language"
    | "levelCategory"
    | "exerciseSelection"
    | "explore"
    | "profile"
    | "vocabularyLevel"
    | "notFound";
  authSession?: StoredSupabaseSession | null;
  accountNickname?: string;
  onAuthSessionChange?: (session: StoredSupabaseSession | null) => void;
  onSignedOut?: () => void;
}

export function Header({
  onAbout,
  onHelp,
  onLevelTest,
  onLanguages,
  onFilters,
  onExercises,
  onExplore,
  onProfile,
  activePage,
  authSession: controlledAuthSession,
  accountNickname,
  onAuthSessionChange,
  onSignedOut,
}: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileAccountMenuOpen, setIsMobileAccountMenuOpen] = useState(false);
  const [isDesktopMoreOpen, setIsDesktopMoreOpen] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  // Start null to match SSR output; the stored session propagates via the
  // controlledAuthSession prop after AppContent's mount useEffect runs.
  const [authSession, setAuthSession] = useState<StoredSupabaseSession | null>(null);
  const lastScrollYRef = useRef(0);
  const [starSeeds, setStarSeeds] = useState<{ sparkle: number; dots: number } | null>(null);
  useEffect(() => {
    setStarSeeds({
      sparkle: Math.floor(Math.random() * 0xffffffff),
      dots: Math.floor(Math.random() * 0xffffffff),
    });
  }, []);
  const starFieldStyle = useMemo(
    () => ({
      backgroundColor: "#4a2b82",
      ...(starSeeds
        ? {
            backgroundImage: `${createSparkleFieldImage(6, starSeeds.sparkle)},\n${createRandomStarFieldImage(22, starSeeds.dots)}`,
          }
        : {}),
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
    }),
    [starSeeds],
  );
  const { t } = useLanguage();
  const moreLabel = t("header.more") === "header.more" ? "More" : t("header.more");
  const loginLabel = "Log in";
  const signupLabel = "Sign up";
  const showAuthButton = true;
  const googleLabel =
    authMode === "login" ? "Continue with Google" : "Sign up with Google";
  const accountDisplayName = accountNickname?.trim() || "Account";
  const nicknameInitial = accountNickname?.trim().charAt(0).toUpperCase() ?? "";
  const authButtonLabel = authSession
    ? nicknameInitial || "Account"
    : loginLabel;
  const goToProfile = (section?: AccountProfileSection) => {
    setIsMenuOpen(false);
    setIsMobileAccountMenuOpen(false);
    setIsDesktopMoreOpen(false);
    setIsAuthDialogOpen(false);
    onProfile?.(section);
  };

  useEffect(() => {
    if (controlledAuthSession === undefined) {
      return;
    }

    setAuthSession(controlledAuthSession);
  }, [controlledAuthSession]);

  const resetAuthForm = () => {
    setAuthEmail("");
    setAuthPassword("");
    setAuthConfirmPassword("");
    setAuthError(null);
    setAuthInfo(null);
    setIsAuthSubmitting(false);
  };

  const openLoginDialog = () => {
    setAuthMode("login");
    resetAuthForm();
    setIsMenuOpen(false);
    setIsMobileAccountMenuOpen(false);
    setIsDesktopMoreOpen(false);
    setIsAuthDialogOpen(true);
  };

  const openSignupDialog = () => {
    setAuthMode("signup");
    setAuthError(null);
    setAuthInfo(null);
    setIsAuthDialogOpen(true);
  };

  const handleSignOut = async () => {
    const currentSession = authSession;

    try {
      setAuthError(null);
      setAuthInfo(null);
      setAuthSession(null);
      onAuthSessionChange?.(null);
      setIsAuthDialogOpen(false);
      setIsMenuOpen(false);
      setIsMobileAccountMenuOpen(false);
      setIsDesktopMoreOpen(false);
      resetAuthForm();
      await signOutSupabase(currentSession);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Sign out failed.");
    } finally {
      onSignedOut?.();
    }
  };

  useEffect(() => {
    let cancelled = false;

    void handleSupabaseAuthRedirect()
      .then((result) => {
        if (cancelled) return;
        if (result.error) {
          setAuthError(result.error);
          setAuthMode("login");
          setIsAuthDialogOpen(true);
          return;
        }
        if (result.session) {
          setAuthSession(result.session);
          onAuthSessionChange?.(result.session);
          setAuthMode("login");
          resetAuthForm();
          setIsAuthDialogOpen(false);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setAuthError(
          error instanceof Error ? error.message : "Google sign-in failed.",
        );
        setAuthMode("login");
        setIsAuthDialogOpen(true);
      });

    return () => {
      cancelled = true;
    };
  }, [onAuthSessionChange]);

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
    } else {
      setIsMobileAccountMenuOpen(false);
    }
  }, [isMenuOpen]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousTouchAction = body.style.touchAction;

    if (isMenuOpen) {
      body.style.overflow = "hidden";
      body.style.touchAction = "none";
    }

    return () => {
      body.style.overflow = previousOverflow;
      body.style.touchAction = previousTouchAction;
    };
  }, [isMenuOpen]);

  const handleGoogleAuth = async () => {
    try {
      setAuthError(null);
      setAuthInfo(null);
      setIsAuthSubmitting(true);
      const redirectTo = `${window.location.origin}${window.location.pathname}${window.location.search}`;
      await signInWithGoogleOAuth(redirectTo);
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Google sign-in failed.",
      );
      setIsAuthSubmitting(false);
    }
  };

  const handlePasswordAuthSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    setAuthInfo(null);

    if (!authEmail.trim()) {
      setAuthError("Email is required.");
      return;
    }

    if (!authPassword) {
      setAuthError("Password is required.");
      return;
    }

    if (authMode === "signup") {
      if (authPassword !== authConfirmPassword) {
        setAuthError("Passwords do not match.");
        return;
      }
    }

    try {
      setIsAuthSubmitting(true);

      if (authMode === "login") {
        const session = await signInWithPassword(authEmail.trim(), authPassword);
        setAuthSession(session);
        onAuthSessionChange?.(session);
        setIsAuthDialogOpen(false);
        resetAuthForm();
        return;
      }

      const result = await signUpWithPassword({
        email: authEmail.trim(),
        password: authPassword,
      });

      if (result.session) {
        setAuthSession(result.session);
        onAuthSessionChange?.(result.session);
        setIsAuthDialogOpen(false);
        resetAuthForm();
        return;
      }

      setAuthMode("login");
      setAuthPassword("");
      setAuthConfirmPassword("");
      setAuthInfo("Account created. Check your email to confirm your sign up.");
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Authentication failed.",
      );
    } finally {
      setIsAuthSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setAuthError(null);
    setAuthInfo(null);

    if (!authEmail.trim()) {
      setAuthError("Enter your email first.");
      return;
    }

    try {
      setIsAuthSubmitting(true);
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      await sendPasswordRecoveryEmail(authEmail.trim(), redirectTo);
      setAuthInfo("Password reset email sent. Check your inbox.");
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Password reset failed.",
      );
    } finally {
      setIsAuthSubmitting(false);
    }
  };
  const isActive = (...pages: NonNullable<HeaderProps["activePage"]>[]) =>
    activePage ? pages.includes(activePage) : false;
  const getDesktopNavClassName = (...pages: NonNullable<HeaderProps["activePage"]>[]) =>
    `header-desktop-link ${isActive(...pages) ? "is-active" : ""}`;
  const desktopAuthButtonClassName =
    "header-desktop-control header-auth-nav";
  const handleAccountNavItemSelect = (section?: AccountProfileSection) => {
    if (section) {
      goToProfile(section);
    }
  };
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

        <nav className="header-nav relative z-[70] flex items-center justify-between max-w-7xl mx-auto md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
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

          <div className="header-desktop-nav hidden md:flex order-2 items-center md:justify-self-center">
            <div className="header-desktop-nav-group">
              <a
                href={NAV_HREFS.language}
                onClick={createNavClickHandler(onLanguages)}
                className={getDesktopNavClassName("language")}
                suppressHydrationWarning
              >
                <Languages size={12} strokeWidth={1.8} aria-hidden="true" />
                {t("header.languages")}
              </a>
              <a
                href={NAV_HREFS.levelCategory}
                onClick={createNavClickHandler(onFilters)}
                className={getDesktopNavClassName("levelCategory")}
                suppressHydrationWarning
              >
                <SlidersHorizontal size={12} strokeWidth={1.8} aria-hidden="true" />
                {t("header.filters")}
              </a>
              <a
                href={NAV_HREFS.exerciseSelection}
                onClick={createNavClickHandler(onExercises)}
                className={getDesktopNavClassName("exerciseSelection")}
                suppressHydrationWarning
              >
                <Dumbbell size={12} strokeWidth={1.8} aria-hidden="true" />
                {t("header.exercises")}
              </a>
              <div
                className="header-desktop-more relative"
                onMouseLeave={() => setIsDesktopMoreOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setIsDesktopMoreOpen((open) => !open)}
                  className={getDesktopNavClassName("about", "help")}
                  aria-haspopup="menu"
                  aria-expanded={isDesktopMoreOpen}
                  suppressHydrationWarning
                >
                  {moreLabel}
                  <ChevronDown
                    size={14}
                    className={`transition-transform ${isDesktopMoreOpen ? "rotate-180" : ""}`}
                  />
                </button>
                {isDesktopMoreOpen ? (
                  <div className="header-desktop-more-panel absolute left-1/2 z-50 w-40 -translate-x-1/2 rounded-2xl border border-white/20 bg-[#2f155b]/95 p-2 shadow-[0_14px_30px_rgba(8,6,24,0.35)] backdrop-blur-sm">
                    <a
                      href={NAV_HREFS.about}
                      onClick={createNavClickHandler(onAbout)}
                      className={`header-desktop-more-item ${
                        isActive("about") ? "bg-white/12 text-white" : "text-white/90"
                      }`}
                    >
                      <Info size={12} strokeWidth={1.8} aria-hidden="true" />
                      {t("header.about")}
                    </a>
                    <a
                      href={NAV_HREFS.help}
                      onClick={createNavClickHandler(onHelp)}
                      className={`header-desktop-more-item ${
                        isActive("help") ? "bg-white/12 text-white" : "text-white/90"
                      }`}
                    >
                      <CircleHelp size={12} strokeWidth={1.8} aria-hidden="true" />
                      {t("header.help")}
                    </a>
                    <a
                      href={NAV_HREFS.explore}
                      onClick={createNavClickHandler(onExplore)}
                      className={`header-desktop-more-item ${
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
                className={`header-desktop-control header-level-test-nav ${
                  isActive("exam") ? "is-active" : ""
                }`}
                suppressHydrationWarning
              >
                <GraduationCap size={12} strokeWidth={1.8} aria-hidden="true" />
                {t("header.levelTest")}
              </a>
            </div>
          </div>

          <div className="header-desktop-actions hidden md:flex order-3 items-center md:justify-self-end">
            {showAuthButton ? (
              authSession ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={desktopAuthButtonClassName}
                    >
                      <UserRound size={12} strokeWidth={1.8} aria-hidden="true" />
                      {authButtonLabel}
                      <ChevronDown size={12} strokeWidth={1.8} aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="center"
                    sideOffset={8}
                    className="w-56 rounded-2xl border border-white/15 bg-[#fffdfd] p-2 text-[#261943] shadow-[0_18px_42px_rgba(18,12,38,0.2)]"
                  >
                    <DropdownMenuLabel className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#7c6ca6]">
                      {accountDisplayName}
                    </DropdownMenuLabel>
                    {ACCOUNT_NAV_GROUPS.map((group) => (
                      <div key={group.labelKey}>
                        <div className="px-3 pb-1 pt-2 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-[#8b7fb0]">
                          {t(group.labelKey)}
                        </div>
                        {group.items.map((item) => {
                          const Icon = item.icon;

                          return (
                            <DropdownMenuItem
                              key={item.id}
                              disabled={Boolean(item.disabled)}
                              onSelect={() => handleAccountNavItemSelect(item.section)}
                              className="rounded-xl px-3 py-2.5 text-sm text-[#261943] hover:bg-[#f6f0ff] hover:text-[#261943] focus:bg-[#f6f0ff] focus:text-[#261943] [&_svg]:absolute [&_svg]:left-3"
                            >
                              <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                              <span className="block w-full text-center">{t(item.labelKey)}</span>
                            </DropdownMenuItem>
                          );
                        })}
                      </div>
                    ))}
                    <DropdownMenuSeparator className="mx-1 my-2 bg-[#ebe4f7]" />
                    <DropdownMenuItem
                      onSelect={() => void handleSignOut()}
                      className="rounded-xl px-3 py-2.5 text-sm text-[#b42318] hover:bg-[#fff1f2] hover:text-[#b42318] focus:bg-[#fff1f2] focus:text-[#b42318] [&_svg]:absolute [&_svg]:left-3"
                    >
                      <LogOut size={16} strokeWidth={1.8} aria-hidden="true" />
                      <span className="block w-full text-center">{t("userProfile.sidebar.actions.signOut")}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <button
                  type="button"
                  onClick={openLoginDialog}
                  className={desktopAuthButtonClassName}
                >
                  <LogIn size={12} strokeWidth={1.8} aria-hidden="true" />
                  {authButtonLabel}
                </button>
              )
            ) : null}
            <div className="header-desktop-actions-divider" aria-hidden="true" />
            <UILanguageSwitcher />
          </div>

          <button
            type="button"
            className="header-menu-toggle md:hidden order-1 p-1 text-white"
            onClick={() => setIsMenuOpen((v) => !v)}
            aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMenuOpen}
          >
            {isMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </nav>

      </header>

      <div
        className={`header-mobile-menu ${isMenuOpen ? "is-open" : ""}`}
        aria-hidden={!isMenuOpen}
        onClick={() => setIsMenuOpen(false)}
      >
        <div
          className="header-mobile-menu-inner"
          onClick={(event) => event.stopPropagation()}
        >
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
                  <span suppressHydrationWarning className="header-mobile-nav-item__label">{item.label}</span>
                  <span className="header-mobile-nav-item__chevron" aria-hidden="true">
                    <ChevronRight size={16} strokeWidth={1.7} />
                  </span>
                </a>
              );
            })}
            {showAuthButton ? (
              authSession ? (
                <button
                  type="button"
                  onClick={() => setIsMobileAccountMenuOpen(true)}
                  className="header-mobile-nav-item header-mobile-nav-item--account text-left"
                >
                  <span className="header-mobile-nav-item__accent" aria-hidden="true" />
                  <span className="header-mobile-nav-item__icon" aria-hidden="true">
                    <UserRound size={17} strokeWidth={1.8} />
                  </span>
                  <span className="header-mobile-nav-item__label">{accountDisplayName}</span>
                  <span className="header-mobile-nav-item__chevron" aria-hidden="true">
                    <ChevronRight size={16} strokeWidth={1.7} />
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={openLoginDialog}
                  className="header-mobile-nav-item text-left"
                >
                  <span className="header-mobile-nav-item__accent" aria-hidden="true" />
                  <span className="header-mobile-nav-item__icon" aria-hidden="true">
                    <LogIn size={17} strokeWidth={1.8} />
                  </span>
                  <span className="header-mobile-nav-item__label">{authButtonLabel}</span>
                  <span className="header-mobile-nav-item__chevron" aria-hidden="true">
                    <ChevronRight size={16} strokeWidth={1.7} />
                  </span>
                </button>
              )
            ) : null}
          </div>
          <div className="header-mobile-lang-wrap">
            <div suppressHydrationWarning className="header-mobile-lang-label">{t("header.languages")}</div>
            <UILanguageSwitcher variant="centered-modal" />
          </div>

          {authSession && isMobileAccountMenuOpen ? (
            <div className="header-mobile-account-menu" onClick={(event) => event.stopPropagation()}>
              <div className="header-mobile-account-menu__panel">
                <button
                  type="button"
                  className="header-mobile-account-menu__back"
                  onClick={() => setIsMobileAccountMenuOpen(false)}
                >
                  <ChevronRight
                    size={16}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className="rotate-180"
                  />
                  Account
                </button>

                <div className="header-mobile-account-menu__list">
                  {ACCOUNT_NAV_GROUPS.map((group) => (
                    <div key={group.labelKey} className="header-mobile-account-group">
                      <div className="header-mobile-account-group__label">{t(group.labelKey)}</div>
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const itemAction = item.section
                          ? () => goToProfile(item.section)
                          : undefined;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            className="header-mobile-account-item"
                            aria-disabled={item.disabled ? "true" : undefined}
                            onClick={itemAction}
                          >
                            <span className="header-mobile-account-item__icon" aria-hidden="true">
                              <Icon size={17} strokeWidth={1.8} />
                            </span>
                            <span className="header-mobile-account-item__label">{t(item.labelKey)}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    className="header-mobile-account-item header-mobile-account-item--danger"
                  >
                    <span className="header-mobile-account-item__icon" aria-hidden="true">
                      <LogOut size={17} strokeWidth={1.8} />
                    </span>
                    <span className="header-mobile-account-item__label">{t("userProfile.sidebar.actions.signOut")}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Dialog open={isAuthDialogOpen} onOpenChange={setIsAuthDialogOpen}>
        <DialogContent className="w-[min(92vw,28rem)] max-w-none rounded-3xl border-white/15 bg-[#fffdfd] p-0 shadow-[0_24px_80px_rgba(18,12,38,0.32)] sm:w-[26rem]">
          <div className="overflow-hidden rounded-3xl">
            <div className="bg-[radial-gradient(circle_at_top,rgba(120,90,255,0.18),rgba(255,255,255,0)_58%),linear-gradient(135deg,#ffffff_0%,#f7f2ff_100%)] px-6 pb-6 pt-7">
              <DialogHeader className="gap-2 text-left">
                <DialogTitle className="text-2xl font-semibold tracking-tight text-[#261943]">
                  {authMode === "login"
                    ? "Welcome back"
                    : "Create your FluentStellar account"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {authMode === "login"
                    ? "Log in to your FluentStellar account with Google or email and password."
                    : "Create a FluentStellar account with Google or email and password."}
                </DialogDescription>
              </DialogHeader>

              <form className="mt-6 space-y-4" onSubmit={handlePasswordAuthSubmit}>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isAuthSubmitting}
                  onClick={() => void handleGoogleAuth()}
                  className="h-11 w-full rounded-xl border-[#d9cffd] bg-white font-semibold text-[#2c2344] hover:bg-[#f8f4ff]"
                >
                  <GoogleMark />
                  {googleLabel}
                </Button>

                <div className="flex items-center gap-3 py-1">
                  <div className="h-px flex-1 bg-[#ddd4fb]" />
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8b7fb0]">
                    Or
                  </span>
                  <div className="h-px flex-1 bg-[#ddd4fb]" />
                </div>

                {authError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {authError}
                  </div>
                ) : null}

                {authInfo ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {authInfo}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label
                    htmlFor="auth-email"
                    className="text-sm font-medium text-[#342456]"
                  >
                    Email
                  </label>
                  <Input
                    id="auth-email"
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    disabled={isAuthSubmitting}
                    className="h-11 rounded-xl border-[#ded7ef] bg-white/90 px-4 text-[#24163d] placeholder:text-[#8f85a8]"
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="auth-password"
                    className="text-sm font-medium text-[#342456]"
                  >
                    Password
                  </label>
                  <Input
                    id="auth-password"
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete={authMode === "login" ? "current-password" : "new-password"}
                    disabled={isAuthSubmitting}
                    className="h-11 rounded-xl border-[#ded7ef] bg-white/90 px-4 text-[#24163d] placeholder:text-[#8f85a8]"
                  />
                </div>

                {authMode === "login" ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleForgotPassword()}
                      disabled={isAuthSubmitting}
                      className="text-sm font-medium text-[#5a4ad1] transition hover:text-[#4938c8] hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                ) : null}

                {authMode === "signup" ? (
                  <div className="space-y-2">
                    <label
                      htmlFor="auth-confirm-password"
                      className="text-sm font-medium text-[#342456]"
                    >
                      Confirm password
                    </label>
                    <Input
                      id="auth-confirm-password"
                      type="password"
                      value={authConfirmPassword}
                      onChange={(event) =>
                        setAuthConfirmPassword(event.target.value)
                      }
                      placeholder="Repeat your password"
                      autoComplete="new-password"
                      disabled={isAuthSubmitting}
                      className="h-11 rounded-xl border-[#ded7ef] bg-white/90 px-4 text-[#24163d] placeholder:text-[#8f85a8]"
                    />
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={isAuthSubmitting}
                  className="mt-2 h-11 w-full rounded-xl bg-[#6558f5] text-base font-semibold text-white hover:bg-[#5647f0]"
                >
                  {isAuthSubmitting
                    ? "Please wait..."
                    : authMode === "login"
                      ? loginLabel
                      : signupLabel}
                </Button>
              </form>
            </div>

            <div className="border-t border-[#ebe4f7] bg-white px-6 py-5">
              {authMode === "login" ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-[#70658b]">
                    Don&apos;t have an account yet?
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={openSignupDialog}
                    className="h-11 w-full rounded-xl border-[#d9cffd] bg-[#faf7ff] font-semibold text-[#49368f] hover:bg-[#f3ecff]"
                  >
                    {signupLabel}
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 text-center">
                  <p className="text-sm text-[#70658b]">
                    Already have an account?
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAuthMode("login")}
                    className="h-11 w-full rounded-xl border-[#d9cffd] bg-[#faf7ff] font-semibold text-[#49368f] hover:bg-[#f3ecff]"
                  >
                    {loginLabel}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
