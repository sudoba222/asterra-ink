import { daysInMonth } from "./periods";

/**
 * Long-term climate change at the field, from NASA POWER monthly data (a transparent comparison,
 * no model): the first 5 years of the window vs the last 5 years, plus a least-squares trend
 * of annual mean temperature per decade.
 */

export interface ClimateTrend {
  years: { from: number; to: number };
  /** Annual mean temperature, °C. */
  meanTemp: { early: number; late: number; change: number; perDecade: number } | null;
  /** Mean temperature of each year's three warmest months, °C. */
  summerTemp: { early: number; late: number; change: number } | null;
  /** Annual rain, mm, plus the driest and wettest year (rain varies a lot between years). */
  annualRain: { early: number; late: number; changePct: number; driest: { year: number; mm: number }; wettest: { year: number; mm: number } } | null;
  /** Months per year whose lowest temperature (T2M_MIN) is below 0 °C. */
  frostMonths: { early: number; late: number; change: number } | null;
  /** e.g. "Since 2005–2009: 1.2 °C warmer, summers +1.0 °C, rain −8 %, 1 fewer frost month a year." */
  sentence: string;
  evidence: Array<{ text: string; source: string }>;
}

/** "YYYY-MM" → value, as returned by `fetchPowerMonthly`. */
export type MonthlySeries = Record<string, number | null>;

const WINDOW = 5;
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
const r1 = (v: number) => Math.round(v * 10) / 10;

/** One value per year, only for years with all 12 months present. */
function yearly(series: MonthlySeries, from: number, to: number, f: (months: number[], year: number) => number): Map<number, number> {
  const out = new Map<number, number>();
  for (let y = from; y <= to; y++) {
    const months = Array.from({ length: 12 }, (_, i) => series[`${y}-${String(i + 1).padStart(2, "0")}`]);
    if (months.every((v): v is number => v != null)) out.set(y, f(months as number[], y));
  }
  return out;
}

function compare(byYear: Map<number, number>, from: number, to: number) {
  const early = [...byYear].filter(([y]) => y < from + WINDOW).map(([, v]) => v);
  const late = [...byYear].filter(([y]) => y > to - WINDOW).map(([, v]) => v);
  if (early.length < 3 || late.length < 3) return null;
  return { early: mean(early), late: mean(late) };
}

function slopePerDecade(byYear: Map<number, number>): number {
  const pts = [...byYear];
  const mx = mean(pts.map(([y]) => y));
  const my = mean(pts.map(([, v]) => v));
  const num = pts.reduce((s, [y, v]) => s + (y - mx) * (v - my), 0);
  const den = pts.reduce((s, [y]) => s + (y - mx) ** 2, 0);
  return den ? (num / den) * 10 : 0;
}

const signed = (v: number, unit: string) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(1)}${unit}`;

export function climateTrend(t2m: MonthlySeries, t2mMin: MonthlySeries, precip: MonthlySeries, from: number, to: number): ClimateTrend {
  const temp = yearly(t2m, from, to, (m) => mean(m));
  const summer = yearly(t2m, from, to, (m) => mean([...m].sort((a, b) => b - a).slice(0, 3)));
  const rain = yearly(precip, from, to, (m, y) => m.reduce((s, v, i) => s + v * daysInMonth(`${y}-${String(i + 1).padStart(2, "0")}`), 0));
  const frost = yearly(t2mMin, from, to, (m) => m.filter((v) => v < 0).length);

  const t = compare(temp, from, to);
  const s = compare(summer, from, to);
  const r = compare(rain, from, to);
  const f = compare(frost, from, to);

  const meanTemp = t ? { early: r1(t.early), late: r1(t.late), change: r1(t.late - t.early), perDecade: Math.round(slopePerDecade(temp) * 100) / 100 } : null;
  const summerTemp = s ? { early: r1(s.early), late: r1(s.late), change: r1(s.late - s.early) } : null;
  const rainYears = [...rain].sort((a, b) => a[1] - b[1]);
  const annualRain =
    r && r.early > 0
      ? {
          early: Math.round(r.early),
          late: Math.round(r.late),
          changePct: Math.round(((r.late - r.early) / r.early) * 100),
          driest: { year: rainYears[0][0], mm: Math.round(rainYears[0][1]) },
          wettest: { year: rainYears.at(-1)![0], mm: Math.round(rainYears.at(-1)![1]) },
        }
      : null;
  const frostMonths = f ? { early: r1(f.early), late: r1(f.late), change: r1(f.late - f.early) } : null;

  const early = `${from}–${from + WINDOW - 1}`;
  const late = `${to - WINDOW + 1}–${to}`;
  const parts: string[] = [];
  if (meanTemp) parts.push(meanTemp.change === 0 ? "same average temperature" : `${Math.abs(meanTemp.change).toFixed(1)} °C ${meanTemp.change > 0 ? "warmer" : "cooler"}`);
  if (summerTemp) parts.push(`summers ${signed(summerTemp.change, " °C")}`);
  if (annualRain) parts.push(`rain ${annualRain.changePct > 0 ? "+" : annualRain.changePct < 0 ? "−" : "±"}${Math.abs(annualRain.changePct)} %`);
  if (frostMonths && Math.abs(frostMonths.change) >= 0.5) {
    const n = Math.round(Math.abs(frostMonths.change));
    parts.push(`${n} ${frostMonths.change < 0 ? "fewer" : "more"} frost month${n === 1 ? "" : "s"} a year`);
  }
  const sentence = parts.length ? `Since ${early}: ${parts.join(", ")}.` : "Not enough NASA POWER history for a trend here.";

  const source = `NASA POWER (${from}–${to})`;
  const evidence: ClimateTrend["evidence"] = [];
  if (meanTemp) evidence.push({ text: `Average temperature went from ${meanTemp.early} °C (${early}) to ${meanTemp.late} °C (${late}), about ${signed(meanTemp.perDecade, " °C")} per decade.`, source });
  if (summerTemp && summerTemp.change >= 0.5) evidence.push({ text: `The three warmest months are ${summerTemp.change.toFixed(1)} °C hotter than in ${early}: more heat stress for summer crops.`, source });
  if (annualRain && Math.abs(annualRain.changePct) >= 5) evidence.push({ text: `Annual rain ${annualRain.changePct < 0 ? "fell" : "rose"} from ${annualRain.early} mm (${early}) to ${annualRain.late} mm (${late}), ${annualRain.changePct > 0 ? "+" : "−"}${Math.abs(annualRain.changePct)} %.`, source });
  if (annualRain) evidence.push({ text: `Rain changes a lot from year to year: ${annualRain.driest.mm} mm in ${annualRain.driest.year}, ${annualRain.wettest.mm} mm in ${annualRain.wettest.year}. Plan for dry years.`, source });
  if (frostMonths && Math.abs(frostMonths.change) >= 0.5) evidence.push({ text: `Frost months per year: ${frostMonths.early} → ${frostMonths.late}.`, source });
  return { years: { from, to }, meanTemp, summerTemp, annualRain, frostMonths, sentence, evidence };
}
