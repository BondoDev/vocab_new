// Pure duration-formatting helper for the Dashboard's Study Activity card
// (summary total, Y-axis labels, tooltip rows). No React, no i18n — this
// module only ever produces the numeric {hours, minutes} parts; the actual
// localized string ("1h 30m" / "1 h 30 min" / etc.) is assembled by the
// component via t()/interpolateTemplate against
// userProfile.dashboardPage.supportingCards.studyActivity.duration.* — see
// StudyActivityCard.tsx. Keeping the numeric part free of i18n lets it stay
// independently unit-tested (scripts/tests/learning/test-study-duration.mjs)
// and lets every locale control its own exact spacing/order/abbreviation
// without touching this module.
//
// "Never display raw seconds" (see the Study Activity brief) is enforced
// here: computeDurationParts always rounds down to whole minutes — a
// duration under 60 seconds renders as 0 minutes, exactly like every other
// sub-minute remainder does, never as a fractional or raw-second value.

export interface StudyDurationParts {
  hours: number;
  minutes: number;
}

// Floors to whole minutes (never raw seconds, never fractional minutes),
// then splits into hours/minutes. Negative/non-finite input is treated as
// zero — this module never produces a negative or NaN part, matching the
// same "safe by construction" precedent as learningTimeStats.ts's own
// parsing.
export function computeDurationParts(totalSeconds: number): StudyDurationParts {
  const safeSeconds = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const totalMinutes = Math.floor(safeSeconds / 60);
  return {
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
  };
}
