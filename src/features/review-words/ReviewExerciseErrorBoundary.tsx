import { Component, type ReactNode } from "react";

// Guards against an unexpected runtime failure inside one of the reused
// exercise components (BrokenWordExercise/HalfWrittenExercise/WordTypingExercise/
// ConnectWordsExercise/ListeningExercise) — none of them are modified by
// Review Words, so this session can't assume they never throw. A render
// error boundary must be a class component (React has no hook equivalent);
// this is a wrapper only, not a fork of any exercise component's logic.
interface ReviewExerciseErrorBoundaryProps {
  // Remounts the boundary's children (clearing the caught error) whenever
  // this changes — the session component passes a key that changes on
  // RETRY so a fresh attempt actually re-renders the exercise instead of
  // staying stuck on the last thrown error.
  resetKey: string | number;
  onError: () => void;
  children: ReactNode;
}

interface ReviewExerciseErrorBoundaryState {
  hasError: boolean;
  resetKey: string | number;
}

export class ReviewExerciseErrorBoundary extends Component<
  ReviewExerciseErrorBoundaryProps,
  ReviewExerciseErrorBoundaryState
> {
  state: ReviewExerciseErrorBoundaryState = { hasError: false, resetKey: this.props.resetKey };

  static getDerivedStateFromProps(
    props: ReviewExerciseErrorBoundaryProps,
    state: ReviewExerciseErrorBoundaryState,
  ): ReviewExerciseErrorBoundaryState | null {
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, resetKey: props.resetKey };
    }
    return null;
  }

  static getDerivedStateFromError(): Partial<ReviewExerciseErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.warn("ReviewExerciseErrorBoundary: caught an exercise render error.", error);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) {
      // The parent session component owns the actual retry UI (driven by
      // the "error" state) — this renders nothing so that UI is the only
      // thing shown, instead of a second, competing error message.
      return null;
    }
    return this.props.children;
  }
}
