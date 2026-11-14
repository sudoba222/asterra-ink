import { cn } from "@/shared/lib";

/**
 * ASTERRA mark: an orbit ring around a sprouting leaf.
 * The browser icons (app/icon.svg, app/favicon.ico, app/apple-icon.png) are this same
 * artwork — update them together if the mark changes.
 */
export function Logo({
  className,
  dark = true,
}: {
  className?: string;
  dark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="15" fill={dark ? "#173E32" : "#173E32"} />
        <ellipse
          cx="16"
          cy="16"
          rx="12.5"
          ry="5"
          fill="none"
          stroke="#C5E58A"
          strokeOpacity="0.55"
          strokeWidth="1.2"
          transform="rotate(-24 16 16)"
        />
        <path d="M16 23c0-6 2.5-9.5 7-11-0.5 5-3 8.5-7 11Z" fill="#C5E58A" />
        <path
          d="M16 23c0-4.5-1.8-7.2-5.5-8.4 0.3 3.9 2.2 6.6 5.5 8.4Z"
          fill="#C5E58A"
          fillOpacity="0.7"
        />
        <circle cx="25.5" cy="11.2" r="1.6" fill="#C5E58A" />
      </svg>
      <span
        className={cn(
          "text-[15px] font-semibold tracking-[0.22em]",
          dark ? "text-white" : "text-forest",
        )}
      >
        ASTERRA
      </span>
    </span>
  );
}
