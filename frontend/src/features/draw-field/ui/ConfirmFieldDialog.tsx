"use client";

import { MapPin, X } from "lucide-react";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { fieldRepository, formatHectares, newFieldId, ringCentroid, type Field } from "@/entities/field";
import { formatCoord } from "@/shared/lib";
import { useFieldDraft } from "../model/field-draft-context";

/** Name + save step. Saves through the FieldRepository and opens the field dashboard. */
export function ConfirmFieldDialog({ onClose }: { onClose: () => void }) {
  const d = useFieldDraft();
  const router = useRouter();
  const [name, setName] = useState(d.meta.fieldName ?? "My field");
  const inputRef = useRef<HTMLInputElement>(null);
  const centroid = ringCentroid(d.vertices);
  const place = [d.meta.districtName, d.meta.regionName].filter(Boolean).join(", ");

  useEffect(() => {
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = () => {
    const field: Field = {
      id: d.meta.fieldId ?? newFieldId(),
      name: name.trim() || "My field",
      polygon: d.vertices,
      areaHa: Math.round(d.areaHa * 100) / 100,
      centroid,
      countryIso: d.meta.countryIso,
      regionName: d.meta.regionName,
      districtName: d.meta.districtName,
      createdAt: new Date().toISOString(),
    };
    fieldRepository.save(field);
    d.cancel();
    onClose();
    router.push(`/field/${field.id}`);
  };

  return (
    <motion.div
      className="pointer-events-auto fixed inset-0 z-[70] grid place-items-center bg-deep/50 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.form
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-field-title"
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="w-[min(420px,100%)] rounded-3xl bg-surface p-5 shadow-[var(--shadow-float)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="save-field-title" className="text-[17px] font-semibold text-ink">
              {d.meta.fieldId ? "Update your field" : "Save your field"}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-muted">We’ll use this boundary to look up conditions on your land.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-full text-ink-muted hover:bg-mist">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-mist px-3 py-2.5">
            <p className="text-[11px] text-ink-muted">Area</p>
            <p className="font-mono text-[18px] font-semibold text-ink tabular-nums">{formatHectares(d.areaHa)}</p>
          </div>
          <div className="rounded-2xl bg-mist px-3 py-2.5">
            <p className="text-[11px] text-ink-muted">Corners</p>
            <p className="font-mono text-[18px] font-semibold text-ink tabular-nums">{d.vertices.length}</p>
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1.5 text-[12px] text-ink-muted">
          <MapPin className="size-3.5" aria-hidden />
          {place ? `${place} · ` : ""}
          {formatCoord(centroid.lat, centroid.lon)}
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-[13px] font-medium text-ink">Field name</span>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[14px] text-ink outline-none focus:border-forest/40 focus:ring-2 focus:ring-lime/60"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2.5 text-[13.5px] font-medium text-ink-muted hover:bg-mist">
            Keep editing
          </button>
          <button type="submit" className="rounded-xl bg-forest px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-deep">
            Save field
          </button>
        </div>
        <p className="mt-3 text-[11px] text-ink-faint">Saved in this browser for now.</p>
      </motion.form>
    </motion.div>
  );
}
