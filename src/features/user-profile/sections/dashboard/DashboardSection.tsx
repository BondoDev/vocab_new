import { useLanguage } from "../../../../contexts/LanguageContext";
import "./dashboard-section.scss";

export function DashboardSection() {
  const { t } = useLanguage();

  return (
    <div className="dashboard-section__notice" role="status">
      <p className="dashboard-section__notice-kicker">
        {t("userProfile.developmentNotice.status")}
      </p>
      <h1 className="dashboard-section__notice-title">
        {t("userProfile.developmentNotice.title")}
      </h1>
      <p className="dashboard-section__notice-description">
        {t("userProfile.developmentNotice.description")}
      </p>
    </div>
  );
}
