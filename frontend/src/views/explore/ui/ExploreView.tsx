"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { loadCountryGeometry, type LoadedCountryGeometry } from "@/entities/country";
import { FieldCard, fieldRepository, useFields, type Field } from "@/entities/field";
import { useExploration, useShellMode } from "@/entities/exploration";
import { flyToOverview, MapOutline, useMap } from "@/entities/map";
import { useFieldDraft } from "@/features/draw-field";
import { LocateButton } from "@/features/locate-me";
import { useSelectCountry } from "@/features/select-country";
import { LocationBadge, useGlobePicker } from "@/features/select-location";
import { Logo } from "@/shared/ui";
import { CountrySelector } from "@/widgets/country-selector";

const ease = [0.22, 1, 0.36, 1] as const;

/** Home: find your field (click a country on the globe, by location or from the list) or open a saved one. */
export function ExploreView() {
  useShellMode("home");
  const map = useMap();
  const draft = useFieldDraft();
  const fields = useFields();
  const { byIso } = useExploration();
  const selectCountry = useSelectCountry();
  const marking = draft.status !== "off";

  const [hoverIso, setHoverIso] = useState<string | null>(null);
  const [hoverGeometry, setHoverGeometry] = useState<LoadedCountryGeometry | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Back on the home screen: return to the whole-Earth view (unless the farmer is marking a field).
  useEffect(() => {
    if (map && draft.status === "off") flyToOverview(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrival with a ready map
  }, [map]);

  // Outline the hovered country (geometry files are cached after the first load).
  useEffect(() => {
    let cancelled = false;
    if (!hoverIso) return;
    loadCountryGeometry(hoverIso).then((g) => !cancelled && setHoverGeometry(g));
    return () => {
      cancelled = true;
    };
  }, [hoverIso]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2600);
    return () => clearTimeout(t);
  }, [notice]);

  useGlobePicker({
    enabled: !marking && !picking,
    onHover: (hit) => {
      const iso = hit.kind === "country" ? hit.iso3 : null;
      setHoverIso(iso);
      if (!iso) setHoverGeometry(null);
    },
    onPick: (hit) => {
      if (hit.kind === "country" && byIso.has(hit.iso3)) {
        setPicking(hit.iso3);
        selectCountry(hit.iso3); // the country screen flies the camera there and outlines it
      } else if (hit.kind === "sea") {
        setNotice("That’s the sea — click on land to choose a country.");
      } else if (hit.kind === "country") {
        setNotice("There’s no data for that territory yet. Try a neighbouring country.");
      }
    },
    onError: () => setNotice("Couldn’t identify the country there. Please try again."),
  });

  const remove = (f: Field) => {
    if (window.confirm(`Delete “${f.name}”? This can’t be undone.`)) fieldRepository.remove(f.id);
  };

  const shownIso = picking ?? hoverIso;
  const shown = shownIso ? byIso.get(shownIso) : undefined;

  return (
    <div className="relative h-full">
      {hoverGeometry && shownIso && !marking && <MapOutline geometry={hoverGeometry.geometry} color="#C5E58A" fillAlpha={0} width={2} />}

      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
        className="pointer-events-auto absolute top-0 left-0 px-4 py-4 sm:px-6"
      >
        <Logo />
      </motion.header>

      {!marking && (
        <div className="absolute inset-x-3 top-[72px] z-10 flex flex-col items-center gap-2 sm:top-4 sm:left-[416px] sm:right-20">
          <LocationBadge
            country={shown ? { iso3: shown.iso3, name: shown.name } : null}
            hint={picking ? "opening…" : shown ? "click to choose" : "Click a country on the globe"}
            busy={Boolean(picking)}
            preview={!picking && Boolean(shown)}
          />
          <AnimatePresence>
            {notice && (
              <motion.p
                role="status"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] text-white/85"
              >
                {notice}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}

      {!marking && (
        <motion.section
          aria-labelledby="find-field"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease }}
          className="glass pointer-events-auto absolute inset-x-3 bottom-3 flex max-h-[62dvh] flex-col rounded-3xl p-4 shadow-[var(--shadow-float)] max-sm:bg-[rgba(10,24,19,0.92)] sm:inset-x-auto sm:left-6 sm:w-[380px] lg:top-20 lg:bottom-6 lg:max-h-none"
        >
          <h1 id="find-field" className="text-[19px] font-semibold tracking-tight text-white">
            Find your field
          </h1>
          <p className="mt-1 mb-4 text-[13px] leading-5 text-white/60">Click your country on the globe, or use your location. Then mark your land and get simple advice for it.</p>

          <LocateButton onLocated={() => draft.start()} />

          {fields.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-lime/70 uppercase">Your fields</p>
              <div className="scroll-quiet-dark max-h-[168px] space-y-1.5 overflow-y-auto pr-1">
                {fields.map((f) => (
                  <FieldCard key={f.id} field={f} onDelete={remove} />
                ))}
              </div>
            </div>
          )}

          <div className="my-4 flex items-center gap-3 text-[11.5px] text-white/40">
            <span className="h-px flex-1 bg-white/10" /> or pick from the list <span className="h-px flex-1 bg-white/10" />
          </div>
          <CountrySelector tone="dark" className="min-h-[220px] flex-1" />
        </motion.section>
      )}
    </div>
  );
}
