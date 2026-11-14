import { cn } from "@/shared/lib";

export function Skeleton({ className, dark }: { className?: string; dark?: boolean }) {
  return <div aria-hidden className={cn(dark ? "skeleton-dark" : "skeleton", "rounded-xl", className)} />;
}
