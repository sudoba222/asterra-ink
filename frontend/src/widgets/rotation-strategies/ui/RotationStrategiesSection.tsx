import { FlaskConical } from "lucide-react";
import type { StrategyComparison } from "@/entities/crop";
import { RotationComparisonTable } from "./RotationComparisonTable";
import { RotationStrategyCard } from "./RotationStrategyCard";

/**
 * "Plan your next crop" → three rotation strategies + the shared comparison table.
 * Pure view: the page passes the comparison in (same object the PDF report gets).
 */
export function RotationStrategiesSection({ comparison }: { comparison: StrategyComparison }) {
  const { strategies, illustrative } = comparison;
  return (
    <section aria-labelledby="rotation-strategies" className="space-y-4">
      <header>
        <h3 id="rotation-strategies" className="text-[16px] font-semibold text-ink">
          Your next 3 seasons, planned 3 ways
        </h3>
        <p className="mt-0.5 text-[12.5px] leading-5 text-ink-muted">Keep your current crops, save water, or build up the soil. Compare them before you choose.</p>
      </header>

      {illustrative && (
        <div role="note" className="flex items-start gap-2.5 rounded-2xl border border-[#F0DDBD] bg-[#FBF5EA] px-4 py-3 text-[12.5px] leading-5 text-[#6B4A12]">
          <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <b className="font-semibold">Sample plans, for illustration only.</b> These three rotations use example data, not your field’s data, and don’t
            change with your answers yet. Don’t plan a season from them.
          </p>
        </div>
      )}

      {/* Three columns once this panel (not the viewport) is wide enough for ~220px cards. */}
      <div className="@container/strategies">
        <ul className="grid grid-cols-1 gap-3 @min-[44rem]/strategies:grid-cols-3" aria-label="Rotation strategies">
          {strategies.map((s) => (
            <RotationStrategyCard key={s.id} strategy={s} />
          ))}
        </ul>
      </div>

      <RotationComparisonTable strategies={strategies} />
    </section>
  );
}
