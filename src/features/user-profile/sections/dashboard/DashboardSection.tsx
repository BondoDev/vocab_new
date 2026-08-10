import { useMemo } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import {
  getDashboardGreetingPeriod,
  interpolateTemplate,
  type DashboardGreetingPeriod,
} from "./dashboardGreeting";
import "./dashboard-section.scss";

interface DashboardSectionProps {
  nickname?: string;
}

const GREETING_KEY_BY_PERIOD: Record<DashboardGreetingPeriod, string> = {
  morning: "userProfile.dashboardPage.greeting.morning",
  afternoon: "userProfile.dashboardPage.greeting.afternoon",
  evening: "userProfile.dashboardPage.greeting.evening",
};

// Dashboard Phase 1: page header ("Dashboard") + a personalized subheader
// greeting only. The rocket/Continue Learning hero card, Today stats,
// charts, milestones, and recent activity are later phases — see this
// section's own directory for where they'll be added.
export function DashboardSection({ nickname }: DashboardSectionProps) {
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
    <header className="dashboard-section__header">
      <h1 className="dashboard-section__title">{t("userProfile.dashboardPage.title")}</h1>
      <p className="dashboard-section__subtitle">{greeting}</p>
    </header>
  );
}
