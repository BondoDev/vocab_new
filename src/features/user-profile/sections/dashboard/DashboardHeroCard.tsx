import { Flame, NotebookPen, Target } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { interpolateTemplate } from "../../../../lib/interpolateTemplate";
import type { UserProfile } from "../../../../lib/userProfile";
import type { UserWordProgressFullRow } from "../../../../lib/newWordProgress";
import type { ProfileSharedDataStatus } from "../useProfileSharedProgressData";
import type { UserProfileSectionId } from "../../components/UserProfileSidebar";
import { computeTodayProgressDisplay } from "../../../../data/learning/todayProgressDisplay";
import { computeDailyStreakSummary, type DailyStreakSummary } from "../../../../data/learning/dailyStreak";
import { useDashboardHeroData } from "./useDashboardHeroData";
import { resolveDashboardHeroCta, type DashboardHeroCtaKind } from "./dashboardHeroCta";

// Owned by public/images/user-profile/dashboard/ (already in the repo — see
// that folder). Not generated or modified by this phase.
const ROCKET_IMAGE_SRC = "/images/user-profile/dashboard/dashboard-image.png";
const ROCKET_MOBILE_IMAGE_SRC = "/images/user-profile/dashboard/dashboard-image-mobile.png";

const EMPTY_STREAK_SUMMARY: DailyStreakSummary = { currentStreakDays: 0, bestStreakDays: 0, currentWeek: [] };

// Reuses the exact same title/button copy already localized for the
// Learning page's Start Learning / Review Words mode cards
// (userProfile.learningSection.modeCards.modes.*) wherever the required
// text is identical, per the Phase brief's "only add new translations for
// genuinely new Dashboard-specific copy." Only Continue Learning's title
// (reused verbatim as its own button label too, since Case 1 specifies the
// same text for both) is genuinely new to the Dashboard.
const CTA_TITLE_KEY: Record<DashboardHeroCtaKind, string> = {
  continueLearning: "userProfile.dashboardPage.hero.continueLearning.title",
  reviewWords: "userProfile.learningSection.modeCards.modes.reviewWords.title",
  startLearning: "userProfile.learningSection.modeCards.modes.studyNewWords.buttonLabel",
};

const CTA_BUTTON_KEY: Record<DashboardHeroCtaKind, string> = {
  continueLearning: "userProfile.dashboardPage.hero.continueLearning.title",
  reviewWords: "userProfile.learningSection.modeCards.modes.reviewWords.buttonLabel",
  startLearning: "userProfile.learningSection.modeCards.modes.studyNewWords.buttonLabel",
};

interface DashboardHeroCardProps {
  // The Dashboard's single shared profile load (see App.tsx's
  // useUserProfileLoad, threaded through UserProfileDashboardPage) — only
  // dailyGoal/practiceLanguage are read here, never a second profile fetch.
  userProfile: UserProfile;
  isProfileLoaded: boolean;
  // UserProfileDashboardPage's shared useProfileSharedProgressData values —
  // this card reads them, never fetches its own copy of either.
  todayISO: string | null;
  todayISOStatus: ProfileSharedDataStatus;
  wordProgressRows: UserWordProgressFullRow[];
  wordProgressStatus: ProfileSharedDataStatus;
  onNavigateToSection?: (section: UserProfileSectionId) => void;
}

