import { AlertTriangle, CheckCircle2, CircleHelp, Minus, type LucideIcon } from "lucide-react";
import type { CardState, Level } from "@/entities/field-conditions";
import { cn } from "@/shared/lib";

const LEVEL: Record<Level, { ring: string; chip: string; icon: LucideIcon; text: string }> = {
  good: { ring: "ring-[#CDE7D6]", chip: "bg-[#E7F4EC] text-[#1F6B43]", icon: CheckCircle2, text: "Good" },
  watch: { ring: "ring-[#F0DDBD]", chip: "bg-[#FBF1E2] text-[#8A5A12]", icon: AlertTriangle, text: "Keep an eye on it" },
  alert: { ring: "ring-[#F3D2BE]", chip: "bg-[#FDECE2] text-[#9A3412]", icon: AlertTriangle, text: "Needs attention" },
  neutral: { ring: "ring-line", chip: "bg-mist text-ink-muted", icon: Minus, text: "Info" },
  unknown: { ring: "ring-line", chip: "bg-mist text-ink-faint", icon: CircleHelp, text: "No data" },
};

/** One of the four main cards: icon, title, big plain word, one number, one sentence. */
export function StatusCard({ title, icon: Icon, state }: { title: string; icon: LucideIcon; state: CardState }) {
  const lv = LEVEL[state.level];
  return (
    <div className={cn("flex flex-col rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)] ring-1", lv.ring)}>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 text-[14px] font-medium text-ink">
          <span className="grid size-9 place-items-center rounded-xl bg-mist text-forest">
            <Icon className="size-[18px]" aria-hidden />
          </span>
          {title}
        </span>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", lv.chip)}>
          <lv.icon className="size-3" aria-hidden /> {lv.text}
        </span>
      </div>
      <p className="mt-4 text-[26px] leading-tight font-semibold tracking-tight text-ink">{state.label}</p>
      <p className="mt-0.5 font-mono text-[14px] text-ink-muted tabular-nums">{state.value}</p>
      <p className="mt-3 text-[13.5px] leading-5 text-ink">{state.detail}</p>
      {state.asOf && <p className="mt-auto pt-3 text-[11.5px] text-ink-faint">{state.asOf}</p>}
    </div>
  );
}
