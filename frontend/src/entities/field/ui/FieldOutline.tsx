"use client";

import { useMemo } from "react";
import { MapOutline } from "@/entities/map";
import type { Field } from "../model/types";

export function FieldOutline({ field }: { field: Field }) {
  const geometry = useMemo(() => ({ polygons: [[[...field.polygon, field.polygon[0]]]] }), [field.polygon]);
  return <MapOutline geometry={geometry} fillAlpha={0.18} width={3} />;
}
