import { Compass, Play } from "lucide-react";
import { useLanguage } from "../../../../contexts/LanguageContext";

interface InteractiveTourCardProps {
  // Reserved for the future interactive tour engine. The tour itself is
  // explicitly out of scope for Guidance Section 1 — no engine, no
  // data-tour-id targets, no completion/skip persistence. Until that
  // engine exists and is wired in from above, this stays undefined on
  // purpose: the button renders as real UI (not disabled, not hidden) but
  // clicking it does nothing rather than faking success or showing an
  // alert. A later phase replaces this by threading a real handler down
  // through GuidanceSection -> GettingStartedSection -> here; nothing
  // about this component's shape needs to change when that happens.
  onStartInteractiveTour?: () => void;
}

export function InteractiveTourCard({ onStartInteractiveTour }: InteractiveTourCardProps) {
  const { t } = useLanguage();

  return (
    <div className="guidance-tour-card">
      <span className="guidance-tour-card__icon" aria-hidden="true">
        <Compass size={22} strokeWidth={2} />
      </span>

      <div className="guidance-tour-card__body">
        <h3 className="guidance-tour-card__title">{t("userProfile.guidancePage.gettingStarted.tour.title")}</h3>
        <p className="guidance-tour-card__description">
          {t("userProfile.guidancePage.gettingStarted.tour.description")}
        </p>
      </div>

      <button type="button" className="guidance-tour-card__button" onClick={onStartInteractiveTour}>
        <Play size={16} strokeWidth={2} aria-hidden="true" />
        {t("userProfile.guidancePage.gettingStarted.tour.startButton")}
      </button>
    </div>
  );
}
