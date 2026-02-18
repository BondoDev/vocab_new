import { ChevronLeft } from "lucide-react";

interface HelpProps {
  onBack?: () => void;
}

export function Help({ onBack }: HelpProps) {
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
            <span>Back</span>
          </button>
        )}
        <div className="space-y-8 text-base md:text-lg leading-relaxed text-foreground">
          <div className="space-y-3">
            <h2 className="text-2xl md:text-3xl font-semibold">
              How to start practice
            </h2>
          </div>

          <div className="space-y-3">
            <h3 className="text-xl md:text-2xl font-semibold">
              Step 1: Choose languages
            </h3>
            <p>Select:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>your native language</li>
              <li>the language you want to practice</li>
            </ul>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h3 className="text-xl md:text-2xl font-semibold">
              Step 2: Set filters (optional)
            </h3>
            <p>You can optionally choose:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>CEFR level</li>
              <li>topics</li>
              <li>word types (part of speech)</li>
            </ul>
            <p>All filters are optional.</p>
            <p>By default, all filters are active.</p>
            <p>
              If you do not select anything, it means you practice all levels,
              all topics, and all word types.
            </p>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h3 className="text-xl md:text-2xl font-semibold">
              Step 3: Choose exercises
            </h3>
            <p>
              Go to the exercise selection page and choose which exercise types
              you want to practice.
            </p>
            <p>There are 5 exercise types:</p>
            <ol className="list-decimal pl-6 space-y-1 text-muted-foreground">
              <li>Full word typing</li>
              <li>Half-written word typing</li>
              <li>Broken-word assembling</li>
              <li>Word connection</li>
              <li>Listening</li>
            </ol>
            <p>By default, all exercises are selected.</p>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h3 className="text-xl md:text-2xl font-semibold">
              Step 4: Choose session size (optional)
            </h3>
            <p>
              You can choose how many words you want to practice in the session.
            </p>
            <p>This is optional:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>You can set a word quantity</li>
              <li>
                Or start practicing without a limit and finish the session at
                any time
              </li>
            </ul>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h3 className="text-xl md:text-2xl font-semibold">
              Exercise types explained
            </h3>
          </div>

          <div className="space-y-3">
            <h4 className="text-lg md:text-xl font-semibold">
              1) Full word typing
            </h4>
            <p>Goal: Type the correct word in the language you are practicing.</p>
            <p>What you see:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>The word meaning in your native language</li>
              <li>Word metadata: CEFR level, topic, and word type (part of speech)</li>
              <li>An input field where you type the answer</li>
            </ul>
            <p>Buttons and features:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                Hint
                <div>Hints are calculated as 50% of the total number of letters in the target word</div>
                <div>The hint gradually reveals letters in the answer</div>
              </li>
              <li>
                Show me word
                <div>Reveals the correct word if you cannot recall it</div>
              </li>
              <li>
                Definition (drop-down)
                <div>Expands to show the detailed definition of the word</div>
              </li>
              <li>
                See in sentence (appears only after completion)
                <div>
                  After you guess the word correctly or use "Show me word", a
                  button appears that opens an example sentence where the word
                  is used
                </div>
              </li>
              <li>
                Skip
                <div>Skips this word and moves to the next exercise</div>
              </li>
            </ul>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h4 className="text-lg md:text-xl font-semibold">
              2) Half-written word typing
            </h4>
            <p>
              Goal: Complete a partially written word in the language you are
              practicing.
            </p>
            <p>What you see:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>The word meaning in your native language</li>
              <li>
                The target word shown partially written (you must type the
                missing part)
              </li>
              <li>Word metadata: CEFR level, topic, and word type (part of speech)</li>
              <li>An input field for completing the missing letters</li>
            </ul>
            <p>Buttons and features:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                Show me word
                <div>Reveals the full correct word</div>
              </li>
              <li>
                Definition (drop-down)
                <div>Expands to show the detailed definition of the word</div>
              </li>
              <li>
                See in sentence (appears only after completion)
                <div>
                  Appears only after the word is completed correctly or revealed
                  via "Show me word"
                </div>
              </li>
              <li>
                Skip
                <div>Skips this word and moves to the next exercise</div>
              </li>
            </ul>
            <p>Notes:</p>
            <p>
              This exercise has no Hint button, because part of the word is
              already provided.
            </p>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h4 className="text-lg md:text-xl font-semibold">
              3) Broken-word assembling
            </h4>
            <p>
              Goal: Assemble the correct word by placing word parts in the
              correct order.
            </p>
            <p>What you see:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>The word meaning in your native language</li>
              <li>Empty slots for the word parts</li>
              <li>A set of shuffled word parts that you place into the slots</li>
              <li>Word metadata: CEFR level, topic, and word type (part of speech)</li>
            </ul>
            <p>Buttons and features:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                Hint
                <div>Available once per word</div>
                <div>Reveals the first correct part in the correct position</div>
              </li>
              <li>
                Show me word
                <div>Reveals the full correct word</div>
              </li>
              <li>
                Definition (drop-down)
                <div>Expands to show the detailed definition of the word</div>
              </li>
              <li>
                See in sentence (appears only after completion)
                <div>
                  Appears only after the word is assembled correctly or revealed
                  via "Show me word"
                </div>
              </li>
              <li>
                Skip
                <div>Skips this word and moves to the next exercise</div>
              </li>
            </ul>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h4 className="text-lg md:text-xl font-semibold">
              4) Word connection
            </h4>
            <p>
              Goal: Connect words in the practicing language with their meanings
              in your native language.
            </p>
            <p>What you see:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Word type (part of speech) at the top (applies to all items)</li>
              <li>Left side: 4 words in the language you are practicing</li>
              <li>Right side: 4 meanings in your native language</li>
            </ul>
            <p>How it works:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Tap one item on the left, then tap the matching item on the right</li>
              <li>Correct matches stay connected</li>
              <li>Incorrect matches are highlighted briefly and can be retried</li>
            </ul>
            <p>Buttons and features:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                Skip
                <div>Skips this exercise and moves to the next one</div>
              </li>
            </ul>
            <p>Notes:</p>
            <p>
              There are no hints and no “show me word” here, because all words
              are already visible.
            </p>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h4 className="text-lg md:text-xl font-semibold">
              5) Listening exercise
            </h4>
            <p>
              Goal: Match spoken words in the practicing language with their
              meanings in your native language.
            </p>
            <p>What you see:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Word type (part of speech) at the top (applies to all items)</li>
              <li>
                Left side: 4 audio buttons (microphone) for words in the practicing
                language
              </li>
              <li>Right side: 4 meanings in your native language</li>
            </ul>
            <p>How it works:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Tap an audio button to hear a word</li>
              <li>Then connect it to the correct meaning on the right</li>
              <li>Correct matches stay connected</li>
              <li>Incorrect matches are highlighted briefly and can be retried</li>
            </ul>
            <p>Buttons and features:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                Skip
                <div>Skips this exercise and moves to the next one</div>
              </li>
            </ul>
            <p>Notes:</p>
            <p>There are no hints and no "show me word" here.</p>
          </div>

          <hr className="border-border/60" />

          <div className="space-y-3">
            <h3 className="text-xl md:text-2xl font-semibold">
              Skipping and finishing
            </h3>
            <p>Every exercise includes a Skip button</p>
            <p>You can finish the session at any time</p>
            <p>
              Words are counted only when you recall them correctly (revealing a
              word does not count as a successful recall)
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
