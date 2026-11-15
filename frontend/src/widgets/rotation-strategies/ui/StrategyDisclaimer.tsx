import { AlertTriangle } from "lucide-react";
import { STRATEGY_DISCLAIMER } from "@/entities/crop";

/** "Supports, not replaces": shown under the rotation strategies (screen and PDF). */
export function StrategyDisclaimer() {
  return (
    <div role="note" className="flex items-start gap-2.5 rounded-2xl border border-[#F0DDBD] bg-[#FBF5EA] px-4 py-3 text-[12.5px] leading-5 text-[#6B4A12]">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{STRATEGY_DISCLAIMER}</p>
    </div>
  );
}
