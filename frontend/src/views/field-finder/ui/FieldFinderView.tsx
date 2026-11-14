"use client";

import { ArrowLeft, Check, Crosshair, MapPinned, ZoomIn } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadCountryGeometry, type Country, type LoadedCountryGeometry } from "@/entities/country";
import { useExploration, useShellMode } from "@/entities/exploration";
import { flyToBBox, flyToPoint, MapOutline, panelInset, useMap } from "@/entities/map";
import { useFieldDraft } from "@/features/draw-field";
import { LocateButton } from "@/features/locate-me";
import { AreaFocus, AreaPicker, useAdminAreas, type AdminArea } from "@/features/select-admin-area";
import { cn } from "@/shared/lib";
import { Flag } from "@/shared/ui";

type Step = "region" | "district" | "mark";

/** Country → region → district → mark the field. */
export function FieldFinderView({ country }: { country: Country }) {
  useShellMode("finder");
  const map = useMap();
  const draft = useFieldDraft();
  const [geometry, setGeometry] = useState<LoadedCountryGeometry | null>(null);
  const [region, setRegion] = useState<AdminArea | null>(null);
  const [district, setDistrict] = useState<AdminArea | null>(null);
  const [chosenStep, setStep] = useState<Step>("region");

  const regions = useAdminAreas(country.iso3);
  const districts = useAdminAreas(country.iso3, region ? region.id : null);
  const marking = draft.status !== "off";

  // Fly to the country on arrival (unless already marking/editing a field).
  useEffect(() => {
    let cancelled = false;
    loadCountryGeometry(country.iso3).then((g) => {
      if (cancelled) return;
      setGeometry(g);
      if (!map || draft.status !== "off") return;
      if (g?.bbox) flyToBBox(map, g.bbox, { minSpanDeg: 3, pad: 0.12, inset: panelInset() });
      else flyToPoint(map, country.latlng[0], country.latlng[1], 2_500_000);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per country with a ready map
  }, [country.iso3, map]);

  // Skip steps the boundary data can't support (derived, not stored).
  const noRegions = regions.status === "success" && !regions.data.available;
  const noDistricts = districts.status === "success" && !districts.data.available;
  const step: Step = (chosenStep === "region" && noRegions) || (chosenStep === "district" && noDistricts) ? "mark" : chosenStep;

  const startMarking = () =>
    draft.start({ countryIso: country.iso3, regionName: region?.name ?? null, districtName: district?.name ?? null });

  const steps: Array<{ id: Step; label: string; done: boolean }> = [
    { id: "region", label: region?.name ?? "Region", done: Boolean(region) },
    { id: "district", label: district?.name ?? "District", done: Boolean(district) },
    { id: "mark", label: "Your field", done: false },
  ];

  return (
    <>
      {!region && geometry && <MapOutline geometry={geometry.geometry} color="#F4F7F1" fillAlpha={0} width={1.5} />}
      <AreaFocus area={district ?? region} />

      <AnimatePresence>
        {!marking && (
          <motion.section
            key="finder"
            aria-label={`Find your field in ${country.name}`}
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              "glass pointer-events-auto absolute inset-x-3 bottom-3 flex max-h-[52dvh] flex-col rounded-3xl p-4 shadow-[var(--shadow-float)] max-sm:bg-[rgba(10,24,19,0.92)] sm:inset-x-auto sm:left-6 sm:w-[380px] lg:top-6",
              step === "mark" ? "lg:bottom-auto" : "lg:bottom-6 lg:max-h-none",
            )}
          >
            <div className="flex items-center gap-2">
              <Link href="/" aria-label="Back to all countries" className="grid size-8 place-items-center rounded-full text-white/70 hover:bg-white/10">
                <ArrowLeft className="size-4" aria-hidden />
              </Link>
              <Flag iso3={country.iso3} name={country.name} className="h-4 w-6" />
              <h1 className="truncate text-[16px] font-semibold text-white">{country.name}</h1>
            </div>

            <ol className="mt-3 flex items-center gap-1 text-[11.5px]" aria-label="Steps">
              {steps.map((s, i) => {
                const current = s.id === step;
                const reachable = s.id === "region" || (s.id === "district" && region) || (s.id === "mark" && (district || step === "mark"));
                return (
                  <li key={s.id} className="flex min-w-0 items-center gap-1">
                    {i > 0 && <span className="h-px w-3 shrink-0 bg-white/20" aria-hidden />}
                    <button
                      type="button"
                      disabled={!reachable}
                      onClick={() => {
                        if (s.id === "region") {
                          setRegion(null);
                          setDistrict(null);
                        }
                        if (s.id === "district") setDistrict(null);
                        setStep(s.id);
                      }}
                      aria-current={current ? "step" : undefined}
                      className={cn(
                        "inline-flex min-w-0 items-center gap-1 rounded-full px-2 py-1 transition-colors",
                        current ? "bg-lime text-deep" : s.done ? "bg-white/10 text-white" : "text-white/45",
                      )}
                    >
                      {s.done && !current && <Check className="size-3 shrink-0" aria-hidden />}
                      <span className="truncate">{s.label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              {step === "region" && (
                <>
                  <StepTitle title="Which region is your field in?" onSkip={() => setStep("mark")} />
                  <AreaPicker
                    label="Regions"
                    areas={regions.data?.areas ?? []}
                    loading={regions.status === "loading" || regions.status === "idle"}
                    error={regions.status === "error" ? regions.error.message : null}
                    onRetry={regions.retry}
                    selectedId={region?.id}
                    onSelect={(a) => {
                      setRegion(a);
                      setDistrict(null);
                      setStep("district");
                    }}
                  />
                </>
              )}

              {step === "district" && region && (
                <>
                  <StepTitle title={`Which district in ${region.name}?`} onSkip={() => setStep("mark")} />
                  <AreaPicker
                    label="Districts"
                    areas={districts.data?.areas ?? []}
                    loading={districts.status === "loading" || districts.status === "idle"}
                    loadingHint="Loading districts… the first time can take a few seconds."
                    error={districts.status === "error" ? districts.error.message : null}
                    onRetry={districts.retry}
                    selectedId={district?.id}
                    onSelect={(a) => {
                      setDistrict(a);
                      setStep("mark");
                    }}
                  />
                </>
              )}

              {step === "mark" && (
                <div className="scroll-quiet-dark overflow-y-auto">
                  <p className="text-[15px] font-semibold text-white">Now find your field</p>
                  {noRegions || (region && noDistricts) ? (
                    <p className="mt-1 text-[12.5px] text-white/55">Detailed boundaries aren’t available here. Just zoom in on the map.</p>
                  ) : null}
                  <ol className="mt-3 space-y-2.5 text-[13px] text-white/80">
                    <Tip icon={<ZoomIn className="size-4" aria-hidden />}>Zoom in (scroll, pinch or double-tap) until you can see your field clearly.</Tip>
                    <Tip icon={<MapPinned className="size-4" aria-hidden />}>Press “Mark my field” and tap each corner of your land.</Tip>
                    <Tip icon={<Check className="size-4" aria-hidden />}>Adjust the corners, then confirm and save.</Tip>
                  </ol>
                  <button
                    type="button"
                    onClick={startMarking}
                    disabled={!map}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-4 py-3 text-[14px] font-semibold text-deep transition hover:bg-lime-strong disabled:opacity-60"
                  >
                    <Crosshair className="size-4" aria-hidden /> Mark my field
                  </button>
                  <LocateButton variant="secondary" className="mt-2" onLocated={startMarking} />
                </div>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </>
  );
}

function StepTitle({ title, onSkip }: { title: string; onSkip: () => void }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <p className="text-[15px] font-semibold text-white">{title}</p>
      <button type="button" onClick={onSkip} className="shrink-0 text-[12px] text-white/50 underline-offset-2 hover:text-white hover:underline">
        Skip
      </button>
    </div>
  );
}

function Tip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-white/8 text-lime">{icon}</span>
      <span className="leading-5">{children}</span>
    </li>
  );
}

/** Route entry: resolves the country from the shared list. */
export function FieldFinderScreen({ iso3 }: { iso3: string }) {
  const { byIso } = useExploration();
  const country = byIso.get(iso3);
  return country ? <FieldFinderView key={iso3} country={country} /> : null;
}
