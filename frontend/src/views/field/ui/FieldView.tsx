"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { EnvironmentalProfile } from "@/entities/climate";
import { EMPTY_PROFILE, evaluateRotation, type FarmerProfile, type RotationResult } from "@/entities/crop";
import { useShellMode } from "@/entities/exploration";
import { FieldOutline, ringBBox, useField, type Field } from "@/entities/field";
import { useFieldConditions } from "@/entities/field-conditions";
import { flyToBBox, useMap } from "@/entities/map";
import { LayerSwitcher } from "@/features/switch-map-layer";
import { useFetchJson, type FetchState } from "@/shared/api";
import { StateMessage } from "@/shared/ui";
import { CropRotation, climateContext } from "@/widgets/crop-rotation";
import { DashboardSkeleton, FieldDashboard } from "@/widgets/field-dashboard";
import { FieldReport, ReportCard, useFieldPhoto } from "@/widgets/field-report";

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
 * Owns every piece of field data (conditions, planning climate, questionnaire answers) so the
 * dashboard, the crop plan and the printable PDF report all show the same thing.
 */
function FieldLoaded({ field }: { field: Field }) {
  const conditions = useFieldConditions(field.polygon);
  const climateUrl = `/api/environment?${new URLSearchParams({ lat: field.centroid.lat.toFixed(3), lon: field.centroid.lon.toFixed(3), period: "12m", kind: "custom" })}`;
  const climate = useFetchJson<EnvironmentalProfile>(climateUrl);
  const [farmer, setFarmer] = useState<FarmerProfile>(EMPTY_PROFILE);
  const ctx = useMemo(() => (climate.data ? climateContext(climate.data) : null), [climate.data]);
  const rotation = useMemo(() => (ctx ? evaluateRotation(farmer, ctx) : null), [farmer, ctx]);
  const photo = useFieldPhoto(field);

  const reportReady =
    conditions.status !== "loading" && (climate.status === "success" || climate.status === "error") && photo.status !== "loading";

  return (
    <>
      <FieldOutline field={field} />
      <div className="pointer-events-auto absolute top-3 right-3 z-20 split:top-7 split:right-7">
        <LayerSwitcher />
      </div>
      <FieldDashboard
        field={field}
        conditions={conditions}
        plan={<PlanNextCrop climate={climate} farmer={farmer} onFarmerChange={setFarmer} rotation={rotation} />}
        footer={<ReportCard fieldName={field.name} ready={reportReady} />}
      />
      <FieldReport
        field={field}
        conditions={conditions.data}
        conditionsError={conditions.error}
        farmer={farmer}
        rotation={rotation}
        rotationError={climate.error?.message ?? null}
        photo={photo}
      />
    </>
  );
}

function PlanNextCrop({
  climate,
  farmer,
  onFarmerChange,
  rotation,
}: {
  climate: ClimateState;
  farmer: FarmerProfile;
  onFarmerChange: (next: FarmerProfile) => void;
  rotation: RotationResult | null;
}) {
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
  return <CropRotation farmer={farmer} onFarmerChange={onFarmerChange} result={rotation} />;
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
