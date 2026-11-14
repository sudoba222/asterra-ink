"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { shortDate, type DayObservation, type ForecastDay } from "@/entities/field-conditions";
import { chart } from "@/shared/config";
import { CloudRain, Thermometer } from "lucide-react";

interface TipProps {
  active?: boolean;
  payload?: Array<{ payload: { date: string }; value: number }>;
}

function Tip({ active, payload, unit }: TipProps & { unit: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-1.5 text-[12px] shadow-[var(--shadow-card)]">
      <span className="text-ink-muted">{shortDate(payload[0].payload.date)}: </span>
      <span className="font-mono font-semibold text-ink">
        {payload[0].value ?? "—"} {unit}
      </span>
    </div>
  );
}

function MiniChart({ title, unit, data, kind, dataKey }: { title: string; unit: string; data: DayObservation[]; kind: "bar" | "line"; dataKey: "rain" | "wetness" }) {
  const rows = data.map((d) => ({ date: d.date, v: d[dataKey] === null ? null : Math.round(d[dataKey]! * 10) / 10 }));
  return (
    <div>
      <p className="mb-1 text-[13px] font-medium text-ink">
        {title} <span className="font-normal text-ink-faint">({unit})</span>
      </p>
      <div className="h-[150px]" role="img" aria-label={`${title} for the last ${rows.length} days`}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === "bar" ? (
            <BarChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: -18 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={chart.grid} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10.5, fill: chart.axis }} tickLine={false} axisLine={{ stroke: chart.grid }} interval={6} />
              <YAxis tick={{ fontSize: 10.5, fill: chart.axis }} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
              <Tooltip cursor={{ fill: "rgba(23,62,50,0.05)" }} content={(p) => <Tip {...(p as unknown as TipProps)} unit={unit} />} />
              <Bar dataKey="v" fill={chart.current} radius={[4, 4, 0, 0]} maxBarSize={10} />
            </BarChart>
          ) : (
            <LineChart data={rows} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
              <CartesianGrid vertical={false} stroke={chart.grid} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10.5, fill: chart.axis }} tickLine={false} axisLine={{ stroke: chart.grid }} interval={6} />
              <YAxis tick={{ fontSize: 10.5, fill: chart.axis }} tickLine={false} axisLine={false} width={44} domain={[0, 100]} />
              <Tooltip cursor={{ stroke: chart.axis }} content={(p) => <Tip {...(p as unknown as TipProps)} unit={unit} />} />
              <Line type="monotone" dataKey="v" stroke={chart.current} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function RecentWeather({ history, forecast }: { history: DayObservation[]; forecast: ForecastDay[] }) {
  return (
    <div className="space-y-5">
      {forecast.length > 0 && (
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">
            Next 3 days <span className="font-normal text-ink-faint">(forecast, Open-Meteo)</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            {forecast.map((d, i) => (
              <div key={d.date} className="rounded-2xl bg-mist px-3 py-2.5">
                <p className="text-[12px] font-medium text-ink">{i === 0 ? "Today" : shortDate(d.date)}</p>
                <p className="mt-1 flex items-center gap-1 text-[12.5px] text-ink">
                  <Thermometer className="size-3.5 text-forest" aria-hidden /> {d.tMax !== null ? Math.round(d.tMax) : "—"}° / {d.tMin !== null ? Math.round(d.tMin) : "—"}°
                </p>
                <p className="flex items-center gap-1 text-[12.5px] text-ink">
                  <CloudRain className="size-3.5 text-forest" aria-hidden /> {d.rain !== null ? `${Math.round(d.rain * 10) / 10} mm` : "—"}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
      {history.length > 0 ? (
        <>
          <MiniChart title="Rain per day" unit="mm" data={history} kind="bar" dataKey="rain" />
          <MiniChart title="Soil moisture" unit="% of saturation" data={history} kind="line" dataKey="wetness" />
          <p className="text-[11.5px] text-ink-faint">Observed by NASA POWER for the ≈50 km area around your field, up to {shortDate(history.at(-1)!.date)}.</p>
        </>
      ) : (
        <p className="text-[13px] text-ink-muted">Recent NASA observations aren’t available right now.</p>
      )}
    </div>
  );
}
