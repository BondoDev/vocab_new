import { useLanguage } from "../../../../contexts/LanguageContext";
import { GettingStartedSection } from "./GettingStartedSection";
import "./guidance-section.scss";

interface GuidanceSectionProps {
  // Reserved for the future interactive tour engine (not implemented in
  // this phase). Threaded straight through to InteractiveTourCard so the
  // eventual tour implementation can be wired in from above (App.tsx ->
  // UserProfileDashboardPage -> here) without any change to this
  // component's own structure. Undefined today is intentional: it leaves
  // the button as real, inert UI rather than a fake/no-op handler.
  onStartInteractiveTour?: () => void;
}

// Guidance Section 1 — "Getting Started" only (page header + the learning
// cycle + the Interactive Tour entry point). Later phases add further
// Guidance sections (Vocabulary, My Lists, Progress, Settings guidance) as
// additional siblings of GettingStartedSection here, matching
// ProgressSection's own precedent of composing several independent
// sub-sections under one page-level header.
export function GuidanceSection({ onStartInteractiveTour }: GuidanceSectionProps) {
  const { t } = useLanguage();

  return (
    <>
      <header className="guidance-section__header">
        <h1 className="guidance-section__title">{t("userProfile.guidancePage.title")}</h1>
        <p className="guidance-section__subtitle">{t("userProfile.guidancePage.subtitle")}</p>
      </header>

      <GettingStartedSection onStartInteractiveTour={onStartInteractiveTour} />
    </>
  );
}
