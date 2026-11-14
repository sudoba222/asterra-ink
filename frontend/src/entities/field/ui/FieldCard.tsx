"use client";

import { ChevronRight, MapPin, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatHectares } from "../lib/area";
import type { Field } from "../model/types";

/** Compact saved-field row for "My fields". */
export function FieldCard({ field, onDelete }: { field: Field; onDelete?: (f: Field) => void }) {
  const place = [field.districtName, field.regionName].filter(Boolean).join(", ");
  return (
    <div className="group flex items-center gap-2 rounded-xl bg-white/6 ring-1 ring-white/10 transition hover:bg-white/10">
      <Link href={`/field/${field.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-lime/15 text-lime">
          <MapPin className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium text-white">{field.name}</span>
          <span className="block truncate text-[11.5px] text-white/50">
            {formatHectares(field.areaHa)}
            {place ? ` · ${place}` : ""}
          </span>
        </span>
        <ChevronRight className="size-4 text-white/40" aria-hidden />
      </Link>
      {onDelete && (
        <button
          type="button"
          onClick={() => onDelete(field)}
          aria-label={`Delete ${field.name}`}
          className="mr-2 grid size-8 place-items-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
