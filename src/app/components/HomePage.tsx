import { useMemo, type ComponentProps, type MutableRefObject } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { LanguageSelector } from "./LanguageSelector";
import { FloatingWords } from "./FloatingWords";
import {
  LanguageContinuePopup,
  type LanguageContinuePopupHandle,
} from "./LanguageContinuePopup";
import { createDistributedStarFieldImage } from "../utils/starField";

interface HomePageProps {
  yourLanguage: string;
  practiceLanguage: string;
  onYourLanguageChange: (value: string) => void;
  onPracticeLanguageChange: (value: string) => void;
  languages: ComponentProps<typeof LanguageSelector>["languages"];
  isContinueDisabled: boolean;
  swapRotation: number;
  onReverseLanguages: () => void;
  onStartPracticing: () => void;
  popupRef: MutableRefObject<LanguageContinuePopupHandle | null>;
}

export function HomePage({
  yourLanguage,
  practiceLanguage,
  onYourLanguageChange,
  onPracticeLanguageChange,
  languages,
  isContinueDisabled,
  swapRotation,
  onReverseLanguages,
  onStartPracticing,
  popupRef,
}: HomePageProps) {
  const { t } = useLanguage();
  const shouldReduceMotion = useReducedMotion();
  const starFieldStyle = useMemo(
    () => ({
      backgroundColor: "#4a2b82",
      backgroundImage: createDistributedStarFieldImage(10),
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
    }),
    [],
  );
  const nextButtonStarFieldStyle = useMemo(
    () => ({
      ...starFieldStyle,
      backgroundColor: "#4a2b82",
      backgroundImage: createDistributedStarFieldImage(3),
      backgroundSize: "100% 100%",
      backgroundRepeat: "no-repeat",
    }),
    [starFieldStyle],
  );

  const swapButton = (
    <motion.button
      onClick={onReverseLanguages}
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
    <main className="flex-1 min-h-0 flex flex-col items-center justify-center px-[clamp(1rem,3vw,2.5rem)] pt-[clamp(0.5rem,2vw,1.5rem)] pb-[clamp(2.5rem,6vw,5rem)] relative">
      <FloatingWords />

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-20 left-10 w-64 h-64 rounded-full blur-3xl"
          style={{
            backgroundColor: "rgba(192, 132, 252, 0.1)",
          }}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        ></motion.div>
        <motion.div
          className="absolute bottom-20 right-10 w-96 h-96 rounded-full blur-3xl"
          style={{
            backgroundColor: "rgba(96, 165, 250, 0.1)",
          }}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
        ></motion.div>
        <motion.div
          className="absolute top-1/2 left-1/3 w-72 h-72 rounded-full blur-3xl"
          style={{
            backgroundColor: "rgba(244, 114, 182, 0.1)",
          }}
          animate={{
            scale: [1, 1.1, 1],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 0.5,
          }}
        ></motion.div>
      </div>

      <div className="language-content-container w-full max-w-2xl relative z-10">
        <motion.div
          className="md:hidden w-full max-w-2xl text-center space-y-[clamp(0.5rem,1.2vw,1rem)] z-10 -mt-4 mb-[clamp(1rem,3vw,1.5rem)]"
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="text-[clamp(2rem,7vw,3rem)] text-foreground leading-tight">
            {t("home.headline")}
          </h2>
          <p className="text-[clamp(1.15rem,4.1vw,1.8rem)] text-muted-foreground/80 max-w-xl mx-auto">
            {t("home.subheadline")}
          </p>
        </motion.div>
        <motion.div
          className="hidden md:block text-center space-y-[clamp(0.75rem,1.6vw,1.25rem)]"
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="text-[clamp(2.25rem,4vw,3.5rem)] text-foreground leading-tight">
            {t("home.headline")}
          </h2>
          <p className="text-[clamp(1.35rem,2.7vw,2.2rem)] text-muted-foreground/80 max-w-xl mx-auto">
            {t("home.subheadline")}
          </p>
        </motion.div>

        <motion.div
          className="language-form-stack space-y-[clamp(1.25rem,3vw,2.5rem)] mt-[clamp(1.5rem,4vw,2rem)]"
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          <motion.div
            className="language-selectors-shell max-w-4xl mx-auto pt-[clamp(0.5rem,2vw,1rem)]"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <div className="md:hidden relative space-y-10">
              <LanguageSelector
                label={t("home.yourLanguage")}
                value={yourLanguage}
                onChange={onYourLanguageChange}
                placeholder={t("home.selectYourLanguage")}
                languages={languages}
                disabledLanguages={[practiceLanguage]}
              />
              <div className="absolute left-1/2 top-[calc(50%+16px)] -translate-x-1/2 -translate-y-1/2 z-10">
                {swapButton}
              </div>
              <LanguageSelector
                label={t("home.practiceLanguage")}
                value={practiceLanguage}
                onChange={onPracticeLanguageChange}
                placeholder={t("home.selectPracticeLanguage")}
                languages={languages}
                disabledLanguages={[yourLanguage]}
              />
            </div>
            <div className="language-inputs-grid hidden md:grid md:grid-cols-[1fr_auto_1fr] md:items-center md:gap-6">
              <LanguageSelector
                label={t("home.yourLanguage")}
                value={yourLanguage}
                onChange={onYourLanguageChange}
                placeholder={t("home.selectYourLanguage")}
                languages={languages}
                disabledLanguages={[practiceLanguage]}
              />
              <div className="language-swap-wrap flex justify-center mt-8">
                {swapButton}
              </div>
              <LanguageSelector
                label={t("home.practiceLanguage")}
                value={practiceLanguage}
                onChange={onPracticeLanguageChange}
                placeholder={t("home.selectPracticeLanguage")}
                languages={languages}
                disabledLanguages={[yourLanguage]}
              />
            </div>
          </motion.div>

          <motion.p
            className="language-change-note text-[clamp(0.75rem,1.6vw,0.95rem)] text-center text-muted-foreground pt-[clamp(0.25rem,1vw,0.5rem)]"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.6 }}
          >
            {t("home.changeNote")}
          </motion.p>

          <motion.div
            className="language-continue-wrap language-continue-wrap-inside flex justify-center pt-[clamp(0.75rem,2vw,1rem)]"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
          >
            <motion.button
              onClick={onStartPracticing}
              aria-disabled={isContinueDisabled}
              style={nextButtonStarFieldStyle}
              className={`language-continue-button text-white px-12 py-4 text-lg rounded-lg shadow-lg shadow-primary/30 ${
                isContinueDisabled
                  ? "opacity-60 cursor-not-allowed shadow-none"
                  : ""
              }`}
              whileHover={{
                scale: 1.05,
                boxShadow: "0 20px 40px rgba(99, 102, 241, 0.3)",
              }}
              whileTap={{ scale: 0.95 }}
              transition={{
                type: "spring",
                stiffness: 400,
                damping: 17,
              }}
            >
              {t("home.next")}
            </motion.button>
          </motion.div>

          <LanguageContinuePopup ref={popupRef} autoHideMs={3000} />

          <motion.div
            className="language-stats-grid hidden md:grid md:grid-cols-3 gap-[clamp(1.5rem,4vw,2rem)] pt-[clamp(2.5rem,6vw,3.5rem)] text-center"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.9 }}
          >
            <div className="space-y-2">
              <div className="text-[clamp(1.25rem,2.5vw,1.5rem)] bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                10,000+
              </div>
              <div className="text-[clamp(0.75rem,1.5vw,0.9rem)] text-muted-foreground">
                {t("home.stat.words")}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-[clamp(1.25rem,2.5vw,1.5rem)] font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
                7
              </div>
              <div className="text-[clamp(0.75rem,1.5vw,0.9rem)] text-muted-foreground">
                {t("home.stat.languages")}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-[clamp(1.25rem,2.5vw,1.5rem)] bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
                {t("home.stat.noSignup")}
              </div>
              <div className="text-[clamp(0.75rem,1.5vw,0.9rem)] text-muted-foreground">
                {t("home.stat.noSignupDesc")}
              </div>
            </div>
          </motion.div>

          <motion.div
            className="md:hidden fixed bottom-5 left-0 right-0 flex items-center justify-center gap-[clamp(1rem,3vw,1.75rem)] text-[clamp(0.75rem,2.5vw,0.9rem)] text-muted-foreground/80 pointer-events-none"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.8 }}
          >
            <span className="flex items-baseline gap-1">
              <span className="font-semibold bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">
                10k+
              </span>
              <span>words</span>
            </span>
            <span className="flex items-baseline gap-1">
              <span className="font-bold bg-gradient-to-r from-blue-500 to-cyan-500 bg-clip-text text-transparent">
                7
              </span>
              <span>languages</span>
            </span>
            <span className="font-semibold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent">
              No signup
            </span>
          </motion.div>
        </motion.div>

        <motion.div
          className="language-continue-wrap language-continue-wrap-outside justify-center pt-[clamp(0.75rem,2vw,1rem)]"
          initial={false}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          <motion.button
            onClick={onStartPracticing}
            aria-disabled={isContinueDisabled}
            style={nextButtonStarFieldStyle}
            className={`language-continue-button text-white px-12 py-4 text-lg rounded-lg shadow-lg shadow-primary/30 ${
              isContinueDisabled
                ? "opacity-60 cursor-not-allowed shadow-none"
                : ""
            }`}
            whileHover={{
              scale: 1.05,
              boxShadow: "0 20px 40px rgba(99, 102, 241, 0.3)",
            }}
            whileTap={{ scale: 0.95 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 17,
            }}
          >
            {t("home.next")}
          </motion.button>
        </motion.div>
      </div>
    </main>
  );
}
