import type { ReactNode } from "react";
import { Header } from "../../../components/layout/Header";
import type { StoredSupabaseSession } from "../../../../lib/supabaseAuth";

type HeaderActivePage =
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

interface WordPageLayoutProps {
  children: ReactNode;
  onAbout?: () => void;
  onHelp?: () => void;
  onLevelTest?: () => void;
  onLanguages?: () => void;
  onFilters?: () => void;
  onExercises?: () => void;
  onExplore?: () => void;
  onProfile?: () => void;
  authSession?: StoredSupabaseSession | null;
  accountNickname?: string;
  onAuthSessionChange?: (session: StoredSupabaseSession | null) => void;
  activePage?: HeaderActivePage;
}

export function WordPageLayout({
  children,
  activePage = "vocabularyLevel",
  ...headerProps
}: WordPageLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header {...headerProps} activePage={activePage} />
      {children}
    </div>
  );
}
