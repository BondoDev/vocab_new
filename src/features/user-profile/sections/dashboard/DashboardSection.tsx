import { useMemo } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { interpolateTemplate } from "../../../../lib/interpolateTemplate";
import type { UserProfile } from "../../../../lib/userProfile";
import type { UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import type { UserProfileSectionId } from "../../components/UserProfileSidebar";
import { getDashboardGreetingPeriod, type DashboardGreetingPeriod } from "./dashboardGreeting";
import { DashboardHeroCard } from "./DashboardHeroCard";
import { VocabularyOverviewCard } from "./VocabularyOverviewCard";
import { StudyActivityCard } from "./StudyActivityCard";
import { WordsLearnedCard } from "./WordsLearnedCard";
import { MilestonePreviewCard } from "./MilestonePreviewCard";
import { useDashboardSupportingData } from "./useDashboardSupportingData";
import { useDashboardVocabularyGrowthData } from "./useDashboardVocabularyGrowthData";
import "./dashboard-section.scss";

interface DashboardSectionProps {
  nickname?: string;
  // Dashboard Phase 2/3's hero + supporting cards all read from the same
  // single shared profile load and useProfileSharedProgressData values
  // already threaded through UserProfileDashboardPage to Learning/
  // Vocabulary/Progress — see each card's own props for what each value is
  // used for. None of these trigger a second fetch of their own; the one
  // genuinely new Phase 3 fetch (useDashboardSupportingData, below) is
  // still owned by this component alone, not duplicated per card.
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  onRetryWordProgress?: () => void;
  onStartReviewWords?: () => void;
  // Lets Vocabulary Overview's "View Vocabulary" and Milestone Preview's
  // "View Progress" switch the active profile section in place — the same
  // mechanism UserProfileSidebar's own nav buttons already use
  // (UserProfileDashboardPage's setActiveSection), not a new route.
  onNavigateToSection?: (section: UserProfileSectionId) => void;
}

const GREETING_KEY_BY_PERIOD: Record<DashboardGreetingPeriod, string> = {
  morning: "userProfile.dashboardPage.greeting.morning",
  afternoon: "userProfile.dashboardPage.greeting.afternoon",
  evening: "userProfile.dashboardPage.greeting.evening",
};

// Dashboard Phase 1 added the page header + personalized greeting. Phase 2
// added the rocket hero. Phase 3 (this change) adds the last piece: four
// compact supporting cards in a 2x2 grid — Vocabulary Overview, Study
// Activity, Words Learned, and Milestone Preview — completing the
// Dashboard. None of these four reproduce their full-page counterparts
// (no favorites/CEFR table on Vocabulary Overview, no milestone
// accordion/history on Milestone Preview, no daily-goal editor here at
// all) — see each card component's own header for its exact scope.
export function DashboardSection({
  nickname,
  userProfile,
  isProfileLoaded,
  todayISO,
  todayISOStatus,
  wordProgressRows,
  wordProgressStatus,
  onRetryWordProgress,
  onStartReviewWords,
  onNavigateToSection,
}: DashboardSectionProps) {
  const { t } = useLanguage();
  const trimmedNickname = nickname?.trim() ?? "";

  // Computed once per mount/nickname-arrival rather than on every render,
  // so the greeting doesn't flip mid-visit as the clock crosses a period
  // boundary — matching the "no aria-live, this only changes on initial
  // render" behavior called for in the Phase 1 brief.
  const greeting = useMemo(() => {
    if (!trimmedNickname) {
      return t("userProfile.dashboardPage.greeting.fallback");
    }
    const period = getDashboardGreetingPeriod(new Date().getHours());
    return interpolateTemplate(t(GREETING_KEY_BY_PERIOD[period]), { name: trimmedNickname });
  }, [t, trimmedNickname]);

  // The one Phase 3 fetch (an unbounded, language-scoped user_daily_stats
  // read) — shared by Study Activity, Words Learned, and Milestone
  // Preview below. See useDashboardSupportingData.ts's own header for the
  // full "why one read, why unbounded" reasoning.
  const { status: dailyStatsStatus, dailyStats, retry: retryDailyStats } = useDashboardSupportingData({
    isProfileLoaded,
    practiceLanguage: userProfile.practiceLanguage,
    todayISO,
    todayISOStatus,
  });
  const {
    status: vocabularyGrowthStatus,
    history: vocabularyGrowthHistory,
    retry: retryVocabularyGrowth,
  } = useDashboardVocabularyGrowthData({
    isProfileLoaded,
    practiceLanguage: userProfile.practiceLanguage,
    todayISO,
    todayISOStatus,
    wordProgressRows,
    wordProgressStatus,
  });

  return (
    <>
      <header className="dashboard-section__header">
        <h1 className="dashboard-section__title">{t("userProfile.dashboardPage.title")}</h1>
        <p className="dashboard-section__subtitle">{greeting}</p>
      </header>

      <DashboardHeroCard
        userProfile={userProfile}
        isProfileLoaded={isProfileLoaded}
        todayISO={todayISO}
        todayISOStatus={todayISOStatus}
        wordProgressRows={wordProgressRows}
        wordProgressStatus={wordProgressStatus}
        onNavigateToSection={onNavigateToSection}
      />

      <div className="dashboard-supporting-grid">
        <VocabularyOverviewCard
          wordProgressRows={wordProgressRows}
          wordProgressStatus={wordProgressStatus}
          onRetryWordProgress={onRetryWordProgress}
          onNavigateToSection={onNavigateToSection}
        />
        <WordsLearnedCard
          status={dailyStatsStatus}
          dailyStats={dailyStats}
          vocabularyGrowthStatus={vocabularyGrowthStatus}
          vocabularyGrowthHistory={vocabularyGrowthHistory}
          todayISO={todayISO}
          onRetry={() => {
            retryDailyStats();
            retryVocabularyGrowth();
          }}
        />
        <StudyActivityCard
          status={dailyStatsStatus}
          dailyStats={dailyStats}
          todayISO={todayISO}
          onRetry={retryDailyStats}
        />
        <MilestonePreviewCard
          wordProgressRows={wordProgressRows}
          wordProgressStatus={wordProgressStatus}
          dailyStats={dailyStats}
          dailyStatsStatus={dailyStatsStatus}
          todayISO={todayISO}
          onRetryWordProgress={onRetryWordProgress}
          onRetryDailyStats={retryDailyStats}
          onNavigateToSection={onNavigateToSection}
        />
      </div>
    </>
  );
}
