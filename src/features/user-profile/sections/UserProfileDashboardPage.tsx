import { useState } from "react";
import type { LanguageLevelCode } from "../../../lib/userProfile";
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
}

const SECTION_ARIA_LABEL_KEYS: Record<UserProfileSectionId, string> = {
  dashboard: "userProfile.developmentNotice.ariaLabel",
  learning: "userProfile.learningSection.ariaLabel",
  vocabulary: "userProfile.vocabularySection.ariaLabel",
};

export function UserProfileDashboardPage({
  nickname,
  practiceLanguage,
  languageLevel,
}: UserProfileDashboardPageProps) {
  const { t } = useLanguage();
  const [activeSection, setActiveSection] = useState<UserProfileSectionId>("learning");

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
            {activeSection === "learning" ? <LearningSection /> : null}
            {activeSection === "vocabulary" ? <VocabularySection /> : null}
            {activeSection === "dashboard" ? <DashboardSection /> : null}
          </section>
        </div>
      </section>
    </main>
  );
}
