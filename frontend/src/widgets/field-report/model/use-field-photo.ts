"use client";

import { useEffect, useMemo, useState } from "react";
import { fieldPhotoFrame, type Field, type PhotoFrame } from "@/entities/field";
import { imageryExportUrl } from "@/entities/satellite-layer";

const PHOTO_PX = 1200;

export interface FieldPhoto {
  frame: PhotoFrame;
  url: string;
  status: "loading" | "ready" | "error";
}

/**
 * Satellite photo of the field for the PDF report. Preloaded so it is already in the
 * browser cache when the user prints (an image still loading would print blank).
 */
export function useFieldPhoto(field: Pick<Field, "polygon">): FieldPhoto {
  const key = JSON.stringify(field.polygon);
  const frame = useMemo(() => fieldPhotoFrame(JSON.parse(key), { sizePx: PHOTO_PX }), [key]);
  const url = useMemo(() => imageryExportUrl(frame.bbox, PHOTO_PX), [frame]);
  const [settled, setSettled] = useState<{ url: string; ok: boolean } | null>(null);

  useEffect(() => {
    let live = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => live && setSettled({ url, ok: img.naturalWidth > 0 });
    img.onerror = () => live && setSettled({ url, ok: false });
    img.src = url;
    return () => {
      live = false;
      img.onload = img.onerror = null;
    };
  }, [url]);

  const status = settled?.url === url ? (settled.ok ? "ready" : "error") : "loading";
  return { frame, url, status };
}
