import { useId } from "react";
import { Award, CalendarCheck, ChevronDown, Library, Repeat, type LucideIcon } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";
import type { MilestoneTrackId, MilestoneTrackResult } from "../../../../data/learning/milestones";
import { MilestonePath } from "./MilestonePath";

// Same icon choices as Phase 1 — distinct from ones already heavily used
// elsewhere in the profile (BookOpen/BookOpenText already cover
// "vocabulary" concepts on the Vocabulary summary cards and the sidebar).
// Exported so MilestonesSection.tsx's collapsed-header summary chips reuse
// these exact same icons/colors/track-name keys instead of duplicating a
// second copy that could drift out of sync with the expanded rows below.
export interface MilestoneTrackConfig {
  icon: LucideIcon;
  titleKey: string;
  unitSingularKey: string;
  unitPluralKey: string;
  variant: "vocabulary" | "mastery" | "reviews" | "consistency";
}

export const TRACK_CONFIGS: Record<MilestoneTrackId, MilestoneTrackConfig> = {
  vocabulary: {
    icon: Library,
    titleKey: "userProfile.progressSection.tracks.vocabulary",
    unitSingularKey: "userProfile.progressSection.units.word",
    unitPluralKey: "userProfile.progressSection.units.words",
    variant: "vocabulary",
  },
  mastery: {
    icon: Award,
    titleKey: "userProfile.progressSection.tracks.mastery",
    unitSingularKey: "userProfile.progressSection.units.word",
    unitPluralKey: "userProfile.progressSection.units.words",
    variant: "mastery",
  },
  reviews: {
    icon: Repeat,
    titleKey: "userProfile.progressSection.tracks.reviews",
    unitSingularKey: "userProfile.progressSection.units.review",
    unitPluralKey: "userProfile.progressSection.units.reviews",
    variant: "reviews",
  },
  consistency: {
    icon: CalendarCheck,
    titleKey: "userProfile.progressSection.tracks.consistency",
    unitSingularKey: "userProfile.progressSection.units.day",
    unitPluralKey: "userProfile.progressSection.units.days",
    variant: "consistency",
  },
};

interface MilestoneAccordionRowProps {
  track: MilestoneTrackId;
  // null while loading — a stable skeleton row renders instead of a
  // "0 / 100" flash.
  result: MilestoneTrackResult | null;
  isExpanded: boolean;
  onToggle: () => void;
}

// One collapsed-by-default accordion row per track (~72-84px tall — see
// progress-section.scss's `.milestone-row__trigger` min-height). Expanding
// a row reveals the milestone "journey" path (MilestonePath.tsx) plus a
// short next-milestone detail line; collapsing/expanding another row is
// handled by the parent (MilestonesSection.tsx holds the single
// currently-expanded track, never more than one at a time). Follows the
// standard WAI-ARIA disclosure pattern: the trigger is a real <button>
// wrapped in a heading, aria-expanded/aria-controls point at the panel,
// and the panel is `role="region" aria-labelledby` the trigger — the exact
// same accordion mechanics already proven in this app (DailyStreakCard's
// compact accordion, learning-section.scss).
export function MilestoneAccordionRow({ track, result, isExpanded, onToggle }: MilestoneAccordionRowProps) {
  const { t, uiLanguage } = useLanguage();
  const config = TRACK_CONFIGS[track];
  const Icon = config.icon;
  const trackTitle = t(config.titleKey);
  const triggerId = useId();
  const panelId = useId();

  // Early return (rather than branching inline below) so TypeScript
  // narrows `result` to non-null for the rest of this function — the same
  // structure Phase 1's MilestoneCard used. The panel element still exists
  // in the DOM while loading (aria-controls/aria-labelledby stay valid),
  // it just renders nothing inside.
  if (result === null) {
    return (
      <div className={`milestone-row milestone-row--${config.variant} milestone-row--loading`}>
        <h3 className="milestone-row__heading">
          <button
            type="button"
            id={triggerId}
            className="milestone-row__trigger"
            aria-expanded={isExpanded}
            aria-controls={panelId}
            onClick={onToggle}
            disabled
          >
            <span className="milestone-row__icon" aria-hidden="true">
              <Icon size={18} strokeWidth={2} />
            </span>
            <span className="milestone-row__main">
              <span className="milestone-row__title">{trackTitle}</span>
              <span className="milestone-row__skeleton" aria-hidden="true" />
            </span>
            <ChevronDown aria-hidden="true" className="milestone-row__chevron" />
          </button>
        </h3>
        <div id={panelId} role="region" aria-labelledby={triggerId} className="milestone-row__panel" />
      </div>
    );
  }

  return (
    <div className={`milestone-row milestone-row--${config.variant} ${isExpanded ? "milestone-row--expanded" : ""}`}>
      <h3 className="milestone-row__heading">
        <button
          type="button"
          id={triggerId}
          className="milestone-row__trigger"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span className="milestone-row__icon" aria-hidden="true">
            <Icon size={18} strokeWidth={2} />
          </span>

          <span className="milestone-row__main">
            <span className="milestone-row__title">{trackTitle}</span>
            <MilestoneRowSummary result={result} config={config} uiLanguage={uiLanguage} t={t} />
          </span>

          <ChevronDown
            aria-hidden="true"
            className={`milestone-row__chevron ${isExpanded ? "milestone-row__chevron--open" : ""}`}
          />
        </button>
      </h3>

      <div
        id={panelId}
        role="region"
        aria-labelledby={triggerId}
        className={`milestone-row__panel ${isExpanded ? "milestone-row__panel--open" : ""}`}
      >
        <div className="milestone-row__panel-inner">
          <MilestonePath track={track} result={result} />
          <MilestoneRowDetails result={result} config={config} uiLanguage={uiLanguage} t={t} />
        </div>
      </div>
    </div>
  );
}

