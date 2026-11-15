"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { EnvironmentalProfile } from "@/entities/climate";
import {
  EMPTY_PROFILE,
  LAND_CHECK_FAILED,
  evaluateFieldRotation,
  fieldEvidence,
  getStrategyComparison,
  useFieldTerrain,
  type CropPlanResult,
  type FarmerProfile,
  type FieldEvidence,
  type StrategyComparison,
  type WaterTrendInfo,
} from "@/entities/crop";
import type { ClimateTrend } from "@/entities/climate";
import { useNdviHistory } from "@/entities/ndvi-history";
import { useShellMode } from "@/entities/exploration";
import { FieldOutline, ringBBox, useField, type Field } from "@/entities/field";
import { useFieldConditions } from "@/entities/field-conditions";
import { LandNotice, useLandSuitability, type LandSuitabilityState } from "@/entities/land-suitability";
import { flyToBBox, useMap } from "@/entities/map";
import { LayerSwitcher } from "@/features/switch-map-layer";
import { useFetchJson, type FetchState } from "@/shared/api";
import { StateMessage } from "@/shared/ui";
import { CropRotation, climateContext } from "@/widgets/crop-rotation";
import { DashboardSkeleton, FieldDashboard } from "@/widgets/field-dashboard";
import { FieldReport, ReportCard, useFieldPhoto } from "@/widgets/field-report";
import { FieldYear, RotationStrategiesSection, StrategyDisclaimer } from "@/widgets/rotation-strategies";

