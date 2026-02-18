import { BadgeCheck } from "lucide-react";
import { useLanguage } from "../../../contexts/LanguageContext";

interface PracticeResultsProps {
  attemptHistory: Array<{
    level: string;
    type: string;
    result: "correct" | "incorrect" | "skipped";
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
}

export function PracticeResults({
  attemptHistory,
  stats,
}: PracticeResultsProps) {
  const { t } = useLanguage();
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
                          <span className="text-muted-foreground">—</span>
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
                        <span className="text-muted-foreground">вЂ”</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
