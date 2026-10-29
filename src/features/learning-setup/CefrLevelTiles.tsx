import { useRef } from "react";
import { Check } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { FILTER_LEVEL_CODES } from "./filterLabels";
import { toggleLevelSelection } from "./filterSelection";
import "./styles/cefr-level-tiles.scss";

interface CefrLevelTilesProps {
  /** The shared persisted level list (useStoredAppPreferences). */
  selectedLevels: string[];
  onChange: (levels: string[]) => void;
  /**
   * Whether a candidate level list still matches any words with the current
   * topic/word-type filters. Options that would fail are disabled.
   */
  canApply: (levels: string[]) => boolean;
  labelledBy: string;
  unavailableHint: string;
}

/**
 * CEFR level tiles shared by the Custom Practice setup page and the detailed
 * filters page. Controlled: both pages write the same App-owned level list,
 * so a change on either page is what the other page and the session read.
 *
 * Click toggles a level (from the all-levels state it narrows to that
 * level; removing the last level selects all again). Double-click, or a
 * double-tap on touch, keeps only that level.
 */
export function CefrLevelTiles({
  selectedLevels,
  onChange,
  canApply,
  labelledBy,
  unavailableHint,
}: CefrLevelTilesProps) {
  const { t } = useLanguage();
  const lastTouchRef = useRef<{ time: number; level: string | null }>({
    time: 0,
    level: null,
  });
  const suppressClickUntilRef = useRef(0);

  // An empty persisted list means every level (the filters page refills it,
  // and the session treats it as unrestricted), so show it as all selected.
  const effectiveLevels =
    selectedLevels.length > 0 ? selectedLevels : FILTER_LEVEL_CODES;

  const toggled = (code: string) =>
    toggleLevelSelection(effectiveLevels, code, FILTER_LEVEL_CODES);

  const applyIfPossible = (levels: string[]) => {
    if (canApply(levels)) onChange(levels);
  };

  return (
    <div className="cefr-level-tiles">
      <div
        className="cefr-level-tiles__grid"
        role="group"
        aria-labelledby={labelledBy}
      >
        {FILTER_LEVEL_CODES.map((code) => {
          const isSelected = effectiveLevels.includes(code);
          const isDisabled = !canApply(toggled(code));
          return (
            <button
              key={code}
              type="button"
              aria-pressed={isSelected}
              disabled={isDisabled}
              className={`cefr-level-tile${isSelected ? " is-selected" : ""}`}
              title={isDisabled ? unavailableHint : undefined}
              onClick={() => {
                if (suppressClickUntilRef.current > Date.now()) return;
                applyIfPossible(toggled(code));
              }}
              onPointerUp={(event) => {
                if (event.pointerType !== "touch") return;
                const now = Date.now();
                const isDoubleTap =
                  lastTouchRef.current.level === code &&
                  now - lastTouchRef.current.time < 320;
                if (isDoubleTap) {
                  suppressClickUntilRef.current = now + 400;
                  applyIfPossible([code]);
                  lastTouchRef.current = { time: 0, level: null };
                  return;
                }
                lastTouchRef.current = { time: now, level: code };
              }}
              onDoubleClick={() => applyIfPossible([code])}
            >
              <span className="cefr-level-tile__code">{code}</span>
              <span className="cefr-level-tile__name">
                {t(`level.${code}.name`)}
              </span>
              <span className="cefr-level-tile__check" aria-hidden="true">
                <Check />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
