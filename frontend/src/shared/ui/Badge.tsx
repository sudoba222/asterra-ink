import type { ReactNode } from "react";
import { cn } from "@/shared/lib";

type Tone = "neutral" | "live" | "sample" | "derived" | "unavailable" | "lime" | "dark";

const tones: Record<Tone, string> = {
  neutral: "bg-mist text-ink-muted border-line",
  live: "bg-[#E7F4EC] text-[#1F6B43] border-[#CDE7D6]",
  sample: "bg-[#FBF1E2] text-[#8A5A12] border-[#F0DDBD]",
  derived: "bg-[#E8F0F5] text-[#2F5A75] border-[#D3E2EC]",
  unavailable: "bg-[#F3F3F1] text-[#7A7A72] border-[#E4E4DF]",
  lime: "bg-lime text-deep border-lime",
  dark: "bg-white/8 text-white/80 border-white/10",
};

export function Badge({
  children,
  tone = "neutral",
  className,
  dot,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {children}
    </span>
  );
}
