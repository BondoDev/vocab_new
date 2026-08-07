import { useEffect, useState } from "react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import type { UserProfile } from "../../../../lib/userProfile";
import { readTodayNewWordsCompleted } from "../../../../lib/newWordProgress";
import { describeSupabaseError } from "../../../../lib/supabaseError";
import { computeTodayProgressDisplay } from "../../../../data/learning/todayProgressDisplay";

const RING_RADIUS = 32;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
// Ensures a sliver of accent color is always visible at the ring's start,
// even at 0 progress, so it never reads as fully inactive. Only the ring
// uses this floor — the horizontal bar below shows a genuinely empty
// track at 0%, matching that layout's own design.
const MIN_VISIBLE_ARC_RATIO = 0.03;

// practiceLanguage/dailyGoal come from the Learning dashboard's single
// shared profile load (see App.tsx's useUserProfileLoad, threaded down
// through LearningSection) rather than a copy fetched by this component;
// todayISO/todayISOStatus come from LearningSection's own single
// getCurrentLearningDate() call (see that file's header) — this component
// no longer calls getCurrentLearningDate itself. Only today's new-word
// count (readTodayNewWordsCompleted) is this component's own request.
//
// "blocked" (distinct from "loading") is what this card enters when
// todayISOStatus is "error": LearningSection's shared date request failed
// and already shows the one parent-level error/retry banner, so this card
// must neither perform its own read against a date it doesn't have, nor
// present a successful "0 completed" as though it were real data — a
// failed date fetch is not equivalent to zero progress. Rendering-wise
// "blocked" is treated the same as "loading" (see isLoading below): a
// neutral skeleton placeholder, never the numeric ring/bar.
type LoadState = { status: "loading" } | { status: "ready"; completed: number } | { status: "blocked" };

interface TodayProgressCardProps {
  practiceLanguage: UserProfile["practiceLanguage"];
  dailyGoal: UserProfile["dailyGoal"];
  isProfileLoaded: boolean;
  // The authoritative current learning date, owned and fetched exactly
  // once by LearningSection. null whenever todayISOStatus isn't "ready".
  todayISO: string | null;
  // LearningSection's own LearningDateState.status, passed straight
  // through:
  //   "loading"     — the shared date request (or the profile load it
  //                    waits on) is still in flight; this card mirrors it.
  //   "ready"       — todayISO is populated; this card performs its own
  //                    statistics read once practiceLanguage is also known.
  //   "unavailable" — legitimately no session (signed out, or auth/profile
  //                    not ready) — the existing safe "0 completed"
  //                    fallback applies, same as before this contract
  //                    changed.
  //   "error"       — the shared date request genuinely failed. This card
  //                    must not run its own read and must not present a
  //                    "0 completed" result as if it were successfully
  //                    loaded data — see "blocked" above.
  todayISOStatus: "loading" | "ready" | "unavailable" | "error";
}

// Below ~1184px the card switches from the circular ring to a horizontal
// strip (see learning-section.scss); both variants are driven by this one
// progressRatio/srLabel pair rather than duplicating the calculation, and
// only one is ever visible — the other is `display: none`, which also
// removes it from the accessibility tree automatically.
export function TodayProgressCard({
  practiceLanguage,
  dailyGoal,
  isProfileLoaded,
  todayISO,
  todayISOStatus,
}: TodayProgressCardProps) {
  const { t } = useLanguage();
  const { authUserId } = useAuthSession();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    if (!authUserId) {
      // Signed-out visitor: trivially "0 of the default goal" — there is no
      // account to read progress from, and this must never crash the page.
      setState({ status: "ready", completed: 0 });
      return;
    }

    if (!isProfileLoaded || todayISOStatus === "loading") {
      // The shared profile load (App.tsx) or LearningSection's shared
      // date load is still in flight — wait for both rather than fetching
      // with a not-yet-known target language or date.
      setState({ status: "loading" });
      return;
    }

    if (todayISOStatus === "error") {
      // LearningSection's shared date request genuinely failed — it
      // already shows the one parent-level error/retry banner. This card
      // must not attempt its own read (there is no date to read with), and
      // must not present a "0 completed" result as though it were
      // successfully loaded data: a failed date fetch is not the same as
      // zero progress. See "blocked" in LoadState above.
      setState({ status: "blocked" });
      return;
    }

    if (!practiceLanguage || !todayISO) {
      // Profile loaded, but no target language chosen yet, or
      // todayISOStatus is "unavailable" (signed out / no session — a
      // legitimate, expected state, not a failure) — same "safe fallback,
      // not a crash" contract as a signed-out visitor.
      setState({ status: "ready", completed: 0 });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) setState({ status: "ready", completed: 0 });
          return;
        }

        const completed = await readTodayNewWordsCompleted(session, practiceLanguage, todayISO);
        if (cancelled) return;
        setState({ status: "ready", completed });
      } catch (error) {
        if (cancelled) return;
        console.warn(
          "TodayProgressCard: failed to load today's progress.",
          describeSupabaseError("readTodayNewWordsCompleted", error),
        );
        setState({ status: "ready", completed: 0 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, isProfileLoaded, practiceLanguage, todayISO, todayISOStatus]);

  // Covers both a genuine in-flight fetch ("loading") and a parent-level
  // date error this card can't act on ("blocked") — both render the same
  // neutral skeleton placeholder below, never the numeric ring/bar/count.
  const isLoading = state.status !== "ready";
  const completed = state.status === "ready" ? state.completed : 0;
  // Read directly from the prop (not cached in state) so a daily-goal
  // change made elsewhere on the page (Daily Goal card) updates this
  // card's ring/bar immediately, without an extra fetch.
  const goal = dailyGoal;
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
