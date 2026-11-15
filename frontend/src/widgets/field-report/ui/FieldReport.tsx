"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  CATALOG_VERSION,
  CONFIDENCE_LABEL,
  STRATEGY_PURPOSE,
  WEIGHTS,
  bareMonthsAfter,
  comparisonRows,
  confidenceExplanation,
  describeProfile,
  monthsInGround,
  seasonWindow,
  STRATEGY_DISCLAIMER,
  type CandidateResult,
  type CheckKind,
  type CropPlanResult,
  type FarmerProfile,
  type FieldCalendar,
  type RotationStrategy,
  type Signal,
  type StrategyComparison,
} from "@/entities/crop";
import { formatHectares, placeLabel, ringToSvgPath, type Field } from "@/entities/field";
import { shortDate, summariseHistory, type CardState, type FieldConditions, type Level } from "@/entities/field-conditions";
import type { LandSuitability } from "@/entities/land-suitability";
import { formatCoord, formatNumber, monthName } from "@/shared/lib";
import { Logo } from "@/shared/ui";
import type { FieldPhoto } from "../model/use-field-photo";

interface Props {
  field: Field;
  conditions: FieldConditions | null;
  conditionsError: string | null;
  farmer: FarmerProfile;
  /** Crop plan after the land check; `status: "unsuitable_land"` means no crops are recommended. */
  rotation: CropPlanResult | null;
  rotationError: string | null;
  /** The three rotation strategies shown under the questionnaire (null when there's no crop plan). */
  strategies: StrategyComparison | null;
  /** Field sources the strategies couldn't use (failed to load), named under the strategies. */
  strategySourcesMissing?: string[];
  /** Land check result (null while unknown or if the check failed). */
  land: LandSuitability | null;
  photo: FieldPhoto;
}

const LEVEL: Record<Level, { word: string; color: string }> = {
  good: { word: "Good", color: "#2F8A4E" },
  watch: { word: "Watch", color: "#B7791F" },
  alert: { word: "Act now", color: "#C2410C" },
  neutral: { word: "Info", color: "#3B6E8F" },
  unknown: { word: "No data", color: "#A3ADA4" },
};

const CHECK: Record<CheckKind, { mark: string; color: string }> = {
  pass: { mark: "✓", color: "#2F8A4E" },
  warn: { mark: "!", color: "#B7791F" },
  fail: { mark: "✕", color: "#C2410C" },
  note: { mark: "i", color: "#3B6E8F" },
};

const STATUS_WORD: Record<CandidateResult["status"], string> = {
  suitable: "Passes filters",
  caution: "Possible, with cautions",
  excluded: "Filtered out",
};

const TOP_EXPLAINED = 3;

const SIGNAL_COLOR: Record<Signal, string> = { good: "#2F8A4E", watch: "#B7791F", concern: "#C2410C", unknown: "#A3ADA4" };
const CONFIDENCE_COLOR: Record<RotationStrategy["confidence"], string> = { high: "#2F8A4E", medium: "#B7791F", low: "#C2410C" };

const noop = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

const photoWidth = (m: number) => (m >= 1000 ? `≈ ${formatNumber(m / 1000, 1)} km across` : `≈ ${Math.round(m / 10) * 10} m across`);
const fmtDateTime = (d: Date) => d.toLocaleString("en-US", { dateStyle: "long", timeStyle: "short" });
const fmt = (v: number | null | undefined, digits: number, unit: string) => (v === null || v === undefined ? "—" : `${formatNumber(v, digits)} ${unit}`);

/**
 * Print-only A4 field report. Hidden on screen; `@media print` in globals.css hides the app and
 * shows only this, so "Download PDF report" (window.print → Save as PDF) produces a clean document.
 */
export function FieldReport(props: Props) {
  const isClient = useIsClient();
  if (!isClient) return null;
  return createPortal(
    <div data-print-report className="hidden bg-white font-sans text-[10.5px] leading-[1.45] text-[#202820]">
      <ReportBody {...props} />
    </div>,
    document.body,
  );
}