// Dashboard Phase 2's first hero section: one unified card combining
// compact Today stats (left), the rocket illustration (center), and a
// dynamic next-action CTA (right) — see resolveDashboardHeroCta for the
// Continue Learning / Review Words / Start Learning decision. Deliberately
// does not implement charts, milestones, recent activity, or a weekly
// words card — those are later Dashboard phases.
export function DashboardHeroCard({
  userProfile,
  isProfileLoaded,
  todayISO,
  todayISOStatus,
  wordProgressRows,
  wordProgressStatus,
  onNavigateToSection,
}: DashboardHeroCardProps) {
  const { t } = useLanguage();
  const heroData = useDashboardHeroData({
    isProfileLoaded,
    practiceLanguage: userProfile.practiceLanguage,
    todayISO,
    todayISOStatus,
  });

  // "blocked" (shared todayISO failed) renders identically to "loading" —
  // same restrained skeleton, matching TodayProgressCard/DailyStreakCard's
  // own precedent. "error" (this card's own read failed) is handled
  // separately below: it still renders real content, just a neutral one —
  // see the Phase brief's Error Behavior section.
  const isLoading = heroData.status === "loading" || heroData.status === "blocked";
  const isErrored = heroData.status === "error";
  const isTodayDataTrusted = heroData.status === "ready";

  const todayDisplay = computeTodayProgressDisplay(
    isTodayDataTrusted ? heroData.completedToday : 0,
    userProfile.dailyGoal,
  );
  const streakSummary: DailyStreakSummary =
    isTodayDataTrusted && todayISO
      ? computeDailyStreakSummary(heroData.streakStats, todayISO)
      : EMPTY_STREAK_SUMMARY;

  // Assume "has progress" (true) unless the shared word-progress read has
  // positively confirmed otherwise — see resolveDashboardHeroCta's own
  // comment on why this must never guess "no vocabulary" from a read that
  // simply hasn't finished yet.
  const hasAnyWordProgress = wordProgressStatus !== "ready" || wordProgressRows.length > 0;

  const cta = resolveDashboardHeroCta({
    isTodayDataTrusted,
    completed: todayDisplay.completed,
    goal: todayDisplay.goal,
    hasInvalidGoal: todayDisplay.hasInvalidGoal,
    hasAnyWordProgress,
  });

  const ctaMessage =
    cta.kind === "continueLearning" && cta.remaining !== null
      ? interpolateTemplate(t("userProfile.dashboardPage.hero.continueLearning.message"), {
          count: String(cta.remaining),
        })
      : cta.kind === "reviewWords"
        ? t("userProfile.dashboardPage.hero.reviewWords.message")
        : null;

  const handleCtaClick = () => onNavigateToSection?.("learning");

  const wordsUnit = t("userProfile.learningSection.todayProgress.wordsUnit");
  const wordsLearnedLabel = t("userProfile.dashboardPage.hero.stats.wordsLearnedLabel");

  return (
    <section className="dashboard-hero" aria-label={t("userProfile.dashboardPage.hero.ariaLabel")}>
      <div className="dashboard-hero__stats">
        <p className="dashboard-hero__kicker">{t("userProfile.dashboardPage.hero.todayLabel")}</p>

        {/* Horizontal row on wide screens (see dashboard-section.scss) — a
            layout/markup grouping only, the three stats below are the same
            three metrics with the same values as before. */}
        <div className="dashboard-hero__stat-row">
          <div className="dashboard-hero__stat">
            <span className="dashboard-hero__stat-icon" aria-hidden="true">
              <NotebookPen size={16} strokeWidth={2} />
            </span>
            <div className="dashboard-hero__stat-body">
              {isLoading ? (
                <span className="dashboard-hero__skeleton dashboard-hero__skeleton--value" aria-hidden="true" />
              ) : (
                <p className="dashboard-hero__stat-value">
                  {isErrored ? "—" : todayDisplay.completed}
                  <span className="dashboard-hero__stat-sep">/</span>
                  {isErrored ? "—" : todayDisplay.goal}
                </p>
              )}
              <p className="dashboard-hero__stat-label">{wordsLearnedLabel}</p>
              <div
                className="dashboard-hero__progress-track"
                role="progressbar"
                aria-busy={isLoading}
                aria-valuenow={isLoading || isErrored ? undefined : todayDisplay.completed}
                aria-valuemin={0}
                aria-valuemax={isLoading || isErrored ? undefined : todayDisplay.goal}
                aria-label={wordsLearnedLabel}
              >
                <div
                  className="dashboard-hero__progress-fill"
                  style={{ width: isLoading || isErrored ? "0%" : `${todayDisplay.progressRatio * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="dashboard-hero__stat">
            <span className="dashboard-hero__stat-icon" aria-hidden="true">
              <Flame size={16} strokeWidth={2} />
            </span>
            <div className="dashboard-hero__stat-body">
              {isLoading ? (
                <span className="dashboard-hero__skeleton dashboard-hero__skeleton--value" aria-hidden="true" />
              ) : (
                <p className="dashboard-hero__stat-value">{isErrored ? "—" : streakSummary.currentStreakDays}</p>
              )}
              <p className="dashboard-hero__stat-label">{t("userProfile.dashboardPage.hero.stats.dayStreakLabel")}</p>
            </div>
          </div>

          <div className="dashboard-hero__stat">
            <span className="dashboard-hero__stat-icon" aria-hidden="true">
              <Target size={16} strokeWidth={2} />
            </span>
            <div className="dashboard-hero__stat-body">
              <p className="dashboard-hero__stat-value dashboard-hero__stat-value--goal">
                {userProfile.dailyGoal} <span className="dashboard-hero__stat-unit">{wordsUnit}</span>
              </p>
              <p className="dashboard-hero__stat-label">{t("userProfile.dashboardPage.hero.stats.goalLabel")}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-hero__art">
        {/* Decorative only — the hero's meaning is fully carried by the
            title/stats/CTA text around it, so this stays alt="" rather than
            a verbose description (see the Phase brief's Accessibility
            section). */}
        <picture>
          <source srcSet={ROCKET_MOBILE_IMAGE_SRC} media="(max-width: 501.98px)" />
          <img
            className="dashboard-hero__rocket"
            src={ROCKET_IMAGE_SRC}
            alt=""
            loading="lazy"
            decoding="async"
          />
        </picture>
      </div>

      <div className="dashboard-hero__cta">
        {isLoading ? (
          <>
            <span className="dashboard-hero__skeleton dashboard-hero__skeleton--title" aria-hidden="true" />
            <span className="dashboard-hero__skeleton dashboard-hero__skeleton--message" aria-hidden="true" />
            <span className="dashboard-hero__skeleton dashboard-hero__skeleton--button" aria-hidden="true" />
          </>
        ) : (
          <>
            <h2 className="dashboard-hero__cta-title">{t(CTA_TITLE_KEY[cta.kind])}</h2>
            {ctaMessage ? <p className="dashboard-hero__cta-message">{ctaMessage}</p> : null}
            <button type="button" className="dashboard-hero__cta-button" onClick={handleCtaClick}>
              {t(CTA_BUTTON_KEY[cta.kind])}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
