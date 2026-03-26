import { useMemo, useState } from "react";
import { BadgeCheck, X } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";

interface PracticeResultsProps {
  attemptHistory: Array<{
    conceptId: string;
    level: string;
    type: string;
    result: "correct" | "incorrect" | "skipped";
    wasTyped: boolean;
    wasRevealed: boolean;
  }>;
  sessionWords: Array<{
    conceptId: string;
    nativeWord: string;
    targetWord: string;
    wordType: string;
    wordTopic: string;
    status: "guessed" | "viewed" | "skipped";
  }>;
  stats: {
    levels: string[];
    types: string[];
    matrix: {
      [level: string]: {
        [type: string]: {
          guessed: number;
          total: number;
        };
      };
    };
  };
  yourLanguageLabel: string;
  practiceLanguageLabel: string;
}

export function PracticeResults({
  attemptHistory,
  sessionWords,
  stats,
  yourLanguageLabel,
  practiceLanguageLabel,
}: PracticeResultsProps) {
  const { t } = useLanguage();
  const [isStudiedWordsOpen, setIsStudiedWordsOpen] = useState(false);
  const { levels, types, matrix } = stats;

  const formatWordTypeLabel = (typeId: string) =>
    typeId
      .split(/[_-]+/g)
      .map((part) =>
        part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part,
      )
      .join(" ");

  const getWordTypeLabel = (typeId: string) => {
    const translated = t(`wordTypes.${typeId}`);
    if (!translated || translated === `wordTypes.${typeId}`) {
      return formatWordTypeLabel(typeId);
    }
    return translated;
  };

  const formatTopicLabel = (topicId: string) =>
    topicId
      .split(/[_-]+/g)
      .map((part) =>
        part.length ? part.charAt(0).toUpperCase() + part.slice(1) : part,
      )
      .join(" ");

  const getTopicLabel = (topicId: string) => {
    const translated = t(`levelCategory.topicNames.${topicId}`);
    if (!translated || translated === `levelCategory.topicNames.${topicId}`) {
      return formatTopicLabel(topicId);
    }
    return translated;
  };

  const typeSummaries = types.reduce(
    (acc, type) => {
      let guessed = 0;
      let total = 0;
      levels.forEach((level) => {
        const cell = matrix[level]?.[type];
        if (!cell) return;
        guessed += cell.guessed;
        total += cell.total;
      });
      acc[type] = { guessed, total };
      return acc;
    },
    {} as Record<string, { guessed: number; total: number }>,
  );

  const totalAttempts = attemptHistory.filter(
    (a) => a.result !== "skipped",
  ).length;
  const totalCorrect = attemptHistory.filter(
    (a) => a.result === "correct",
  ).length;
  const accuracy =
    totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

  const sortedSessionWords = useMemo(
    () =>
      [...sessionWords].sort((a, b) =>
        a.nativeWord.localeCompare(b.nativeWord, undefined, {
          sensitivity: "base",
        }),
      ),
    [sessionWords],
  );

  const guessedWords = useMemo(
    () => sortedSessionWords.filter((word) => word.status === "guessed"),
    [sortedSessionWords],
  );
  const viewedWords = useMemo(
    () => sortedSessionWords.filter((word) => word.status === "viewed"),
    [sortedSessionWords],
  );
  const skippedWords = useMemo(
    () => sortedSessionWords.filter((word) => word.status === "skipped"),
    [sortedSessionWords],
  );

  const guessedWordsLabel = (() => {
    const translated = t("practice.guessedWords");
    return !translated || translated === "practice.guessedWords"
      ? "Guessed words"
      : translated;
  })();
  const practicedWordsButtonLabel = (() => {
    const translated = t("practice.practicedWords");
    return !translated || translated === "practice.practicedWords"
      ? "Practiced words"
      : translated;
  })();

  const viewedWordsLabel = (() => {
    const translated = t("practice.viewedWords");
    return !translated || translated === "practice.viewedWords"
      ? "Viewed words"
      : translated;
  })();

  const skippedWordsLabel = (() => {
    const translated = t("practice.skippedWords");
    return !translated || translated === "practice.skippedWords"
      ? "Skipped words"
      : translated;
  })();

  const topicHeaderLabel = (() => {
    const translated = t("practice.topicHeader");
    return !translated || translated === "practice.topicHeader"
      ? "Topic"
      : translated;
  })();

  const renderWordRow = (word: {
    conceptId: string;
    nativeWord: string;
    targetWord: string;
    wordType: string;
    wordTopic: string;
  }) => (
    <tr
      key={word.conceptId}
      className="border-b border-border/70 last:border-b-0"
    >
      <td className="px-4 py-3 text-foreground">{word.nativeWord || "-"}</td>
      <td className="px-4 py-3 text-foreground">{word.targetWord || "-"}</td>
      <td className="px-4 py-3 text-muted-foreground">{word.wordType || "-"}</td>
      <td className="px-4 py-3 text-muted-foreground">
        {word.wordTopic ? getTopicLabel(word.wordTopic) : "-"}
      </td>
    </tr>
  );

  return (
    <div className="space-y-8 py-4 lg:space-y-6 lg:py-1">
      <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
        <div className="text-center rounded-lg border border-border bg-muted/20 px-4 py-3">
          <div className="text-xl font-bold text-primary">{totalAttempts}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t("practice.wordsLabel")}
          </div>
        </div>
        <div className="text-center rounded-lg border border-border bg-muted/20 px-4 py-3">
          <div className="text-xl font-bold text-green-600">{accuracy}%</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">
            {t("practice.accuracyLabel")}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
        <div className="px-3 py-3 bg-muted/30 border-b border-border">
          <h3 className="font-semibold text-center inline-flex w-full items-center justify-center gap-2">
            <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary p-1">
              <BadgeCheck className="w-4 h-4" />
            </span>
            <span>{t("practice.performanceMatrix")}</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-muted/10">
                <th className="sticky left-0 z-20 w-22 max-w-22 px-1 py-2.5 font-medium border-b border-r text-muted-foreground text-xs uppercase tracking-wide whitespace-nowrap text-center bg-card shadow-[2px_0_0_0_var(--border)]">
                  {t("practice.levelType")}
                </th>
                {types.map((type) => (
                  <th
                    key={type}
                    className="px-6 py-2.5 font-medium border-b text-center capitalize"
                  >
                    {getWordTypeLabel(type)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {levels.map((level) => (
                <tr key={level} className="hover:bg-muted/5 transition-colors">
                  <th className="sticky left-0 z-20 w-8 max-w-8 px-1 py-4 font-bold border-r text-foreground uppercase bg-card text-center shadow-[2px_0_0_0_var(--border)]">
                    {level}
                  </th>
                  {types.map((type) => {
                    const cell = matrix[level][type];
                    const total = cell.total;
                    return (
                      <td
                        key={`${level}-${type}`}
                        className="px-6 py-4 text-center border-b last:border-b-0"
                      >
                        {total > 0 ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="font-semibold text-green-600">
                              {cell.guessed} / {total}
                            </span>
                            <div className="flex h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                              <div
                                className="bg-green-500 h-full"
                                style={{
                                  width: `${(cell.guessed / total) * 100}%`,
                                }}
                              />
                              <div
                                className="bg-red-400 h-full"
                                style={{
                                  width: `${((total - cell.guessed) / total) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              <tr className="bg-muted/10">
                <th className="sticky left-0 z-20 w-8 max-w-8 px-1 py-3 font-bold border-r border-t text-foreground uppercase text-center bg-card shadow-[2px_0_0_0_var(--border)]">
                  {t("practice.total")}
                </th>
                {types.map((type) => {
                  const summary = typeSummaries[type];
                  const total = summary.total;
                  return (
                    <td
                      key={`total-${type}`}
                      className="px-6 py-3 text-center border-t"
                    >
                      {total > 0 ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-semibold text-green-600">
                            {summary.guessed} / {total}
                          </span>
                          <div className="flex h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                            <div
                              className="bg-green-500 h-full"
                              style={{
                                width: `${(summary.guessed / total) * 100}%`,
                              }}
                            />
                            <div
                              className="bg-red-400 h-full"
                              style={{
                                width: `${((total - summary.guessed) / total) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={() => setIsStudiedWordsOpen(true)}
          className="inline-flex items-center rounded-xl border border-primary/25 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary/15"
        >
          {practicedWordsButtonLabel}
        </button>
        <div className="relative mt-1 max-w-xs rounded-2xl bg-primary px-4 py-3 text-center text-xs leading-relaxed text-primary-foreground shadow-sm">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-[-8px] h-4 w-4 -translate-x-1/2 rotate-45 bg-primary"
          />
          <span className="relative block">
            Click this button to see guessed, viewed, and skipped words from this session.
          </span>
        </div>
      </div>

      {isStudiedWordsOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[2px]"
          onMouseDown={() => setIsStudiedWordsOpen(false)}
        >
          <div
            className="w-full max-w-4xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {practicedWordsButtonLabel}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {sortedSessionWords.length} {t("practice.wordsInThisSession")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsStudiedWordsOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={t("practice.closePracticedWords")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b border-border">
                    <th className="px-4 py-3 font-semibold text-foreground">
                      {yourLanguageLabel}
                    </th>
                    <th className="px-4 py-3 font-semibold text-foreground">
                      {practiceLanguageLabel}
                    </th>
                    <th className="px-4 py-3 font-semibold text-foreground">
                      {t("practice.wordTypeHeader")}
                    </th>
                    <th className="px-4 py-3 font-semibold text-foreground">
                      {topicHeaderLabel}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {guessedWords.length > 0 ? (
                    <>
                      <tr className="border-b border-border bg-muted/20">
                        <td
                          colSpan={4}
                          className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground"
                        >
                          {guessedWordsLabel} ({guessedWords.length})
                        </td>
                      </tr>
                      {guessedWords.map(renderWordRow)}
                    </>
                  ) : null}
                  {viewedWords.length > 0 ? (
                    <>
                      <tr className="border-b border-border bg-muted/20">
                        <td
                          colSpan={4}
                          className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground"
                        >
                          {viewedWordsLabel} ({viewedWords.length})
                        </td>
                      </tr>
                      {viewedWords.map(renderWordRow)}
                    </>
                  ) : null}
                  {skippedWords.length > 0 ? (
                    <>
                      <tr className="border-b border-border bg-muted/20">
                        <td
                          colSpan={4}
                          className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-foreground"
                        >
                          {skippedWordsLabel} ({skippedWords.length})
                        </td>
                      </tr>
                      {skippedWords.map(renderWordRow)}
                    </>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
