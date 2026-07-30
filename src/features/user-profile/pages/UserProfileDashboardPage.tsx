import type { LanguageLevelCode } from "../../../lib/userProfile";
import { useLanguage, type UILanguage } from "../../../contexts/LanguageContext";
import { UserProfileSidebar } from "../components/UserProfileSidebar";

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
  const { t } = useLanguage();

  return (
    <main className="user-profile-dashboard flex-1">
      <section className="user-profile-dashboard__shell">
        <div className="user-profile-dashboard__layout">
          <UserProfileSidebar
            nickname={nickname}
            practiceLanguage={practiceLanguage}
            languageLevel={languageLevel}
          />

          <section
            className="user-profile-dashboard__content"
            aria-label={t("userProfile.developmentNotice.ariaLabel")}
          >
            {nickname ? <span className="sr-only">{nickname}</span> : null}
            <div className="user-profile-dashboard__notice" role="status">
              <p className="user-profile-dashboard__notice-kicker">
                {t("userProfile.developmentNotice.status")}
              </p>
              <h1 className="user-profile-dashboard__notice-title">
                {t("userProfile.developmentNotice.title")}
              </h1>
              <p className="user-profile-dashboard__notice-description">
                {t("userProfile.developmentNotice.description")}
              </p>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
