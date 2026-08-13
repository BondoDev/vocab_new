import { useState } from "react";
import {
  BookOpenText,
  ChartSpline,
  Home,
  ListPlus,
  LogOut,
  Settings,
  Target,
  UserRound,
  X,
} from "lucide-react";
import "../styles/user-profile-sidebar.scss";
import type { LanguageLevelCode } from "../../../lib/userProfile";
import { useLanguage, type UILanguage } from "../../../contexts/LanguageContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../../app/components/ui/alert-dialog";

type SidebarNavGroup = {
  labelKey: string;
  items: Array<{
    id: string;
    labelKey: string;
    icon: typeof Home;
    isActive?: boolean;
  }>;
};

export type UserProfileSectionId =
  | "dashboard"
  | "learning"
  | "vocabulary"
  | "myLists"
  | "progress"
  | "settings";

function isUserProfileSectionId(value: string): value is UserProfileSectionId {
  return (
    value === "dashboard" ||
    value === "learning" ||
    value === "vocabulary" ||
    value === "myLists" ||
    value === "progress" ||
    value === "settings"
  );
}

const SIDEBAR_NAV_GROUPS: SidebarNavGroup[] = [
  {
    labelKey: "userProfile.sidebar.groups.main",
    items: [
      { id: "dashboard", labelKey: "userProfile.sidebar.items.dashboard", icon: Home },
    ],
  },
  {
    labelKey: "userProfile.sidebar.groups.learning",
    items: [
      { id: "learning", labelKey: "userProfile.sidebar.items.learning", icon: Target },
      { id: "vocabulary", labelKey: "userProfile.sidebar.items.vocabulary", icon: BookOpenText },
      { id: "myLists", labelKey: "userProfile.sidebar.items.myLists", icon: ListPlus },
    ],
  },
  {
    labelKey: "userProfile.sidebar.groups.insights",
    items: [{ id: "progress", labelKey: "userProfile.sidebar.items.progress", icon: ChartSpline }],
  },
  {
    labelKey: "userProfile.sidebar.groups.system",
    items: [{ id: "settings", labelKey: "userProfile.sidebar.items.settings", icon: Settings }],
  },
] as const;

interface SidebarInnerProps {
  nickname?: string;
  practiceLanguage?: UILanguage | "";
  languageLevel?: LanguageLevelCode | "";
  activeSection: UserProfileSectionId;
  onSectionChange: (sectionId: UserProfileSectionId) => void;
  onSignOutClick?: () => void;
}

