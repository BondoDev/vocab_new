// Compact, anonymous-only onboarding nudge shown once on the Filters page
// right after a first-time visitor finishes the Languages page's Continue
// flow (see useAccountIntroPopup.ts for the trigger/consumption logic).
// Reads as a short product introduction (branded icon band, title, one-line
// intro, three scannable benefit rows, then the CTA stack) rather than a
// generic confirmation dialog - but stays a single compact card: no
// illustration, no large feature cards. Reuses the same light lavender/
// purple/off-white tokens and header-glow treatment as
// AccountOnboardingDialog.tsx (the post-signup "finish your profile"
// dialog) instead of introducing new colors.
import { BookOpen, BrainCircuit, ListChecks, TrendingUp, type LucideIcon } from "lucide-react";

import { useLanguage } from "../../../contexts/LanguageContext";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

interface AccountIntroDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateAccount: () => void;
  onLogIn: () => void;
}

// Icons chosen to match already-established usage elsewhere in the project
// (no new icon dependency): BookOpen already stands for vocabulary/learning
// (VocabularySummaryCards.tsx, PracticeEmptyState.tsx), BrainCircuit is the
// review feature's own icon (ReviewWordsPreparation.tsx), and TrendingUp
// already stands for progress/growth (VocabularyGrowthSection.tsx).
const BENEFITS: {
  key: string;
  icon: LucideIcon;
  titleKey: string;
  descriptionKey: string;
}[] = [
  {
    key: "studyWords",
    icon: BookOpen,
    titleKey: "accountIntroPopup.benefits.studyWords.title",
    descriptionKey: "accountIntroPopup.benefits.studyWords.description",
  },
  {
    key: "reviewSmart",
    icon: BrainCircuit,
    titleKey: "accountIntroPopup.benefits.reviewSmart.title",
    descriptionKey: "accountIntroPopup.benefits.reviewSmart.description",
  },
  {
    key: "trackProgress",
    icon: TrendingUp,
    titleKey: "accountIntroPopup.benefits.trackProgress.title",
    descriptionKey: "accountIntroPopup.benefits.trackProgress.description",
  },
];

export function AccountIntroDialog({
  open,
  onOpenChange,
  onCreateAccount,
  onLogIn,
}: AccountIntroDialogProps) {
  const { t } = useLanguage();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,27rem)] max-w-none max-h-[calc(100svh-2rem)] overflow-y-auto overflow-x-hidden rounded-[1.75rem] border-[#ece4ff] bg-[#fffdfd] p-0 shadow-[0_20px_54px_-10px_rgba(38,25,67,0.28)]">
        {/* Branded top band: same radial-glow-over-white-to-lavender recipe
            AccountOnboardingDialog's header already uses, kept short here
            (icon + title + one-line intro only) so the emphasis stays near
            the top without making the header tall. */}
        <div className="bg-[radial-gradient(circle_at_top,rgba(120,90,255,0.18),rgba(255,255,255,0)_60%),linear-gradient(180deg,#f7f2ff_0%,#fffdfd_100%)] px-6 pb-5 pt-6 sm:px-7">
          <DialogHeader className="items-center gap-2.5 text-center sm:text-center">
            <span
              aria-hidden="true"
              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-[#6f58ff] shadow-[0_10px_22px_-8px_rgba(111,88,255,0.5)] ring-1 ring-[#ece4ff]"
            >
              <ListChecks className="h-7 w-7" />
            </span>
            <DialogTitle className="text-xl font-semibold leading-snug text-[#261943]">
              {t("accountIntroPopup.title")}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-[#6f6290]">
              {t("accountIntroPopup.description")}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6 pt-4 sm:px-7">
          <div className="flex flex-col gap-1">
            {BENEFITS.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <div
                  key={benefit.key}
                  className="flex items-start gap-3 rounded-xl px-2 py-2"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f2edff] text-[#6f58ff]"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-semibold leading-tight text-[#261943]">
                      {t(benefit.titleKey)}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-[#8d7cb6]">
                      {t(benefit.descriptionKey)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <Button
              type="button"
              onClick={onCreateAccount}
              className="h-11 w-full rounded-xl bg-[linear-gradient(135deg,#6f58ff,#5c49f2)] text-sm font-semibold text-white shadow-[0_12px_24px_-12px_rgba(92,73,242,0.85)] transition-transform hover:translate-y-[-1px] hover:opacity-95"
            >
              {t("accountIntroPopup.createAccount")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="h-9 w-full rounded-xl text-sm font-medium text-[#6f6290] hover:bg-[#f5f1ff] hover:text-[#37275b]"
            >
              {t("accountIntroPopup.maybeLater")}
            </Button>
            <button
              type="button"
              onClick={onLogIn}
              className="mt-0.5 text-center text-xs font-medium text-[#8d7cb6] underline decoration-[#dcd1ff] underline-offset-4 transition-colors hover:text-[#6f58ff] hover:decoration-[#6f58ff]"
            >
              {t("accountIntroPopup.logIn")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
