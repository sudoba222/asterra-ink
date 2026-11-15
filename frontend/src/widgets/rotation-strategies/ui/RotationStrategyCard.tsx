import { CircleCheck, Droplets, History, Sprout, type LucideIcon } from "lucide-react";
import { STRATEGY_PURPOSE, type RotationStrategy, type RotationStrategyId } from "@/entities/crop";
import { cn } from "@/shared/lib";
import { ConfidenceIndicator } from "./ConfidenceIndicator";
import { SeasonTimeline } from "./SeasonTimeline";
import { StrategyInformation } from "./StrategyInformation";

export const STRATEGY_ICON: Record<RotationStrategyId, LucideIcon> = { current: History, water: Droplets, soil: Sprout };

/**
 * One strategy as four stacked parts: header, crop sequence, confidence, information.
 * In the three-column layout the card is a subgrid row-span-4, so the same part lines up
 * across all three cards even when their text lengths differ.
 */
export function RotationStrategyCard({ strategy }: { strategy: RotationStrategy }) {
  const Icon = STRATEGY_ICON[strategy.id];
  const titleId = `strategy-${strategy.id}`;
  const part = "px-4";

  return (
    // No @container on the card itself: container queries add layout containment, which disables subgrid.
    <li
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col rounded-[var(--radius-card)] border bg-surface shadow-[var(--shadow-card)]",
        "@min-[44rem]/strategies:row-span-4 @min-[44rem]/strategies:grid @min-[44rem]/strategies:grid-rows-subgrid @min-[44rem]/strategies:gap-0",
        strategy.fitsGoal ? "border-forest ring-1 ring-forest" : "border-line",
      )}
    >
      <header className={cn(part, "pt-4 pb-3")}>
        <div className="flex items-start gap-2.5">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", strategy.fitsGoal ? "bg-lime text-deep" : "bg-mist text-forest")} aria-hidden>
            <Icon className="size-[18px]" />
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 pt-1.5">
            <h4 id={titleId} className="text-[16px] leading-6 font-semibold text-ink">
              {strategy.title}
            </h4>
            {strategy.fitsGoal && (
              <span className="inline-flex items-center gap-1 rounded-full bg-lime px-2 py-0.5 text-[11.5px] leading-4 font-semibold whitespace-nowrap text-deep">
                <CircleCheck className="size-3.5" aria-hidden /> Fits your goal
              </span>
            )}
          </div>
        </div>
        <p className="mt-2 text-[12.5px] leading-[1.5] text-ink-muted">{STRATEGY_PURPOSE[strategy.id]}</p>
      </header>

      {strategy.available ? (
        <>
          <div className={cn(part, "pb-3")}>
            <SeasonTimeline seasons={strategy.seasons} />
          </div>
          <ConfidenceIndicator strategy={strategy} className={cn(part, "border-t border-line py-3")} />
          <div className={cn(part, "border-t border-line pb-1")}>
            <StrategyInformation strategy={strategy} />
          </div>
        </>
      ) : (
        <>
          <div className={cn(part, "pb-4")}>
            <p className="rounded-xl border border-dashed border-line-strong px-3 py-3 text-[12.5px] leading-5 text-ink-muted">
              {strategy.unavailableReason ?? "This plan can’t be built for your field."}
            </p>
          </div>
          {/* Keep the subgrid's four rows so the other cards stay aligned. */}
          <div aria-hidden />
          <div aria-hidden />
        </>
      )}
    </li>
  );
}
