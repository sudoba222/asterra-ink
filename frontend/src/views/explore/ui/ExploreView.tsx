"use client";

import { motion } from "motion/react";
import { useEffect } from "react";
import { FieldCard, fieldRepository, useFields, type Field } from "@/entities/field";
import { useShellMode } from "@/entities/exploration";
import { flyToOverview, useMap } from "@/entities/map";
import { useFieldDraft } from "@/features/draw-field";
import { LocateButton } from "@/features/locate-me";
import { Logo } from "@/shared/ui";
import { CountrySelector } from "@/widgets/country-selector";

const ease = [0.22, 1, 0.36, 1] as const;

/** Home: find your field (by location or country) or open a saved one. */
export function ExploreView() {
  useShellMode("home");
  const map = useMap();
  const draft = useFieldDraft();
  const fields = useFields();
  const marking = draft.status !== "off";

  // Back on the home screen: return to the whole-Earth view (unless the farmer is marking a field).
  useEffect(() => {
    if (map && draft.status === "off") flyToOverview(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per arrival with a ready map
  }, [map]);

  const remove = (f: Field) => {
    if (window.confirm(`Delete “${f.name}”? This can’t be undone.`)) fieldRepository.remove(f.id);
  };

  return (
    <div className="relative h-full">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease }}
        className="pointer-events-auto absolute top-0 left-0 px-4 py-4 sm:px-6"
      >
        <Logo />
      </motion.header>

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
          <p className="mt-1 mb-4 text-[13px] leading-5 text-white/60">Mark your land on the satellite map and get simple advice for it.</p>

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
            <span className="h-px flex-1 bg-white/10" /> or choose your country <span className="h-px flex-1 bg-white/10" />
          </div>
          <CountrySelector tone="dark" className="min-h-[220px] flex-1" />
        </motion.section>
      )}
    </div>
  );
}
