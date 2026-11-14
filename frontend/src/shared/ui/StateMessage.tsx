import type { ReactNode } from "react";
import { cn } from "@/shared/lib";

export function StateMessage({
  icon,
  title,
  description,
  action,
  tone = "light",
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] px-6 py-10 text-center",
        tone === "light" ? "border border-dashed border-line-strong bg-surface/60" : "text-white",
        className,
      )}
    >
      {icon && (
        <div
          className={cn(
            "mb-1 grid size-10 place-items-center rounded-full",
            tone === "light" ? "bg-mist text-forest" : "bg-white/10 text-lime",
          )}
        >
          {icon}
        </div>
      )}
      <p className={cn("text-sm font-semibold", tone === "light" ? "text-ink" : "text-white")}>{title}</p>
      {description && (
        <p className={cn("max-w-sm text-[13px] leading-5", tone === "light" ? "text-ink-muted" : "text-white/65")}>
          {description}
        </p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
