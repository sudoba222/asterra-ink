import { comparisonRows, type RotationStrategy, type Signal } from "@/entities/crop";
import { cn } from "@/shared/lib";

const DOT: Record<Signal, string> = { good: "bg-good", watch: "bg-watch", concern: "bg-concern", unknown: "bg-ink-faint" };
const GOAL_COL = "bg-[#F5FAEC]";

/**
 * One shared table under the cards: six criteria × three strategies. Scrolls sideways on
 * narrow screens with the criterion column pinned, so a row is always readable.
 */
export function RotationComparisonTable({ strategies }: { strategies: RotationStrategy[] }) {
  const rows = comparisonRows(strategies);
  return (
    <div>
      <h4 id="rotation-comparison" className="text-[14px] font-semibold text-ink">
        Side by side
      </h4>
      <p className="mt-0.5 text-[12.5px] text-ink-muted">Green is better, amber means watch, orange means a concern.</p>
      <div
        role="region"
        aria-labelledby="rotation-comparison"
        tabIndex={0}
        className="scroll-quiet mt-3 overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface outline-none focus-visible:ring-2 focus-visible:ring-forest/60"
      >
        <table className="w-full min-w-[600px] border-collapse text-left text-[12.5px] leading-[1.45]">
          <caption className="sr-only">Comparison of the three rotation strategies</caption>
          <colgroup>
            <col className="w-[27%]" />
            {strategies.map((s) => (
              <col key={s.id} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="sticky left-0 z-10 bg-surface px-4 py-3 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                Criterion
              </th>
              {strategies.map((s) => (
                <th key={s.id} scope="col" className={cn("px-3 py-3 align-bottom font-semibold text-ink", s.fitsGoal && GOAL_COL)}>
                  <span className="block text-[13px]">{s.title}</span>
                  {s.fitsGoal && <span className="mt-0.5 block text-[11px] font-medium text-forest">Fits your goal</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-b-0">
                <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-3 align-top font-normal shadow-[1px_0_0_var(--color-line)]">
                  <span className="block font-semibold text-ink">{r.criterion}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-4 text-ink-faint">{r.hint}</span>
                </th>
                {r.cells.map((c, i) => (
                  <td key={strategies[i].id} className={cn("px-3 py-3 align-top", strategies[i].fitsGoal && GOAL_COL)}>
                    {c ? (
                      <>
                        <span className="flex items-center gap-1.5 font-semibold text-ink">
                          <span className={cn("size-2 shrink-0 rounded-full", DOT[c.signal])} aria-hidden />
                          {c.label}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-ink-muted">{c.detail}</span>
                      </>
                    ) : (
                      <span className="text-ink-faint">Not available</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
