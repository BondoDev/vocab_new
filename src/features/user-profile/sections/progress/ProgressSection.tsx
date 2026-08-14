import { useLanguage } from "../../../../contexts/LanguageContext";
import type { UserProfile } from "../../../../lib/userProfile";
import type { MilestoneDailyStatRow, UserWordProgressFullRow, VocabularyGrowthEventRow } from "../../../../lib/newWordProgress";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import type { SharedLazyResourceStatus } from "../useProfileSharedDailyStats";
import { MilestonesSection } from "./MilestonesSection";
import { VocabularyGrowthSection } from "./VocabularyGrowthSection";
import "./progress-section.scss";

interface ProgressSectionProps {
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  // The shared learning date and active-language word-progress rows, owned
  // and fetched exactly once by UserProfileDashboardPage's
  // useProfileSharedProgressData — forwarded straight through to both
  // children (no logic of its own here); see that hook's own header.
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
  onRetryLearningDate: () => void;
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  onRetryWordProgress: () => void;
  // Fetch-audit Phase 1: the shared, lazily-loaded user_daily_stats/
  // vocabulary-growth-events resources (see useProfileSharedDailyStats.ts)
  // — forwarded straight through to MilestonesSection/VocabularyGrowthSection
  // (no logic of its own here), the same shared resources Dashboard's
  // supporting cards consume when the user switches there.
  dailyStatsStatus: SharedLazyResourceStatus;
  dailyStatsRows: MilestoneDailyStatRow[];
  onRequestDailyStats: () => void;
  onRetryDailyStats: () => void;
  vocabularyGrowthStatus: SharedLazyResourceStatus;
  vocabularyGrowthEvents: VocabularyGrowthEventRow[];
  onRequestVocabularyGrowthEvents: () => void;
  onRetryVocabularyGrowthEvents: () => void;
  onStartNewWordStudy?: () => void;
}

// The Progress page's own page-level header — title "Progress" + a short
// subtitle, same visual hierarchy as VocabularySection/LearningSection's
// own headers (see progress-section.scss's `.progress-section__header`).
// Deliberately a *different* string pair from MilestonesSection's own
// collapsed-trigger title/subtitle ("Milestones" / "Track your long-term
// learning milestones.") — userProfile.progressPage.* here is the whole
// page's identity, userProfile.progressSection.* stays the Milestones
// section's own copy. Kept compact (see the scss) so it leaves room for
// Milestones plus sibling sections — Vocabulary Growth is the first of
// those, rendered directly below Milestones; future sections (Learning
// Calendar, Activity Charts) have an obvious place to be added the same
// way.
export function ProgressSection({
  userProfile,
  isProfileLoaded,
  todayISO,
  todayISOStatus,
  onRetryLearningDate,
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
  onStartNewWordStudy,
}: ProgressSectionProps) {
  const { t } = useLanguage();

  return (
    <>
      <header className="progress-section__header">
        <div className="progress-section__heading">
          <h1 className="progress-section__title">{t("userProfile.progressPage.title")}</h1>
          <p className="progress-section__subtitle">{t("userProfile.progressPage.subtitle")}</p>
        </div>
      </header>

      <MilestonesSection
        userProfile={userProfile}
        isProfileLoaded={isProfileLoaded}
        todayISO={todayISO}
        todayISOStatus={todayISOStatus}
        onRetryLearningDate={onRetryLearningDate}
        wordProgressRows={wordProgressRows}
        wordProgressStatus={wordProgressStatus}
        onRetryWordProgress={onRetryWordProgress}
        dailyStatsStatus={dailyStatsStatus}
        dailyStatsRows={dailyStatsRows}
        onRequestDailyStats={onRequestDailyStats}
        onRetryDailyStats={onRetryDailyStats}
      />
      <VocabularyGrowthSection
        userProfile={userProfile}
        isProfileLoaded={isProfileLoaded}
        todayISO={todayISO}
        todayISOStatus={todayISOStatus}
        onRetryLearningDate={onRetryLearningDate}
        wordProgressRows={wordProgressRows}
        wordProgressStatus={wordProgressStatus}
        onRetryWordProgress={onRetryWordProgress}
        vocabularyGrowthStatus={vocabularyGrowthStatus}
        vocabularyGrowthEvents={vocabularyGrowthEvents}
        onRequestVocabularyGrowthEvents={onRequestVocabularyGrowthEvents}
        onRetryVocabularyGrowthEvents={onRetryVocabularyGrowthEvents}
        onStartNewWordStudy={onStartNewWordStudy}
      />
    </>
  );
}
