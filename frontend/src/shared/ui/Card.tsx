import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/shared/lib";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padded?: boolean;
  tone?: "surface" | "mist" | "forest";
}

export function Card({ children, className, padded = true, tone = "surface", ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border shadow-[var(--shadow-card)]",
        tone === "surface" && "border-line bg-surface",
        tone === "mist" && "border-line bg-mist",
        tone === "forest" && "border-forest bg-forest text-white",
        padded && "p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
