import { CloudOff, LoaderCircle } from "lucide-react";
import type { StrategyComparison } from "@/entities/crop";
import { FieldYearStrip } from "./FieldYearStrip";
import { RotationComparisonTable } from "./RotationComparisonTable";
import { RotationStrategyCard } from "./RotationStrategyCard";

const list = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * "Plan your next crop" → the field's 12-month strip, three rotation strategies and the shared
 * comparison table. Pure view: the page passes the comparison in (same object the PDF report gets).
 * `pending` / `unavailable` name field sources still loading or missing, so the farmer knows what
 * the plans are (not yet) based on.
 */
export function RotationStrategiesSection({
  comparison,
  pending = [],
  unavailable = [],
}: {
  comparison: StrategyComparison;
  pending?: string[];
  unavailable?: string[];
}) {
  const { strategies, calendar } = comparison;
  return (
    <section aria-labelledby="rotation-strategies" className="space-y-4">
      <header>
        <h3 id="rotation-strategies" className="text-[16px] font-semibold text-ink">
          Your next 3 seasons, planned 3 ways
        </h3>
        <p className="mt-0.5 text-[12.5px] leading-5 text-ink-muted">Keep your current crops, save water, or build up the soil. Compare them before you choose.</p>
      </header>

      {(pending.length > 0 || unavailable.length > 0) && (
        <div role="status" className="space-y-1 text-[12px] leading-5 text-ink-muted">
          {pending.length > 0 && (
            <p className="flex items-start gap-1.5">
              <LoaderCircle className="mt-[3px] size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
              <span>Still loading {list(pending)}. The plans update when it arrives.</span>
            </p>
          )}
          {unavailable.length > 0 && (
            <p className="flex items-start gap-1.5">
              <CloudOff className="mt-[3px] size-3.5 shrink-0" aria-hidden />
              <span>Not available right now: {list(unavailable)}. The plans don’t use it.</span>
            </p>
          )}
        </div>
      )}

      {calendar && <FieldYearStrip calendar={calendar} />}

      {/* Three columns once this panel (not the viewport) is wide enough for ~220px cards. */}
      <div className="@container/strategies">
        <ul className="grid grid-cols-1 gap-3 @min-[44rem]/strategies:grid-cols-3" aria-label="Rotation strategies">
          {strategies.map((s) => (
            <RotationStrategyCard key={s.id} strategy={s} calendar={calendar} />
          ))}
        </ul>
      </div>

      <RotationComparisonTable strategies={strategies} />
    </section>
  );
}
