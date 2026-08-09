import { useLanguage } from "../../../../contexts/LanguageContext";
import type { UserProfile } from "../../../../lib/userProfile";
import type { UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
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
        onStartNewWordStudy={onStartNewWordStudy}
      />
    </>
  );
}
