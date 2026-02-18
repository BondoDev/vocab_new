import { ArrowLeft, Home } from "lucide-react";

interface PracticeHeaderProps {
  onBack: () => void;
  onStartAgain?: () => void;
  sessionComplete: boolean;
  onFinishTest: () => void;
  getLanguageName: (code: string) => string;
  yourLanguage: string;
  practiceLanguage: string;
}

export function PracticeHeader({
  onBack,
  onStartAgain,
  sessionComplete,
  onFinishTest,
  getLanguageName,
  yourLanguage,
  practiceLanguage,
}: PracticeHeaderProps) {
  return (
    <header className="sticky top-0 z-20 w-full px-3 pt-2 md:px-6 md:pt-2.5">
      <div className="w-full mx-auto lg:w-[50vw]">
        <div
          className="flex items-center justify-between gap-2 rounded-2xl px-2.5 py-1.5 sm:px-3 sm:py-2"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.94), rgba(248,249,251,0.92))",
            boxShadow:
              "0 10px 25px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(255,255,255,0.5) inset",
            backdropFilter: "blur(6px)",
          }}
        >
          {sessionComplete ? (
            <button
              onClick={onStartAgain}
              type="button"
              className="inline-flex items-center rounded-xl px-2.5 py-1 sm:px-3 sm:py-1.5 text-[0.72rem] sm:text-sm font-semibold hover:bg-muted transition-colors"
              style={{
                color: "rgba(100, 116, 139, 0.78)",
                backgroundColor: "rgba(100, 116, 139, 0.12)",
                border: "1px solid rgba(100, 116, 139, 0.28)",
              }}
            >
              Practice Again
            </button>
          ) : (
            <button
              onClick={onBack}
              type="button"
              className="inline-flex items-center gap-1.5 sm:gap-2 rounded-xl px-2 py-1 sm:px-3 sm:py-1.5 hover:bg-muted transition-colors"
              style={{
                color: "rgba(100, 116, 139, 0.78)",
                backgroundColor: "rgba(100, 116, 139, 0.12)",
                border: "1px solid rgba(100, 116, 139, 0.28)",
              }}
              aria-label="Back"
            >
              <ArrowLeft className="h-[1.1rem] w-[1.1rem] sm:h-[1.25rem] sm:w-[1.25rem]" />
            </button>
          )}

          <div
            className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full px-2.5 py-1 sm:px-3 sm:py-1.5 font-bold uppercase tracking-wide"
            style={{
              backgroundColor: "rgba(74, 43, 130, 0.08)",
              border: "1px solid rgba(74, 43, 130, 0.2)",
            }}
          >
            <span
              className="text-[0.68rem] sm:text-xs"
              style={{ color: "rgba(74, 43, 130, 0.72)" }}
            >
              {getLanguageName(yourLanguage)}
            </span>
            <span
              className="h-3.5 w-px sm:h-4"
              style={{ backgroundColor: "rgba(74, 43, 130, 0.28)" }}
            />
            <span
              className="text-[0.68rem] sm:text-xs"
              style={{ color: "rgba(74, 43, 130, 0.72)" }}
            >
              {getLanguageName(practiceLanguage)}
            </span>
          </div>

          {!sessionComplete ? (
            <button
              onClick={onFinishTest}
              type="button"
              className="practice-finish-button inline-flex items-center gap-1.5 rounded-xl px-2 py-1 sm:px-3 sm:py-1.5 text-[0.72rem] sm:text-sm font-semibold transition-colors hover:bg-muted"
              style={{
                color: "rgba(100, 116, 139, 0.78)",
                backgroundColor: "rgba(100, 116, 139, 0.12)",
                border: "1px solid rgba(100, 116, 139, 0.28)",
              }}
            >
              <span>Finish</span>
            </button>
          ) : (
            <button
              onClick={onBack}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl px-2 py-1 sm:px-2.5 sm:py-1.5 text-[0.72rem] sm:text-sm font-semibold hover:bg-muted transition-colors"
              style={{
                color: "rgba(100, 116, 139, 0.78)",
                backgroundColor: "rgba(100, 116, 139, 0.12)",
                border: "1px solid rgba(100, 116, 139, 0.28)",
              }}
              aria-label="Home"
            >
              <Home className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Home</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
