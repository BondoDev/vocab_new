import {
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { motion } from "motion/react";
import { Volume2 } from "lucide-react";
import { cn } from "../ui/utils";
import { useLanguage } from "../../../contexts/LanguageContext";

interface UniversalExerciseInputProps {
  isCorrect: boolean;
  onSpeakWord: () => void;
  fieldStyle?: CSSProperties;
  overlay?: ReactNode;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  inputClassName?: string;
  inputStyle?: CSSProperties;
  displayContent?: ReactNode;
  displayClassName?: string;
  displayStyle?: CSSProperties;
  enableOverlayAutoFit?: boolean;
}

const universalCaretColor = "rgb(74, 43, 130)";

export function UniversalExerciseCaret({
  className,
}: {
  className?: string;
}) {
  return (
    <motion.span
      aria-hidden="true"
      className={cn(
        "absolute left-0 top-1/2 -translate-y-1/2 w-px h-6",
        className,
      )}
      style={{ backgroundColor: universalCaretColor }}
      animate={{ opacity: [1, 1, 0, 0, 1] }}
      transition={{
        duration: 1,
        repeat: Infinity,
        ease: "linear",
        times: [0, 0.44, 0.5, 0.94, 1],
      }}
    />
  );
}

export function UniversalExerciseInput({
  isCorrect,
  onSpeakWord,
  fieldStyle,
  overlay,
  inputProps,
  inputClassName,
  inputStyle,
  displayContent,
  displayClassName,
  displayStyle,
  enableOverlayAutoFit = false,
}: UniversalExerciseInputProps) {
  const { t } = useLanguage();
  const hasTypingInput = Boolean(inputProps);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const overlayHostRef = useRef<HTMLDivElement | null>(null);
  const [autoFittedWidthPx, setAutoFittedWidthPx] = useState<number | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!hasTypingInput || !enableOverlayAutoFit || !rootRef.current) {
      setAutoFittedWidthPx(null);
      return;
    }

    const measure = () => {
      const root = rootRef.current;
      const field = fieldRef.current;
      const measurementRoot =
        (overlayHostRef.current?.firstElementChild as HTMLElement | null) ||
        overlayHostRef.current;
      if (!measurementRoot || !root || !field) return;

      const segments = measurementRoot.querySelectorAll<HTMLElement>(
        "[data-compound-segment='true']",
      );
      if (segments.length <= 1) {
        setAutoFittedWidthPx(null);
        return;
      }

      const containerStyle = window.getComputedStyle(measurementRoot);
      const horizontalPadding =
        Number.parseFloat(containerStyle.paddingLeft || "0") +
        Number.parseFloat(containerStyle.paddingRight || "0");

      const segmentWidths: number[] = [];
      let contentWidth = 0;
      segments.forEach((segment) => {
        const style = window.getComputedStyle(segment);
        const marginLeft = Number.parseFloat(style.marginLeft || "0");
        const marginRight = Number.parseFloat(style.marginRight || "0");
        const segmentWidth =
          segment.getBoundingClientRect().width + marginLeft + marginRight;
        segmentWidths.push(segmentWidth);
        contentWidth += segmentWidth;
      });

      const desiredSingleLineWidth = Math.ceil(
        contentWidth + horizontalPadding,
      );

      const computedField = window.getComputedStyle(field);
      const maxWidthRaw = (computedField.maxWidth || "").trim().toLowerCase();
      let maxWidthPx = Number.POSITIVE_INFINITY;

      if (maxWidthRaw.endsWith("%")) {
        const percent = Number.parseFloat(maxWidthRaw);
        if (Number.isFinite(percent) && percent > 0) {
          maxWidthPx = (root.clientWidth * percent) / 100;
        }
      } else if (maxWidthRaw.endsWith("px")) {
        const px = Number.parseFloat(maxWidthRaw);
        if (Number.isFinite(px) && px > 0) {
          maxWidthPx = px;
        }
      } else if (maxWidthRaw !== "none" && maxWidthRaw !== "") {
        // Fallback for rare computed forms.
        const parsed = Number.parseFloat(maxWidthRaw);
        if (Number.isFinite(parsed) && parsed > 0) {
          maxWidthPx = parsed;
        }
      }

      const widthCeiling = Math.min(root.clientWidth, maxWidthPx);
      const availableWidth = Math.max(0, Math.floor(widthCeiling));
      const availableContentWidth = Math.max(
        0,
        availableWidth - horizontalPadding,
      );

      if (
        desiredSingleLineWidth > 0 &&
        desiredSingleLineWidth <= availableWidth
      ) {
        setAutoFittedWidthPx(desiredSingleLineWidth);
        return;
      }

      if (segmentWidths.length === 0 || availableContentWidth <= 0) {
        setAutoFittedWidthPx(null);
        return;
      }

      const countRowsForWidth = (targetContentWidth: number): number => {
        let rows = 1;
        let used = 0;
        for (const width of segmentWidths) {
          if (used === 0) {
            used = width;
            continue;
          }
          if (used + width <= targetContentWidth + 0.5) {
            used += width;
          } else {
            rows += 1;
            used = width;
          }
        }
        return rows;
      };

      const currentRows = countRowsForWidth(availableContentWidth);
      const minSegmentWidth = Math.max(...segmentWidths);
      let low = minSegmentWidth;
      let high = Math.min(contentWidth, availableContentWidth);
      let best = high;

      // Binary search the narrowest width that preserves current row count.
      for (let i = 0; i < 24; i += 1) {
        const mid = (low + high) / 2;
        const rows = countRowsForWidth(mid);
        if (rows <= currentRows) {
          best = mid;
          high = mid;
        } else {
          low = mid;
        }
      }

      const wrappedWidth = Math.ceil(best + horizontalPadding);
      setAutoFittedWidthPx(wrappedWidth > 0 ? wrappedWidth : null);
    };

    const raf = window.requestAnimationFrame(measure);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [hasTypingInput, enableOverlayAutoFit, overlay]);

  return (
    <div ref={rootRef} className="relative w-full flex justify-center">
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center">
        <motion.button
          onClick={onSpeakWord}
          className="p-2 bg-[#6b53a3] hover:bg-[#5d4691] text-white border border-[#4a3870]/45 shadow-sm rounded-full transition-colors"
          aria-label={t("practice.listenToPronunciation")}
          animate={{
            opacity: isCorrect ? 1 : 0,
            scale: isCorrect ? 1 : 0.8,
          }}
          transition={{
            opacity: { duration: 0.2 },
            scale: { duration: 0.2 },
          }}
          style={{
            pointerEvents: isCorrect ? "auto" : "none",
          }}
        >
          <Volume2 className="w-6 h-6" strokeWidth={2.5} />
        </motion.button>
      </div>

      <div
        ref={fieldRef}
        className="relative exercise-answer-field"
        style={{
          ...fieldStyle,
          width: autoFittedWidthPx
            ? `${autoFittedWidthPx}px`
            : fieldStyle?.width,
        }}
      >
        {hasTypingInput ? (
          <>
            <div ref={overlayHostRef}>{overlay}</div>
            <input
              {...inputProps}
              className={cn(inputClassName, inputProps?.className)}
              style={{
                ...inputStyle,
                ...(inputProps?.style as CSSProperties | undefined),
                caretColor: "transparent",
              }}
            />
          </>
        ) : (
          <div className={displayClassName} style={displayStyle}>
            {displayContent}
          </div>
        )}
      </div>
    </div>
  );
}
