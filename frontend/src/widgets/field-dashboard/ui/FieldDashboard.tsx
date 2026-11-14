"use client";

import { ArrowLeft, Droplets, Leaf, RefreshCw, Sprout, Thermometer, WifiOff } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatHectares, type Field } from "@/entities/field";
import { shortDate, useFieldConditions } from "@/entities/field-conditions";
import { Skeleton, StateMessage } from "@/shared/ui";
import { MoreDetails } from "./MoreDetails";
import { RecommendationCard } from "./RecommendationCard";
import { StatusCard } from "./StatusCard";

/** The simple farmer view: one recommendation, four cards, everything else in "More details". */
export function FieldDashboard({ field, plan }: { field: Field; plan: ReactNode }) {
  const { status, data, error, retry } = useFieldConditions(field.polygon);
  const place = [field.districtName, field.regionName].filter(Boolean).join(", ");

  return (
    <motion.div
      initial={{ opacity: 0, x: -24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto absolute inset-x-0 top-[40dvh] bottom-0 overflow-hidden rounded-t-[28px] bg-canvas shadow-[0_-12px_40px_-16px_rgba(0,0,0,0.5)] lg:top-0 lg:right-[var(--globe-split)] lg:rounded-none lg:shadow-none"
    >
      <div className="scroll-quiet h-full overflow-y-auto">
        <div className="mx-auto max-w-[760px] px-4 pt-5 pb-16 sm:px-6 lg:pt-7">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] font-medium text-ink-muted hover:bg-mist hover:text-ink">
            <ArrowLeft className="size-4" aria-hidden /> My fields
          </Link>

          <header className="mt-3">
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-ink">{field.name}</h1>
            <p className="mt-1 text-[13.5px] text-ink-muted">
              {formatHectares(field.areaHa)}
              {place ? ` · ${place}` : ""}
            </p>
            {data && (
              <p className="mt-1 text-[12px] text-ink-faint">
                {data.observedUntil ? `NASA observations until ${shortDate(data.observedUntil)}` : "No recent NASA observations"}
                {data.forecastFrom ? ` · forecast from ${shortDate(data.forecastFrom)}` : ""}
              </p>
            )}
          </header>

          <div className="mt-5" aria-busy={status === "loading"}>
            {data ? (
              <div className={status === "loading" ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <RecommendationCard rec={data.recommendation} />
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <StatusCard title="Temperature" icon={Thermometer} state={data.temperature} />
                  <StatusCard title="Soil moisture" icon={Droplets} state={data.soil} />
                  <StatusCard title="Crop health" icon={Leaf} state={data.crop} />
                  <StatusCard title="Irrigation" icon={Sprout} state={data.irrigation} />
                </div>
              </div>
            ) : status === "error" ? (
              <StateMessage
                icon={<WifiOff className="size-5" aria-hidden />}
                title="We couldn’t load your field’s data"
                description={error}
                action={
                  <button type="button" onClick={retry} className="inline-flex items-center gap-2 rounded-full bg-forest px-4 py-2 text-[13px] font-semibold text-white">
                    <RefreshCw className="size-3.5" aria-hidden /> Try again
                  </button>
                }
              />
            ) : (
              <DashboardSkeleton />
            )}
          </div>

          <MoreDetails field={field} data={data} plan={plan} />
        </div>
      </div>
    </motion.div>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-label="Loading field data">
      <Skeleton className="h-36 rounded-[24px]" />
      <p className="mt-3 text-center text-[12.5px] text-ink-muted">Checking NASA satellite and weather data for your field…</p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44 rounded-[var(--radius-card)]" />
        ))}
      </div>
    </div>
  );
}
