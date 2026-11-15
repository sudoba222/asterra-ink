import type { FieldCalendar, MonthFlags } from "@/entities/crop";
import { cn, monthName } from "@/shared/lib";

type RowId = "bare" | "frost" | "heat" | "dry";

const ROWS: Array<{ id: RowId; label: string; hint: string; fill: string }> = [
  { id: "bare", label: "Bare", hint: "Bare soil seen from space (Sentinel-2 NDVI below 0.2)", fill: "bg-[#A9825A]" },
  { id: "frost", label: "Frost", hint: "Coldest hour below 0 °C (NASA POWER)", fill: "bg-info" },
  { id: "heat", label: "Hot", hint: "Hottest hour 40 °C or more (NASA POWER)", fill: "bg-concern" },
  { id: "dry", label: "Dry", hint: "Rain below half of crop water use (NASA POWER)", fill: "bg-watch" },
];

const cellState = (m: MonthFlags, row: RowId): boolean | null => (row === "bare" ? m.bare : m[row]);

/**
 * The 12-month strip: the field's last year, month by month (bare / frost / hot / dry), from
 * `fieldCalendar()`. A real table so screen readers get row and month headers; colour is never the
 * only signal (filled tile vs empty, row label, and text per cell for screen readers).
 */
export function FieldYearStrip({ calendar }: { calendar: FieldCalendar }) {
  return (
    <section aria-labelledby="field-year" className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3.5">
      <h4 id="field-year" className="text-[14px] font-semibold text-ink">
        Your field’s year <span className="font-normal text-ink-faint">(last 12 months)</span>
      </h4>
      <table className="mt-2.5 w-full table-fixed border-separate border-spacing-[2px] text-[10.5px]">
        <caption className="sr-only">Bare, frost, hot and dry months on your field in the last 12 months</caption>
        <colgroup>
          <col className="w-[3.25rem]" />
          {calendar.months.map((m) => (
            <col key={m.month} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <td />
            {calendar.months.map((m) => (
              <th key={m.month} scope="col" abbr={monthName(m.month - 1)} className="pb-0.5 text-center font-medium text-ink-faint">
                {monthName(m.month - 1).charAt(0)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.id}>
              <th scope="row" title={row.hint} className="pr-1 text-left text-[11.5px] font-medium text-ink-muted">
                {row.label}
              </th>
              {calendar.months.map((m) => {
                const on = cellState(m, row.id);
                const name = monthName(m.month - 1);
                return (
                  <td key={m.month} className="p-0">
                    <span
                      title={on === null ? `${name}: no clear satellite view` : `${name}: ${on ? row.label.toLowerCase() : `not ${row.label.toLowerCase()}`}`}
                      className={cn(
                        "block h-4 rounded-[4px]",
                        on === true && row.fill,
                        on === false && "bg-mist",
                        on === null && "border border-dashed border-line-strong",
                      )}
                    >
                      <span className="sr-only">{on === null ? "no clear view" : on ? "yes" : "no"}</span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[12.5px] leading-5 text-ink">{calendar.sentence}</p>
      {calendar.months.some((m) => m.bare === null) && (
        <p className="mt-0.5 text-[11.5px] leading-4 text-ink-faint">Dashed: clouds hid the field all month, so we can’t say if it was bare.</p>
      )}
    </section>
  );
}
