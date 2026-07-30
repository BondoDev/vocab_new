import { useState } from "react";
import {
  BookOpenText,
  ChartSpline,
  Home,
  ListPlus,
  Settings,
  Target,
  UserRound,
  X,
} from "lucide-react";
import "../styles/user-profile-sidebar.scss";
import type { LanguageLevelCode } from "../../../lib/userProfile";
import type { UILanguage } from "../../../contexts/LanguageContext";

type SidebarNavGroup = {
  label: string;
  items: Array<{
    id: string;
    label: string;
    icon: typeof Home;
    isActive?: boolean;
  }>;
};

const SIDEBAR_NAV_GROUPS: SidebarNavGroup[] = [
  {
    label: "Main",
    items: [
      { id: "dashboard", label: "Dashboard", icon: Home, isActive: true },
      { id: "practice", label: "Learning", icon: Target },
    ],
  },
  {
    label: "Learning",
    items: [
      { id: "vocabulary", label: "Vocabulary", icon: BookOpenText },
      { id: "my-lists", label: "My Lists", icon: ListPlus },
    ],
  },
  {
    label: "Insights",
    items: [{ id: "progress", label: "Progress", icon: ChartSpline }],
  },
  {
    label: "System",
    items: [{ id: "settings", label: "Settings", icon: Settings }],
  },
] as const;

const LANGUAGE_LABELS: Record<UILanguage, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
};

interface SidebarInnerProps {
  nickname?: string;
  practiceLanguage?: UILanguage | "";
  languageLevel?: LanguageLevelCode | "";
}

function SidebarInner({
  nickname,
  practiceLanguage,
  languageLevel,
}: SidebarInnerProps) {
  const displayName = nickname?.trim() || "Bondo";
  const avatarLabel = displayName.charAt(0).toUpperCase() || "B";
  const learningLanguageLabel = practiceLanguage
    ? LANGUAGE_LABELS[practiceLanguage]
    : "German";
  const learningLevelLabel = languageLevel || "A2";

  return (
    <div className="user-profile-sidebar__surface">
      <section className="user-profile-sidebar__user-card" aria-label="User summary">
        <div className="user-profile-sidebar__identity">
          <div className="user-profile-sidebar__avatar" aria-hidden="true">
            {avatarLabel}
          </div>
          <div className="user-profile-sidebar__identity-copy">
            <h2 className="user-profile-sidebar__name">{displayName}</h2>
            <p className="user-profile-sidebar__meta">
              {learningLanguageLabel} <span aria-hidden="true">&bull;</span> {learningLevelLabel}
            </p>
          </div>
        </div>
      </section>

      <nav className="user-profile-sidebar__nav" aria-label="Profile sections">
        {SIDEBAR_NAV_GROUPS.map((group) => (
          <section key={group.label} className="user-profile-sidebar__group">
            <h3 className="user-profile-sidebar__group-label">{group.label}</h3>
            <div className="user-profile-sidebar__group-items">
              {group.items.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`user-profile-sidebar__nav-item ${
                      item.isActive ? "is-active" : ""
                    }`}
                  >
                    <span className="user-profile-sidebar__nav-icon" aria-hidden="true">
                      <Icon size={16} strokeWidth={1.9} />
                    </span>
                    <span className="user-profile-sidebar__nav-label">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
    </div>
  );
}

interface UserProfileSidebarProps {
  nickname?: string;
  practiceLanguage?: UILanguage | "";
  languageLevel?: LanguageLevelCode | "";
}

export function UserProfileSidebar({
  nickname,
  practiceLanguage,
  languageLevel,
}: UserProfileSidebarProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`user-profile-sidebar__mobile-trigger ${
          isDrawerOpen ? "is-hidden" : ""
        }`}
        onClick={() => setIsDrawerOpen(true)}
      >
        <UserRound size={18} strokeWidth={2} aria-hidden="true" />
        <span>Profile Menu</span>
      </button>

      <aside className="user-profile-sidebar user-profile-sidebar--desktop">
        <SidebarInner
          nickname={nickname}
          practiceLanguage={practiceLanguage}
          languageLevel={languageLevel}
        />
      </aside>

      {isDrawerOpen ? (
        <div className="user-profile-sidebar__drawer" role="dialog" aria-modal="true">
          <button
            type="button"
            className="user-profile-sidebar__drawer-overlay"
            aria-label="Close profile menu"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="user-profile-sidebar__drawer-panel">
            <div className="user-profile-sidebar__drawer-header">
              <span className="user-profile-sidebar__drawer-title">Profile Menu</span>
              <button
                type="button"
                className="user-profile-sidebar__drawer-close"
                aria-label="Close profile menu"
                onClick={() => setIsDrawerOpen(false)}
              >
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <SidebarInner
              nickname={nickname}
              practiceLanguage={practiceLanguage}
              languageLevel={languageLevel}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
