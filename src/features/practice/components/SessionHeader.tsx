import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";

// Shared session header rail, used by Custom Practice (PracticeHeader) and
// Review Words (ReviewSession). Styles live in ../styles/exercises.scss under
// .practice-session-header. All three slots share one 36px rail: the count and
// language chips are quiet white surfaces, and the end-slot action (Finish)
// uses .practice-header-button(--finish) as the only tinted element. The
// 1fr/auto/1fr grid keeps the language chip centered in the viewport regardless
// of how wide the side slots render in a given UI language.

interface SessionHeaderProps {
  start: ReactNode;
  end: ReactNode;
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

interface SessionCountChipProps {
  // Fully localized phrase containing the number, e.g. "12 practiced" or
  // "Повторено: 12"; announced as a whole to screen readers.
  label: string;
  count: number;
}

// Splits the localized label at the number so it can be set apart
// typographically while each locale keeps its own word order.
export function SessionCountChip({ label, count }: SessionCountChipProps) {
  const countText = String(count);
  const countIndex = label.indexOf(countText);
  const before = countIndex >= 0 ? label.slice(0, countIndex).trim() : "";
  const after = countIndex >= 0 ? label.slice(countIndex + countText.length).trim() : label;

  return (
    <span className="practice-header-chip practice-practiced-count" title={label}>
      <CheckCircle2 className="practice-practiced-count__icon" aria-hidden="true" />
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
