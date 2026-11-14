"use client";

import { ChevronDown, Download, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { fieldRepository, formatHectares, toGeoJsonFeature, type Field } from "@/entities/field";
import { shortDate, type FieldConditions } from "@/entities/field-conditions";
import { useFieldDraft } from "@/features/draw-field";
import { cn, formatCoord } from "@/shared/lib";
import { RecentWeather } from "./RecentWeather";

type Section = "weather" | "crop" | "plan" | "field";

/** Everything beyond the four cards, collapsed by default. */
export function MoreDetails({ field, data, plan }: { field: Field; data: FieldConditions | null; plan: ReactNode }) {
  const [open, setOpen] = useState<Section | null>(null);
  const toggle = (s: Section) => setOpen((o) => (o === s ? null : s));

  return (
    <section aria-labelledby="more-details" className="mt-6">
      <h2 id="more-details" className="mb-2 px-1 text-[13px] font-semibold text-ink-muted">
        More details
      </h2>
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <Item id="weather" title="Weather and soil — last 30 days" open={open} onToggle={toggle}>
          {data ? <RecentWeather history={data.history} forecast={data.forecast} /> : <Loading />}
        </Item>
        <Item id="crop" title="Crop health from space" open={open} onToggle={toggle}>
          {data ? <CropDetails data={data} /> : <Loading />}
        </Item>
        <Item id="plan" title="Plan your next crop" open={open} onToggle={toggle}>
          {open === "plan" && plan}
        </Item>
        <Item id="field" title="Field information and data sources" open={open} onToggle={toggle} last>
          <FieldInfo field={field} data={data} />
        </Item>
      </div>
    </section>
  );
}

function Item({ id, title, open, onToggle, children, last }: { id: Section; title: string; open: Section | null; onToggle: (s: Section) => void; children: ReactNode; last?: boolean }) {
  const isOpen = open === id;
  return (
    <div className={cn(!last && "border-b border-line")}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        aria-controls={`details-${id}`}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left text-[14px] font-medium text-ink transition-colors hover:bg-mist/60"
      >
        {title}
        <ChevronDown className={cn("size-4 text-ink-faint transition-transform", isOpen && "rotate-180")} aria-hidden />
      </button>
      {isOpen && (
        <div id={`details-${id}`} className="px-5 pb-5">
          {children}
        </div>
      )}
    </div>
  );
}

function Loading() {
  return <p className="text-[13px] text-ink-muted">Loading…</p>;
}

function CropDetails({ data }: { data: FieldConditions }) {
  const { ndvi, ndviLastYear } = data;
  if (!ndvi) {
    return (
      <p className="text-[13px] leading-5 text-ink-muted">
        No clear satellite pixels for your field right now (often clouds or snow). Try again in a few days — the NASA image updates daily on an 8-day window.
      </p>
    );
  }
  return (
    <div className="space-y-3 text-[13px] leading-5 text-ink">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-mist px-3 py-2.5">
          <p className="text-[11.5px] text-ink-muted">Now{ndvi.date ? ` (${shortDate(ndvi.date)})` : ""}</p>
          <p className="font-mono text-[20px] font-semibold tabular-nums">{ndvi.mean.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl bg-mist px-3 py-2.5">
          <p className="text-[11.5px] text-ink-muted">A year ago{ndviLastYear?.date ? ` (${shortDate(ndviLastYear.date)})` : ""}</p>
          <p className="font-mono text-[20px] font-semibold tabular-nums">{ndviLastYear ? ndviLastYear.mean.toFixed(2) : "—"}</p>
        </div>
      </div>
      <p>
        NDVI measures how green plants are, from 0 (bare soil) to about 0.9 (dense, healthy crops). Values below 0.2 are normal before planting or after harvest.
      </p>
      <p className="text-[12px] text-ink-muted">
        Source: NASA MODIS Terra, 250 m pixels, via NASA GIBS. {ndvi.pixels} pixel{ndvi.pixels === 1 ? "" : "s"} inside your field.
        {ndvi.smallerThanPixel && " Your field is smaller than one pixel, so the value includes the land around it."} Use “Layers → Crop health” on the map to see it.
      </p>
    </div>
  );
}

function FieldInfo({ field, data }: { field: Field; data: FieldConditions | null }) {
  const router = useRouter();
  const draft = useFieldDraft();
  const download = () => {
    const blob = new Blob([JSON.stringify(toGeoJsonFeature(field.polygon, { name: field.name, areaHa: field.areaHa }), null, 2)], { type: "application/geo+json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${field.name.replace(/[^\w-]+/g, "_") || "field"}.geojson`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const edit = () => {
    draft.start(
      {
        countryIso: field.countryIso,
        regionName: field.regionName,
        districtName: field.districtName,
        cityName: field.cityName ?? null,
        fieldId: field.id,
        fieldName: field.name,
      },
      field.polygon,
    );
    router.push("/");
  };
  const remove = () => {
    if (!window.confirm(`Delete “${field.name}”? This can’t be undone.`)) return;
    fieldRepository.remove(field.id);
    router.push("/");
  };

  return (
    <div className="space-y-4 text-[13px] text-ink">
      <dl className="grid grid-cols-[120px_1fr] gap-y-1.5">
        <dt className="text-ink-muted">Area</dt>
        <dd>{formatHectares(field.areaHa)}</dd>
        <dt className="text-ink-muted">Centre</dt>
        <dd>{formatCoord(field.centroid.lat, field.centroid.lon)}</dd>
        <dt className="text-ink-muted">Corners</dt>
        <dd>{field.polygon.length}</dd>
        <dt className="text-ink-muted">Saved</dt>
        <dd>{new Date(field.createdAt).toLocaleDateString("en-US", { dateStyle: "medium" })}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={edit} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 font-medium hover:bg-mist">
          <Pencil className="size-4" aria-hidden /> Edit boundary
        </button>
        <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 font-medium hover:bg-mist">
          <Download className="size-4" aria-hidden /> Download boundary (GeoJSON)
        </button>
        <button type="button" onClick={remove} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 font-medium text-[#9A3412] hover:bg-[#FDECE2]">
          <Trash2 className="size-4" aria-hidden /> Delete field
        </button>
      </div>
      <div>
        <p className="mb-1.5 text-[12px] font-semibold tracking-wide text-ink-muted uppercase">Where this data comes from</p>
        <ul className="space-y-1.5">
          {(data?.sources ?? []).map((s) => (
            <li key={s.id} className="flex gap-2">
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", s.ok ? "bg-good" : "bg-ink-faint")} aria-hidden />
              <span>
                <span className="font-medium">{s.name}</span>
                <span className="block text-[12px] text-ink-muted">{s.detail}</span>
              </span>
            </li>
          ))}
          <li className="flex gap-2">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-good" aria-hidden />
            <span>
              <span className="font-medium">Satellite photo: Esri World Imagery</span>
              <span className="block text-[12px] text-ink-muted">Used to find and outline your field (Esri, Maxar, Earthstar Geographics).</span>
            </span>
          </li>
          <li className="flex gap-2">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-good" aria-hidden />
            <span>
              <span className="font-medium">Regions and districts: geoBoundaries</span>
              <span className="block text-[12px] text-ink-muted">Open administrative boundaries (ODbL / CC BY). Area is calculated from your corners on the globe.</span>
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