interface SummaryPieceProps {
  result: MilestoneTrackResult;
  config: MilestoneTrackConfig;
  uiLanguage: string;
  t: (key: string) => string;
}

// The collapsed row's one-line progress readout ("26 / 50 words", or the
// highest milestone title + "Completed") plus the thin decorative progress
// bar underneath it. Neither is aria-hidden: this text becomes part of the
// trigger <button>'s accessible name automatically (accessible-name-from-
// content), exactly the same as DailyStreakCard's own compact accordion
// trigger, which likewise leaves its value span unhidden alongside the
// title and only marks the chevron icon aria-hidden. The bar itself has no
// text content, so it contributes nothing extra either way.
function MilestoneRowSummary({ result, config, uiLanguage, t }: SummaryPieceProps) {
  const { currentValue, target, progress, isTrackComplete, previousMilestone } = result;

  if (isTrackComplete) {
    return (
      <span className="milestone-row__progress-line milestone-row__progress-line--complete">
        {t(`userProfile.progressSection.milestones.${previousMilestone!.id}`)} · {t("userProfile.progressSection.completedLabel")}
      </span>
    );
  }

  const unitLabel = t(currentValue === 1 ? config.unitSingularKey : config.unitPluralKey);

  return (
    <>
      <span className="milestone-row__progress-line">
        {currentValue.toLocaleString(uiLanguage)} / {target.toLocaleString(uiLanguage)} {unitLabel}
      </span>
      <span className="milestone-row__bar">
        <span className="milestone-row__bar-fill" style={{ width: `${progress * 100}%` }} />
      </span>
    </>
  );
}

// The concise text under the expanded path: which milestone is next (or
// that the track is complete) plus the same current/target readout already
// shown collapsed, and — when one exists — the small persistent "previous
// milestone reached" line carried over from Phase 1's card design.
function MilestoneRowDetails({ result, config, uiLanguage, t }: SummaryPieceProps) {
  const { currentValue, target, previousMilestone, nextMilestone, isTrackComplete } = result;

  if (isTrackComplete) {
    return (
      <p className="milestone-row__details milestone-row__details--complete">
        {t(`userProfile.progressSection.milestones.${previousMilestone!.id}`)} · {t("userProfile.progressSection.completedLabel")}
      </p>
    );
  }

  const unitLabel = t(currentValue === 1 ? config.unitSingularKey : config.unitPluralKey);
  const reachedLabel = previousMilestone
    ? `${t(`userProfile.progressSection.milestones.${previousMilestone.id}`)} — ${t(
        "userProfile.progressSection.milestoneReachedLabel",
      )}`
    : null;

  return (
    <div className="milestone-row__details">
      <p className="milestone-row__next">
        <span className="milestone-row__next-label">{t("userProfile.progressSection.nextMilestoneLabel")}</span>{" "}
        <span className="milestone-row__next-title">{t(`userProfile.progressSection.milestones.${nextMilestone!.id}`)}</span>
      </p>
      <p className="milestone-row__ratio">
        {currentValue.toLocaleString(uiLanguage)} {t("userProfile.progressSection.ofLabel")} {target.toLocaleString(uiLanguage)}{" "}
        {unitLabel}
      </p>
      {reachedLabel ? <p className="milestone-row__reached">{reachedLabel}</p> : null}
    </div>
  );
}
