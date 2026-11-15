import { CONFIDENCE_LABEL, confidenceExplanation, type RotationStrategy } from "@/entities/crop";
import { cn } from "@/shared/lib";

const LEVEL = {
  high: { bars: 3, color: "bg-good", text: "text-[#1F6B43]" },
  medium: { bars: 2, color: "bg-watch", text: "text-[#8A5A12]" },
  low: { bars: 1, color: "bg-concern", text: "text-[#9A3412]" },
} as const;

/** Three-bar meter + "High confidence" + the one-line reason from the strategy. */
export function ConfidenceIndicator({ strategy, className }: { strategy: Pick<RotationStrategy, "confidence" | "confidenceReason">; className?: string }) {
  const level = LEVEL[strategy.confidence];
  return (
    <div className={className}>
      <p className="flex items-center gap-2">
        <span className="flex h-3 items-end gap-[3px]" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className={cn("w-[5px] rounded-[1.5px]", i < level.bars ? level.color : "bg-line-strong")} style={{ height: `${6 + i * 3}px` }} />
          ))}
        </span>
        <span className={cn("text-[12.5px] font-semibold", level.text)}>{CONFIDENCE_LABEL[strategy.confidence]}</span>
      </p>
      <p className="mt-1 text-[12px] leading-[1.45] text-ink-muted">{confidenceExplanation(strategy)}</p>
    </div>
  );
}
