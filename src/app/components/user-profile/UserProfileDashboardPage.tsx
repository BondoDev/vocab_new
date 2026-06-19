import type { LanguageLevelCode } from "../../../lib/userProfile";
import type { UILanguage } from "../../../contexts/LanguageContext";
import { UserProfileSidebar } from "./UserProfileSidebar";

interface UserProfileDashboardPageProps {
  nickname?: string;
  practiceLanguage?: UILanguage | "";
  languageLevel?: LanguageLevelCode | "";
}

export function UserProfileDashboardPage({
  nickname,
  practiceLanguage,
  languageLevel,
}: UserProfileDashboardPageProps) {
  return (
    <main className="user-profile-dashboard flex-1">
      <section className="user-profile-dashboard__shell">
        <div className="user-profile-dashboard__layout">
          <UserProfileSidebar
            nickname={nickname}
            practiceLanguage={practiceLanguage}
            languageLevel={languageLevel}
          />

          <section className="user-profile-dashboard__content" aria-label="Profile dashboard">
            {nickname ? <span className="sr-only">{nickname}</span> : null}
          </section>
        </div>
      </section>
    </main>
  );
}
