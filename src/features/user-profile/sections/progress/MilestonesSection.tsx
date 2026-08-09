import { useEffect, useId, useState } from "react";
import { ChevronDown, Trophy } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import { useAuthSession } from "../../../../app/hooks/useAuthSession";
import { getStoredSupabaseSession } from "../../../../lib/supabaseAuth";
import { getCurrentLearningDate } from "../../../../lib/learningDate";
import { describeSupabaseError } from "../../../../lib/supabaseError";
import type { UserProfile } from "../../../../lib/userProfile";
import {
  MILESTONE_TRACK_IDS,
  evaluateAllMilestoneTracks,
  type MilestoneTrackId,
  type MilestoneTrackResult,
  type MilestoneResults,
} from "../../../../data/learning/milestones";
import { loadMilestoneMetrics } from "./loadMilestoneMetrics";
import { MilestoneAccordionRow, TRACK_CONFIGS } from "./MilestoneAccordionRow";
import "./progress-section.scss";

// Same "safe zero state" contract every other Learning/Vocabulary card
// follows for a signed-out visitor or a not-yet-chosen target language —
// never a crash, never an error banner for a legitimate empty state.
const ZERO_RESULTS: MilestoneResults = evaluateAllMilestoneTracks({
  learnedWords: 0,
  masteredWords: 0,
  totalReviews: 0,
  currentStreakDays: 0,
});

const MILESTONE_ROW_TRACK_IDS: readonly MilestoneTrackId[] = [
  "vocabulary",
  "reviews",
  "mastery",
  "consistency",
];

type LoadState =
  | { status: "loading" }
  | { status: "ready"; results: MilestoneResults }
  | { status: "error" };

interface MilestonesSectionProps {
  // Same shared-profile-load contract as LearningSection/VocabularySection
  // (App.tsx's single useUserProfileLoad, threaded down as props) — this
  // component fetches no profile of its own.
  userProfile: UserProfile;
  isProfileLoaded: boolean;
}

