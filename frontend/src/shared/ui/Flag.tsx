import { cn } from "@/shared/lib";

/** Country flag from /public/flags (copied from world-countries at install). */
export function Flag({ iso3, name, className }: { iso3: string; name: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs; next/image adds no value here
    <img
      src={`/flags/${iso3}.svg`}
      alt={`${name} flag`}
      loading="lazy"
      decoding="async"
      className={cn("inline-block shrink-0 rounded-[3px] object-cover ring-1 ring-black/10", className ?? "h-4 w-6")}
    />
  );
}
