"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { EnvironmentalProfile } from "@/entities/climate";
import { useShellMode } from "@/entities/exploration";
import { FieldOutline, ringBBox, useField, type Field } from "@/entities/field";
import { flyToBBox, useMap } from "@/entities/map";
import { LayerSwitcher } from "@/features/switch-map-layer";
import { useFetchJson } from "@/shared/api";
import { StateMessage } from "@/shared/ui";
import { CropRotation } from "@/widgets/crop-rotation";
import { DashboardSkeleton, FieldDashboard } from "@/widgets/field-dashboard";

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
      <div className="pointer-events-auto grid h-full place-items-center bg-canvas p-6 lg:mr-[var(--globe-split)]">
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

  return (
    <>
      <FieldOutline field={field} />
      <div className="pointer-events-auto absolute top-3 right-3 z-20 lg:top-7 lg:right-7">
        <LayerSwitcher />
      </div>
      <FieldDashboard field={field} plan={<PlanNextCrop field={field} />} />
    </>
  );
}

function PlanNextCrop({ field }: { field: Field }) {
  const url = `/api/environment?${new URLSearchParams({ lat: field.centroid.lat.toFixed(3), lon: field.centroid.lon.toFixed(3), period: "12m", kind: "custom" })}`;
  const { status, data, error, retry } = useFetchJson<EnvironmentalProfile>(url);
  if (status === "error")
    return (
      <StateMessage
        title="Climate data for planning isn’t available right now"
        description={error.message}
        action={
          <button type="button" onClick={retry} className="rounded-full bg-forest px-4 py-2 text-[13px] font-semibold text-white">
            Try again
          </button>
        }
      />
    );
  if (!data) return <p className="text-[13px] text-ink-muted">Loading climate data…</p>;
  return <CropRotation profile={data} />;
}

export function FieldViewSkeleton() {
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-[40dvh] bottom-0 overflow-hidden rounded-t-[28px] bg-canvas lg:top-0 lg:right-[var(--globe-split)] lg:rounded-none">
      <div className="mx-auto max-w-[760px] px-4 pt-16 sm:px-6">
        <DashboardSkeleton />
      </div>
    </div>
  );
}
