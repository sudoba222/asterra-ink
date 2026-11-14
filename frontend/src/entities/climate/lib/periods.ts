import type { MonthlyValue } from "../model/types";

export interface PeriodPair {
  current: MonthlyValue[];
  comparison: MonthlyValue[];
}

/** Splits a chronological series (2N months) into comparison (first N) + current (last N). */
export function splitPeriods(values: MonthlyValue[], months: number): PeriodPair {
  const current = values.slice(-months);
  const comparison = values.slice(-months * 2, -months);
  return { current, comparison };
}

/** Consecutive "YYYY-MM" keys ending at `end`, `count` long. */
export function monthRange(end: string, count: number): string[] {
  let [y, m] = end.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return out;
}

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
