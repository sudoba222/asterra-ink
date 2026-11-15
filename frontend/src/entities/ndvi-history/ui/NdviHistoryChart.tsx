"use client";

import { RefreshCw } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { LonLat } from "@/entities/field";
import { shortDate } from "@/entities/field-conditions";
import { chart } from "@/shared/config";
import { useNdviHistory } from "../api/use-ndvi-history";
import { BARE_SOIL_NDVI, summarizeNdvi, type NdviPoint } from "../lib/summary";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthTick = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1] ?? iso;

function Tip({ active, payload }: { active?: boolean; payload?: Array<{ payload: NdviPoint }> }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-1.5 text-[12px] shadow-[var(--shadow-card)]">
      <span className="text-ink-muted">{shortDate(p.date)}: </span>
      <span className="font-mono font-semibold text-ink">NDVI {p.ndvi.toFixed(2)}</span>
    </div>
  );
}

/** Last 12 months of Sentinel-2 NDVI (10 m) for the field, from the ASTERRA backend (Copernicus). */
export function NdviHistoryChart({ polygon }: { polygon: LonLat[] }) {
  const { status, data, error, retry } = useNdviHistory(polygon);
  const summary = useMemo(() => (data ? summarizeNdvi(data.series) : null), [data]);

  if (status === "loading") return <p className="text-[13px] text-ink-muted">Loading 12 months of Sentinel-2 satellite data…</p>;
  if (status === "error")
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-muted">
        <p className="min-w-0 flex-1">{error}</p>
        <button type="button" onClick={retry} className="inline-flex items-center gap-1.5 rounded-full bg-mist px-3 py-1 font-medium text-ink hover:bg-line">
          <RefreshCw className="size-3.5" aria-hidden /> Try again
        </button>
      </div>
    );
  if (!summary || summary.points.length === 0)
    return <p className="text-[13px] text-ink-muted">Clouds covered your field in every Sentinel-2 image of the last 12 months, so there is no history to show.</p>;

  const { points, latest, peak, barePeriods } = summary;
  const low = Math.min(0, ...points.map((p) => p.ndvi));
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-medium text-ink">
        Last 12 months <span className="font-normal text-ink-faint">(NDVI, Sentinel-2, 10 m)</span>
      </p>
      <div className="h-[170px]" role="img" aria-label={`NDVI over the last 12 months: ${points.length} clear satellite views, peak ${peak?.ndvi.toFixed(2)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 6, right: 4, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke={chart.grid} />
            <ReferenceArea y1={low} y2={BARE_SOIL_NDVI} fill={chart.comparison} fillOpacity={0.08} ifOverflow="extendDomain" />
            <XAxis dataKey="date" tickFormatter={monthTick} tick={{ fontSize: 10.5, fill: chart.axis }} tickLine={false} axisLine={{ stroke: chart.grid }} minTickGap={18} />
            <YAxis domain={[low, 1]} ticks={[0, 0.2, 0.5, 0.8]} tick={{ fontSize: 10.5, fill: chart.axis }} tickLine={false} axisLine={false} width={44} />
            <Tooltip cursor={{ stroke: chart.axis }} content={(p) => <Tip {...(p as unknown as { active?: boolean; payload?: Array<{ payload: NdviPoint }> })} />} />
            <Line type="monotone" dataKey="ndvi" stroke={chart.current} strokeWidth={2} dot={{ r: 2.5, fill: chart.current, strokeWidth: 0 }} activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[13px] leading-5 text-ink">
        {latest && <>Latest clear view: <b className="font-semibold">{latest.ndvi.toFixed(2)}</b> ({shortDate(latest.date)}). </>}
        {peak && <>Greenest: <b className="font-semibold">{peak.ndvi.toFixed(2)}</b> ({shortDate(peak.date)}). </>}
        {barePeriods > 0
          ? `Bare soil (shaded, below ${BARE_SOIL_NDVI}) in ${barePeriods} of ${points.length} clear views — before planting, after harvest or fallow.`
          : "The field was green in every clear view."}
      </p>
      <p className="text-[12px] text-ink-muted">
        Source: Copernicus Sentinel-2 L2A (ESA), 10 m pixels, cloudy pixels removed; {points.length} clear views, one per 10 days at most.
      </p>
    </div>
  );
}
