import { ChevronLeft } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

interface AboutProps {
  onBack?: () => void;
}

export function About({ onBack }: AboutProps) {
  const { t } = useLanguage();

  return (
    <main className="about-page flex-1 px-4 py-10 md:py-16">
      <div className="about-help-content mx-auto w-full max-w-3xl">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="page-back-button mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>{t("aboutPage.back")}</span>
          </button>
        )}
        <div className="space-y-6 text-base md:text-lg leading-relaxed text-foreground">
          <p>{t("aboutPage.p1")}</p>
          <p>{t("aboutPage.p2")}</p>
          <p>{t("aboutPage.p3")}</p>

          <div>
            <p className="font-semibold">{t("aboutPage.filtersTitle")}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{t("aboutPage.filters.topics")}</li>
              <li>{t("aboutPage.filters.wordTypes")}</li>
              <li>{t("aboutPage.filters.exerciseTypes")}</li>
            </ul>
          </div>

          <p>{t("aboutPage.p4")}</p>
          <p>{t("aboutPage.p5")}</p>

          <div>
            <h2 className="text-xl md:text-2xl font-semibold">
              {t("aboutPage.howTitle")}
            </h2>
            <p className="mt-2">{t("aboutPage.howSubtitle")}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{t("aboutPage.howList.wordTyping")}</li>
              <li>{t("aboutPage.howList.partialCompletion")}</li>
              <li>{t("aboutPage.howList.wordAssembling")}</li>
              <li>{t("aboutPage.howList.wordConnection")}</li>
              <li>{t("aboutPage.howList.listening")}</li>
            </ul>
          </div>

          <p>{t("aboutPage.p6")}</p>
          <p>{t("aboutPage.p7")}</p>

          <div>
            <h2 className="text-xl md:text-2xl font-semibold">
              {t("aboutPage.accountTitle")}
            </h2>
            <p className="mt-2">{t("aboutPage.accountSubtitle")}</p>
          </div>

          <p>{t("aboutPage.p8")}</p>

          <div>
            <p className="font-semibold">{t("aboutPage.goalTitle")}</p>
            <p className="text-muted-foreground">{t("aboutPage.goalText")}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
