import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";
import { LanguageSelector } from "../../components/LanguageSelector";

interface LevelTestLanguageOption {
  code: string;
  name: string;
  flagCode?: string;
}

interface LevelTestLanguageModalProps {
  open: boolean;
  initialYourLanguage: string;
  initialPracticeLanguage: string;
  languages: LevelTestLanguageOption[];
  // Owned by the caller: this rotation counter must survive navigation away
  // from and back to the level-test SEO page, but this component only
  // mounts while that page is showing — so it can't own state that needs to
  // outlive its own mount lifetime.
  swapRotation: number;
  onReverse: () => void;
  onClose: () => void;
  onConfirm: (yourLanguage: string, practiceLanguage: string) => void;
}

export function LevelTestLanguageModal({
  open,
  initialYourLanguage,
  initialPracticeLanguage,
  languages,
  swapRotation,
  onReverse,
  onClose,
  onConfirm,
}: LevelTestLanguageModalProps) {
  const { t } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const [draftYourLanguage, setDraftYourLanguage] = useState(
    initialYourLanguage,
  );
  const [draftPracticeLanguage, setDraftPracticeLanguage] = useState(
    initialPracticeLanguage,
  );

  // Reseed drafts from the caller's current committed languages every time
  // the modal opens (not on every render while it stays open) — matches the
  // pre-extraction openLevelTestLanguageModal behavior in App.tsx.
  useEffect(() => {
    if (!open) {
      return;
    }
    setDraftYourLanguage(initialYourLanguage);
    setDraftPracticeLanguage(initialPracticeLanguage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) {
    return null;
  }

  const handleReverseLanguages = () => {
    const temp = draftYourLanguage;
    setDraftYourLanguage(draftPracticeLanguage);
    setDraftPracticeLanguage(temp);
    onReverse();
  };

  const isConfirmDisabled =
    !draftYourLanguage ||
    !draftPracticeLanguage ||
    draftYourLanguage === draftPracticeLanguage;

  const handleConfirm = () => {
    if (isConfirmDisabled) {
      return;
    }
    onConfirm(draftYourLanguage, draftPracticeLanguage);
  };

  const swapButton = (
    <motion.button
      type="button"
      onClick={handleReverseLanguages}
      className="flex items-center justify-center w-9 h-9 md:w-10 md:h-10 rounded-full border border-border/70 bg-muted/50 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/70 shadow-sm transition-all opacity-90 md:opacity-100"
      aria-label="Reverse languages"
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
    >
      <motion.span
        animate={shouldReduceMotion ? undefined : { rotate: swapRotation }}
        transition={
          shouldReduceMotion
            ? { duration: 0 }
            : { duration: 0.25, ease: "easeInOut" }
        }
        className="inline-flex"
      >
        <ArrowLeftRight className="w-4 h-4 rotate-90 md:rotate-0 text-foreground/80" />
      </motion.span>
    </motion.button>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label={t("languageContinuePopup.closePopup")}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-border bg-card p-6 shadow-2xl md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl text-foreground">
              {t("languageContinuePopup.title")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("home.selectYourLanguage")} and{" "}
              {t("home.selectPracticeLanguage").toLowerCase()}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
            aria-label={t("languageContinuePopup.close")}
          >
            X
          </button>
        </div>

        <div className="mt-6">
          <div className="md:hidden relative space-y-10">
            <LanguageSelector
              label={t("home.yourLanguage")}
              value={draftYourLanguage}
              onChange={setDraftYourLanguage}
              placeholder={t("home.selectYourLanguage")}
              languages={languages}
              disabledLanguages={[draftPracticeLanguage]}
            />
            <div className="absolute left-1/2 top-[calc(50%+16px)] -translate-x-1/2 -translate-y-1/2 z-10">
              {swapButton}
            </div>
            <LanguageSelector
              label={t("home.practiceLanguage")}
              value={draftPracticeLanguage}
              onChange={setDraftPracticeLanguage}
              placeholder={t("home.selectPracticeLanguage")}
              languages={languages}
              disabledLanguages={[draftYourLanguage]}
            />
          </div>
          <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-6">
            <LanguageSelector
              label={t("home.yourLanguage")}
              value={draftYourLanguage}
              onChange={setDraftYourLanguage}
              placeholder={t("home.selectYourLanguage")}
              languages={languages}
              disabledLanguages={[draftPracticeLanguage]}
            />
            <div className="flex justify-center mt-8">{swapButton}</div>
            <LanguageSelector
              label={t("home.practiceLanguage")}
              value={draftPracticeLanguage}
              onChange={setDraftPracticeLanguage}
              placeholder={t("home.selectPracticeLanguage")}
              languages={languages}
              disabledLanguages={[draftYourLanguage]}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${
              isConfirmDisabled
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "border border-primary/45 bg-primary/10 text-primary hover:bg-primary/15"
            }`}
          >
            Start Level Test
          </button>
        </div>
      </div>
    </div>
  );
}
