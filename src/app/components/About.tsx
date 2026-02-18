import { ChevronLeft } from "lucide-react";

interface AboutProps {
  onBack?: () => void;
}

export function About({ onBack }: AboutProps) {
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
            <span>Back</span>
          </button>
        )}
        <div className="space-y-6 text-base md:text-lg leading-relaxed text-foreground">
          <p>
            LEXISTAR is designed for active vocabulary practice, not passive
            browsing.
          </p>
          <p>
            You don’t scroll through word lists or memorize definitions. You
            practice words by using them, through carefully designed exercises
            that train recall, spelling, and recognition.
          </p>
          <p>
            There is no registration and no login. You choose your native
            language, the language you want to practice, and your CEFR level. If
            you don’t know your level, a short test helps determine it.
          </p>

          <div>
            <p className="font-semibold">You can optionally filter:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>practice topics</li>
              <li>word types</li>
              <li>exercise types</li>
            </ul>
          </div>

          <p>Then you start a practice session.</p>

          <p>
            All learning happens inside the session. Words are introduced,
            tested, repeated, and reinforced through different exercises — not
            shown as lists.
          </p>

          <div>
            <h2 className="text-xl md:text-2xl font-semibold">
              How practice works
            </h2>
            <p className="mt-2">
              The system uses multiple exercise types, such as:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>full word typing</li>
              <li>partial word completion</li>
              <li>word assembling</li>
              <li>word connection</li>
              <li>listening (when enabled)</li>
            </ul>
          </div>

          <p>
            Some exercises train active recall, others provide light
            reinforcement. Words are counted only when you correctly recall them
            — revealing an answer does not count as learning.
          </p>

          <p>
            This approach focuses on real vocabulary acquisition, not shortcuts.
          </p>

          <div>
            <h2 className="text-xl md:text-2xl font-semibold">
              Why no account?
            </h2>
            <p className="mt-2">LEXISTAR is intentionally session-based.</p>
          </div>

          <p>
            You can start practicing immediately, without creating an account or
            sharing personal data. Nothing is stored after you leave the
            session.
          </p>

          <div>
            <p className="font-semibold">The goal is simple:</p>
            <p className="text-muted-foreground">
              practice words effectively, with as little friction as possible.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