function SidebarInner({
  nickname,
  practiceLanguage,
  languageLevel,
  activeSection,
  onSectionChange,
  onSignOutClick,
}: SidebarInnerProps) {
  const { t } = useLanguage();
  const displayName = nickname?.trim() || "Account";
  const avatarLabel = displayName.charAt(0).toUpperCase();
  const learningLanguageLabel = practiceLanguage ? t(`languageNames.${practiceLanguage}`) : "";
  const learningMeta = [learningLanguageLabel, languageLevel].filter(Boolean).join(" • ");

  return (
    <div className="user-profile-sidebar__surface">
      <section className="user-profile-sidebar__user-card" aria-label={t("userProfile.sidebar.aria.userSummary")}>
        <div className="user-profile-sidebar__identity">
          <div className="user-profile-sidebar__avatar" aria-hidden="true">
            {avatarLabel}
          </div>
          <div className="user-profile-sidebar__identity-copy">
            <h2 className="user-profile-sidebar__name">{displayName}</h2>
            {learningMeta ? <p className="user-profile-sidebar__meta">{learningMeta}</p> : null}
          </div>
        </div>
      </section>

      <nav className="user-profile-sidebar__nav" aria-label={t("userProfile.sidebar.aria.profileSections")}>
        {SIDEBAR_NAV_GROUPS.map((group) => (
          <section key={group.labelKey} className="user-profile-sidebar__group">
            <h3 className="user-profile-sidebar__group-label">{t(group.labelKey)}</h3>
            <div className="user-profile-sidebar__group-items">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = item.id === activeSection;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`user-profile-sidebar__nav-item ${
                      isActive ? "is-active" : ""
                    }`}
                    onClick={() => {
                      if (isUserProfileSectionId(item.id)) {
                        onSectionChange(item.id);
                      }
                    }}
                  >
                    <span className="user-profile-sidebar__nav-icon" aria-hidden="true">
                      <Icon size={16} strokeWidth={1.9} />
                    </span>
                    <span className="user-profile-sidebar__nav-label">{t(item.labelKey)}</span>
                  </button>
                );
              })}
              {group.labelKey === "userProfile.sidebar.groups.system" && onSignOutClick ? (
                <button
                  type="button"
                  className="user-profile-sidebar__nav-item user-profile-sidebar__nav-item--danger"
                  onClick={onSignOutClick}
                >
                  <span className="user-profile-sidebar__nav-icon" aria-hidden="true">
                    <LogOut size={16} strokeWidth={1.9} />
                  </span>
                  <span className="user-profile-sidebar__nav-label">{t("userProfile.sidebar.actions.signOut")}</span>
                </button>
              ) : null}
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
  activeSection: UserProfileSectionId;
  onSectionChange: (sectionId: UserProfileSectionId) => void;
  onSignOut?: () => void | Promise<void>;
}

export function UserProfileSidebar({
  nickname,
  practiceLanguage,
  languageLevel,
  activeSection,
  onSectionChange,
  onSignOut,
}: UserProfileSidebarProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);
  const { t } = useLanguage();

  const openSignOutConfirm = () => {
    setIsDrawerOpen(false);
    setIsSignOutConfirmOpen(true);
  };

  const handleConfirmSignOut = () => {
    setIsSignOutConfirmOpen(false);
    void onSignOut?.();
  };

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
        <span>{t("userProfile.sidebar.mobileMenu")}</span>
      </button>

      <aside className="user-profile-sidebar user-profile-sidebar--desktop">
        <SidebarInner
          nickname={nickname}
          practiceLanguage={practiceLanguage}
          languageLevel={languageLevel}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          onSignOutClick={openSignOutConfirm}
        />
      </aside>

      {isDrawerOpen ? (
        <div className="user-profile-sidebar__drawer" role="dialog" aria-modal="true">
          <button
            type="button"
            className="user-profile-sidebar__drawer-overlay"
            aria-label={t("userProfile.sidebar.aria.closeProfileMenu")}
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="user-profile-sidebar__drawer-panel">
            <div className="user-profile-sidebar__drawer-header">
              <span className="user-profile-sidebar__drawer-title">{t("userProfile.sidebar.mobileMenu")}</span>
              <button
                type="button"
                className="user-profile-sidebar__drawer-close"
                aria-label={t("userProfile.sidebar.aria.closeProfileMenu")}
                onClick={() => setIsDrawerOpen(false)}
              >
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
            <SidebarInner
              nickname={nickname}
              practiceLanguage={practiceLanguage}
              languageLevel={languageLevel}
              activeSection={activeSection}
              onSectionChange={(sectionId) => {
                onSectionChange(sectionId);
                setIsDrawerOpen(false);
              }}
              onSignOutClick={openSignOutConfirm}
            />
          </div>
        </div>
      ) : null}

      <AlertDialog open={isSignOutConfirmOpen} onOpenChange={setIsSignOutConfirmOpen}>
        <AlertDialogContent className="user-profile-sidebar__sign-out-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("userProfile.sidebar.signOutConfirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("userProfile.sidebar.signOutConfirm.description")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("userProfile.sidebar.signOutConfirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="user-profile-sidebar__sign-out-confirm-button"
              onClick={handleConfirmSignOut}
            >
              {t("userProfile.sidebar.signOutConfirm.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
