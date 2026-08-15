import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import type { LanguageLevelCode, UserProfile } from "../../../lib/userProfile";
import { useLanguage, type UILanguage } from "../../../contexts/LanguageContext";
import { useAuthSession } from "../../../app/hooks/useAuthSession";
import {
  UserProfileSidebar,
  type UserProfileSectionId,
} from "../components/UserProfileSidebar";
import { DashboardSection } from "./dashboard/DashboardSection";
import { LearningSection } from "./learning/LearningSection";
import { VocabularySection } from "./vocabulary/VocabularySection";
import { MyListsSection, type PracticeListStartConfig } from "./my-lists/MyListsSection";
import { ProgressSection } from "./progress/ProgressSection";
import {
  SettingsSection,
  type ProfileNicknameChange,
  type ProfileLanguagesChange,
  type ProfileTimezoneChange,
} from "./settings/SettingsSection";
import { useProfileSharedProgressData } from "./useProfileSharedProgressData";
import { useProfileSharedDailyStats } from "./useProfileSharedDailyStats";
import { useProfileSharedMyLists } from "./useProfileSharedMyLists";

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
  // My Lists Phase 3 — see MyListsSection's own prop for the full contract.
  onStartPracticeList?: (config: PracticeListStartConfig) => void;
  onSignOut?: () => void | Promise<void>;
  // Lets the Learning section's DailyGoalSelector (which owns its own
  // save round-trip to Supabase) push a successfully saved goal back up
  // into App.tsx's userProfile state — without this, other places reading
  // userProfile.dailyGoal (e.g. NewWordStudyPreparation) keep showing the
  // value from the last full profile load until the page is reloaded.
  onDailyGoalChange?: (dailyGoal: number) => void;
  // Settings Phase 1 — see SettingsSection's own prop comments for exactly
  // what each callback does and why it's needed in addition to updating
  // userProfile alone.
  onNicknameChange?: (change: ProfileNicknameChange) => void;
  onProfileLanguagesChange?: (change: ProfileLanguagesChange) => void;
  onTimezoneChange?: (change: ProfileTimezoneChange) => void;
  onAccountDeleted?: () => void | Promise<void>;
}

const SECTION_ARIA_LABEL_KEYS: Record<UserProfileSectionId, string> = {
  dashboard: "userProfile.dashboardPage.ariaLabel",
  learning: "userProfile.learningSection.ariaLabel",
  vocabulary: "userProfile.vocabularySection.ariaLabel",
  myLists: "userProfile.myListsSection.ariaLabel",
  progress: "userProfile.progressSection.ariaLabel",
  settings: "userProfile.settingsSection.ariaLabel",
};