// Level 1 of the two-level accordion (Progress page -> Milestones section
// -> milestone track -> milestone path): the whole Milestones section is
// itself a single collapsed-by-default disclosure, so a Progress page with
// several future sections (Vocabulary Growth, Learning Calendar, Activity
// Charts — see the redesign brief) isn't dominated by milestones the
// moment it loads. Collapsed, the trigger is a two-zone header (see
// progress-section.scss's `.milestones-section__header-row`, a named-area
// CSS grid): a left zone (icon/title/subtitle, ~35-40% wide on desktop)
// and a right zone holding one compact statistic per track (see
// MilestoneSummaryStat below — label, current/target value, and a hairline
// progress bar, no icon/pill/card) plus a large circular chevron button at
// the far right. No track rows, no paths — those stay inside the panel.
// Expanding it reveals Level 2: the four per-track rows
// (MilestoneAccordionRow), each independently expandable exactly as before
// (only one open at a time) — that machinery is unchanged from the
// previous redesign.
//
// Reusable by both the Progress section (this Phase's only wired-in host)
// and a future Dashboard page — this component owns its own
// current-learning-date fetch (getCurrentLearningDate) rather than
// depending on LearningSection's, since it has no sibling cards to share
// that date with here; see loadMilestoneMetrics.ts for why todayISO is only
// needed for the Consistency track's streak walk.
export function MilestonesSection({ userProfile, isProfileLoaded }: MilestonesSectionProps) {
  const { t, uiLanguage } = useLanguage();
  const { authUserId } = useAuthSession();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);
  // Level 1: is the whole Milestones section open. Collapsed by default.
  const [isSectionExpanded, setIsSectionExpanded] = useState(false);
  // Level 2: which single track (if any) is open inside it. Reset to null
  // whenever Level 1 collapses, so reopening the section always starts
  // from every track collapsed again, matching the brief's own "Default:
  // ▶ Vocabulary ▶ Mastery ▶ Reviews ▶ Consistency" illustration.
  const [expandedTrack, setExpandedTrack] = useState<MilestoneTrackId | null>(null);
  const sectionPanelId = useId();

  const targetLanguage = userProfile.practiceLanguage;

  useEffect(() => {
    if (!authUserId) {
      setState({ status: "ready", results: ZERO_RESULTS });
      return;
    }

    if (!isProfileLoaded) {
      setState({ status: "loading" });
      return;
    }

    if (!targetLanguage) {
      setState({ status: "ready", results: ZERO_RESULTS });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const session = getStoredSupabaseSession();
        if (!session) {
          if (!cancelled) setState({ status: "ready", results: ZERO_RESULTS });
          return;
        }

        const todayISO = await getCurrentLearningDate(session);
        const results = await loadMilestoneMetrics({ session, targetLanguage, todayISO });
        if (cancelled) return;
        setState({ status: "ready", results });
      } catch (error) {
        if (cancelled) return;
        console.warn("MilestonesSection: failed to load milestone metrics.", describeSupabaseError("loadMilestoneMetrics", error));
        setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authUserId, isProfileLoaded, targetLanguage, retryToken]);

  const isError = state.status === "error";
  const results = state.status === "ready" ? state.results : null;
  const isLoading = results === null && !isError;

  const handleToggleSection = () => {
    setIsSectionExpanded((current) => {
      const next = !current;
      if (!next) {
        setExpandedTrack(null);
      }
      return next;
    });
  };

  return (
    <section className="milestones-section" aria-label={t("userProfile.progressSection.title")}>
      <h2 className="milestones-section__heading">
        <button
          type="button"
          className="milestones-section__trigger"
          aria-expanded={isSectionExpanded}
          aria-controls={sectionPanelId}
          onClick={handleToggleSection}
        >
          <span className="milestones-section__header-row">
            <span className="milestones-section__zone-left">
              <span className="milestones-section__title-row">
                <span className="milestones-section__icon" aria-hidden="true">
                  <Trophy size={18} strokeWidth={2} />
                </span>
                <span className="milestones-section__title">{t("userProfile.progressSection.title")}</span>
              </span>
              <span className="milestones-section__subtitle">{t("userProfile.progressSection.subtitle")}</span>
            </span>

            {isLoading ? (
              <span className="milestones-section__stats-skeleton" aria-hidden="true" />
            ) : !isError ? (
              <span className="milestones-section__stats">
                {MILESTONE_TRACK_IDS.map((track) => (
                  <MilestoneSummaryStat key={track} track={track} result={(results ?? ZERO_RESULTS)[track]} uiLanguage={uiLanguage} t={t} />
                ))}
              </span>
            ) : null /* Error state: the panel's own error/retry block already
                         explains what happened — the collapsed row just stays
                         quiet rather than showing stale or placeholder numbers,
                         and the "stats" grid area simply stays empty. */}

            <span className="milestones-section__chevron-button" aria-hidden="true">
              <ChevronDown
                strokeWidth={2.5}
                className={`milestones-section__chevron ${isSectionExpanded ? "milestones-section__chevron--open" : ""}`}
              />
            </span>
          </span>
        </button>
      </h2>

      <div
        id={sectionPanelId}
        role="region"
        aria-label={t("userProfile.progressSection.title")}
        className={`milestones-section__panel ${isSectionExpanded ? "milestones-section__panel--open" : ""}`}
      >
        <div className="milestones-section__panel-inner">
          {isError ? (
            <div className="milestones-section__error" role="status">
              <p className="milestones-section__error-text">{t("userProfile.progressSection.loadError")}</p>
              <button
                type="button"
                className="milestones-section__error-retry"
                onClick={() => setRetryToken((token) => token + 1)}
              >
                {t("userProfile.progressSection.retryButton")}
              </button>
            </div>
          ) : (
            <div className="milestones-accordion" aria-busy={isLoading}>
              {MILESTONE_ROW_TRACK_IDS.map((track) => (
                <MilestoneAccordionRow
                  key={track}
                  track={track}
                  result={results?.[track] ?? null}
                  isExpanded={expandedTrack === track}
                  onToggle={() => setExpandedTrack((current) => (current === track ? null : track))}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

interface MilestoneSummaryStatProps {
  track: MilestoneTrackId;
  result: MilestoneTrackResult;
  uiLanguage: string;
  t: (key: string) => string;
}

// One compact statistic per track in the collapsed header's right zone —
// a small icon + muted label on top, a larger semibold current/target
// value, and a real progress bar (not a decorative rule) tinted with the
// track's own subtle accent color. Reuses TRACK_CONFIGS's icon (the exact
// same Library/Award/Repeat/CalendarCheck the expanded row below already
// uses) so this can never drift out of sync — no new icon dependency.
// Deliberately no pill/card chrome around it (see the redesign brief's
// Summary Design section): the icon is decorative (aria-hidden) since the
// visible category label right next to it already identifies the track
// for both sighted and screen-reader users — icons alone are never the
// sole means of identifying a category here.
//
// `current` is clamped to `target` for display only (same technique the
// original card's aria-valuenow already used) — a completed track reads
// "10,000 / 10,000" rather than a numerator that visually exceeds its own
// denominator. `progress`/`clampedCurrent` are read directly from the
// already-computed MilestoneTrackResult (0-1, clamped by the unchanged
// engine) — nothing here recomputes a ratio; the bar's width and its
// role="progressbar" aria-value* attributes are driven by that exact same
// number, so the bar is a real (if compact) progress indicator rather
// than a static accent line.
function MilestoneSummaryStat({ track, result, uiLanguage, t }: MilestoneSummaryStatProps) {
  const config = TRACK_CONFIGS[track];
  const Icon = config.icon;
  const clampedCurrent = Math.min(result.currentValue, result.target);
  const current = clampedCurrent.toLocaleString(uiLanguage);
  const target = result.target.toLocaleString(uiLanguage);
  const unitLabel = t(result.currentValue === 1 ? config.unitSingularKey : config.unitPluralKey);
  const barLabel = `${t(config.titleKey)}: ${current} ${t("userProfile.progressSection.ofLabel")} ${target} ${unitLabel}`;

  return (
    <span className={`milestones-section__stat milestones-section__stat--${config.variant}`}>
      <span className="milestones-section__stat-top">
        <Icon className="milestones-section__stat-icon" size={12} strokeWidth={2.25} aria-hidden="true" />
        <span className="milestones-section__stat-label">{t(config.titleKey)}</span>
      </span>
      <span className="milestones-section__stat-value">
        {current} / {target}
      </span>
      <span
        className="milestones-section__stat-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={result.target}
        aria-valuenow={clampedCurrent}
        aria-label={barLabel}
      >
        <span className="milestones-section__stat-bar-fill" style={{ width: `${result.progress * 100}%` }} />
      </span>
    </span>
  );
}
