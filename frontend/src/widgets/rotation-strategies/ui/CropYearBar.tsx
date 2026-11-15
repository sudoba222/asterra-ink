import { monthsInGround, monthRanges, type FieldCalendar, type PlannedSeason } from "@/entities/crop";
import { cn, monthName } from "@/shared/lib";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Which of the field's risk months (frost / hot / dry) fall in each calendar month. */
function riskByMonth(calendar: FieldCalendar | null): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (!calendar) return out;
  const add = (months: number[], label: string) => months.forEach((m) => out.set(m, [...(out.get(m) ?? []), label]));
  add(calendar.frostMonths, "frost");
  add(calendar.heatMonths, "hot");
  add(calendar.dryMonths, "dry");
  return out;
}

/**
 * When each season's crop is in the ground, on one Jan–Dec scale (one row per season, so seasons in
 * different years never overlap). A mark under the rows shows the months that were frosty, hot or dry
 * on this field, so a crop growing through them stands out; the field strip above says which is which.
 */
export function CropYearBar({ seasons, calendar }: { seasons: PlannedSeason[]; calendar: FieldCalendar | null }) {
  const risk = riskByMonth(calendar);
  const summary = seasons
    .map((s, i) => `Season ${i + 1}, ${s.cropName}: ${monthRanges(monthsInGround(s))}`)
    .join(". ");

  return (
    <figure className="mt-3">
      <div role="img" aria-label={`Months in the ground. ${summary}.`} className="grid grid-cols-[1rem_repeat(12,minmax(0,1fr))] gap-[2px] text-[10px]">
        <span aria-hidden />
        {MONTHS.map((m) => (
          <span key={m} aria-hidden className="text-center leading-4 text-ink-faint">
            {monthName(m - 1).charAt(0)}
          </span>
        ))}
        {seasons.map((s, i) => {
          const grows = new Set(monthsInGround(s));
          return [
            <span key={`n${i}`} aria-hidden className="grid place-items-center text-[9.5px] font-semibold text-ink-muted">
              {i + 1}
            </span>,
            ...MONTHS.map((m) => {
              const flags = risk.get(m);
              return (
                <span
                  key={`${i}-${m}`}
                  aria-hidden
                  title={`${monthName(m - 1)}: ${grows.has(m) ? s.cropName : "no crop"}${flags ? ` · ${flags.join(", ")} month on your field` : ""}`}
                  className={cn("h-2.5 rounded-[3px]", grows.has(m) ? "bg-forest" : "bg-mist")}
                />
              );
            }),
          ];
        })}
        {risk.size > 0 && (
          <>
            <span aria-hidden />
            {MONTHS.map((m) => (
              <span key={`r${m}`} aria-hidden className={cn("h-[3px] rounded-full", risk.has(m) ? "bg-watch" : "bg-transparent")} />
            ))}
          </>
        )}
      </div>
      <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10.5px] leading-4 text-ink-faint">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-3 rounded-[2px] bg-forest" aria-hidden /> In the ground
        </span>
        {risk.size > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="h-[3px] w-3 rounded-full bg-watch" aria-hidden /> Frost, hot or dry month on your field
          </span>
        )}
      </figcaption>
    </figure>
  );
}
