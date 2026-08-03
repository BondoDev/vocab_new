import { useEffect, useState } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import {
  DEFAULT_DAILY_GOAL,
  readStoredUserProfile,
  readSupabaseUserProfile,
} from "../../../../lib/userProfile";
import { readTodayNewWordsCompleted } from "../../../../lib/newWordProgress";
import { getLocalCalendarDateISO } from "../../../../data/learning/localStudyDate";
import { computeTodayProgressDisplay } from "../../../../data/learning/todayProgressDisplay";

const RING_RADIUS = 32;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// Ensures a sliver of accent color is always visible at the ring's start,
// even at 0 progress, so it never reads as fully inactive. Only the ring
// uses this floor — the horizontal bar below shows a genuinely empty
// track at 0%, matching that layout's own design.
const MIN_VISIBLE_ARC_RATIO = 0.03;

// Own self-contained load, matching DailyGoalSelector's precedent in this
// same section: reads its own copy of the authenticated profile (for
// target language + daily goal) rather than depending on prop threading
// from App.tsx, and its own read of today's new-word count via Phase 1/3's
// existing readTodayNewWordsCompleted helper — no new Supabase query shape
// is introduced here.
type LoadState =
  | { status: "loading" }
  | { status: "ready"; completed: number; goal: number };

// Below ~1184px the card switches from the circular ring to a horizontal
// strip (see learning-section.scss); both variants are driven by this one
// progressRatio/srLabel pair rather than duplicating the calculation, and
// only one is ever visible — the other is `display: none`, which also
// removes it from the accessibility tree automatically.
export function TodayProgressCard() {
  const { t } = useLanguage();
  const { authUserId } = useAuthSession();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!authUserId) {
      // Signed-out visitor: trivially "0 of the default goal" — there is no
      // account to read progress from, and this must never crash the page.
      setState({ status: "ready", completed: 0, goal: DEFAULT_DAILY_GOAL });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });
    const storedProfile = readStoredUserProfile(authUserId);

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        const supabaseProfile = session ? await readSupabaseUserProfile(session) : null;
        if (cancelled) return;

        const targetLanguage = supabaseProfile?.practiceLanguage || storedProfile?.practiceLanguage || "";
        const goal = supabaseProfile?.dailyGoal ?? storedProfile?.dailyGoal ?? DEFAULT_DAILY_GOAL;

        if (!session || !targetLanguage) {
          // No usable session or no target language chosen yet — same "safe
          // fallback, not a crash" contract as a signed-out visitor.
          setState({ status: "ready", completed: 0, goal });
          return;
        }

        const completed = await readTodayNewWordsCompleted(session, targetLanguage, getLocalCalendarDateISO());
        if (cancelled) return;
        setState({ status: "ready", completed, goal });
      } catch (error) {
        if (cancelled) return;
        console.warn("TodayProgressCard: failed to load today's progress.", error);
        setState({ status: "ready", completed: 0, goal: storedProfile?.dailyGoal ?? DEFAULT_DAILY_GOAL });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId]);

  const isLoading = state.status === "loading";
  const completed = state.status === "ready" ? state.completed : 0;
  const goal = state.status === "ready" ? state.goal : DEFAULT_DAILY_GOAL;
  const display = computeTodayProgressDisplay(completed, goal);

  if (display.hasInvalidGoal && !isLoading) {
    console.warn(`TodayProgressCard: invalid daily goal "${goal}" — falling back to a 0% ring.`);
  }

  const ringDisplayRatio = Math.max(display.progressRatio, MIN_VISIBLE_ARC_RATIO);
  const ringOffset = RING_CIRCUMFERENCE * (1 - ringDisplayRatio);
  // progressRatio is already clamped to 1 exactly when completed >= goal
  // (and 0 for an invalid/missing goal — see computeTodayProgressDisplay),
  // so this is also the "goal reached" signal for the ring/bar color.
  const isGoalComplete = !isLoading && display.progressRatio >= 1;

  const title = t("userProfile.learningSection.todayProgress.title");
  const ofWord = t("userProfile.learningSection.todayProgress.aria.of");
  const srLabel = isLoading
    ? `${title}. ${t("userProfile.learningSection.todayProgress.aria.loading")}`
    : `${title}. ${display.completed} ${ofWord} ${display.goal} ${t(
        "userProfile.learningSection.todayProgress.aria.dailyWordsCompleted",
      )}.`;

  return (
    <div
      className={`learning-kpi-card today-progress-card ${isLoading ? "today-progress-card--loading" : ""} ${
        isGoalComplete ? "today-progress-card--complete" : ""
      }`}
    >
      <div className="today-progress-card__circular">
        <p className="learning-kpi-card__title today-progress-card__title">{title}</p>

        <div
          className="today-progress-card__ring-wrap"
          role="progressbar"
          aria-busy={isLoading}
          aria-valuenow={isLoading ? undefined : display.completed}
          aria-valuemin={0}
          aria-valuemax={isLoading ? undefined : display.goal}
          aria-label={srLabel}
        >
          <svg className="today-progress-card__ring" viewBox="0 0 80 80" aria-hidden="true">
            <circle className="today-progress-card__ring-track" cx="40" cy="40" r={RING_RADIUS} />
            {isLoading ? null : (
              <circle
                className="today-progress-card__ring-fill"
                cx="40"
                cy="40"
                r={RING_RADIUS}
                transform="rotate(-90 40 40)"
                style={{
                  strokeDasharray: RING_CIRCUMFERENCE,
                  strokeDashoffset: ringOffset,
                }}
              />
            )}
          </svg>
          <div className="today-progress-card__ring-value" aria-hidden="true">
            {isLoading ? (
              <span className="today-progress-card__skeleton today-progress-card__skeleton--ring" />
            ) : (
              <>
                <span className="today-progress-card__ring-completed">{display.completed}</span>
                <span className="today-progress-card__ring-goal">
                  <span className="today-progress-card__ring-goal-label">{ofWord}</span>{" "}
                  <span className="today-progress-card__ring-goal-value">{display.goal}</span>
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="today-progress-card__horizontal">
        <div className="today-progress-card__horizontal-header">
          <p className="learning-kpi-card__title today-progress-card__horizontal-title">{title}</p>
          {isLoading ? (
            <span className="today-progress-card__skeleton today-progress-card__skeleton--text" aria-hidden="true" />
          ) : (
            <p className="today-progress-card__horizontal-ratio">
              <span className="today-progress-card__horizontal-completed">{display.completed}</span>
              <span className="today-progress-card__horizontal-meta">
                {" "}
                {ofWord} {display.goal} {t("userProfile.learningSection.todayProgress.wordsUnit")}
              </span>
            </p>
          )}
        </div>

        <div
          className="today-progress-card__horizontal-track"
          role="progressbar"
          aria-busy={isLoading}
          aria-valuenow={isLoading ? undefined : display.completed}
          aria-valuemin={0}
          aria-valuemax={isLoading ? undefined : display.goal}
          aria-label={srLabel}
        >
          <div
            className="today-progress-card__horizontal-fill"
            style={{ width: isLoading ? "0%" : `${display.progressRatio * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
