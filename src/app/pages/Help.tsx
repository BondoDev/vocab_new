import { ChevronLeft } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";

interface HelpProps {
  onBack?: () => void;
}

export function Help({ onBack }: HelpProps) {
  const { t } = useLanguage();

  return (
    <main className="help-page flex-1 px-4 py-10 md:py-16">
      <div className="about-help-content mx-auto w-full max-w-3xl">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="page-back-button mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition"
          >
            <ChevronLeft className="w-5 h-5" />
            <span>{t("helpPage.back")}</span>
          </button>
        )}

        <div className="space-y-8 text-base md:text-lg leading-relaxed text-foreground">
          <div className="space-y-3">
            <h2 className="text-2xl md:text-3xl font-semibold">
              {t("helpPage.title")}
            </h2>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl md:text-2xl font-semibold">
              {t("helpPage.step1.title")}
            </h3>
            <p>{t("helpPage.step1.intro")}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{t("helpPage.step1.item1")}</li>
              <li>{t("helpPage.step1.item2")}</li>
            </ul>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h3 className="text-xl md:text-2xl font-semibold">
              {t("helpPage.step2.title")}
            </h3>
            <p>{t("helpPage.step2.intro")}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{t("helpPage.step2.item1")}</li>
              <li>{t("helpPage.step2.item2")}</li>
              <li>{t("helpPage.step2.item3")}</li>
            </ul>
            <p>{t("helpPage.step2.note1")}</p>
            <p>{t("helpPage.step2.note2")}</p>
            <p>{t("helpPage.step2.note3")}</p>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h3 className="text-xl md:text-2xl font-semibold">
              {t("helpPage.step3.title")}
            </h3>
            <p>{t("helpPage.step3.intro")}</p>
            <p>{t("helpPage.step3.listTitle")}</p>
            <ol className="list-decimal pl-6 space-y-1 text-muted-foreground">
              <li>{t("helpPage.step3.item1")}</li>
              <li>{t("helpPage.step3.item2")}</li>
              <li>{t("helpPage.step3.item3")}</li>
              <li>{t("helpPage.step3.item4")}</li>
              <li>{t("helpPage.step3.item5")}</li>
            </ol>
            <p>{t("helpPage.step3.note")}</p>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h3 className="text-xl md:text-2xl font-semibold">
              {t("helpPage.step4.title")}
            </h3>
            <p>{t("helpPage.step4.intro")}</p>
            <p>{t("helpPage.step4.optionalTitle")}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{t("helpPage.step4.item1")}</li>
              <li>{t("helpPage.step4.item2")}</li>
            </ul>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h3 className="text-xl md:text-2xl font-semibold">
              {t("helpPage.types.title")}
            </h3>
          </div>

          <div className="space-y-3">
            <h4 className="text-lg md:text-xl font-semibold">
              {t("helpPage.types.fullWord.title")}
            </h4>
            <p>{t("helpPage.types.fullWord.goal")}</p>
            <p>{t("helpPage.types.fullWord.seeTitle")}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{t("helpPage.common.seeMeaning")}</li>
              <li>{t("helpPage.common.seeMeta")}</li>
              <li>{t("helpPage.types.fullWord.seeInput")}</li>
            </ul>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h4 className="text-lg md:text-xl font-semibold">
              {t("helpPage.types.halfWritten.title")}
            </h4>
            <p>{t("helpPage.types.halfWritten.goal")}</p>
            <p>{t("helpPage.types.halfWritten.seeTitle")}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{t("helpPage.common.seeMeaning")}</li>
              <li>{t("helpPage.types.halfWritten.seePartial")}</li>
              <li>{t("helpPage.common.seeMeta")}</li>
              <li>{t("helpPage.types.halfWritten.seeInput")}</li>
            </ul>
            <p>{t("helpPage.types.halfWritten.note")}</p>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h4 className="text-lg md:text-xl font-semibold">
              {t("helpPage.types.brokenWord.title")}
            </h4>
            <p>{t("helpPage.types.brokenWord.goal")}</p>
            <p>{t("helpPage.types.brokenWord.seeTitle")}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{t("helpPage.common.seeMeaning")}</li>
              <li>{t("helpPage.types.brokenWord.seeSlots")}</li>
              <li>{t("helpPage.types.brokenWord.seeChunks")}</li>
              <li>{t("helpPage.common.seeMeta")}</li>
            </ul>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h4 className="text-lg md:text-xl font-semibold">
              {t("helpPage.types.connectWords.title")}
            </h4>
            <p>{t("helpPage.types.connectWords.goal")}</p>
            <p>{t("helpPage.types.connectWords.seeTitle")}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{t("helpPage.types.connectWords.seeTypeTop")}</li>
              <li>{t("helpPage.types.connectWords.seeLeft")}</li>
              <li>{t("helpPage.types.connectWords.seeRight")}</li>
            </ul>
            <p>{t("helpPage.types.connectWords.howTitle")}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{t("helpPage.types.connectWords.how1")}</li>
              <li>{t("helpPage.types.connectWords.how2")}</li>
              <li>{t("helpPage.types.connectWords.how3")}</li>
            </ul>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h4 className="text-lg md:text-xl font-semibold">
              {t("helpPage.types.listening.title")}
            </h4>
            <p>{t("helpPage.types.listening.goal")}</p>
            <p>{t("helpPage.types.listening.seeTitle")}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{t("helpPage.types.listening.seeTypeTop")}</li>
              <li>{t("helpPage.types.listening.seeLeft")}</li>
              <li>{t("helpPage.types.listening.seeRight")}</li>
            </ul>
            <p>{t("helpPage.types.listening.howTitle")}</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>{t("helpPage.types.listening.how1")}</li>
              <li>{t("helpPage.types.listening.how2")}</li>
              <li>{t("helpPage.types.listening.how3")}</li>
              <li>{t("helpPage.types.listening.how4")}</li>
            </ul>
            <p>{t("helpPage.types.listening.note")}</p>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h3 className="text-xl md:text-2xl font-semibold">
              {t("helpPage.finish.title")}
            </h3>
            <p>{t("helpPage.finish.p1")}</p>
            <p>{t("helpPage.finish.p2")}</p>
            <p>{t("helpPage.finish.p3")}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