function resolveProfileSection(search: string): UserProfileSectionId {
  const section = new URLSearchParams(search).get("section");
  return section === "learning" ||
    section === "vocabulary" ||
    section === "myLists" ||
    section === "progress" ||
    section === "settings" ||
    section === "dashboard"
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
  onStartPracticeList,
  onSignOut,
  onDailyGoalChange,
  onNicknameChange,
  onProfileLanguagesChange,
  onTimezoneChange,
  onAccountDeleted,
}: UserProfileDashboardPageProps) {
  const { t } = useLanguage();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState<UserProfileSectionId>(() =>
    resolveProfileSection(location.search),
  );

  useEffect(() => {
    setActiveSection(resolveProfileSection(location.search));
  }, [location.search]);

  // Phase 1 of the profile-section data optimization: the authoritative
  // current learning date and the active-language user_word_progress rows
  // are each fetched exactly once here, above Learning/Vocabulary/Progress,
  // and threaded down as props — see useProfileSharedProgressData.ts's own
  // header for the full contract. None of the three sections below fetches
  // either itself anymore.
  const { authUserId } = useAuthSession();
  const {
    todayISO,
    todayISOStatus,
    retryLearningDate,
    wordProgressRows,
    wordProgressStatus,
    retryWordProgress,
  } = useProfileSharedProgressData({
    authUserId,
    isProfileLoaded,
    targetLanguage: userProfile.practiceLanguage,
    timezone: userProfile.timezone,
  });

  // Fetch-audit Phase 1: the shared, lazily-loaded owner of user_daily_stats
  // (dailyStats*) and vocabulary-growth review_events (vocabularyGrowth*) —
  // see useProfileSharedDailyStats.ts's own header for the full contract.
  // Unlike the shared hook above, this one fetches nothing merely because
  // /profile mounted: Dashboard/Learning/Progress each call
  // requestDailyStats()/requestVocabularyGrowthEvents() themselves, once
  // per mount, only for whichever of the two resources they actually need —
  // Vocabulary/My Lists/Settings never do, so switching to those never
  // triggers either fetch.
  const {
    dailyStatsStatus,
    dailyStatsRows,
    requestDailyStats,
    retryDailyStats,
    vocabularyGrowthStatus,
    vocabularyGrowthEvents,
    requestVocabularyGrowthEvents,
    retryVocabularyGrowthEvents,
  } = useProfileSharedDailyStats({
    authUserId,
    isProfileLoaded,
    targetLanguage: userProfile.practiceLanguage,
  });

  // My Lists Phase 3: the shared, lazily-loaded owner of the signed-in
  // user's vocabulary lists + list-word memberships — see
  // useProfileSharedMyLists.ts's own header for the full contract. Like
  // useProfileSharedDailyStats above, this fetches nothing merely because
  // /profile mounted: only MyListsSection's own mount effect calls
  // requestMyLists(), so switching to Dashboard/Learning/Vocabulary/
  // Progress/Settings never triggers a My Lists Supabase read.
  const {
    myListsStatus,
    myLists,
    myListsMemberships,
    requestMyLists,
    retryMyLists,
    applyListCreated,
    applyListRenamed,
    applyListDeleted,
    applyListMembershipsReplaced,
    applyMembershipRemoved,
    applyMembershipAdded,
  } = useProfileSharedMyLists({
    authUserId,
    isProfileLoaded,
    targetLanguage: userProfile.practiceLanguage,
  });

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
            onSignOut={onSignOut}
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
                todayISO={todayISO}
                todayISOStatus={todayISOStatus}
                onRetryLearningDate={retryLearningDate}
                dailyStatsStatus={dailyStatsStatus}
                dailyStatsRows={dailyStatsRows}
                onRequestDailyStats={requestDailyStats}
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
                wordProgressRows={wordProgressRows}
                wordProgressStatus={wordProgressStatus}
                onRetryWordProgress={retryWordProgress}
                onStartNewWordStudy={onStartNewWordStudy}
              />
            ) : null}
            {activeSection === "myLists" ? (
              <MyListsSection
                userProfile={userProfile}
                isProfileLoaded={isProfileLoaded}
                wordProgressRows={wordProgressRows}
                wordProgressStatus={wordProgressStatus}
                onRetryWordProgress={retryWordProgress}
                onStartPracticeList={onStartPracticeList}
                myListsStatus={myListsStatus}
                myLists={myLists}
                myListsMemberships={myListsMemberships}
                onRequestMyLists={requestMyLists}
                onRetryMyLists={retryMyLists}
                onListCreated={applyListCreated}
                onListRenamed={applyListRenamed}
                onListDeleted={applyListDeleted}
                onListMembershipsReplaced={applyListMembershipsReplaced}
                onListMembershipRemoved={applyMembershipRemoved}
                onListMembershipAdded={applyMembershipAdded}
              />
            ) : null}
            {activeSection === "progress" ? (
              <ProgressSection
                userProfile={userProfile}
                isProfileLoaded={isProfileLoaded}
                todayISO={todayISO}
                todayISOStatus={todayISOStatus}
                onRetryLearningDate={retryLearningDate}
                wordProgressRows={wordProgressRows}
                wordProgressStatus={wordProgressStatus}
                onRetryWordProgress={retryWordProgress}
                dailyStatsStatus={dailyStatsStatus}
                dailyStatsRows={dailyStatsRows}
                onRequestDailyStats={requestDailyStats}
                onRetryDailyStats={retryDailyStats}
                vocabularyGrowthStatus={vocabularyGrowthStatus}
                vocabularyGrowthEvents={vocabularyGrowthEvents}
                onRequestVocabularyGrowthEvents={requestVocabularyGrowthEvents}
                onRetryVocabularyGrowthEvents={retryVocabularyGrowthEvents}
                onStartNewWordStudy={onStartNewWordStudy}
              />
            ) : null}
            {activeSection === "settings" ? (
              <SettingsSection
                userProfile={userProfile}
                isProfileLoaded={isProfileLoaded}
                onNicknameChange={onNicknameChange}
                onProfileLanguagesChange={onProfileLanguagesChange}
                onTimezoneChange={onTimezoneChange}
                onAccountDeleted={onAccountDeleted}
              />
            ) : null}
            {activeSection === "dashboard" ? (
              <DashboardSection
                nickname={nickname}
                userProfile={userProfile}
                isProfileLoaded={isProfileLoaded}
                todayISO={todayISO}
                todayISOStatus={todayISOStatus}
                wordProgressRows={wordProgressRows}
                wordProgressStatus={wordProgressStatus}
                onRetryWordProgress={retryWordProgress}
                dailyStatsStatus={dailyStatsStatus}
                dailyStatsRows={dailyStatsRows}
                onRequestDailyStats={requestDailyStats}
                onRetryDailyStats={retryDailyStats}
                vocabularyGrowthStatus={vocabularyGrowthStatus}
                vocabularyGrowthEvents={vocabularyGrowthEvents}
                onRequestVocabularyGrowthEvents={requestVocabularyGrowthEvents}
                onRetryVocabularyGrowthEvents={retryVocabularyGrowthEvents}
                onStartReviewWords={onStartReviewWords}
                onNavigateToSection={setActiveSection}
              />
            ) : null}
          </section>
        </div>
      </section>
    </main>
  );
}
