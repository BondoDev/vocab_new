import { ArrowLeft, BookOpen } from "lucide-react";

interface PracticeEmptyStateProps {
  onBack: () => void;
  getLanguageName: (code: string) => string;
  yourLanguage: string;
  practiceLanguage: string;
}

export function PracticeEmptyState({
  onBack,
  getLanguageName,
  yourLanguage,
  practiceLanguage,
}: PracticeEmptyStateProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-background">
      <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
        <BookOpen className="w-10 h-10" />
      </div>
      <h2 className="text-2xl font-bold mb-3">No words found</h2>
      <p className="text-muted-foreground max-w-md mb-8">
        We couldn't find any words matching your selected filters for 
        <span className="font-semibold text-foreground mx-1">
          {getLanguageName(practiceLanguage)}
        </span> 
        practice. Try adjusting your category or level selections.
      </p>
      <button
        onClick={onBack}
        className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-sm"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Filters
      </button>
    </div>
  );
}
