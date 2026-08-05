import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import type { LanguageLevelCode, UserProfile } from "../../../lib/userProfile";
import { useLanguage, type UILanguage } from "../../../contexts/LanguageContext";
import {
  UserProfileSidebar,
  type UserProfileSectionId,
} from "../components/UserProfileSidebar";
import { DashboardSection } from "./dashboard/DashboardSection";
import { LearningSection } from "./learning/LearningSection";
import { VocabularySection } from "./vocabulary/VocabularySection";

interface UserProfileDashboardPageProps {
  nickname?: string;
  practiceLanguage?: UILanguage | "";
  languageLevel?: LanguageLevelCode | "";
  // App.tsx's single shared profile load, threaded through to the Learning
  // section (Daily Goal, Daily Streak, Today's Progress) and the Vocabulary
  // section so none of them fetch their own copy of the profile.
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  onStartCustomPractice?: () => void;
  onStartNewWordStudy?: () => void;
  onStartReviewWords?: () => void;
  // Lets the Learning section's DailyGoalSelector (which owns its own
  // save round-trip to Supabase) push a successfully saved goal back up
  // into App.tsx's userProfile state — without this, other places reading
  // userProfile.dailyGoal (e.g. NewWordStudyPreparation) keep showing the
  // value from the last full profile load until the page is reloaded.
  onDailyGoalChange?: (dailyGoal: number) => void;
}

const SECTION_ARIA_LABEL_KEYS: Record<UserProfileSectionId, string> = {
  dashboard: "userProfile.developmentNotice.ariaLabel",
  learning: "userProfile.learningSection.ariaLabel",
  vocabulary: "userProfile.vocabularySection.ariaLabel",
};

function resolveProfileSection(search: string): UserProfileSectionId {
  const section = new URLSearchParams(search).get("section");
  return section === "learning" || section === "vocabulary" || section === "dashboard"
    ? section
    : "dashboard";
}

export function UserProfileDashboardPage({
  nickname,
  practiceLanguage,
  languageLevel,
  userProfile,
  isProfileLoaded,
  onStartCustomPractice,
  onStartNewWordStudy,
  onStartReviewWords,
  onDailyGoalChange,
}: UserProfileDashboardPageProps) {
  const { t } = useLanguage();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState<UserProfileSectionId>(() =>
    resolveProfileSection(location.search),
  );

  useEffect(() => {
    setActiveSection(resolveProfileSection(location.search));
  }, [location.search]);

  return (
    <main className="user-profile-dashboard flex-1">
      <section className="user-profile-dashboard__shell">
        <div className="user-profile-dashboard__layout">
          <UserProfileSidebar
            nickname={nickname}
            practiceLanguage={practiceLanguage}
            languageLevel={languageLevel}
            activeSection={activeSection}
            onSectionChange={setActiveSection}
          />

          <section
            className="user-profile-dashboard__content"
            aria-label={t(SECTION_ARIA_LABEL_KEYS[activeSection])}
          >
            {nickname ? <span className="sr-only">{nickname}</span> : null}
            {activeSection === "learning" ? (
              <LearningSection
                userProfile={userProfile}
                isProfileLoaded={isProfileLoaded}
                onStartCustomPractice={onStartCustomPractice}
                onStartNewWordStudy={onStartNewWordStudy}
                onStartReviewWords={onStartReviewWords}
                onDailyGoalChange={onDailyGoalChange}
              />
            ) : null}
            {activeSection === "vocabulary" ? (
              <VocabularySection
                userProfile={userProfile}
                isProfileLoaded={isProfileLoaded}
                onStartNewWordStudy={onStartNewWordStudy}
              />
            ) : null}
            {activeSection === "dashboard" ? <DashboardSection /> : null}
          </section>
        </div>
      </section>
    </main>
  );
}
