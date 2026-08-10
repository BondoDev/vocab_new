import { useMemo } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { interpolateTemplate } from "../../../../lib/interpolateTemplate";
import type { UserProfile } from "../../../../lib/userProfile";
import type { UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import { getDashboardGreetingPeriod, type DashboardGreetingPeriod } from "./dashboardGreeting";
import { DashboardHeroCard } from "./DashboardHeroCard";
import "./dashboard-section.scss";

interface DashboardSectionProps {
  nickname?: string;
  // Dashboard Phase 2's hero card reads from the same single shared profile
  // load and useProfileSharedProgressData values already threaded through
  // UserProfileDashboardPage to Learning/Vocabulary/Progress — see
  // DashboardHeroCard.tsx's own props for what each is used for. None of
  // these trigger a second fetch of their own.
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  onStartNewWordStudy?: () => void;
  onStartReviewWords?: () => void;
}

const GREETING_KEY_BY_PERIOD: Record<DashboardGreetingPeriod, string> = {
  morning: "userProfile.dashboardPage.greeting.morning",
  afternoon: "userProfile.dashboardPage.greeting.afternoon",
  evening: "userProfile.dashboardPage.greeting.evening",
};

// Dashboard Phase 1 added the page header + personalized greeting. Phase 2
// adds the first content section directly below it: the combined Today /
// Rocket / Continue Learning hero card (DashboardHeroCard.tsx). Charts, a
// milestones preview, recent activity, and a weekly words card are later
// phases — see this section's own directory for where they'll be added.
export function DashboardSection({
  nickname,
  userProfile,
  isProfileLoaded,
  todayISO,
  todayISOStatus,
  wordProgressRows,
  wordProgressStatus,
  onStartNewWordStudy,
  onStartReviewWords,
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
        onStartNewWordStudy={onStartNewWordStudy}
        onStartReviewWords={onStartReviewWords}
      />
    </>
  );
}
