import { useSyncExternalStore, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, Expand, Shrink, type LucideIcon } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import {
  isSessionToggleExpanded,
  subscribeSessionExpanded,
  toggleSessionExpanded,
} from "../../../app/utils/immersiveSession";

// Shared session header rail, used by Custom Practice (PracticeHeader),
// Review Words (ReviewSession), and Study New Words (NewWordStudySession). Styles live in ../styles/exercises.scss under
// .practice-session-header. All three slots share one 36px rail: the language
// chip is a quiet white surface, and the start-slot action (Finish) uses
// .practice-header-button(--finish) as the only tinted element. The
// 1fr/auto/1fr grid keeps the language chip centered in the viewport regardless
// of how wide the side slots render in a given UI language.

interface SessionHeaderProps {
  // Either slot may be empty; both still render so the language chip stays
  // centered.
  start?: ReactNode;
  end?: ReactNode;
  fromLanguageName: string;
  toLanguageName: string;
  fromLanguageCode: string;
  toLanguageCode: string;
  // Drops the header's own outer padding for hosts that already pad their
  // content column (Review Words' .review-session).
  inset?: boolean;
}

export function SessionHeader({
  start,
  end,
  fromLanguageName,
  toLanguageName,
  fromLanguageCode,
  toLanguageCode,
  inset = false,
}: SessionHeaderProps) {
  return (
    <header
      className={`practice-session-header immersive-session-header${
        inset ? " practice-session-header--inset" : ""
      }`}
    >
      <div className="practice-session-header__inner">
        <div className="practice-session-header__start">{start}</div>

        <div
          className="practice-header-chip practice-language-pill"
          title={`${fromLanguageName} → ${toLanguageName}`}
        >
          {/* Full names on wider screens, ISO codes ("en → de") on phones;
              the swap is CSS-only, so screen readers get the sr-only full
              names below instead of either visual variant. */}
          <span
            className="practice-language-pill__name practice-language-pill__name--from"
            aria-hidden="true"
          >
            <span className="practice-language-pill__full">{fromLanguageName}</span>
            <span className="practice-language-pill__code">{fromLanguageCode}</span>
          </span>
          <ArrowRight className="practice-language-pill__arrow" aria-hidden="true" />
          <span
            className="practice-language-pill__name practice-language-pill__name--to"
            aria-hidden="true"
          >
            <span className="practice-language-pill__full">{toLanguageName}</span>
            <span className="practice-language-pill__code">{toLanguageCode}</span>
          </span>
          <span className="sr-only">{`${fromLanguageName} → ${toLanguageName}`}</span>
        </div>

        <div className="practice-session-header__end">{end}</div>
      </div>
    </header>
  );
}

// Expand/collapse control for the running session on any device (sessions
// start expanded on phones, normal elsewhere). Must sit inside an
// ImmersiveSessionFrame, whose mount sets the initial mode.
export function SessionFullscreenToggle() {
  const { t } = useLanguage();
  const isExpanded = useSyncExternalStore(subscribeSessionExpanded, isSessionToggleExpanded, () => false);

  const label = t(isExpanded ? "practice.exitFullscreen" : "practice.enterFullscreen");
  // Four diagonal arrows: outward to expand, inward to shrink back.
  const Icon = isExpanded ? Shrink : Expand;

  return (
    <button
      type="button"
      onClick={toggleSessionExpanded}
      aria-pressed={isExpanded}
      aria-label={label}
      title={label}
      className="practice-header-button practice-header-button--icon"
    >
      <Icon className="practice-header-button__icon" aria-hidden="true" />
    </button>
  );
}

// Session counter footer for Custom Practice and Review Words: sticky to the
// bottom of the viewport (or the immersive scroller), and the last flex item
// of the session column, so the card centers between header and footer.
// Carries the rail's chip tokens itself, since it renders outside
// .practice-session-header.
export function SessionCountFooter({ children }: { children: ReactNode }) {
  return <div className="practice-session-count">{children}</div>;
}

interface SessionCountChipProps {
  // Fully localized phrase containing the number, e.g. "12 practiced" or
  // "Повторено: 12"; announced as a whole to screen readers.
  label: string;
  count: number;
  // Defaults to the check mark used by the practiced/reviewed counters.
  icon?: LucideIcon;
}

// Splits the localized label at the number so it can be set apart
// typographically while each locale keeps its own word order.
export function SessionCountChip({ label, count, icon: Icon = CheckCircle2 }: SessionCountChipProps) {
  const countText = String(count);
  const countIndex = label.indexOf(countText);
  const before = countIndex >= 0 ? label.slice(0, countIndex).trim() : "";
  const after = countIndex >= 0 ? label.slice(countIndex + countText.length).trim() : label;

  return (
    <span className="practice-header-chip practice-practiced-count" title={label}>
      <Icon className="practice-practiced-count__icon" aria-hidden="true" />
      <span className="practice-practiced-count__text" aria-hidden="true">
        {before && <span className="practice-practiced-count__word">{before}</span>}
        <span className="practice-practiced-count__value">{countText}</span>
        {after && <span className="practice-practiced-count__word">{after}</span>}
      </span>
      <span className="sr-only" role="status" aria-atomic="true">
        {label}
      </span>
    </span>
  );
}
