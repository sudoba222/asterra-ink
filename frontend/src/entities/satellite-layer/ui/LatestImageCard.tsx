"use client";

import { ChevronLeft, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { formatDate } from "@/shared/lib";
import type { LatestImageState } from "../api/use-latest-image";

const daysAgo = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(`${iso}T12:00:00Z`).getTime()) / 86_400_000));

/** Latest image layer: when the picture was taken, and a button to step back to an older clear one. */
export function LatestImageCard({ latest }: { latest: LatestImageState }) {
  const { status, image, error, older, newest, isNewest } = latest;
  const ago = image ? daysAgo(image.date) : 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="glass flex w-[min(300px,calc(100vw-32px))] items-center gap-2 rounded-2xl px-3.5 py-2.5 text-white shadow-[var(--shadow-float)]"
    >
      <p className="min-w-0 flex-1 text-[12.5px]" aria-live="polite">
        {status === "loading" || status === "idle"
          ? "Finding a clear image…"
          : status === "error"
            ? error
            : image
              ? (
                  <>
                    <span className="font-semibold">{formatDate(image.date)}</span>{" "}
                    <span className="text-white/55">· {ago === 0 ? "today" : `${ago} d ago`}</span>
                  </>
                )
              : "No clear image in 60 days"}
      </p>
      {!isNewest && (
        <button type="button" onClick={newest} aria-label="Newest image" className="rounded-full bg-white/10 p-1.5 hover:bg-white/15">
          <RotateCcw className="size-3.5" aria-hidden />
        </button>
      )}
      {image && (
        <button type="button" onClick={older} className="inline-flex items-center gap-0.5 rounded-full bg-white/10 py-1 pr-2.5 pl-1.5 text-[11.5px] font-medium hover:bg-white/15">
          <ChevronLeft className="size-3.5" aria-hidden /> Older
        </button>
      )}
    </motion.div>
  );
}