/** /field/[id]: saved field → map focus + simple dashboard. */
export function FieldView({ id }: { id: string }) {
  useShellMode("field");
  const { field, ready } = useField(id);
  const map = useMap();

  useEffect(() => {
    if (map && field) flyToBBox(map, ringBBox(field.polygon), { minSpanDeg: 0.004, pad: 0.35, duration: 2.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fly once per field
  }, [map, field?.id]);

  if (!ready) return <FieldViewSkeleton />;
  if (!field) {
    return (
      <div className="pointer-events-auto grid h-full place-items-center bg-canvas p-6 split:mr-[var(--globe-split)]">
        <StateMessage
          title="We couldn’t find this field"
          description="Fields are saved in this browser. It may have been deleted, or saved on another device."
          action={
            <Link href="/" className="rounded-full bg-forest px-4 py-2 text-[13px] font-semibold text-white">
              Find your field
            </Link>
          }
        />
      </div>
    );
  }

  return <FieldLoaded field={field} />;
}

type ClimateState = FetchState<EnvironmentalProfile> & { retry: () => void };

/**
 * Owns every piece of field data (conditions, land check, planning climate, questionnaire answers)
 * so the dashboard, the crop plan and the printable PDF report all show the same thing.
 * The crop engine runs only after the land check says the polygon can be farmed.
 */
function FieldLoaded({ field }: { field: Field }) {
  const conditions = useFieldConditions(field.polygon);
  const land = useLandSuitability(field.polygon);
  const climateUrl = `/api/environment?${new URLSearchParams({ lat: field.centroid.lat.toFixed(3), lon: field.centroid.lon.toFixed(3), period: "12m", kind: "custom" })}`;
  const climate = useFetchJson<EnvironmentalProfile>(climateUrl);
  const [farmer, setFarmer] = useState<FarmerProfile>(EMPTY_PROFILE);
  const ctx = useMemo(() => (climate.data ? climateContext(climate.data) : null), [climate.data]);
  // null while the land check runs: no crop is evaluated before the land is known.
  const landVerdict = land.status === "success" ? land.data : land.status === "error" ? LAND_CHECK_FAILED : null;
  const rotation = useMemo(() => (landVerdict ? evaluateFieldRotation(farmer, ctx, landVerdict) : null), [farmer, ctx, landVerdict]);
  // The three rotation strategies, shown under the questionnaire and in the PDF. Same gate as the crop list:
  // nothing for land that can't be farmed or while climate data is missing.
  // Field evidence for the strategies (each source cached server-side; a failure just leaves its lines out).
  const point = new URLSearchParams({ lat: field.centroid.lat.toFixed(3), lon: field.centroid.lon.toFixed(3) }).toString();
  const ndvi = useNdviHistory(field.polygon);
  const trend = useFetchJson<ClimateTrend>(`/api/climate-trend?${point}`);
  const smap = useFetchJson<{ evidence: Array<{ text: string; source: string }> }>(`/api/smap?${point}`);
  const water = useFetchJson<WaterTrendInfo>(`/api/water-trend?${point}`);
  const terrain = useFieldTerrain(field.polygon);
  const evidence = useMemo<FieldEvidence | undefined>(
    () =>
      ctx
        ? fieldEvidence(ctx, ndvi.data?.series ?? [], [...(trend.data?.evidence ?? []), ...(smap.data?.evidence ?? [])], terrain.data, water.data)
        : undefined,
    [ctx, ndvi.data, trend.data, smap.data, terrain.data, water.data],
  );
  const strategies = useMemo(
    () => (ctx && rotation && rotation.status !== "unsuitable_land" ? getStrategyComparison(farmer, ctx, evidence) : null),
    [farmer, ctx, rotation, evidence],
  );
  const photo = useFieldPhoto(field);

  const reportReady =
    conditions.status !== "loading" &&
    land.status !== "loading" &&
    (rotation?.status === "unsuitable_land" || climate.status === "success" || climate.status === "error") &&
    photo.status !== "loading";

  return (
    <>
      <FieldOutline field={field} />
      <div className="pointer-events-auto absolute top-3 right-3 z-20 split:top-7 split:right-7">
        <LayerSwitcher focus={ringBBox(field.polygon)} />
      </div>
      <FieldDashboard
        field={field}
        conditions={conditions}
        plan={
          <PlanNextCrop
            land={land}
            climate={climate}
            farmer={farmer}
            onFarmerChange={setFarmer}
            rotation={rotation}
            strategies={strategies}
            calendar={evidence?.calendar ?? null}
            trendSentence={trend.data?.sentence ?? null}
          />
        }
        landNotice={land.data?.status === "unsuitable_land" ? <LandNotice land={land.data} /> : undefined}
        footer={<ReportCard fieldName={field.name} ready={reportReady} />}
      />
      <FieldReport
        field={field}
        conditions={conditions.data}
        conditionsError={conditions.error}
        farmer={farmer}
        rotation={rotation}
        rotationError={climate.error?.message ?? null}
        strategies={strategies}
        land={land.data}
        photo={photo}
      />
    </>
  );
}

function PlanNextCrop({
  land,
  climate,
  farmer,
  onFarmerChange,
  rotation,
  strategies,
  calendar,
  trendSentence,
}: {
  land: LandSuitabilityState;
  climate: ClimateState;
  farmer: FarmerProfile;
  onFarmerChange: (next: FarmerProfile) => void;
  rotation: CropPlanResult | null;
  strategies: StrategyComparison | null;
  calendar: FieldEvidence["calendar"] | null | undefined;
  trendSentence: string | null;
}) {
  if (land.status === "loading") return <p className="text-[13px] text-ink-muted">Checking that this area is farmland (satellite land cover and map data)…</p>;
  // Unsuitable land: the land notice replaces the questionnaire and every candidate.
  if (rotation?.status === "unsuitable_land" && land.data) return <LandNotice land={land.data} />;
  if (climate.status === "error" && !rotation)
    return (
      <StateMessage
        title="Climate data for planning isn’t available right now"
        description={climate.error.message}
        action={
          <button type="button" onClick={climate.retry} className="rounded-full bg-forest px-4 py-2 text-[13px] font-semibold text-white">
            Try again
          </button>
        }
      />
    );
  if (!rotation) return <p className="text-[13px] text-ink-muted">Loading climate data…</p>;
  return (
    <div className="space-y-3">
      {land.data?.status === "uncertain" && <LandNotice land={land.data} />}
      {land.status === "error" && (
        <div role="status" className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-2xl border border-[#F0DDBD] bg-[#FBF5EA] px-4 py-3 text-[12.5px] leading-5 text-[#6B4A12]">
          <p className="min-w-0 flex-1">
            <b className="font-semibold">We couldn’t confirm this is farmland.</b> {LAND_CHECK_FAILED.message}
          </p>
          <button type="button" onClick={land.retry} className="rounded-full bg-[#F3E6CC] px-3 py-1 font-medium hover:bg-[#EEDCB8]">
            Check again
          </button>
        </div>
      )}
      <CropRotation farmer={farmer} onFarmerChange={onFarmerChange} result={rotation} />
      {strategies && (
        <div className="mt-6 space-y-4 border-t border-line pt-6">
          {(calendar || trendSentence) && <FieldYear calendar={calendar ?? null} trendSentence={trendSentence} />}
          <RotationStrategiesSection comparison={strategies} />
          <StrategyDisclaimer />
        </div>
      )}
    </div>
  );
}

export function FieldViewSkeleton() {
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-[40dvh] bottom-0 overflow-hidden rounded-t-[28px] bg-canvas split:top-0 split:right-[var(--globe-split)] split:rounded-none">
      <div className="@container mx-auto max-w-[880px] px-4 pt-16 @md:px-6">
        <DashboardSkeleton />
      </div>
    </div>
  );
}
