"use client";

import { ArrowLeft, Check, Crosshair, Map as MapIcon, MapPinned, ZoomIn } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { CityMarkers, fetchNearestCity, useCities, type City } from "@/entities/city";
import { loadCountryGeometry, type Country, type LoadedCountryGeometry } from "@/entities/country";
import { useExploration, useShellMode } from "@/entities/exploration";
import { flyToBBox, flyToPoint, MapOutline, panelInset, useMap } from "@/entities/map";
import { useFieldDraft } from "@/features/draw-field";
import { LocateButton } from "@/features/locate-me";
import { AreaFocus, AreaPicker, useAdminAreas, type AdminArea } from "@/features/select-admin-area";
import { useSelectCountry } from "@/features/select-country";
import { CityPicker, LocationBadge, useGlobePicker } from "@/features/select-location";
import { cn } from "@/shared/lib";
import { Flag } from "@/shared/ui";

type Path = "city" | "region";
type Step = "city" | "region" | "district" | "mark";

/** Country → city (on the globe or from the list) → mark the field. Region/district stay available as an alternative path. */
export function FieldFinderView({ country }: { country: Country }) {
  useShellMode("finder");
  const map = useMap();
  const draft = useFieldDraft();
  const { byIso } = useExploration();
  const selectCountry = useSelectCountry();
  const [geometry, setGeometry] = useState<LoadedCountryGeometry | null>(null);
  const [path, setPath] = useState<Path>("city");
  const [city, setCity] = useState<City | null>(null);
  const [hoverCityId, setHoverCityId] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** A click landed in a neighbouring country: offer to switch instead of jumping there (fields near borders). */
  const [neighbour, setNeighbour] = useState<Country | null>(null);
  const [region, setRegion] = useState<AdminArea | null>(null);
  const [district, setDistrict] = useState<AdminArea | null>(null);
  const [chosenStep, setStep] = useState<Step>("city");
  const nearestAbort = useRef<AbortController | null>(null);

  const cities = useCities(country.iso3);
  const regions = useAdminAreas(path === "region" ? country.iso3 : null);
  const districts = useAdminAreas(country.iso3, path === "region" ? (region ? region.id : null) : null);
  const marking = draft.status !== "off";
  const cityList = useMemo(() => cities.data?.cities ?? [], [cities.data]);

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

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2800);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!neighbour) return;
    const t = setTimeout(() => setNeighbour(null), 6000);
    return () => clearTimeout(t);
  }, [neighbour]);

  useEffect(() => () => nearestAbort.current?.abort(), []);

  // Skip steps the boundary data can't support (derived, not stored).
  const noRegions = regions.status === "success" && !regions.data.available;
  const noDistricts = districts.status === "success" && !districts.data.available;
  const step: Step = (chosenStep === "region" && noRegions) || (chosenStep === "district" && noDistricts) ? "mark" : chosenStep;

  const chooseCity = (c: City) => {
    nearestAbort.current?.abort();
    setLocating(false);
    setCity(c);
    setStep("mark");
    // Frame the town and its surroundings (≈ 40 km), in the part of the map not covered by the panel.
    if (map) flyToBBox(map, { west: c.lon - 0.2, east: c.lon + 0.2, south: c.lat - 0.15, north: c.lat + 0.15 }, { minSpanDeg: 0.3, pad: 0.05, inset: panelInset(), duration: 2 });
  };

  const findNearest = (lat: number, lon: number) => {
    nearestAbort.current?.abort();
    const ctrl = new AbortController();
    nearestAbort.current = ctrl;
    setLocating(true);
    fetchNearestCity(country.iso3, lat, lon, ctrl.signal)
      .then((c) => {
        if (ctrl.signal.aborted) return;
        setLocating(false);
        if (c) chooseCity(c);
        else setNotice("No town found near there. Pick one from the list or zoom in and mark your field.");
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setLocating(false);
        setNotice(err instanceof Error ? err.message : "Couldn’t look up the nearest town.");
      });
  };

  useGlobePicker({
    enabled: !marking,
    onHover: (hit) => setHoverCityId(hit.kind === "city" ? hit.cityId : null),
    onPick: (hit) => {
      if (hit.kind === "city") {
        const c = cityList.find((x) => x.id === hit.cityId);
        if (c) chooseCity(c);
      } else if (hit.kind === "country") {
        if (hit.iso3 === country.iso3) {
          setNeighbour(null);
          if (path === "city") findNearest(hit.lat, hit.lon);
        } else {
          const other = byIso.get(hit.iso3);
          // Second click on the same neighbour = "yes, switch".
          if (other && neighbour?.iso3 === other.iso3) selectCountry(other.iso3);
          else if (other) setNeighbour(other);
        }
      } else if (hit.kind === "sea") {
        setNotice("That’s the sea — click on land.");
      }
    },
    onError: () => setNotice("Couldn’t identify that place. Please try again."),
  });

  const startMarking = () =>
    draft.start({
      countryIso: country.iso3,
      cityName: path === "city" ? (city?.name ?? null) : null,
      regionName: path === "region" ? (region?.name ?? null) : null,
      districtName: path === "region" ? (district?.name ?? null) : null,
    });

  const switchPath = (p: Path) => {
    setPath(p);
    setCity(null);
    setRegion(null);
    setDistrict(null);
    setStep(p === "city" ? "city" : "region");
  };

  const steps: Array<{ id: Step; label: string; done: boolean; reachable: boolean }> =
    path === "city"
      ? [
          { id: "city", label: city?.name ?? "City", done: Boolean(city), reachable: true },
          { id: "mark", label: "Your field", done: false, reachable: Boolean(city) || step === "mark" },
        ]
      : [
          { id: "region", label: region?.name ?? "Region", done: Boolean(region), reachable: true },
          { id: "district", label: district?.name ?? "District", done: Boolean(district), reachable: Boolean(region) },
          { id: "mark", label: "Your field", done: false, reachable: Boolean(district) || step === "mark" },
        ];

  const placeName = path === "city" ? (city?.name ?? null) : (district?.name ?? region?.name ?? null);
  // Show every town while choosing; afterwards only the chosen one, so the map stays clear for marking.
  const markers = useMemo(() => (step === "city" ? cityList : city ? [city] : []), [step, cityList, city]);

  return (
    <>
      {!region && geometry && <MapOutline geometry={geometry.geometry} color="#C5E58A" fillAlpha={step === "city" ? 0.06 : 0} width={2} />}
      {path === "region" && <AreaFocus area={district ?? region} />}
      {!marking && path === "city" && <CityMarkers cities={markers} selectedId={city?.id} hoveredId={hoverCityId} />}

      {!marking && (
        <div className="absolute inset-x-3 top-3 z-10 flex flex-col items-center gap-2 sm:top-4 sm:left-[416px] sm:right-20">
          <LocationBadge
            country={{ iso3: country.iso3, name: country.name }}
            place={placeName}
            hint={locating ? "finding the nearest town…" : !placeName && path === "city" ? "click the map near your field" : null}
            busy={locating || (path === "city" && cities.status === "loading")}
          />
          <AnimatePresence>
            {notice && (
              <motion.p role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-md rounded-2xl bg-black/70 px-3 py-1.5 text-center text-[12.5px] text-white/85">
                {notice}
              </motion.p>
            )}
            {neighbour && (
              <motion.div
                key={neighbour.iso3}
                role="status"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/75 py-1 pr-1 pl-3 text-[12.5px] text-white/85"
              >
                <Flag iso3={neighbour.iso3} name={neighbour.name} className="h-3 w-[18px]" />
                That’s in {neighbour.name}.
                <button type="button" onClick={() => selectCountry(neighbour.iso3)} className="rounded-full bg-lime px-2.5 py-1 text-[12px] font-semibold text-deep hover:bg-lime-strong">
                  Switch
                </button>
                <button type="button" onClick={() => setNeighbour(null)} className="rounded-full px-2 py-1 text-[12px] text-white/60 hover:text-white">
                  Stay
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

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
                return (
                  <li key={s.id} className="flex min-w-0 items-center gap-1">
                    {i > 0 && <span className="h-px w-3 shrink-0 bg-white/20" aria-hidden />}
                    <button
                      type="button"
                      disabled={!s.reachable}
                      onClick={() => {
                        if (s.id === "city") setCity(null);
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
              {step === "city" && (
                <>
                  <StepTitle title="Which city or town is your field near?" onSkip={() => setStep("mark")} />
                  <CityPicker
                    iso3={country.iso3}
                    cities={cityList}
                    total={cities.data?.total}
                    loading={cities.status === "loading" || cities.status === "idle"}
                    error={cities.status === "error" ? cities.error.message : null}
                    onRetry={cities.retry}
                    selectedId={city?.id}
                    onSelect={chooseCity}
                    onHover={setHoverCityId}
                  />
                  <SwitchPath onClick={() => switchPath("region")} label="Browse by region and district instead" />
                </>
              )}

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
                  <SwitchPath onClick={() => switchPath("city")} label="Choose a city instead" />
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
                  <p className="text-[15px] font-semibold text-white">{placeName ? `Now find your field near ${placeName}` : "Now find your field"}</p>
                  {path === "region" && (noRegions || (region && noDistricts)) ? (
                    <p className="mt-1 text-[12.5px] text-white/55">Detailed boundaries aren’t available here. Just zoom in on the map.</p>
                  ) : null}
                  <ol className="mt-3 space-y-2.5 text-[13px] text-white/80">
                    <Tip icon={<ZoomIn className="size-4" aria-hidden />}>Zoom in (pinch, scroll or +) until you can see your field clearly. Swipe with two fingers to move the map.</Tip>
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

function SwitchPath({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 inline-flex items-center gap-1.5 self-start rounded-full px-1 text-[12px] text-white/55 hover:text-white">
      <MapIcon className="size-3.5" aria-hidden /> {label}
    </button>
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
