import { useEffect, useMemo } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { interpolateTemplate } from "../../../../lib/interpolateTemplate";
import type { UserProfile } from "../../../../lib/userProfile";
import type { MilestoneDailyStatRow, UserWordProgressFullRow, VocabularyGrowthEventRow } from "../../../../lib/newWordProgress";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import type { SharedLazyResourceStatus } from "../useProfileSharedDailyStats";
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
  // used for.
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  onRetryWordProgress?: () => void;
  // Fetch-audit Phase 1: the shared, lazily-loaded user_daily_stats/
  // vocabulary-growth resources owned by UserProfileDashboardPage's
  // useProfileSharedDailyStats — requested exactly once here (see the
  // mount effect below), then reused as-is by every card that needs
  // either, instead of each card (or even this component, previously)
  // fetching its own copy. Progress's MilestonesSection/
  // VocabularyGrowthSection consume the exact same two resources when the
  // user switches there — see ProgressSection's own props.
  dailyStatsStatus: SharedLazyResourceStatus;
  dailyStatsRows: MilestoneDailyStatRow[];
  onRequestDailyStats: () => void;
  onRetryDailyStats: () => void;
  vocabularyGrowthStatus: SharedLazyResourceStatus;
  vocabularyGrowthEvents: VocabularyGrowthEventRow[];
  onRequestVocabularyGrowthEvents: () => void;
  onRetryVocabularyGrowthEvents: () => void;
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
  dailyStatsStatus,
  dailyStatsRows,
  onRequestDailyStats,
  onRetryDailyStats,
  vocabularyGrowthStatus,
  vocabularyGrowthEvents,
  onRequestVocabularyGrowthEvents,
  onRetryVocabularyGrowthEvents,
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

  // Fetch-audit Phase 1: this section is one of the (up to three) places
  // that can ask the shared daily-stats/vocabulary-growth resources to
  // load — see useProfileSharedDailyStats.ts's own header. Both request
  // functions are no-ops if already loading/loaded for the current
  // (authUserId, targetLanguage) context, so navigating away and back here
  // never issues a second request; navigating here *after* Learning/
  // Progress already requested one of these two resources reuses that
  // same in-flight/loaded state instead of starting a new fetch.
  useEffect(() => {
    onRequestDailyStats();
    onRequestVocabularyGrowthEvents();
  }, [onRequestDailyStats, onRequestVocabularyGrowthEvents]);

  // Study Activity, Words Learned, and Milestone Preview below all derive
  // from the same shared dailyStatsRows — see useDashboardSupportingData.ts's
  // own header for the full "why one shared array, why unbounded" reasoning
  // (unchanged from Phase 3; only the array's origin — shared vs. a fetch
  // of its own — changed in this phase).
  const { status: dailyStatsCardStatus, dailyStats } = useDashboardSupportingData({
    isProfileLoaded,
    practiceLanguage: userProfile.practiceLanguage,
    todayISOStatus,
    dailyStatsStatus,
    dailyStatsRows,
  });
  const { status: vocabularyGrowthCardStatus, history: vocabularyGrowthHistory } = useDashboardVocabularyGrowthData({
    isProfileLoaded,
    practiceLanguage: userProfile.practiceLanguage,
    todayISO,
    todayISOStatus,
    wordProgressRows,
    wordProgressStatus,
    vocabularyGrowthStatus,
    vocabularyGrowthEvents,
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
        dailyStatsStatus={dailyStatsStatus}
        dailyStatsRows={dailyStatsRows}
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
          status={dailyStatsCardStatus}
          dailyStats={dailyStats}
          vocabularyGrowthStatus={vocabularyGrowthCardStatus}
          vocabularyGrowthHistory={vocabularyGrowthHistory}
          todayISO={todayISO}
          onRetry={() => {
            onRetryDailyStats();
            onRetryVocabularyGrowthEvents();
          }}
        />
        <StudyActivityCard
          status={dailyStatsCardStatus}
          dailyStats={dailyStats}
          todayISO={todayISO}
          onRetry={onRetryDailyStats}
        />
        <MilestonePreviewCard
          wordProgressRows={wordProgressRows}
          wordProgressStatus={wordProgressStatus}
          dailyStats={dailyStats}
          dailyStatsStatus={dailyStatsCardStatus}
          todayISO={todayISO}
          onRetryWordProgress={onRetryWordProgress}
          onRetryDailyStats={onRetryDailyStats}
          onNavigateToSection={onNavigateToSection}
        />
      </div>
    </>
  );
}
