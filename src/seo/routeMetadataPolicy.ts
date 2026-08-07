import type { SeoMetadata } from "./SeoContext";

const HOMEPAGE_METADATA = {
  title: "FluentStellar - Structured Vocabulary Learning Platform",
  description:
    "Structured CEFR vocabulary system with interactive exercises and intelligent learning tools.",
} as const;

const INDEXABLE_PUBLIC_METADATA: Record<string, { title: string; description: string }> = {
  "/about": {
    title: "About FluentStellar",
    description:
      "Learn what FluentStellar is building and how the platform approaches structured vocabulary learning.",
  },
  "/help": {
    title: "FluentStellar Help",
    description:
      "Get help using FluentStellar, including navigation, practice routes, and core vocabulary features.",
  },
} as const;

const PUBLIC_APP_METADATA: Record<string, { title: string; description: string }> = {
  "/languages": {
    title: "Choose Your Language Pair - FluentStellar",
    description:
      "Choose your interface language and practice language to start structured vocabulary learning on FluentStellar.",
  },
  "/languages/filters": {
    title: "Vocabulary Filters and Levels - FluentStellar",
    description:
      "Browse CEFR vocabulary by level and topic, then open targeted practice pages built around the words you need next.",
  },
  "/languages/filters/exercises": {
    title: "Vocabulary Exercises - FluentStellar",
    description:
      "Start vocabulary exercises with your selected language pair and practice route on FluentStellar.",
  },
  "/languages/filters/exercises/practice": {
    title: "Vocabulary Practice | FluentStellar",
    description: "Your current FluentStellar practice session will appear here.",
  },
  "/languages/level-test": {
    title: "English Level Test - FluentStellar",
    description:
      "Take the FluentStellar English level test to estimate your CEFR level and jump into the right vocabulary practice.",
  },
  "/explore": {
    title: "Explore Languages and Vocabulary - FluentStellar",
    description:
      "Explore FluentStellar language-learning tools, vocabulary routes, and practice pages from one hub.",
  },
  "/learning/new-words": {
    title: "Study New Words | FluentStellar",
    description:
      "Start a guided FluentStellar session for learning new vocabulary words from your daily goal.",
  },
  "/learning/review": {
    title: "Review Words | FluentStellar",
    description:
      "Review due FluentStellar vocabulary words with structured recall practice.",
  },
} as const;

export type RouteMetadataClass =
  | "homepage"
  | "public-seo"
  | "private-account"
  | "practice-session"
  | "public-app"
  | "invalid";

function normalizePathname(pathname: string): string {
  const normalized = pathname.split(/[?#]/, 1)[0] || "/";
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.replace(/\/+$/, "");
  }

  return normalized;
}

export function isPracticeSessionPath(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  return (
    normalized === "/languages/filters/exercises/practice" ||
    /^\/languages\/filters\/exercises\/[a-z]{2}-[a-z]{2}\/practice$/i.test(normalized)
  );
}

export function classifyRouteMetadata(pathname: string): RouteMetadataClass {
  const normalized = normalizePathname(pathname);

  if (normalized === "/") {
    return "homepage";
  }

  if (normalized === "/profile") {
    return "private-account";
  }

  if (isPracticeSessionPath(normalized)) {
    return "practice-session";
  }

  if (normalized in INDEXABLE_PUBLIC_METADATA) {
    return "public-seo";
  }

  if (normalized in PUBLIC_APP_METADATA) {
    return "public-app";
  }

  return "invalid";
}

function buildNoindexMetadata(
  title: string,
  description: string,
  robots = "noindex, nofollow",
): SeoMetadata {
  return {
    title,
    description,
    robots,
  };
}

export function buildRouteMetadata(pathname: string, siteOrigin: string): SeoMetadata {
  const normalized = normalizePathname(pathname);
  const origin = siteOrigin.replace(/\/$/, "");
  const routeClass = classifyRouteMetadata(normalized);

  if (routeClass === "homepage") {
    return {
      title: HOMEPAGE_METADATA.title,
      description: HOMEPAGE_METADATA.description,
      canonical: `${origin}/`,
    };
  }

  if (routeClass === "private-account") {
    return buildNoindexMetadata(
      "Profile | FluentStellar",
      "Your FluentStellar account dashboard.",
    );
  }

  if (routeClass === "practice-session") {
    return buildNoindexMetadata(
      "Vocabulary Practice | FluentStellar",
      "Your current FluentStellar practice session will appear here.",
    );
  }

  if (routeClass === "public-seo") {
    const metadata = INDEXABLE_PUBLIC_METADATA[normalized];
    return {
      title: metadata.title,
      description: metadata.description,
      canonical: `${origin}${normalized}`,
    };
  }

  if (routeClass === "public-app") {
    const metadata = PUBLIC_APP_METADATA[normalized];
    return buildNoindexMetadata(metadata.title, metadata.description, "noindex, follow");
  }

  return buildNoindexMetadata(
    "Page Not Found | FluentStellar",
    "The requested page could not be found on FluentStellar. Explore vocabulary routes and learning tools from valid pages instead.",
  );
}
