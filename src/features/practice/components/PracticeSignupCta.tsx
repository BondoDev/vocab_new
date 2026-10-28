import { TrendingUp } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";

// Guest-only sign-up prompt on the Custom Practice finish screen.
// Presentational: who sees it (resolved auth, no user) and what the button
// opens (Header's existing sign-up dialog) are decided by App, since Practice
// does not own the account lifecycle. The parent renders this only for
// guests, so a hidden CTA leaves no container or spacing behind.
export function PracticeSignupCta({ onCreateAccount }: { onCreateAccount: () => void }) {
  const { t } = useLanguage();

  return (
    <section
      aria-labelledby="practice-signup-cta-heading"
      className="flex flex-col gap-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:gap-5 sm:p-5"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          aria-hidden="true"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <TrendingUp className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2
            id="practice-signup-cta-heading"
            className="text-base font-semibold leading-snug text-foreground"
          >
            {t("practice.signupCta.heading")}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {t("practice.signupCta.description")}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-1.5 text-center sm:items-center">
        <button
          type="button"
          onClick={onCreateAccount}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          {t("practice.signupCta.button")}
        </button>
        <span className="text-xs text-muted-foreground">{t("practice.signupCta.supportingText")}</span>
      </div>
    </section>
  );
}