function ReportBody({ field, conditions, conditionsError, farmer, rotation, rotationError, strategies, strategySourcesMissing = [], land, photo }: Props) {
  const [printedAt, setPrintedAt] = useState(() => new Date());
  useEffect(() => {
    const onBefore = () => setPrintedAt(new Date());
    window.addEventListener("beforeprint", onBefore);
    return () => window.removeEventListener("beforeprint", onBefore);
  }, []);
  const place = placeLabel(field);
  const planN = conditions ? 4 : 3;

  return (
    <article>
      <header className="flex items-start justify-between border-b-2 border-[#173E32] pb-3">
        <Logo dark={false} />
        <div className="text-right text-[9.5px] text-[#5F6B60]">
          <p className="text-[11px] font-semibold tracking-wide text-[#173E32] uppercase">Field report</p>
          <p>Generated {fmtDateTime(printedAt)}</p>
        </div>
      </header>

      <div className="mt-4 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-semibold tracking-tight">{field.name}</h1>
          <p className="mt-1 text-[11.5px] text-[#5F6B60]">
            {formatHectares(field.areaHa)}
            {place ? ` · ${place}` : ""}
          </p>
          {rotation?.status === "unsuitable_land" ? (
            <div className="mt-3 rounded-lg border-l-4 border-[#C2410C] py-1 pl-3">
              <p className="text-[9px] font-semibold tracking-wide text-[#5F6B60] uppercase">Land check</p>
              <p className="text-[14px] font-semibold">{rotation.message}</p>
            </div>
          ) : conditions?.recommendation && (
            <div
              className="mt-3 rounded-lg border-l-4 py-1 pl-3"
              style={{
                borderColor: LEVEL[conditions.recommendation.level].color,
              }}
            >
              <p className="text-[9px] font-semibold tracking-wide text-[#5F6B60] uppercase">Today’s recommendation</p>
              <p className="text-[14px] font-semibold">{conditions.recommendation.title}</p>
              {conditions.recommendation.reasons.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {conditions.recommendation.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <Section n={1} title="Field">
        <div className="grid grid-cols-[95mm_1fr] items-start gap-6">
          <FieldPhotoFigure field={field} photo={photo} />
          <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5">
            <Row label="Area" value={formatHectares(field.areaHa)} />
            <Row label="Centre" value={formatCoord(field.centroid.lat, field.centroid.lon)} />
            <Row label="Corners" value={String(field.polygon.length)} />
            <Row
              label="Saved"
              value={new Date(field.createdAt).toLocaleDateString("en-US", {
                dateStyle: "medium",
              })}
            />
            <Row label="Location" value={place || "—"} />
            <Row label="Country" value={field.countryIso ?? "—"} />
            <Row label="Photo width" value={photoWidth(photo.frame.metresPerPx * photo.frame.sizePx)} />
          </dl>
        </div>
      </Section>

      {conditions ? (
        <>
          <Section n={2} title="Conditions now">
            <p className="mb-2 text-[9.5px] text-[#5F6B60]">
              {conditions.observedUntil ? `NASA observations until ${shortDate(conditions.observedUntil)}` : "No recent NASA observations"}
              {conditions.forecastFrom ? ` · forecast from ${shortDate(conditions.forecastFrom)}` : ""}
            </p>
            <Table head={["", "Status", "Value", "What it means", "As of"]} widths={["16%", "13%", "11%", "46%", "14%"]}>
              <CardRow title="Temperature" s={conditions.temperature} />
              <CardRow title="Soil moisture" s={conditions.soil} />
              <CardRow title="Crop health" s={conditions.crop} />
              <CardRow title="Irrigation" s={conditions.irrigation} />
            </Table>
            <p className="mt-2">
              <b className="font-semibold">Crop greenness (NDVI):</b>{" "}
              {conditions.ndvi
                ? `${conditions.ndvi.mean.toFixed(2)} now${conditions.ndvi.date ? ` (${shortDate(conditions.ndvi.date)})` : ""}, ${
                    conditions.ndviLastYear ? `${conditions.ndviLastYear.mean.toFixed(2)} a year ago` : "no reading a year ago"
                  }. 0 is bare soil, about 0.9 is dense healthy crops.`
                : "no clear satellite pixels right now (often clouds or snow)."}
            </p>
          </Section>

          <Section n={3} title="Weather">
            <WeatherSummary conditions={conditions} />
          </Section>
        </>
      ) : (
        <Section n={2} title="Conditions now">
          <Unavailable>
            Field conditions couldn’t be loaded
            {conditionsError ? `: ${conditionsError}` : "."}
          </Unavailable>
        </Section>
      )}

      <Section n={planN} title="Crop plan" flow>
        <CropPlan farmer={farmer} rotation={rotation} rotationError={rotationError} />
      </Section>

      {strategies && (
        <Section n={planN + 1} title="Rotation strategies: next 3 seasons" flow pageBreak>
          <RotationStrategies comparison={strategies} missing={strategySourcesMissing} />
          <p className="mt-3 text-[10.5px] leading-snug text-[#6B4A12]">{STRATEGY_DISCLAIMER}</p>
        </Section>
      )}

      <Section n={planN + (strategies ? 2 : 1)} title="Data sources">
        <ul className="space-y-0.5">
          {[...(conditions?.sources ?? []), ...(land?.sources ?? [])].map((s) => (
            <li key={s.id}>
              <b className="font-semibold">{s.name}</b> {s.ok ? "" : "(unavailable) "}— {s.detail}
            </li>
          ))}
          <li>
            <b className="font-semibold">Crop planning climate: NASA POWER</b> — monthly temperature and rainfall for the field centre.
          </li>
          <li>
            <b className="font-semibold">Satellite photo: Esri World Imagery</b> — used to outline the field (Esri, Maxar, Earthstar Geographics).
          </li>
          <li>
            <b className="font-semibold">Regions and districts: geoBoundaries</b> — open administrative boundaries (ODbL / CC BY).
          </li>
        </ul>
      </Section>

      <footer className="mt-6 border-t border-[#D5DDD2] pt-2 text-[9px] leading-[1.5] text-[#5F6B60]">
        <b className="font-semibold text-[#6B4A12]">Indicative, not validated agronomic advice.</b> Crop suggestions come from documented rules and a small crop
        catalog (v
        {CATALOG_VERSION}, ranges summarised from FAO ECOCROP, pending agronomy review), not field trials. Profit is never estimated. Confirm decisions with a
        local extension service. Generated by ASTERRA on {fmtDateTime(printedAt)}.
      </footer>
    </article>
  );
}

/** Large satellite photo (Esri World Imagery) with the field boundary, north arrow and scale bar drawn on top. */
function FieldPhotoFigure({ field, photo }: { field: Field; photo: FieldPhoto }) {
  const { frame } = photo;
  const S = frame.sizePx;
  const ok = photo.status === "ready";
  const outline = ok ? `M${frame.points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L")}Z` : ringToSvgPath(field.polygon, S, S * 0.16);
  const bar = frame.scaleBar;
  const m = S * 0.025; // overlay margin
  return (
    <figure className="break-inside-avoid">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-[#D5DDD2] bg-[#F7F9F4]">
        {ok && (
          // eslint-disable-next-line @next/next/no-img-element -- static still for print; next/image would add a loader round-trip
          <img src={photo.url} alt={`Satellite photo of ${field.name}`} crossOrigin="anonymous" className="absolute inset-0 size-full object-cover" />
        )}
        <svg viewBox={`0 0 ${S} ${S}`} className="absolute inset-0 size-full" aria-hidden>
          {ok ? (
            <>
              <path d={outline} fill="#C5E58A" fillOpacity="0.12" stroke="#0A1813" strokeOpacity="0.65" strokeWidth={S * 0.014} strokeLinejoin="round" />
              <path d={outline} fill="none" stroke="#C5E58A" strokeWidth={S * 0.007} strokeLinejoin="round" />
            </>
          ) : (
            <path d={outline} fill="#C5E58A" fillOpacity="0.55" stroke="#173E32" strokeWidth={S * 0.006} strokeLinejoin="round" />
          )}
          {/* North arrow */}
          <g transform={`translate(${S - m - S * 0.065} ${m})`}>
            <rect width={S * 0.065} height={S * 0.09} rx={S * 0.012} fill="#fff" fillOpacity="0.9" />
            <text x={S * 0.0325} y={S * 0.04} textAnchor="middle" fontSize={S * 0.03} fontWeight="700" fill="#173E32">
              N
            </text>
            <path d={`M${S * 0.0325} ${S * 0.048} l${-S * 0.014} ${S * 0.03} h${S * 0.028} Z`} fill="#173E32" />
          </g>
          {/* Scale bar (only on the photo: the fallback outline is not drawn to scale) */}
          {ok && (
            <g transform={`translate(${m} ${S - m - S * 0.07})`}>
              <rect width={bar.px + S * 0.05} height={S * 0.07} rx={S * 0.012} fill="#fff" fillOpacity="0.9" />
              <text x={S * 0.025} y={S * 0.032} fontSize={S * 0.026} fontWeight="600" fill="#173E32">
                {bar.label}
              </text>
              <path
                d={`M${S * 0.025} ${S * 0.042} v${S * 0.014} h${bar.px} v${-S * 0.014}`}
                fill="none"
                stroke="#173E32"
                strokeWidth={S * 0.004}
                strokeLinejoin="round"
              />
            </g>
          )}
        </svg>
      </div>
      <figcaption className="mt-1 text-[8.5px] text-[#5F6B60]">
        {ok ? "Satellite view, north up · Imagery: Esri, Maxar, Earthstar Geographics" : "Satellite photo unavailable, outline only (north up)"}
      </figcaption>
    </figure>
  );
}

/** `flow` lets a long section run across pages (its inner blocks still avoid splitting); `pageBreak` starts it on a new page. */
function Section({ n, title, children, flow, pageBreak }: { n: number; title: string; children: ReactNode; flow?: boolean; pageBreak?: boolean }) {
  return (
    <section className={`${flow ? "mt-5" : "mt-5 break-inside-avoid"} ${pageBreak ? "break-before-page" : ""}`}>
      <h2 className="mb-2 flex break-after-avoid items-baseline gap-2 border-b border-[#D5DDD2] pb-1 text-[12.5px] font-semibold text-[#173E32]">
        <span className="text-[10px] text-[#A3ADA4]">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[#5F6B60]">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </>
  );
}

function Table({ head, widths, children }: { head: string[]; widths?: string[]; children: ReactNode }) {
  return (
    <table className="w-full table-fixed border-collapse">
      {widths && (
        <colgroup>
          {widths.map((w, i) => (
            <col key={i} style={{ width: w }} />
          ))}
        </colgroup>
      )}
      <thead>
        <tr className="border-b border-[#D5DDD2] text-left text-[9px] tracking-wide text-[#5F6B60] uppercase">
          {head.map((h, i) => (
            <th key={i} className="py-1 pr-2 font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={`border-b border-[#EEF3EA] py-1 pr-2 align-top ${className ?? ""}`}>{children}</td>;
}

function Dot({ color }: { color: string }) {
  return <span className="mr-1 inline-block size-2 rounded-full align-middle" style={{ backgroundColor: color }} aria-hidden />;
}

function CardRow({ title, s }: { title: string; s: CardState }) {
  return (
    <tr className="break-inside-avoid">
      <Td className="font-semibold">{title}</Td>
      <Td>
        <Dot color={LEVEL[s.level].color} />
        {s.label}
      </Td>
      <Td className="font-mono">{s.value || "—"}</Td>
      <Td>{s.detail}</Td>
      <Td className="text-[#5F6B60]">{s.asOf ?? "—"}</Td>
    </tr>
  );
}

function WeatherSummary({ conditions }: { conditions: FieldConditions }) {
  const s = summariseHistory(conditions.history);
  const forecast = conditions.forecast.slice(0, 7);
  return (
    <div className="grid grid-cols-[1fr_1.15fr] gap-5">
      <div>
        <p className="mb-1 font-semibold">
          Last {s.days} days
          {s.from && s.to ? ` (${shortDate(s.from)} – ${shortDate(s.to)})` : ""}
        </p>
        <dl className="grid grid-cols-[1fr_auto] gap-y-0.5">
          <Row label="Rain" value={s.rainMm === null ? "—" : `${formatNumber(s.rainMm, 0)} mm on ${s.rainyDays} day${s.rainyDays === 1 ? "" : "s"}`} />
          <Row label="Average temperature" value={fmt(s.meanTempC, 1, "°C")} />
          <Row
            label="Coldest / warmest"
            value={s.minTempC === null || s.maxTempC === null ? "—" : `${formatNumber(s.minTempC, 0)} / ${formatNumber(s.maxTempC, 0)} °C`}
          />
          <Row label="Water used by crops (ET₀)" value={fmt(s.et0Mm, 0, "mm")} />
          <Row label="Latest soil wetness" value={fmt(s.latestWetness, 0, "%")} />
        </dl>
      </div>
      <div>
        <p className="mb-1 font-semibold">Next {forecast.length} days</p>
        {forecast.length ? (
          <Table head={["Day", "Low", "High", "Rain"]}>
            {forecast.map((d) => (
              <tr key={d.date}>
                <Td>{shortDate(d.date)}</Td>
                <Td className="font-mono">{fmt(d.tMin, 0, "°C")}</Td>
                <Td className="font-mono">{fmt(d.tMax, 0, "°C")}</Td>
                <Td className="font-mono">{fmt(d.rain, 1, "mm")}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="text-[#5F6B60]">No forecast available.</p>
        )}
      </div>
    </div>
  );
}

function CropPlan({ farmer, rotation, rotationError }: { farmer: FarmerProfile; rotation: CropPlanResult | null; rotationError: string | null }) {
  const answers = describeProfile(farmer);
  const ranked = rotation?.candidates.filter((c) => c.status !== "excluded") ?? [];
  const excluded = rotation?.candidates.filter((c) => c.status === "excluded") ?? [];

  return (
    <div className="space-y-4">
      <div className="break-inside-avoid">
        <p className="mb-1 font-semibold">Your answers</p>
        <dl className="grid grid-cols-[110px_1fr_110px_1fr] gap-x-3 gap-y-1">
          {answers.map((a) => (
            <Row key={a.label} label={a.label} value={a.value} />
          ))}
        </dl>
      </div>

      {rotation?.status === "unsuitable_land" ? (
        <Unavailable>{rotation.message}</Unavailable>
      ) : !rotation ? (
        <Unavailable>
          Crop plan unavailable: climate data for planning couldn’t be loaded
          {rotationError ? ` (${rotationError})` : ""}.
        </Unavailable>
      ) : (
        <>
          {rotation.status === "land_uncertain" && (
            <p className="break-inside-avoid rounded-md border border-[#F0DDBD] bg-[#FBF5EA] px-3 py-2 text-[#6B4A12]">
              <b className="font-semibold">Land not confirmed as farmland.</b> {rotation.message}
            </p>
          )}
          {(rotation.notes.length > 0 || rotation.missingData.length > 0) && (
            <div className="grid break-inside-avoid grid-cols-2 gap-5">
              {rotation.notes.length > 0 && (
                <div>
                  <p className="mb-1 font-semibold">Notes</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {rotation.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
              {rotation.missingData.length > 0 && (
                <div>
                  <p className="mb-1 font-semibold">Needed for a stronger recommendation</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-[#5F6B60]">
                    {rotation.missingData.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-1 font-semibold">Suggested crops, best first</p>
            {ranked.length ? (
              <Table head={["#", "Crop", "Family", "Season", "Water need", "Status", "Points"]} widths={["5%", "19%", "18%", "15%", "12%", "21%", "10%"]}>
                {ranked.map((c, i) => (
                  <tr key={c.crop.id} className="break-inside-avoid">
                    <Td className="font-mono text-[#A3ADA4]">{String(i + 1).padStart(2, "0")}</Td>
                    <Td className="font-semibold">{c.crop.name}</Td>
                    <Td>{c.crop.familyLabel}</Td>
                    <Td>{c.seasonLabel}</Td>
                    <Td className="capitalize">{c.crop.waterNeed}</Td>
                    <Td>
                      <Dot color={c.status === "suitable" ? "#2F8A4E" : "#B7791F"} />
                      {STATUS_WORD[c.status]}
                    </Td>
                    <Td className="font-mono">{c.score > 0 ? `+${c.score}` : c.score}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <p className="text-[#5F6B60]">No catalog crop passes the climate and water filters for these answers.</p>
            )}
          </div>

          {ranked.slice(0, TOP_EXPLAINED).map((c, i) => (
            <div key={c.crop.id} className="break-inside-avoid">
              <p className="mb-1 font-semibold">
                Why {i + 1}. {c.crop.name}
              </p>
              <Checks checks={c.checks} />
            </div>
          ))}

          {excluded.length > 0 && (
            <div className="break-inside-avoid">
              <p className="mb-1 font-semibold">Filtered out ({excluded.length})</p>
              <ul className="space-y-0.5">
                {excluded.map((c) => {
                  const why = c.checks.find((ch) => ch.kind === "fail") ?? c.checks.find((ch) => ch.kind === "warn");
                  return (
                    <li key={c.crop.id}>
                      <b className="font-semibold">{c.crop.name}</b>
                      {why ? <span className="text-[#5F6B60]"> — {why.text}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="break-inside-avoid">
            <p className="mb-1 font-semibold">How the ordering works</p>
            <p className="mb-1 text-[#5F6B60]">
              Crops failing a hard limit (temperature or rainfall outside the tolerated range) are filtered out. The rest are grouped by warnings and ordered by
              these points. There is no hidden model and no profit estimate.
            </p>
            <Table head={["Rule", "Points"]} widths={["88%", "12%"]}>
              {WEIGHTS.map((w) => (
                <tr key={w.rule}>
                  <Td>{w.rule}</Td>
                  <Td className="font-mono">{w.points}</Td>
                </tr>
              ))}
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

function Checks({ checks }: { checks: CandidateResult["checks"] }) {
  return (
    <ul className="space-y-0.5">
      {checks.map((ch, i) => (
        <li key={i} className="flex gap-1.5">
          <span className="w-3 shrink-0 text-center font-bold" style={{ color: CHECK[ch.kind].color }} aria-hidden>
            {CHECK[ch.kind].mark}
          </span>
          <span>
            <span className="text-[#5F6B60]">{ch.rule}: </span>
            {ch.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Same strategies and comparison as the on-screen section, laid out for A4. */
function RotationStrategies({ comparison, missing }: { comparison: StrategyComparison; missing: string[] }) {
  const { strategies, calendar } = comparison;
  const rows = comparisonRows(strategies);
  const titleWidth = `${Math.floor(78 / Math.max(1, strategies.length))}%`;
  return (
    <div className="space-y-3">
      {missing.length > 0 && (
        <p className="break-inside-avoid rounded-md border border-[#F0DDBD] bg-[#FBF5EA] px-3 py-2 text-[#6B4A12]">
          <b className="font-semibold">Not used (unavailable when this report was made):</b> {missing.join(", ")}.
        </p>
      )}

      {calendar && <FieldYearTable calendar={calendar} />}

      {strategies.map((s) => (
        <StrategyBlock key={s.id} s={s} />
      ))}

      <div className="break-inside-avoid">
        <p className="mb-1 font-semibold">Side by side</p>
        <Table head={["Criterion", ...strategies.map((s) => (s.fitsGoal ? `${s.title} ✓ fits goal` : s.title))]} widths={["22%", ...strategies.map(() => titleWidth)]}>
          {rows.map((r) => (
            <tr key={r.id} className="break-inside-avoid">
              <Td>
                <b className="font-semibold">{r.criterion}</b>
                <span className="block text-[8.5px] text-[#5F6B60]">{r.hint}</span>
              </Td>
              {r.cells.map((c, i) => (
                <Td key={strategies[i].id} className={strategies[i].fitsGoal ? "bg-[#F5FAEC]" : undefined}>
                  {c ? (
                    <>
                      <span className="font-semibold">
                        <Dot color={SIGNAL_COLOR[c.signal]} />
                        {c.label}
                      </span>
                      <span className="block text-[#5F6B60]">{c.detail}</span>
                    </>
                  ) : (
                    <span className="text-[#5F6B60]">Not available</span>
                  )}
                </Td>
              ))}
            </tr>
          ))}
        </Table>
        <p className="mt-1 text-[8.5px] text-[#5F6B60]">Green is better, amber means watch, orange means a concern.</p>
      </div>
    </div>
  );
}

function StrategyBlock({ s }: { s: RotationStrategy }) {
  return (
    <div className="break-inside-avoid rounded-lg border px-3 py-2.5" style={{ borderColor: s.fitsGoal ? "#173E32" : "#D5DDD2", borderWidth: s.fitsGoal ? 1.5 : 1 }}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[12.5px] font-semibold">
          {s.title}
          {s.fitsGoal && <span className="ml-2 rounded-full bg-[#C5E58A] px-2 py-0.5 align-middle text-[8.5px] font-semibold text-[#10251E]">Fits your goal</span>}
        </p>
        <p className="shrink-0 text-[9.5px] font-semibold">
          <Dot color={CONFIDENCE_COLOR[s.confidence]} />
          {CONFIDENCE_LABEL[s.confidence]}
        </p>
      </div>
      <p className="text-[#5F6B60]">{STRATEGY_PURPOSE[s.id]}</p>
      <p className="mt-0.5 text-[9.5px] text-[#5F6B60]">
        <b className="font-semibold">Confidence:</b> {confidenceExplanation(s)}
      </p>

      {s.available ? (
        <>
          <div className="mt-2">
            <Table head={["Season", "Crop", "Plant", "Harvest", "In the ground (J–D)", "Note"]} widths={["11%", "21%", "9%", "9%", "26%", "24%"]}>
              {s.seasons.map((x, i) => {
                const w = seasonWindow(x);
                const bare = bareMonthsAfter(s.seasons, i);
                const notes = [x.status === "caution" ? "Possible, with cautions" : "", bare ? `then ${bare} month${bare === 1 ? "" : "s"} bare` : ""].filter(Boolean);
                return (
                  <tr key={`${x.cropId}-${x.startOffset}`}>
                    <Td className="font-mono">
                      {i + 1} <span className="text-[#A3ADA4]">· yr {w.year}</span>
                    </Td>
                    <Td className="font-semibold">{x.cropName}</Td>
                    <Td>{w.plant}</Td>
                    <Td>{w.harvest}</Td>
                    <Td>
                      <MonthBoxes on={new Set(monthsInGround(x))} color="#173E32" />
                    </Td>
                    <Td className="text-[#5F6B60]">{notes.join(", ") || "—"}</Td>
                  </tr>
                );
              })}
            </Table>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-5 gap-y-2">
            <InfoList title="Why suggested" items={s.why} />
            <InfoList title="Evidence" items={s.evidence.map((e) => `${e.text} (${e.source})`)} />
            <InfoList title="Benefits" items={s.benefits} />
            <InfoList title="What we don’t know" items={s.gaps} />
            <InfoList title="Check locally" items={s.checkLocally} box />
          </div>
        </>
      ) : (
        <div className="mt-2">
          <Unavailable>{s.unavailableReason ?? "This plan can’t be built for this field."}</Unavailable>
        </div>
      )}
    </div>
  );
}

/** Twelve small boxes, Jan–Dec, filled where `on` has the month (1–12). */
function MonthBoxes({ on, color }: { on: Set<number>; color: string }) {
  return (
    <span className="inline-flex gap-[1.5px] align-middle">
      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
        <span
          key={m}
          className="inline-block h-[7px] w-[7px] rounded-[1.5px]"
          style={{ backgroundColor: on.has(m) ? color : "#EEF3EA" }}
        />
      ))}
    </span>
  );
}

/** The 12-month strip for print: the field's last year, bare / frost / hot / dry by month. */
function FieldYearTable({ calendar }: { calendar: FieldCalendar }) {
  const rows: Array<[string, number[], string]> = [
    ["Bare (Sentinel-2)", calendar.bareMonths, "#A9825A"],
    ["Frost (NASA POWER)", calendar.frostMonths, "#3B6E8F"],
    ["Hot (NASA POWER)", calendar.heatMonths, "#C2410C"],
    ["Dry (NASA POWER)", calendar.dryMonths, "#B7791F"],
  ];
  const noView = new Set(calendar.months.filter((m) => m.bare === null).map((m) => m.month));
  return (
    <div className="break-inside-avoid">
      <p className="mb-1 font-semibold">This field’s last 12 months</p>
      <table className="border-collapse">
        <thead>
          <tr>
            <th />
            {calendar.months.map((m) => (
              <th key={m.month} className="w-[18px] text-center text-[8.5px] font-medium text-[#5F6B60]">
                {monthName(m.month - 1).charAt(0)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, months, color], r) => (
            <tr key={label}>
              <td className="pr-3 text-[9px] text-[#5F6B60]">{label}</td>
              {calendar.months.map((m) => {
                const unknown = r === 0 && noView.has(m.month);
                return (
                  <td key={m.month} className="p-[1px] text-center">
                    <span
                      className="inline-block h-[9px] w-[15px] rounded-[2px] align-middle"
                      style={unknown ? { border: "0.5px dashed #A3ADA4" } : { backgroundColor: months.includes(m.month) ? color : "#EEF3EA" }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1">{calendar.sentence}</p>
      {noView.size > 0 && <p className="text-[8.5px] text-[#5F6B60]">Dashed: no clear satellite view that month.</p>}
    </div>
  );
}

function InfoList({ title, items, box }: { title: string; items: string[]; box?: boolean }) {
  return (
    <div className="break-inside-avoid">
      <p className="mb-0.5 text-[9px] font-semibold tracking-wide text-[#173E32] uppercase">{title}</p>
      {items.length ? (
        <ul className="space-y-0.5">
          {items.map((t) => (
            <li key={t} className="flex gap-1.5">
              <span className="w-2.5 shrink-0 text-center text-[#5F6B60]" aria-hidden>
                {box ? "☐" : "•"}
              </span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[#5F6B60]">Nothing to add here.</p>
      )}
    </div>
  );
}

function Unavailable({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-[#D5DDD2] px-3 py-2 text-[#5F6B60]">{children}</p>;
}
